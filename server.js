// Koach Real-Time Streaming Transcription WebSocket Server
// 
// CRITICAL: This uses AssemblyAI STREAMING transcription ONLY
// Reference: https://www.assemblyai.com/docs/universal-streaming#quickstart
// 
// This WebSocket server:
// 1. Receives audio from Koach app via WebSocket
// 2. Streams audio to AssemblyAI streaming API in real-time
// 3. Receives streaming transcript responses
// 4. Sends final transcripts back to Koach app
// 5. Updates Supabase database with live transcripts

const WebSocket = require('ws');
const http = require('http');
const { AssemblyAI } = require('assemblyai');

const PORT = process.env.PORT || 3000;
const PROXY_URL = 'https://tisayujoykquxfflubjn.supabase.co/functions/v1/proxy-transcript';
const DB_UPDATE_INTERVAL = 5000; // 5 seconds for live_transcript
const RECORDING_UPDATE_INTERVAL = 30000; // 30 seconds for recording_transcript

// Initialize AssemblyAI client
const assemblyAIKey = process.env.ASSEMBLYAI_API_KEY;
const proxySecret = process.env.PROXY_SECRET;

if (!assemblyAIKey) {
  console.error('ERROR: ASSEMBLYAI_API_KEY environment variable is required');
  process.exit(1);
}

console.log('Environment check:');
console.log('- ASSEMBLYAI_API_KEY:', assemblyAIKey ? '✓ Set' : '✗ Missing');
console.log('- PROXY_SECRET:', proxySecret ? '✓ Set' : '✗ Missing');

const aai = new AssemblyAI({
  apiKey: assemblyAIKey,
});

// Create HTTP server
const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'koach-transcription',
      version: '2.0.0',
      websocket: 'enabled'
    }));
    return;
  }

  // Root endpoint
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Koach Transcription WebSocket Server\nConnect to /realtime for streaming transcription');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/realtime'
});

console.log(`Starting Koach Transcription WebSocket Server on port ${PORT}...`);

