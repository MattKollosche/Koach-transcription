const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { audio_url, session_id } = req.body;

    if (!audio_url || !session_id) {
      res.status(400).json({ error: 'Missing required fields: audio_url and session_id' });
      return;
    }

    console.log('Simple batch transcription test for session:', session_id);

    // Simulate transcription (without AssemblyAI)
    const mockTranscript = `This is a mock transcription for session ${session_id} with audio URL: ${audio_url}`;

    console.log('Mock transcription completed, sending to proxy');

    // Test proxy communication
    const proxyResponse = await fetch("https://tisayujoykquxfflubjn.supabase.co/functions/v1/proxy-transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.PROXY_SECRET
      },
      body: JSON.stringify({
        session_id,
        recording_transcript: mockTranscript,
        recording_status: "completed"
      })
    });

    if (!proxyResponse.ok) {
      throw new Error(`Proxy request failed: ${proxyResponse.status}`);
    }

    res.json({ 
      success: true, 
      transcript_id: 'mock-transcript-123',
      message: 'Mock transcription completed successfully'
    });
    
  } catch (error) {
    console.error('Simple batch transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
