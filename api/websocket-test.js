// Minimal WebSocket test function for debugging
export default async function handler(request) {
  console.log('=== WebSocket Test Function Called ===');
  console.log('Request method:', request.method);
  console.log('Request headers:', Object.fromEntries(request.headers.entries()));
  console.log('Request URL:', request.url);

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
    const pair = new WebSocketPair();
    const wsClient = pair[0];
    const server = pair[1];

    console.log('WebSocket pair created successfully');

    // Accept the WebSocket connection
    server.accept();
    console.log('WebSocket connection accepted');

    // Handle messages from client
    server.addEventListener('message', (event) => {
      console.log('Received message:', event.data);
      try {
        const message = JSON.parse(event.data);
        console.log('Parsed message:', message);
        
        // Echo back the message
        server.send(JSON.stringify({
          type: 'echo',
          originalMessage: message,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error('Error parsing message:', error);
        server.send(JSON.stringify({
          type: 'error',
          message: 'Invalid JSON'
        }));
      }
    });

    // Handle connection close
    server.addEventListener('close', (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
    });

    // Handle connection errors
    server.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
    });

    console.log('Returning WebSocket response');
    return new Response(null, {
      status: 101,
      webSocket: wsClient,
    });

  } catch (error) {
    console.error('Error in WebSocket handler:', error);
    console.error('Error stack:', error.stack);
    return new Response(`WebSocket error: ${error.message}`, { status: 500 });
  }
}
