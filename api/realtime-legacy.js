// Edge Runtime WebSocket endpoint for real-time transcription
export const config = {
  runtime: 'edge',
};

const PROXY_URL = 'https://tisayujoykquxfflubjn.supabase.co/functions/v1/proxy-transcript';
const DB_UPDATE_INTERVAL = 5000; // 5 seconds for live_transcript
const RECORDING_UPDATE_INTERVAL = 30000; // 30 seconds for recording_transcript

export default async function handler(request) {
  // Verify WebSocket upgrade request
  if (request.headers.get('upgrade') !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  // Create WebSocket pair
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  // Accept the server side of the WebSocket
  server.accept();

  // Initialize connection state
  let sessionId = null;
  let fullTranscript = '';
  let lastLiveUpdateMs = 0;
  let lastRecordingUpdateMs = 0;
  let assemblyAISocket = null;

  // Helper function to send data to the proxy
  async function sendToProxy(data) {
    if (!sessionId) {
      console.warn('sendToProxy called without sessionId');
      return;
    }

    try {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.PROXY_SECRET,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Proxy error:', response.status, error);
        return;
      }

      const result = await response.json();
      console.log('Proxy update successful:', result.success);
    } catch (error) {
      console.error('Failed to send to proxy:', error.message);
    }
  }

  // Helper function to send throttled transcript updates
  async function sendTranscriptUpdate() {
    if (!sessionId || !fullTranscript) return;

    const now = Date.now();

    // Update live_transcript every 5 seconds
    if (now - lastLiveUpdateMs >= DB_UPDATE_INTERVAL) {
      await sendToProxy({
        session_id: sessionId,
        live_transcript: fullTranscript,
      });
      lastLiveUpdateMs = now;
    }

    // Update recording_transcript every 30 seconds
    if (now - lastRecordingUpdateMs >= RECORDING_UPDATE_INTERVAL) {
      await sendToProxy({
        session_id: sessionId,
        recording_transcript: fullTranscript,
      });
      lastRecordingUpdateMs = now;
    }
  }

  // Connect to AssemblyAI WebSocket (v3 API)
  function connectToAssemblyAI() {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      console.error('ASSEMBLYAI_API_KEY not set');
      server.close(1011, 'Server configuration error');
      return;
    }

    // v3 API endpoint with format_turns for better transcript formatting
    const aaiUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true`;
    
    // v3 uses Authorization header instead of token in URL
    assemblyAISocket = new WebSocket(aaiUrl, {
      headers: {
        Authorization: apiKey,
      },
    });

    assemblyAISocket.addEventListener('open', () => {
      console.log('Connected to AssemblyAI v3 API');
    });

    assemblyAISocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle session begin (v3)
        if (data.type === 'Begin') {
          console.log('AssemblyAI session began:', data.id, 'expires at:', data.expires_at);
        }

        // Handle final transcripts (v3 uses "Turn" type with format flag)
        if (data.type === 'Turn') {
          const transcript = data.transcript || '';
          const isFormatted = data.turn_is_formatted;

          // Only process formatted (final) transcripts
          if (isFormatted && transcript.trim()) {
            // Append to accumulated transcript
            if (fullTranscript) {
              fullTranscript += '\n' + transcript;
            } else {
              fullTranscript = transcript;
            }

            console.log('Final transcript received:', transcript);

            // Send throttled updates to proxy
            await sendTranscriptUpdate();

            // Send transcript back to Coach app
            if (server.readyState === 1) {
              server.send(JSON.stringify({
                type: 'transcript.final',
                text: transcript,
                full_transcript: fullTranscript,
              }));
            }
          }
        }

        // Handle session termination (v3)
        if (data.type === 'Termination') {
          console.log('AssemblyAI session terminated:', 
            'audio_duration:', data.audio_duration_seconds,
            'session_duration:', data.session_duration_seconds);
        }
      } catch (error) {
        console.error('Error processing AssemblyAI message:', error.message);
      }
    });

    assemblyAISocket.addEventListener('error', async (event) => {
      console.error('AssemblyAI WebSocket error:', event);
      if (sessionId) {
        await sendToProxy({
          session_id: sessionId,
          connection_status: 'error',
        });
      }
    });

    assemblyAISocket.addEventListener('close', async (event) => {
      console.log('AssemblyAI WebSocket closed:', event.code, event.reason);
      if (sessionId) {
        await sendToProxy({
          session_id: sessionId,
          connection_status: 'disconnected',
        });
      }
    });
  }

  // Connect to AssemblyAI on startup
  connectToAssemblyAI();

  // Handle messages from Coach app
  server.addEventListener('message', async (event) => {
    try {
      const message = JSON.parse(event.data);

      // Handle session initialization
      if (message.type === 'session.init') {
        sessionId = message.sessionId;
        console.log('Session initialized:', sessionId);

        // Send connection status to proxy
        await sendToProxy({
          session_id: sessionId,
          connection_status: 'connected',
          recording_status: 'recording',
        });

        return;
      }

      // Handle audio data
      if (message.type === 'input_audio_buffer.append') {
        if (!message.audio) {
          console.warn('Received audio message without audio data');
          return;
        }

        // v3 API requires raw PCM Buffer, not JSON with base64
        // Decode base64 to Buffer and send directly
        if (assemblyAISocket && assemblyAISocket.readyState === 1) {
          try {
            // Decode base64 string to binary buffer
            const binaryString = atob(message.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Send raw PCM buffer (not JSON!)
            assemblyAISocket.send(bytes.buffer);
          } catch (error) {
            console.error('Error decoding/sending audio:', error.message);
          }
        } else {
          console.warn('AssemblyAI socket not ready, dropping audio chunk');
        }

        return;
      }

      // Ignore other message types
      console.log('Ignoring message type:', message.type);
    } catch (error) {
      console.error('Error processing Coach message:', error.message);
    }
  });

  // Handle disconnection from Coach app
  server.addEventListener('close', async (event) => {
    console.log('Coach WebSocket closed:', event.code, event.reason);

    // Close AssemblyAI connection
    if (assemblyAISocket && assemblyAISocket.readyState === 1) {
      assemblyAISocket.close();
    }

    // Send final updates to proxy
    if (sessionId) {
      // Send final transcript updates
      if (fullTranscript) {
        await sendToProxy({
          session_id: sessionId,
          live_transcript: fullTranscript,
          recording_transcript: fullTranscript,
        });
      }

      // Update status
      await sendToProxy({
        session_id: sessionId,
        connection_status: 'disconnected',
        recording_status: 'completed',
      });
    }
  });

  // Handle errors from Coach app
  server.addEventListener('error', async (event) => {
    console.error('Coach WebSocket error:', event);

    if (sessionId) {
      await sendToProxy({
        session_id: sessionId,
        connection_status: 'error',
      });
    }
  });

  // Return the client side of the WebSocket with 101 status
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

