# Migration Guide: From Vercel to WebSocket-Capable Platforms

## 🚨 What Happened?

Your Koach transcription service was crashing with `FUNCTION_INVOCATION_FAILED` errors on Vercel because:

### Root Cause
**Vercel serverless functions do not support WebSocket connections.**

### Technical Details

1. **Original Code Used Cloudflare Workers API**
   - `WebSocketPair()` - This is a Cloudflare Workers-specific API
   - Response with `webSocket` property - Cloudflare Workers syntax
   - These APIs don't exist in Vercel's Node.js runtime

2. **Vercel Limitations**
   - Serverless functions are stateless and short-lived (max 60 seconds)
   - WebSockets require persistent, long-lived connections
   - No WebSocket support in standard serverless functions
   - Edge Functions have experimental WebSocket support but with limitations

3. **Why Health Endpoint Worked**
   - Simple HTTP request/response (no persistent connection needed)
   - Completed in milliseconds (well under function timeout)
   - No special runtime features required

## ✅ What Was Fixed?

### New Implementation

The service has been completely refactored to use proper WebSocket server architecture:

1. **Standard WebSocket Server**
   - Uses `ws` library (industry standard for Node.js WebSocket servers)
   - Proper HTTP server with WebSocket upgrade handling
   - Persistent connection support

2. **AssemblyAI Integration**
   - Uses `aai.realtime.transcriber()` for streaming
   - Proper event handling (open, transcript, error, close)
   - Bidirectional audio streaming

3. **Platform Compatibility**
   - Works on any platform that supports persistent connections
   - Railway, Render, Heroku, Fly.io, DigitalOcean, etc.
   - **Not compatible with Vercel**

### Files Changed

- ✅ **NEW:** `server.js` - Standalone WebSocket server
- ✅ **UPDATED:** `package.json` - Added `ws` dependency, updated scripts
- ✅ **UPDATED:** `README.md` - Complete rewrite with deployment guides
- ✅ **NEW:** `Procfile` - For Heroku deployment
- ✅ **NEW:** `railway.json` - For Railway deployment
- ✅ **NEW:** `render.yaml` - For Render deployment
- ✅ **UPDATED:** `test-websocket.html` - Updated URLs and instructions
- ⚠️ **DEPRECATED:** `/api/realtime.js` - No longer used (can be removed)
- ⚠️ **DEPRECATED:** `/api/health.js` - No longer used (replaced by server.js)

## 🚀 Next Steps

### Option A: Deploy to Railway (Recommended - Easiest)

Railway offers the best developer experience with WebSocket support.

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Initialize Project:**
   ```bash
   railway login
   railway init
   ```

3. **Set Environment Variables:**
   ```bash
   railway variables set ASSEMBLYAI_API_KEY=your_key_here
   railway variables set PROXY_SECRET=your_secret_here
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

5. **Get Your URL:**
   ```bash
   railway domain
   ```

6. **Your WebSocket URL:**
   ```
   wss://your-app.railway.app/realtime
   ```

### Option B: Deploy to Render

Render is a great Heroku alternative with good free tier.

1. **Go to [render.com](https://render.com)**

2. **Create New Web Service**
   - Connect your GitHub repo
   - Select "Web Service"

3. **Configure Build Settings:**
   - **Name:** koach-transcription
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

4. **Add Environment Variables:**
   - `ASSEMBLYAI_API_KEY` = your_key
   - `PROXY_SECRET` = your_secret

5. **Deploy!**

6. **Your WebSocket URL:**
   ```
   wss://koach-transcription.onrender.com/realtime
   ```

### Option C: Deploy to Heroku

Classic PaaS with great WebSocket support.

1. **Install Heroku CLI:**
   ```bash
   brew install heroku/brew/heroku
   ```

2. **Login and Create App:**
   ```bash
   heroku login
   heroku create koach-transcription
   ```

3. **Set Environment Variables:**
   ```bash
   heroku config:set ASSEMBLYAI_API_KEY=your_key_here
   heroku config:set PROXY_SECRET=your_secret_here
   ```

4. **Deploy:**
   ```bash
   git push heroku main
   ```

5. **Your WebSocket URL:**
   ```
   wss://koach-transcription.herokuapp.com/realtime
   ```

## 🧪 Testing Your New Deployment

### 1. Test Health Endpoint

```bash
# Replace with your actual URL
curl https://your-app.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-22T12:00:00.000Z",
  "service": "koach-transcription",
  "version": "2.0.0",
  "websocket": "enabled"
}
```

### 2. Test WebSocket Connection

**Option A: Use the HTML test tool**
1. Open `test-websocket.html` in your browser
2. Update the URL to your deployment
3. Click "Connect"
4. Click "Send session.init"
5. Check logs for success

**Option B: Use wscat CLI**
```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c wss://your-app.railway.app/realtime

