# Koach Transcription Service

## ⚠️ IMPORTANT: WebSocket Server (Not Vercel Compatible)

**UPDATE:** This service has been converted to a standard WebSocket server because **Vercel does not support WebSocket connections in serverless functions**.

### Why the Change?

The original implementation tried to use WebSockets on Vercel, which caused `FUNCTION_INVOCATION_FAILED` errors because:
- Vercel serverless functions are stateless and short-lived
- WebSocket connections require persistent, long-lived connections
- AssemblyAI streaming transcription requires bidirectional WebSocket communication

### Solution

This service now uses a proper WebSocket server with the `ws` library that can be deployed to platforms that support persistent connections:
- ✅ **Railway** (Recommended)
- ✅ **Render**
- ✅ **Heroku**
- ✅ **Fly.io**
- ✅ **DigitalOcean App Platform**
- ❌ **Vercel** (Not supported)

---

## ⚠️ CRITICAL: STREAMING TRANSCRIPTION ONLY

This service uses **AssemblyAI Streaming Speech-to-Text** for real-time transcription. 

**DO NOT USE:**
- `aai.transcripts.create()` - This is batch/POST-processing
- Any batch transcription endpoints
- POST-processing transcription methods

**ONLY USE:**
- `aai.realtime.transcriber()` - This is real-time streaming
- WebSocket-based real-time transcription
- Streaming Speech-to-Text API

## Architecture

This service provides:
- **Real-time streaming transcription** via WebSocket
- **Live transcript updates** to Supabase database
- **WebSocket bridge** between Koach app and AssemblyAI streaming API
- **Persistent connection** for continuous audio streaming

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

Create a `.env` file or set environment variables:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
PROXY_SECRET=your_proxy_secret_here  # Optional, for Supabase integration
PORT=3000  # Optional, will be set automatically by hosting platforms
```

### 3. Run Locally

```bash
npm start
```

The server will start on port 3000 (or the PORT environment variable):
- **WebSocket endpoint:** `ws://localhost:3000/realtime`
- **Health check:** `http://localhost:3000/health`

## Deployment Options

### Option 1: Railway (Recommended)

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login and create new project:
   ```bash
   railway login
   railway init
   ```

3. Set environment variables:
   ```bash
   railway variables set ASSEMBLYAI_API_KEY=your_key_here
   railway variables set PROXY_SECRET=your_secret_here
   ```

4. Deploy:
   ```bash
   railway up
   ```

5. Get your WebSocket URL:
   ```bash
   railway domain
   ```
   Your WebSocket endpoint will be: `wss://your-app.railway.app/realtime`

### Option 2: Render

1. Create a new Web Service on [Render](https://render.com)

2. Connect your GitHub repository

3. Configure build settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

4. Add environment variables:
   - `ASSEMBLYAI_API_KEY`
   - `PROXY_SECRET`

5. Deploy!

Your WebSocket endpoint will be: `wss://your-app.onrender.com/realtime`

### Option 3: Heroku

1. Install Heroku CLI and login:
   ```bash
   heroku login
   ```

2. Create new app:
   ```bash
   heroku create your-app-name
   ```

3. Set environment variables:
   ```bash
   heroku config:set ASSEMBLYAI_API_KEY=your_key_here
   heroku config:set PROXY_SECRET=your_secret_here
   ```

4. Deploy:
   ```bash
   git push heroku main
   ```

Your WebSocket endpoint will be: `wss://your-app-name.herokuapp.com/realtime`

## Endpoints

### `GET /` - Root Endpoint

Simple information endpoint.

**Response:**
```
Koach Transcription WebSocket Server
Connect to /realtime for streaming transcription
```

### `GET /health` - Health Check

Health check endpoint to verify service status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-22T12:00:00.000Z",
  "service": "koach-transcription",
  "version": "2.0.0",
  "websocket": "enabled"
}
```

### `WS /realtime` - Real-Time Streaming Transcription

WebSocket endpoint that bridges audio from the Koach app to AssemblyAI and returns streaming transcripts.

**WebSocket URL:**
```
wss://your-deployment.railway.app/realtime
```

## WebSocket Protocol

### Messages FROM Koach App TO Server:

#### 1. Session Initialization
```json
{
  "type": "session.init",
  "sessionId": "unique-session-id"
}
```

**Response:**
```json
{
  "type": "session.ready",
  "sessionId": "unique-session-id"
}
```

#### 2. Audio Data
```json
{
  "type": "input_audio_buffer.append",
  "audio": "base64-encoded-pcm16-audio-data"
}
```

#### 3. Session End
```json
{
  "type": "session.end"
}
```

### Messages FROM Server TO Koach App:

#### 1. Final Transcript
```json
{
  "type": "transcript.final",
  "text": "This is the final transcript text",
  "full_transcript": "Complete accumulated transcript"
}
```

#### 2. Error
```json
{
  "type": "error",
  "error": "Error message"
}
```

## AssemblyAI Integration Details

This service uses **AssemblyAI JavaScript SDK v4** with real-time streaming transcription.

**SDK Configuration:**
```javascript
const transcriber = aai.realtime.transcriber({
  sampleRate: 16000,
});
```

**Audio Format:**
- **Input:** Base64-encoded PCM16 from Koach app
- **Sent to AssemblyAI:** Raw PCM binary buffer (decoded from base64)
- **Sample Rate:** 16000 Hz (16 kHz)
- **Channels:** 1 (mono)
- **Encoding:** PCM16 (16-bit linear PCM)

**SDK Events:**
- `open` - Session opened with AssemblyAI
- `transcript` - Transcript updates (only FinalTranscript messages are processed)
- `error` - Connection or processing errors
- `close` - Session closed

**Reference:** https://www.assemblyai.com/docs/universal-streaming#quickstart

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ASSEMBLYAI_API_KEY` | ✅ Yes | Your AssemblyAI API key from https://www.assemblyai.com/dashboard |
| `PROXY_SECRET` | ⚠️ Optional | Secret for authenticating with Supabase proxy function |
| `PORT` | ⚠️ Optional | Server port (defaults to 3000, set automatically by hosting platforms) |

