const fetch = require('node-fetch');
const { AssemblyAI } = require('assemblyai');

const aai = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

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

    console.log('Starting batch transcription for session:', session_id);

    const transcript = await aai.transcripts.create({
      audio_url,
      auto_highlights: true
    });

    console.log('Transcription completed, sending to proxy');

    await fetch("https://tisayujoykquxfflubjn.supabase.co/functions/v1/proxy-transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.PROXY_SECRET
      },
      body: JSON.stringify({
        session_id,
        recording_transcript: transcript.text,
        recording_status: "completed"
      })
    });

    res.json({ success: true, transcript_id: transcript.id });
  } catch (error) {
    console.error('Batch transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