// Helper function to send data to the proxy
async function sendToProxy(sessionId, data) {
  if (!sessionId) {
    console.warn('sendToProxy called without sessionId');
    return;
  }

  try {
    console.log(`[Session ${sessionId}] Sending to proxy:`, Object.keys(data));
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': proxySecret,
      },
      body: JSON.stringify({
        session_id: sessionId,
        ...data
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`[Session ${sessionId}] Proxy error:`, response.status, error);
      return;
    }

    const result = await response.json();
    console.log(`[Session ${sessionId}] Proxy update successful:`, result.success);
  } catch (error) {
    console.error(`[Session ${sessionId}] Failed to send to proxy:`, error.message);
  }
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('=== New WebSocket connection established ===');
  
  // Connection state
  let sessionId = null;
  let fullTranscript = '';
  let lastLiveUpdateMs = 0;
  let lastRecordingUpdateMs = 0;
  let transcriber = null;
  let isTranscriberReady = false;

  // Helper function to send throttled transcript updates
  async function sendTranscriptUpdate() {
    if (!sessionId || !fullTranscript) return;

    const now = Date.now();

    // Update live_transcript every 5 seconds
    if (now - lastLiveUpdateMs >= DB_UPDATE_INTERVAL) {
      console.log(`[Session ${sessionId}] Updating live_transcript`);
      await sendToProxy(sessionId, {
        live_transcript: fullTranscript,
      });
      lastLiveUpdateMs = now;
    }

    // Update recording_transcript every 30 seconds
    if (now - lastRecordingUpdateMs >= RECORDING_UPDATE_INTERVAL) {
      console.log(`[Session ${sessionId}] Updating recording_transcript`);
      await sendToProxy(sessionId, {
        recording_transcript: fullTranscript,
      });
      lastRecordingUpdateMs = now;
    }
  }

  // Initialize AssemblyAI transcriber
  async function initializeTranscriber() {
    console.log(`[Session ${sessionId}] Initializing AssemblyAI transcriber...`);
    try {
      transcriber = aai.realtime.transcriber({
        sampleRate: 16000,
      });

      transcriber.on('open', ({ sessionId: aaiSessionId, expiresAt }) => {
        console.log(`[Session ${sessionId}] AssemblyAI session opened`);
        console.log(`- AssemblyAI Session ID: ${aaiSessionId}`);
        console.log(`- Expires at: ${expiresAt}`);
        isTranscriberReady = true;
      });

      transcriber.on('error', async (error) => {
        console.error(`[Session ${sessionId}] AssemblyAI transcriber error:`, error);
        isTranscriberReady = false;
        
        if (sessionId) {
          await sendToProxy(sessionId, {
            connection_status: 'error',
          });
        }

        // Send error to client
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Transcription service error',
          }));
        }
      });

      transcriber.on('close', async (code, reason) => {
        console.log(`[Session ${sessionId}] AssemblyAI session closed:`, code, reason);
        isTranscriberReady = false;
        
        if (sessionId) {
          await sendToProxy(sessionId, {
            connection_status: 'disconnected',
          });
        }
      });

      transcriber.on('transcript', async (transcript) => {
        console.log(`[Session ${sessionId}] Transcript received:`, {
          message_type: transcript.message_type,
          text: transcript.text,
        });

        // Only process final transcripts
        if (transcript.message_type === 'FinalTranscript') {
          const text = transcript.text;
          console.log(`[Session ${sessionId}] Final transcript:`, text);
          
          // Append to accumulated transcript
          if (fullTranscript) {
            fullTranscript += ' ' + text;
          } else {
            fullTranscript = text;
          }

          console.log(`[Session ${sessionId}] Full transcript length:`, fullTranscript.length);

          // Send throttled updates to proxy
          await sendTranscriptUpdate();

          // Send transcript back to Koach app
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'transcript.final',
              text: text,
              full_transcript: fullTranscript,
            }));
          }
        }
      });

      // Connect to AssemblyAI
      console.log(`[Session ${sessionId}] Connecting to AssemblyAI...`);
      await transcriber.connect();
      console.log(`[Session ${sessionId}] Connected to AssemblyAI streaming service`);

    } catch (error) {
      console.error(`[Session ${sessionId}] Failed to initialize transcriber:`, error);
      isTranscriberReady = false;
      if (sessionId) {
        await sendToProxy(sessionId, {
          connection_status: 'error',
        });
      }
      
      // Send error to client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to initialize transcription service',
        }));
      }
    }
  }

  // Handle messages from Koach app
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[Session ${sessionId || 'unknown'}] Message received:`, message.type);

      // Handle session initialization
      if (message.type === 'session.init') {
        sessionId = message.sessionId;
        console.log(`[Session ${sessionId}] Session initialized`);

        // Initialize transcriber
        await initializeTranscriber();

        // Send connection status to proxy
        await sendToProxy(sessionId, {
          connection_status: 'connected',
          recording_status: 'recording',
        });

        // Send ready confirmation to client
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'session.ready',
            sessionId: sessionId,
          }));
        }

        return;
      }

      // Handle audio data
      if (message.type === 'input_audio_buffer.append') {
        if (!message.audio) {
          console.warn(`[Session ${sessionId}] Received audio message without audio data`);
          return;
        }

        // Send audio to AssemblyAI transcriber
        if (transcriber && isTranscriberReady) {
          try {
            // Decode base64 string to binary buffer
            const audioBuffer = Buffer.from(message.audio, 'base64');
            console.log(`[Session ${sessionId}] Sending audio to transcriber: ${audioBuffer.length} bytes`);
            
            // Send raw PCM buffer to transcriber
            transcriber.sendAudio(audioBuffer);
          } catch (error) {
            console.error(`[Session ${sessionId}] Error sending audio:`, error.message);
          }
        } else {
          console.warn(`[Session ${sessionId}] Transcriber not ready, dropping audio chunk`);
        }

        return;
      }

      // Handle session end
      if (message.type === 'session.end') {
        console.log(`[Session ${sessionId}] Session end requested`);
        
        if (transcriber && isTranscriberReady) {
          console.log(`[Session ${sessionId}] Closing transcriber...`);
          await transcriber.close();
        }

        return;
      }

      // Log unknown message types
      console.log(`[Session ${sessionId}] Unknown message type:`, message.type);
      
    } catch (error) {
      console.error(`[Session ${sessionId || 'unknown'}] Error processing message:`, error.message);
    }
  });

  // Handle disconnection
  ws.on('close', async (code, reason) => {
    console.log(`[Session ${sessionId || 'unknown'}] Client disconnected:`, code, reason.toString());

    // Close AssemblyAI connection
    if (transcriber && isTranscriberReady) {
      try {
        console.log(`[Session ${sessionId}] Closing transcriber connection...`);
        await transcriber.close();
      } catch (error) {
        console.error(`[Session ${sessionId}] Error closing transcriber:`, error);
      }
    }

    // Send final updates to proxy
    if (sessionId) {
      console.log(`[Session ${sessionId}] Sending final updates to proxy...`);
      
      // Send final transcript updates
      if (fullTranscript) {
        await sendToProxy(sessionId, {
          live_transcript: fullTranscript,
          recording_transcript: fullTranscript,
        });
      }

      // Update status
      await sendToProxy(sessionId, {
        connection_status: 'disconnected',
        recording_status: 'completed',
      });
    }
  });

  // Handle errors
  ws.on('error', async (error) => {
    console.error(`[Session ${sessionId || 'unknown'}] WebSocket error:`, error);

    if (sessionId) {
      await sendToProxy(sessionId, {
        connection_status: 'error',
      });
    }
  });
});

// Handle server errors
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 Koach Transcription Server Started');
  console.log(`📡 Listening on: 0.0.0.0:${PORT}`);
  console.log(`📡 WebSocket endpoint: /realtime`);
  console.log(`🏥 Health check: /health`);
  console.log('=================================');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