## Database Updates

The service automatically updates your Supabase database via the proxy endpoint:

- **live_transcript**: Updated every 5 seconds during active transcription
- **recording_transcript**: Updated every 30 seconds during active transcription
- **connection_status**: Updated when WebSocket connects/disconnects/errors
- **recording_status**: Updated when recording starts/completes

**Proxy Endpoint:** `https://tisayujoykquxfflubjn.supabase.co/functions/v1/proxy-transcript`

## Testing

### Local Testing

1. Start the server:
   ```bash
   npm start
   ```

2. Open `test-websocket.html` in your browser

3. Update the WebSocket URL to `ws://localhost:3000/realtime`

4. Click "Connect" to establish connection

5. Click "Send session.init" to initialize a session

6. Monitor the console for messages

### Health Check Testing

```bash
# Local
curl http://localhost:3000/health

# Production
curl https://your-app.railway.app/health
```

### WebSocket Testing with wscat

Install wscat:
```bash
npm install -g wscat
```

Connect to WebSocket:
```bash
# Local
wscat -c ws://localhost:3000/realtime

# Production
wscat -c wss://your-app.railway.app/realtime
```

Send messages:
```json
{"type":"session.init","sessionId":"test-session-123"}
```

## Logging

The server includes comprehensive logging for debugging:

- Connection establishment and closure
- Session initialization
- Audio data reception and forwarding
- Transcript reception and delivery
- Error handling
- Database update attempts

All logs are prefixed with `[Session {sessionId}]` for easy tracking.

## Troubleshooting

### WebSocket Connection Issues

**Problem:** Cannot connect to WebSocket
- ✓ Verify the URL is correct (`wss://` for HTTPS, `ws://` for HTTP)
- ✓ Check that the server is running and accessible
- ✓ Ensure no firewall is blocking WebSocket connections
- ✓ Check server logs for connection errors

**Problem:** Connection closes immediately
- ✓ Send `session.init` message right after connecting
- ✓ Check AssemblyAI API key is valid
- ✓ Check server logs for initialization errors

### Transcription Issues

**Problem:** No transcripts received
- ✓ Verify audio format is correct (16kHz, mono, PCM16)
- ✓ Ensure audio data is base64-encoded
- ✓ Check that audio chunks are being sent regularly
- ✓ Verify AssemblyAI API key has streaming access
- ✓ Check server logs for transcription errors

**Problem:** Transcripts are inaccurate
- ✓ Ensure audio quality is good (clear speech, minimal background noise)
- ✓ Verify sample rate is exactly 16000 Hz
- ✓ Check that audio is mono (single channel)

### Database Update Issues

**Problem:** Database not updating
- ✓ Verify `PROXY_SECRET` environment variable is set
- ✓ Check that proxy endpoint is accessible
- ✓ Check server logs for proxy communication errors
- ✓ Verify sessionId is being sent correctly

### Platform-Specific Issues

**Railway:**
- Make sure you've set environment variables in Railway dashboard
- Check deployment logs for startup errors
- Verify domain is assigned to your service

**Render:**
- Ensure build and start commands are correct
- Check that health check path is `/health`
- Verify environment variables are set in Render dashboard

**Heroku:**
- Check that `Procfile` is committed to git
- Verify environment variables with `heroku config`
- Monitor logs with `heroku logs --tail`

## Important Notes

- **Streaming Only**: This service only provides streaming transcription, not batch processing
- **Real-time**: Transcripts are delivered in real-time as speech is detected
- **Persistent Connection**: Requires hosting platform with WebSocket support
- **Not for Vercel**: This service cannot be deployed on Vercel due to WebSocket limitations
- **Koach Integration**: Designed specifically for the Koach application

## Migration from Vercel

If you were previously trying to deploy this on Vercel:

1. Choose a new hosting platform (Railway recommended)
2. Deploy using instructions above
3. Update your Koach app with the new WebSocket URL
4. Update environment variables on new platform
5. Test the connection

## Dependencies

- `assemblyai` (^4.0.0) - Official AssemblyAI JavaScript SDK for streaming transcription
- `ws` (^8.18.0) - WebSocket server implementation

## Support

For issues or questions:
- Check the [AssemblyAI documentation](https://www.assemblyai.com/docs)
- Review server logs for error messages
- Test with the included HTML test tool

## License

MIT
