import OpenAI from "openai";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const supportedAudioTypes = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "audio/ogg",
]);

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "AIONs Spracherkennung ist noch nicht eingerichtet." },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json({ error: "Es wurde keine Aufnahme empfangen." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: "Die Aufnahme ist zu lang. Bitte sprich in kürzeren Abschnitten." },
        { status: 413 },
      );
    }

    const baseType = audio.type.split(";")[0].toLowerCase();
    if (baseType && !supportedAudioTypes.has(baseType)) {
      return Response.json(
        { error: "Dieses Audioformat wird leider nicht unterstützt." },
        { status: 415 },
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
      response_format: "json",
      prompt:
        "Reisegespräch. Transkribiere exakt in der gesprochenen Originalsprache. Übersetze nicht.",
    });
    const text = transcription.text?.trim();

    if (!text) {
      return Response.json(
        { error: "Ich konnte in der Aufnahme keine deutliche Sprache erkennen." },
        { status: 422 },
      );
    }

    return Response.json({ text });
  } catch (error) {
    console.error("[translate/audio] transcription failed", error);
    return Response.json(
      { error: "AION konnte die Sprache gerade nicht erkennen. Bitte versuche es erneut." },
      { status: 500 },
    );
  }
}
