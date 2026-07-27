# AION by Nadj.ai

AION ist ein visueller Voice-Agent für Alltag, Wissen, Meditation und
jungianisch inspirierte Selbstreflexion.

## Technik

- Next.js 16 und React 19
- Motion für UI-Animationen
- Vapi Web SDK für Echtzeitgespräche
- Deepgram für Transkription
- OpenAI als Sprachmodell
- ElevenLabs für die AION-Stimme

## Lokal starten

```bash
npm install
npm run dev
```

Die Anwendung enthält einen öffentlichen Vapi-Browser-Key. Die Provider für
OpenAI, Deepgram und ElevenLabs müssen im zugehörigen Vapi-Konto verbunden sein.

## Vercel

Das Repository kann direkt als Next.js-Projekt in Vercel importiert werden.
