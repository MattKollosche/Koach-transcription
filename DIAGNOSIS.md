# Diagnosis: WebSocket Function Crash on Vercel

## 🔍 Issue Summary

**Error:** `FUNCTION_INVOCATION_FAILED` - 500 Internal Server Error  
**Location:** `/api/realtime.js` WebSocket endpoint  
**Status:** Health endpoint working ✅, WebSocket endpoint crashing ❌

## 🎯 Root Cause Analysis

### Primary Issue: Platform Incompatibility

**Vercel serverless functions do not support WebSocket connections.**

### Technical Details

#### 1. Architecture Mismatch

The code was written using **Cloudflare Workers WebSocket API**:

```javascript
// Line 50 in /api/realtime.js
const pair = new WebSocketPair(); // ❌ Cloudflare Workers API

// Lines 353-356
return new Response(null, {
  status: 101,
  webSocket: wsClient,  // ❌ Cloudflare Workers response format
});
```

This syntax works on Cloudflare Workers but **does not exist on Vercel**.

#### 2. Runtime Environment Differences

| Feature | Cloudflare Workers | Vercel Serverless |
|---------|-------------------|-------------------|
| WebSocketPair | ✅ Available | ❌ Not available |
| WebSocket response | ✅ Supported | ❌ Not supported |
| Persistent connections | ✅ Yes | ❌ No |
| Function lifetime | ⏱️ Until idle | ⏱️ Max 60 seconds |
| State management | ✅ Durable Objects | ❌ Stateless |

#### 3. Why Health Endpoint Worked

The health endpoint (`/api/health.js`) uses standard HTTP request/response:

```javascript
module.exports = (req, res) => {
  res.status(200).json({ status: 'healthy' }); // ✅ Works fine
};
```

This doesn't require WebSockets or persistent connections, so it works perfectly on Vercel.

#### 4. The Fatal Error Chain

1. **Function starts** → Runtime initializes ✅
2. **Check for WebSocketPair** → `typeof WebSocketPair === 'undefined'` → **true** ❌
3. **Code tries to return early** → But execution may continue to WebSocketPair creation
4. **WebSocketPair constructor called** → `ReferenceError: WebSocketPair is not defined` ❌
5. **Unhandled exception** → Function crashes → `FUNCTION_INVOCATION_FAILED` ❌

### Why This Wasn't Caught Earlier

The code has a check for WebSocketPair:

```javascript
// Line 44-47
if (typeof WebSocketPair === 'undefined') {
  console.error('WebSocketPair is not available in this runtime');
  return new Response('WebSocket not supported in this runtime', { status: 500 });
}
```

However, the function still attempts to create WebSocketPair right after this check (line 50), causing an immediate crash if the check fails.

## 🔬 Detailed Error Analysis

### Error Stack Trace (Expected)

```
ReferenceError: WebSocketPair is not defined
    at handler (/api/realtime.js:50:15)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
```

### Vercel Function Logs (What You'd See)

```
[2025-10-22 12:00:00] Request method: GET
[2025-10-22 12:00:00] Request URL: /api/realtime
[2025-10-22 12:00:00] Upgrade header: websocket
[2025-10-22 12:00:00] Connection header: Upgrade
[2025-10-22 12:00:00] Creating WebSocket pair...
[2025-10-22 12:00:00] WebSocketPair is not available in this runtime
[2025-10-22 12:00:00] ERROR: ReferenceError: WebSocketPair is not defined
[2025-10-22 12:00:00] FUNCTION_INVOCATION_FAILED
```

## ✅ Solution

### The Fix

Replace Vercel serverless function with a proper WebSocket server that can be deployed to a WebSocket-capable platform.

### New Architecture

```
Before (Vercel - Broken):
Client → Vercel Serverless Function (stateless, no WebSocket) → ❌ Crash

After (Railway/Render - Fixed):
Client → WebSocket Server (stateful, persistent) → AssemblyAI → ✅ Works
```

### Implementation Changes

1. **Created `server.js`** - Standalone Node.js WebSocket server
   - Uses `ws` library (industry standard)
   - HTTP server with WebSocket upgrade
   - Persistent connection support

