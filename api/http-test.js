// Simple HTTP test function to verify basic function execution
export default async function handler(request) {
  console.log('=== HTTP Test Function Called ===');
  console.log('Request method:', request.method);
  console.log('Request URL:', request.url);
  console.log('Request headers:', Object.fromEntries(request.headers.entries()));

  return new Response(JSON.stringify({
    message: 'HTTP endpoint working',
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries())
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
