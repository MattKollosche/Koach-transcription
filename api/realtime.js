// Vercel WebSocket endpoint for real-time transcription using AssemblyAI SDK
import { AssemblyAI } from 'assemblyai';

const PROXY_URL = 'https://tisayujoykquxfflubjn.supabase.co/functions/v1/proxy-transcript';
const DB_UPDATE_INTERVAL = 5000; // 5 seconds for live_transcript
const RECORDING_UPDATE_INTERVAL = 30000; // 30 seconds for recording_transcript

export default async function handler(request) {
  // Check if this is a WebSocket upgrade request
  if (request.headers.get('upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const pair = new WebSocketPair();
  const wsClient = pair[0];
  const server = pair[1];

  server.accept();

  console.log('Coach WebSocket connected');
    
  // Initialize connection state
  let sessionId = null;
  let fullTranscript = '';
  let lastLiveUpdateMs = 0;
  let lastRecordingUpdateMs = 0;
  let transcriber = null;

  // Initialize AssemblyAI client
  const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
  });

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

  // Initialize AssemblyAI transcriber
  async function initializeTranscriber() {
    try {
      transcriber = client.streaming.transcriber({
        sampleRate: 16000,
        formatTurns: true,
      });

      transcriber.on('open', ({ id }) => {
        console.log(`AssemblyAI session opened with ID: ${id}`);
      });

      transcriber.on('error', async (error) => {
        console.error('AssemblyAI transcriber error:', error);
        
        if (sessionId) {
          await sendToProxy({
            session_id: sessionId,
            connection_status: 'error',
          });
        }
      });

      transcriber.on('close', async (code, reason) => {
        console.log('AssemblyAI session closed:', code, reason);
        
        if (sessionId) {
          await sendToProxy({
            session_id: sessionId,
            connection_status: 'disconnected',
          });
        }
      });

      transcriber.on('turn', async (turn) => {
        if (!turn.transcript || !turn.turn_is_formatted) {
          return;
        }

        const transcript = turn.transcript;
        
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
        server.send(JSON.stringify({
          type: 'transcript.final',
          text: transcript,
          full_transcript: fullTranscript,
        }));
      });

      // Connect to AssemblyAI
      await transcriber.connect();
      console.log('Connected to AssemblyAI streaming service');

    } catch (error) {
      console.error('Failed to initialize transcriber:', error);
      if (sessionId) {
        await sendToProxy({
          session_id: sessionId,
          connection_status: 'error',
        });
      }
    }
  }

  // Initialize transcriber on connection
  initializeTranscriber();

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

        // Send audio to AssemblyAI transcriber
        if (transcriber) {
          try {
            // Decode base64 string to binary buffer
            const binaryString = atob(message.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Send raw PCM buffer to transcriber
            transcriber.stream().write(bytes);
          } catch (error) {
            console.error('Error decoding/sending audio:', error.message);
          }
        } else {
          console.warn('Transcriber not ready, dropping audio chunk');
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
    if (transcriber) {
      try {
        await transcriber.close();
      } catch (error) {
        console.error('Error closing transcriber:', error);
      }
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
  server.addEventListener('error', async (error) => {
    console.error('Coach WebSocket error:', error);

    if (sessionId) {
      await sendToProxy({
        session_id: sessionId,
        connection_status: 'error',
      });
    }
  });

  // Return WebSocket response
  return new Response(null, {
    status: 101,
    webSocket: wsClient,
  });
}