// Koach Real-Time Streaming Transcription WebSocket Endpoint
// 
// CRITICAL: This function uses AssemblyAI STREAMING transcription ONLY
// Reference: https://www.assemblyai.com/docs/universal-streaming#quickstart
// 
// DO NOT USE: aai.transcripts.create() - that is batch processing
// ONLY USE: aai.streaming.transcriber() - this is real-time streaming
//
// This WebSocket endpoint:
// 1. Receives audio from Koach app via WebSocket
// 2. Streams audio to AssemblyAI streaming API in real-time
// 3. Receives streaming transcript responses
// 4. Sends final transcripts back to Koach app
// 5. Updates Supabase database with live transcripts
//
const { AssemblyAI } = require('assemblyai');

const PROXY_URL = 'https://tisayujoykquxfflubjn.supabase.co/functions/v1/proxy-transcript';
const DB_UPDATE_INTERVAL = 5000; // 5 seconds for live_transcript
const RECORDING_UPDATE_INTERVAL = 30000; // 30 seconds for recording_transcript

module.exports = async function handler(request) {
  console.log('=== Koach Real-time WebSocket Handler Called ===');
  console.log('Request method:', request.method);
  console.log('Request URL:', request.url);
  console.log('Request headers:', Object.fromEntries(request.headers.entries()));

  // Check if this is a WebSocket upgrade request
  const upgradeHeader = request.headers.get('upgrade');
  const connectionHeader = request.headers.get('connection');
  
  console.log('Upgrade header:', upgradeHeader);
  console.log('Connection header:', connectionHeader);

  if (upgradeHeader !== 'websocket') {
    console.log('Not a WebSocket upgrade request, returning 426');
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  try {
    console.log('Creating WebSocket pair...');
    
    // Check if WebSocketPair is available
    if (typeof WebSocketPair === 'undefined') {
      console.error('WebSocketPair is not available in this runtime');
      return new Response('WebSocket not supported in this runtime', { status: 500 });
    }
    
    console.log('WebSocketPair is available, creating pair...');
    const pair = new WebSocketPair();
    const wsClient = pair[0];
    const server = pair[1];
    console.log('WebSocket pair created successfully');

    server.accept();
    console.log('WebSocket connection accepted');
    
    // Initialize connection state
    let sessionId = null;
    let fullTranscript = '';
    let lastLiveUpdateMs = 0;
    let lastRecordingUpdateMs = 0;
    let transcriber = null;

    // Check environment variables
    console.log('Checking environment variables...');
    const assemblyAIKey = process.env.ASSEMBLYAI_API_KEY;
    const proxySecret = process.env.PROXY_SECRET;
    
    console.log('ASSEMBLYAI_API_KEY exists:', !!assemblyAIKey);
    console.log('PROXY_SECRET exists:', !!proxySecret);
    
    if (!assemblyAIKey) {
      console.error('ASSEMBLYAI_API_KEY is missing!');
      server.close(1011, 'Missing API key');
      return new Response('Server configuration error', { status: 500 });
    }

    // Initialize AssemblyAI client
    console.log('Initializing AssemblyAI client...');
    const client = new AssemblyAI({
      apiKey: assemblyAIKey,
    });
    console.log('AssemblyAI client created');

    // Helper function to send data to the proxy
    async function sendToProxy(data) {
      console.log('sendToProxy called with:', data);
      if (!sessionId) {
        console.warn('sendToProxy called without sessionId');
        return;
      }

      try {
        console.log('Sending to proxy:', PROXY_URL);
        const response = await fetch(PROXY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': proxySecret,
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
        console.error('Proxy error stack:', error.stack);
      }
    }

    // Helper function to send throttled transcript updates
    async function sendTranscriptUpdate() {
      console.log('sendTranscriptUpdate called');
      if (!sessionId || !fullTranscript) return;

      const now = Date.now();

      // Update live_transcript every 5 seconds
      if (now - lastLiveUpdateMs >= DB_UPDATE_INTERVAL) {
        console.log('Updating live_transcript');
        await sendToProxy({
          session_id: sessionId,
          live_transcript: fullTranscript,
        });
        lastLiveUpdateMs = now;
      }

      // Update recording_transcript every 30 seconds
      if (now - lastRecordingUpdateMs >= RECORDING_UPDATE_INTERVAL) {
        console.log('Updating recording_transcript');
        await sendToProxy({
          session_id: sessionId,
          recording_transcript: fullTranscript,
        });
        lastRecordingUpdateMs = now;
      }
    }

    // Initialize AssemblyAI transcriber
    async function initializeTranscriber() {
      console.log('Initializing AssemblyAI transcriber...');
      try {
        transcriber = client.streaming.transcriber({
          sampleRate: 16000,
          formatTurns: true,
        });
        console.log('Transcriber created');

        transcriber.on('open', ({ id }) => {
          console.log(`AssemblyAI session opened with ID: ${id}`);
        });

        transcriber.on('error', async (error) => {
          console.error('AssemblyAI transcriber error:', error);
          console.error('AssemblyAI error stack:', error.stack);
          
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
          console.log('AssemblyAI turn received:', turn);
          if (!turn.transcript || !turn.turn_is_formatted) {
            console.log('Turn not formatted or no transcript, ignoring');
            return;
          }

          const transcript = turn.transcript;
          console.log('Processing transcript:', transcript);
          
          // Append to accumulated transcript
          if (fullTranscript) {
            fullTranscript += '\n' + transcript;
          } else {
            fullTranscript = transcript;
          }

          console.log('Final transcript received:', transcript);
          console.log('Full transcript so far:', fullTranscript);

          // Send throttled updates to proxy
          await sendTranscriptUpdate();

          // Send transcript back to Koach app
          console.log('Sending transcript back to client');
          server.send(JSON.stringify({
            type: 'transcript.final',
            text: transcript,
            full_transcript: fullTranscript,
          }));
        });

        // Connect to AssemblyAI
        console.log('Connecting to AssemblyAI...');
        await transcriber.connect();
        console.log('Connected to AssemblyAI streaming service');

      } catch (error) {
        console.error('Failed to initialize transcriber:', error);
        console.error('Transcriber error stack:', error.stack);
        if (sessionId) {
          await sendToProxy({
            session_id: sessionId,
            connection_status: 'error',
          });
        }
      }
    }

    // Initialize transcriber on connection
    console.log('Starting transcriber initialization...');
    initializeTranscriber();

    // Handle messages from Koach app
    server.addEventListener('message', async (event) => {
      console.log('Message received from client:', event.data);
      try {
        const message = JSON.parse(event.data);
        console.log('Parsed message:', message);

        // Handle session initialization
        if (message.type === 'session.init') {
          console.log('Handling session.init message');
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
          console.log('Handling audio data message');
          if (!message.audio) {
            console.warn('Received audio message without audio data');
            return;
          }

          console.log('Audio data length:', message.audio.length);

          // Send audio to AssemblyAI transcriber
          if (transcriber) {
            try {
              console.log('Decoding audio data...');
              // Decode base64 string to binary buffer
              const binaryString = atob(message.audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              console.log('Sending audio to transcriber, bytes:', bytes.length);
              // Send raw PCM buffer to transcriber
              transcriber.stream().write(bytes);
            } catch (error) {
              console.error('Error decoding/sending audio:', error.message);
              console.error('Audio error stack:', error.stack);
            }
          } else {
            console.warn('Transcriber not ready, dropping audio chunk');
          }

          return;
        }

        // Ignore other message types
        console.log('Ignoring message type:', message.type);
      } catch (error) {
        console.error('Error processing Koach message:', error.message);
        console.error('Message processing error stack:', error.stack);
      }
    });

    // Handle disconnection from Koach app
    server.addEventListener('close', async (event) => {
      console.log('Koach WebSocket closed:', event.code, event.reason);

      // Close AssemblyAI connection
      if (transcriber) {
        try {
          console.log('Closing transcriber connection...');
          await transcriber.close();
          console.log('Transcriber closed');
        } catch (error) {
          console.error('Error closing transcriber:', error);
        }
      }

      // Send final updates to proxy
      if (sessionId) {
        console.log('Sending final updates to proxy...');
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

    // Handle errors from Koach app
    server.addEventListener('error', async (error) => {
      console.error('Koach WebSocket error:', error);
      console.error('Koach WebSocket error stack:', error.stack);

      if (sessionId) {
        await sendToProxy({
          session_id: sessionId,
          connection_status: 'error',
        });
      }
    });

    console.log('Returning WebSocket response');
    return new Response(null, {
      status: 101,
      webSocket: wsClient,
    });

  } catch (error) {
    console.error('Error in WebSocket handler:', error);
    console.error('Handler error stack:', error.stack);
    return new Response(`WebSocket error: ${error.message}`, { status: 500 });
  }
}