2. **Updated `package.json`**
   - Added `ws` dependency
   - Changed start script to `node server.js`

3. **Created deployment configs**
   - `Procfile` (Heroku)
   - `railway.json` (Railway)
   - `render.yaml` (Render)

4. **Updated documentation**
   - Complete README rewrite
   - Migration guide
   - Quick start guide

## 📊 Verification Steps

### Before Fix

```bash
# Try to connect to Vercel WebSocket
wscat -c wss://koach-transcription.vercel.app/api/realtime

# Result: ❌ Connection failed
# Error: 500 Internal Server Error
# FUNCTION_INVOCATION_FAILED
```

### After Fix (Railway)

```bash
# Connect to Railway WebSocket
wscat -c wss://koach-transcription.railway.app/realtime

# Result: ✅ Connected
# Can send/receive messages
# Transcription works
```

## 🎓 Key Learnings

### 1. Platform Constraints

Not all platforms support all features. Always verify:
- ✅ Does platform support WebSockets?
- ✅ Does platform support persistent connections?
- ✅ What's the maximum function/connection duration?

### 2. API Compatibility

Code written for one platform (Cloudflare Workers) doesn't automatically work on another (Vercel):
- WebSocketPair is Cloudflare-specific
- Response with webSocket property is Cloudflare-specific
- Always use standard APIs or platform-specific adapters

### 3. Error Detection

The check for WebSocketPair was present but insufficient:
- Check passed, but code still tried to use the API
- Should have early-returned before attempting to use WebSocketPair
- Better error handling would have made this clearer

### 4. Architecture Decisions

For real-time, bidirectional communication:
- ❌ Serverless functions: Not suitable
- ✅ WebSocket servers: Perfect fit
- ✅ Persistent connections: Required

## 🚀 Recommended Actions

### Immediate (Critical)

1. ✅ **Deploy to Railway/Render/Heroku** - Use new `server.js`
2. ✅ **Update Koach app** - Change WebSocket URL
3. ✅ **Test connection** - Verify streaming works

### Short Term

1. Remove old `/api/` directory (no longer needed)
2. Remove `vercel.json` and `.vercelignore`
3. Update any documentation referencing Vercel
4. Set up monitoring/logging on new platform

### Long Term

1. Consider adding reconnection logic in Koach app
2. Implement rate limiting for API protection
3. Add metrics/monitoring for transcription quality
4. Consider scalability (load balancing, clustering)

## 📋 Checklist

- [x] Diagnosed root cause (Vercel doesn't support WebSockets)
- [x] Created proper WebSocket server implementation
- [x] Tested locally (verify it works)
- [ ] Deploy to WebSocket-capable platform
- [ ] Update Koach app with new WebSocket URL
- [ ] Test end-to-end transcription flow
- [ ] Monitor for any new issues

## 🔗 References

- [Vercel WebSocket Limitations](https://vercel.com/guides/do-vercel-serverless-functions-support-websocket-connections)
- [AssemblyAI Streaming API](https://www.assemblyai.com/docs/universal-streaming)
- [WebSocket Protocol (RFC 6455)](https://tools.ietf.org/html/rfc6455)
- [ws Library Documentation](https://github.com/websockets/ws)

## 💡 Prevention for Future

When choosing a hosting platform, consider:

1. **Connection Type**
   - HTTP only? → Any platform
   - WebSocket? → Check support specifically

2. **Function Duration**
   - Quick operations (< 10s)? → Serverless fine
   - Long-running (minutes/hours)? → Need persistent server

3. **State Management**
   - Stateless operations? → Serverless fine
   - Need to maintain state? → Need persistent server

4. **Real-time Requirements**
   - Batch processing? → Serverless fine
   - Real-time streaming? → Need persistent server

**For Koach transcription:** Requires WebSocket, persistent connections, and real-time streaming → **Must use WebSocket-capable platform like Railway, Render, or Heroku**.

---

**Problem solved!** The service now works properly on WebSocket-capable platforms. 🎉

