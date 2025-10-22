# Koach-transcription

Real-time transcription service that receives audio from a Coach web application, transcribes it using AssemblyAI, and sends the transcript back to the Coach app via Supabase.

## Architecture

1. **Coach App (Frontend)** → Sends audio via WebSocket
2. **Vercel Server** → Receives audio, forwards to AssemblyAI, receives transcripts
3. **AssemblyAI** → Performs real-time transcription
4. **Vercel Server** → Sends transcripts to Lovable Cloud Supabase proxy
5. **Coach App** → Displays live transcription

## Endpoints

### `/api/realtime` - Real-Time Transcription WebSocket (Edge Function)

WebSocket endpoint that bridges audio from the Coach app to AssemblyAI and returns transcripts.

**WebSocket URL:**
```
wss://your-deployment.vercel.app/api/realtime
```

## Message Formats

### Messages from Coach App → Server

#### 1. Session Initialization
```json
{
  "type": "session.init",
  "sessionId": "uuid-string"
}
```

**Response:** Server sends connection status to Supabase proxy.

#### 2. Audio Data
```json
{
  "type": "input_audio_buffer.append",
  "audio": "base64-encoded-pcm16-audio"
}
```

**Audio Specifications:**
- **Sample Rate:** 16000 Hz (16kHz)
- **Channels:** 1 (mono)
- **Format:** PCM16 (16-bit PCM)
- **Encoding:** Base64-encoded
- **Minimum Chunk Size:** 1600 samples (100ms at 16kHz)

### Messages from Server → Coach App

#### Final Transcript
```json
{
  "type": "transcript.final",
  "text": "This is a final transcript utterance.",
  "full_transcript": "Previous utterance.\nThis is a final transcript utterance."
}
```

---

## AssemblyAI Integration Details

This service uses **AssemblyAI v3 Streaming API** for real-time transcription.

**API Endpoint:**
```
wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true
```

**Audio Format:**
- Receives: Base64-encoded PCM16 from Coach app
- Sends to AssemblyAI: Raw PCM binary buffer (decoded from base64)
- Sample Rate: 16000 Hz
- Channels: 1 (mono)

**Authentication:**
- Method: `Authorization` header (not query param)
- Value: Your AssemblyAI API key

**Message Types Received from AssemblyAI:**
- `Begin` - Session initialization confirmation
- `Turn` - Transcript updates (both partial and final)
  - `turn_is_formatted: true` - Final transcript (formatted, complete utterance)
  - `turn_is_formatted: false` - Partial transcript (in-progress, not used)
- `Termination` - Session ended with duration stats

## Transcript Handling

### Database Updates

Transcripts are sent to the Supabase proxy at:
```
https://tisayujoykquxfflubjn.supabase.co/functions/v1/proxy-transcript
```

**Update Intervals:**
- `live_transcript`: Updated every **5 seconds** (for real-time UI)
- `recording_transcript`: Updated every **30 seconds** (for permanent storage)

**Important:** Only **final transcripts** are sent to the database (not partial/interim transcripts). This prevents self-correcting text in the UI.

### Transcript Accumulation

The server maintains a `fullTranscript` string that accumulates all final transcripts:
- Each final transcript is appended with a newline separator
- The **entire accumulated transcript** is sent on each update (not deltas)
- Transcripts persist for the duration of the WebSocket connection

## Environment Variables

Set these in your Vercel project settings:

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
PROXY_SECRET=your_proxy_secret_key
```

### Getting Environment Variables

1. **AssemblyAI API Key:** Get from [AssemblyAI Dashboard](https://www.assemblyai.com/dashboard)
2. **Proxy Secret:** Provided by your Lovable Cloud Supabase configuration

### Setting in Vercel

```bash
# Via Vercel CLI
vercel env add ASSEMBLYAI_API_KEY
vercel env add PROXY_SECRET

# Or via Vercel Dashboard:
# Project Settings → Environment Variables
```

## Connection Status Updates

The server automatically updates the Supabase database with connection status:

| Event | Status Updates |
|-------|----------------|
| Session Init | `connection_status: 'connected'`, `recording_status: 'recording'` |
| Disconnection | `connection_status: 'disconnected'`, `recording_status: 'completed'` |
| Error | `connection_status: 'error'` |

## Testing Checklist

Before deploying to production, verify:

- [ ] Audio format matches: 16kHz, mono, PCM16, base64
- [ ] Only final transcripts are sent to database (not partial)
- [ ] Full accumulated transcript is sent (not deltas)
- [ ] Update intervals are respected (5s for live, 30s for recording)
- [ ] Proxy authentication works (`x-api-key` header)
- [ ] Error handling for all proxy responses (401, 400, 404, 500)
- [ ] Connection status updates correctly on init
- [ ] Recording status updates on completion
- [ ] WebSocket reconnection handled gracefully
- [ ] Session cleanup on disconnection
- [ ] AssemblyAI connection establishes successfully
- [ ] Transcripts appear in Supabase database

## Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy
vercel --prod
```

### Verify Deployment

1. Check deployment logs in Vercel Dashboard
2. Test WebSocket connection using a WebSocket client
3. Send test audio and verify transcripts appear in Supabase
4. Monitor logs for any errors

## Troubleshooting

### WebSocket Connection Fails
- Verify `ASSEMBLYAI_API_KEY` is set in Vercel environment variables
- Check Vercel logs for connection errors
- Ensure Edge runtime is configured for `/api/realtime`

### No Transcripts in Database
- Verify `PROXY_SECRET` is correct
- Check proxy endpoint returns 200 status
- Ensure `session_id` is sent in `session.init` message
- Monitor server logs for proxy errors (401, 400, 404, 500)

### Audio Not Transcribing
- Verify audio format: 16kHz, mono, PCM16, base64
- Ensure minimum chunk size is 1600 samples (100ms)
- Check AssemblyAI WebSocket connection status in logs
- Test with AssemblyAI's example audio to isolate issues

### Partial Transcripts Causing UI Issues
- Confirm only `transcript.final` events are being sent
- Verify `message_type === 'FinalTranscript'` in code
- Check that partial transcripts are being ignored

## Success Criteria

When correctly implemented, the Coach app will:

1. ✅ Show live transcription appearing in real-time (updated every 5s)
2. ✅ Display smooth, non-flickering text (only final transcripts)
3. ✅ Have a complete transcript stored in the database every 30s
4. ✅ Show accurate connection and recording status
5. ✅ Handle reconnections gracefully

## License

MIT