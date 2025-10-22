import express from "express";
import fetch from "node-fetch";
import { AssemblyAI } from "assemblyai";

const app = express();
app.use(express.json());

const aai = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

app.post("/start-transcription", async (req, res) => {
  try {
    const { audio_url, session_id } = req.body;

    const transcript = await aai.transcripts.create({
      audio_url,
      auto_highlights: true
    });

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
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default app;
