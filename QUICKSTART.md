# Quick Start Guide

## 🚨 Important: Vercel Doesn't Support WebSockets!

This service **cannot run on Vercel**. It requires a platform with persistent WebSocket support.

## ⚡ Fastest Path to Working Service (5 minutes)

### Deploy to Railway

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Deploy in 3 commands:**
   ```bash
   railway login
   railway init
   railway up
   ```

3. **Set environment variables:**
   ```bash
   railway variables set ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
   railway variables set PROXY_SECRET=your_proxy_secret_here
   ```

4. **Get your URL:**
   ```bash
   railway domain
   ```

5. **Use your WebSocket URL:**
   ```
   wss://your-app.railway.app/realtime
   ```

**Done! Your WebSocket server is live.** 🎉

## 🧪 Test Locally First

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   ASSEMBLYAI_API_KEY=your_key_here
   PROXY_SECRET=your_secret_here
   ```

3. **Start server:**
   ```bash
   npm start
   ```

4. **Test it:**
   - Health check: http://localhost:3000/health
   - WebSocket: ws://localhost:3000/realtime
   - Test tool: Open `test-websocket.html` in browser

## 🔑 Get Your API Key

Get your AssemblyAI API key from:
https://www.assemblyai.com/dashboard

## 📱 Update Your Koach App

Change your WebSocket URL in your Koach app:

```javascript
// Old (doesn't work on Vercel)
const wsUrl = 'wss://koach-transcription.vercel.app/api/realtime';

// New (works on Railway/Render/Heroku)
const wsUrl = 'wss://your-app.railway.app/realtime';
```

## ❓ Need Help?

- See `MIGRATION_GUIDE.md` for detailed explanation
- See `README.md` for complete documentation
- Check server logs: `railway logs` (Railway) or check platform dashboard

## 🎯 What's Next?

1. Deploy to Railway (or Render/Heroku)
2. Update your Koach app with new WebSocket URL
3. Test the connection
4. Start transcribing!

**Simple as that!** 🚀

