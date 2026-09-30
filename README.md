# Undertone

A rebuild of [Fathom](https://fathom.video), a meeting notetaker, focused on what happens after the call: playback against the transcript, AI summaries with switchable templates, action items, highlights and clips, search across meetings, and sharing.

The capture layer (the bot that joins Zoom/Meet/Teams) is **faked on purpose**. See [`Plan.md`](Plan.md) for why, and for the phase-by-phase build plan.

## Stack
- Next.js 16 (App Router), TypeScript, Tailwind v4, deployed on Vercel
- Supabase: Postgres for data, Storage bucket `media` for recordings
- Sarvam AI for text-to-speech (voicing the seeded meetings) and speech-to-text (`saaras:v3`, code-mixed Hindi/English with diarization); Groq for summaries and for romanizing and translating Hinglish lines
- No auth: a single shared demo workspace. All database access is server-side with the service role.

## Setup

1. **Create a Supabase project** and copy `.env.example` to `.env.local`. Fill in the URL, the publishable key and the service role (secret) key.
2. **Apply the schema and demo data.** In the Supabase SQL editor, run `supabase/migrations/20260930000000_core_schema.sql`, then `supabase/seed.sql`. With the Supabase CLI, run `supabase link` then `supabase db push`, and run the seed separately.
3. **Upload the smoke-test recording:**
   ```sh
   python3 scripts/make-smoke-audio.py
   node --env-file=.env.local scripts/upload-media.mjs media/capture-smoke-test.wav smoke/capture-smoke-test.wav audio/wav
   ```
4. **Seed the demo meetings** (voices each script with Sarvam TTS and caches the clips in `media/tts-cache/`, so re-runs are free):
   ```sh
   for m in mandi-sprint-planning q4-roadmap-review horizon-retail-discovery meera-arjun-1on1 platform-standup; do
     node --env-file=.env.local scripts/seed-meeting.mjs $m
   done
   ```
5. **Run it:** `pnpm install && pnpm dev`

## Deploy
Import the repo in Vercel and set the same three environment variables. Nothing else is required.

## Data model
See the table in [`Plan.md`](Plan.md#data-model) and the migration in `supabase/migrations/`.

Two conventions to know:
- Times inside a recording are integer milliseconds.
- Transcripts are stored as one row per utterance (`transcript_segments`), with a full-text index.

## Agent logs
Every prompt and final response from building this is in `.agent-logs/`. See [`CAPTURE-TEST.md`](CAPTURE-TEST.md) for how they're captured.
