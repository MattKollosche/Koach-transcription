# Koach Transcription Service

## ⚠️ CRITICAL: STREAMING TRANSCRIPTION ONLY

This service uses **AssemblyAI Streaming Speech-to-Text** for real-time transcription. 

**DO NOT USE:**
- `aai.transcripts.create()` - This is batch/POST-processing
- Any batch transcription endpoints
- POST-processing transcription methods

**ONLY USE:**
- `aai.streaming.transcriber()` - This is real-time streaming
- WebSocket-based real-time transcription
- Streaming Speech-to-Text API

## Architecture

This service provides:
- **Real-time streaming transcription** via WebSocket
- **Live transcript updates** to Supabase database
- **WebSocket bridge** between Koach app and AssemblyAI streaming API

## AssemblyAI Streaming API Reference

Based on: https://www.assemblyai.com/docs/universal-streaming#quickstart

### Key Features:
- Real-time streaming transcription
- Immutable transcriptions (text won't be overwritten)
- Turn-based processing with formatted final transcripts
- WebSocket-based communication
- Live transcript updates every 5 seconds
- Recording transcript updates every 30 seconds

## Endpoints

### `/api/realtime` - Real-Time Streaming Transcription WebSocket

WebSocket endpoint that bridges audio from the Koach app to AssemblyAI using the official SDK and returns streaming transcripts.

**WebSocket URL:**
```
wss://your-deployment.vercel.app/api/realtime
```

**Message Format from Koach App:**

1. **Session Initialization:**
```json
{
  "type": "session.init",
  "sessionId": "unique-session-id"
}
```

2. **Audio Data:**
```json
{
  "type": "input_audio_buffer.append",
  "audio": "base64-encoded-pcm16-audio-data"
}
```

**Message Format to Koach App:**

1. **Final Transcript:**
```json
{
  "type": "transcript.final",
  "text": "This is the final transcript text",
  "full_transcript": "Complete accumulated transcript"
}
```

### `/api/health` - Health Check

Simple health check endpoint to verify service status.

**URL:**
```
https://your-deployment.vercel.app/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-22T05:54:07.774Z",
  "service": "koach-transcription",
  "version": "1.0.0"
}
```

## AssemblyAI Integration Details

This service uses **AssemblyAI JavaScript SDK v4** with streaming transcription for real-time processing.

**SDK Configuration:**
```javascript
const transcriber = client.streaming.transcriber({
  sampleRate: 16000,
  formatTurns: true,
});
```

**Audio Format:**
- Receives: Base64-encoded PCM16 from Koach app
- Sends to AssemblyAI: Raw PCM binary buffer (decoded from base64)
- Sample Rate: 16000 Hz
- Channels: 1 (mono)

**Authentication:**
- Method: AssemblyAI SDK handles authentication automatically
- Configuration: Uses `ASSEMBLYAI_API_KEY` environment variable

**SDK Events:**
- `open` - Session initialization with session ID
- `turn` - Final transcript updates (formatted turns only)
- `error` - Connection or processing errors
- `close` - Session termination with status codes

## Environment Variables

Required environment variables:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
PROXY_SECRET=your_supabase_proxy_secret
```

## Dependencies

The service uses the following key dependencies:

- `assemblyai` (^4.0.0) - Official AssemblyAI JavaScript SDK for streaming transcription
- `node-fetch` (^3.3.2) - HTTP client for proxy communication

## Testing

### WebSocket Test

Use the included `test-websocket.html` file to test the WebSocket connection:

1. Open `test-websocket.html` in your browser
2. Click "Connect" to establish WebSocket connection
3. Click "Send session.init" to initialize a session
4. Check your Supabase database for status updates

### Health Check

Test the health endpoint:
```bash
curl https://your-deployment.vercel.app/api/health
```

## Database Updates

The service automatically updates your Supabase database via the proxy endpoint:

- **live_transcript**: Updated every 5 seconds during active transcription
- **recording_transcript**: Updated every 30 seconds during active transcription
- **connection_status**: Updated when WebSocket connects/disconnects
- **recording_status**: Updated when recording starts/stops

## Deployment

This service is designed for deployment on Vercel:

1. Push code to GitHub repository
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy automatically on push to main branch

## Important Notes

- **Streaming Only**: This service only provides streaming transcription, not batch processing
- **Real-time**: Transcripts are delivered in real-time as speech is detected
- **Immutable**: Once a transcript is finalized, it won't be changed
- **Formatted**: Final transcripts include punctuation and proper formatting
- **Koach App**: This service is specifically designed for the Koach application

## Troubleshooting

### WebSocket Connection Issues
- Verify WebSocket URL is correct
- Check that the session is properly initialized
- Ensure audio data is in correct format (base64 PCM16)

### Transcription Issues
- Verify AssemblyAI API key is set correctly
- Check audio format matches requirements (16kHz, mono, PCM16)
- Ensure sufficient audio quality for transcription

### Database Update Issues
- Verify PROXY_SECRET environment variable is set
- Check Supabase proxy endpoint is accessible
- Monitor Vercel function logs for proxy communication errors