# Send message
{"type":"session.init","sessionId":"test-123"}
```

### 3. Test with Koach App

Update your Koach app configuration with the new WebSocket URL:

```javascript
// Old (Vercel - doesn't work)
const wsUrl = 'wss://koach-transcription.vercel.app/api/realtime';

// New (Railway/Render/Heroku - works!)
const wsUrl = 'wss://your-app.railway.app/realtime';
```

## 📊 Comparison: Before vs After

| Aspect | Before (Vercel) | After (Railway/Render) |
|--------|-----------------|------------------------|
| WebSocket Support | ❌ No | ✅ Yes |
| Function Timeout | 60 seconds max | ⏱️ Unlimited |
| Connection Type | Stateless | Persistent |
| Pricing | Free tier | Free tier available |
| Deployment | `vercel deploy` | `railway up` / git push |
| Logs | Function logs | Real-time streaming logs |
| Error | FUNCTION_INVOCATION_FAILED | ✅ Works! |

## 🔍 Debugging Tips

### Check Server Logs

**Railway:**
```bash
railway logs
```

**Render:**
- Go to your service dashboard
- Click "Logs" tab

**Heroku:**
```bash
heroku logs --tail
```

### Common Issues

#### Issue: "Connection refused"
**Solution:** Server might not be running. Check logs for startup errors.

#### Issue: "Unable to connect to WebSocket"
**Solution:** Verify URL uses `wss://` for HTTPS and `ws://` for HTTP.

#### Issue: "No transcripts received"
**Solution:** 
- Check AssemblyAI API key is valid
- Verify audio format (16kHz, mono, PCM16)
- Check server logs for transcription errors

#### Issue: "Database not updating"
**Solution:**
- Verify `PROXY_SECRET` is set
- Check proxy endpoint is accessible
- Check server logs for proxy errors

## 🗑️ Cleanup (Optional)

You can remove the old Vercel-specific files if you're not going back:

```bash
# Remove old API functions
rm -rf api/

# Remove Vercel config
rm vercel.json
rm vercelignore
```

Or keep them as reference - they won't interfere with the new deployment.

## 💰 Cost Comparison

### Vercel (Old)
- ✅ Free tier: 100 GB-hours/month
- ❌ **Problem:** Doesn't support WebSockets!

### Railway (New - Recommended)
- ✅ Free tier: $5 monthly credit (no credit card required)
- ✅ WebSocket support: Full
- ✅ Deployment: Git-based, super easy
- 💵 Paid: Pay per usage after free credit

### Render (New - Alternative)
- ✅ Free tier: 750 hours/month
- ✅ WebSocket support: Full
- ⚠️ Note: Free tier instances spin down after 15 min inactivity
- 💵 Paid: $7/month for always-on instances

### Heroku (New - Classic)
- ✅ Free tier: Gone (as of Nov 2022)
- ✅ WebSocket support: Full
- 💵 Paid: $7/month minimum (Eco dynos)

**Recommendation:** Start with Railway for best free tier + ease of use.

## 📚 Resources

- [AssemblyAI Streaming Docs](https://www.assemblyai.com/docs/universal-streaming)
- [Railway Documentation](https://docs.railway.app)
- [Render Documentation](https://render.com/docs)
- [ws Library Documentation](https://github.com/websockets/ws)

## ✨ Benefits of the New Setup

1. **Proper WebSocket Support** - No more crashes!
2. **Better Logging** - See everything happening in real-time
3. **Persistent Connections** - Sessions can last as long as needed
4. **Standard Architecture** - Works on any platform
5. **Better Performance** - No cold starts, dedicated resources
6. **Easier Debugging** - Real server with full access

## ❓ FAQ

**Q: Can I go back to Vercel?**
A: No, Vercel fundamentally doesn't support WebSockets for serverless functions. You need a platform with persistent connection support.

**Q: What about Vercel Edge Functions?**
A: Edge Functions have experimental WebSocket support, but it's limited and not recommended for production streaming applications.

**Q: Will this cost more?**
A: Railway and Render both have generous free tiers. For a transcription service with moderate usage, you'll likely stay within free tier limits.

**Q: Do I need to change my Koach app code?**
A: Only the WebSocket URL needs to change. The protocol (message format) remains the same.

**Q: Can I test locally first?**
A: Yes! Run `npm start` and connect to `ws://localhost:3000/realtime`

**Q: What if I have multiple Koach apps?**
A: Each app connects to the same WebSocket server. The `sessionId` in `session.init` keeps them separate.

## 🎉 Conclusion

Your transcription service is now properly architected for WebSocket communication! Choose your deployment platform and get started with real-time streaming transcription.

**Recommended Next Step:** Deploy to Railway (takes ~5 minutes)

```bash
npm install -g @railway/cli
railway login
railway init
railway variables set ASSEMBLYAI_API_KEY=your_key
railway up
```

Good luck! 🚀

