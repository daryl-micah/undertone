# Undertone

**A Fathom-style meeting notetaker built for how Indian teams actually talk: Hindi and English mixed mid-sentence.**

A stand-up in Bengaluru sounds like "यार, ये ticket अभी भी blocked है, backend से API contract नहीं आया." Notetakers built for one language at a time mangle this. Undertone keeps what was said as it was said, lets you read every line as romanized Hinglish or in English, searches all three forms, and writes summaries and action items in English that link back to the exact moment.

Under that sits the Fathom baseline: playback synced to the transcript, AI summaries with switchable templates, action items, highlights and clips, search across meetings, sharing with people who weren't on the call, and a calendar-driven notetaker.

**Live:** https://undertone-8x.vercel.app

---

## What's real and what's faked

| Real | Faked, on purpose |
|---|---|
| Playback synced to the transcript, chapters, speaker lanes, deep links (`?t=`, `?clip=`) | **The meeting bot.** It "joins" and "records" (states, timer, Stop) but captures no audio. You upload the recording afterwards, and the page says so. |
| **Speech-to-text** with speaker detection: Sarvam `saaras:v3` in `codemix` mode, for the Hinglish meeting and every upload | **The calendar.** "Connect Google Calendar" loads sample events placed around now, with no OAuth. |
| Summaries and templates (Groq `gpt-oss-120b`), with bullets citing transcript lines | **Seeded audio is text-to-speech.** The meetings were scripted, then voiced with Sarvam, one voice per person. |
| Hinglish romanization and translation, per line (Groq) | **The English seeded meetings use their script as the transcript.** Only the Hinglish meeting was transcribed from its audio, which is the honest test of the pipeline. |
| Full-text search across Devanagari, romanized and English text (Postgres) | **About 25% of the hour-long meeting's lines, and all 3 short English meetings, are left silent on purpose.** Hinglish was the focus, so text-to-speech credit went to the Hinglish meeting. Playback has silent stretches there; transcripts, summaries and search are unaffected. |
| Highlights, clips, share links, view counting, Open Graph previews | **No video:** seeded meetings are audio, shown as a speaker grid lit by the transcript. Uploaded video plays as video. |
| Action items you can check off; uploads up to 50 MB | **No auth:** one shared demo workspace. |

## How the 8-person, hour-long call holds up

Every screen was built against the hour-long meeting first, not a 2-minute test call. These were measured on the production build:

- **The meeting page** renders in about 0.4 s with all 424 lines, which are paged past Supabase's 1,000-row API limit.
  - The transcript isn't virtualized, on purpose. Memoized blocks re-render only when the active line changes, and jumping to a distant search hit stays exact. Virtualized rows of varying height make that unreliable.
  - It follows playback until you scroll away, with "Jump to now" to resume.
- **Who talked:** a lane per speaker under the scrubber, plus talk-time shares. With 8 people you can see the room at a glance.
- **Summaries:** the free Groq tier allows 8,000 tokens a minute, and the transcript alone is about 12,000 tokens. So the meeting is condensed **once** into notes that cite the original lines: about 2m45s, paced by the rate limit.
  - After that, each template takes about 4 s, and a cached one about 0.15 s.
  - Bullets cite line numbers that the server converts to timestamps, so every claim can be checked by playing it.
- **Search** across all meetings takes 0.12–0.18 s, including Devanagari queries. Prefix matching means "reconcile" finds "reconciliation" (49 hits against 4 for plain matching).

## The Hinglish pipeline: what the test actually showed

For the Sprint 23 meeting, a 10.8-minute recording voiced in five Hindi voices went through Sarvam's speech-to-text:

- **Speaker detection** found **5 speakers**, each mapping one-to-one to a person. That mapping agrees with the script for **96.9%** of the speech.
- **Hindi share:** 79% of words came back in Devanagari, against 64% in the script, because the model writes some English loanwords in Devanagari (ऑफलाइन, स्प्रिंट).
- **Real recognition errors,** which were kept rather than hidden:
  - "Tumkur" became "तुम कौन".
  - "phone पे order" became "PhonePe order".
  - "Slack" was heard as "slate", and the summary repeats it.
- **One integration bug:** Sarvam's batch API read an undeclared MP3 as WAV and returned an empty transcript. The fix is to always declare the codec.

## What was cut, and why

- **A real meeting bot** (Zoom/Meet/Teams SDKs and a headless browser). It's the hardest part to build and the least differentiating; the brief allows faking it. The upload path covers real recordings.
- **Real calendar OAuth.** It's plumbing; the stub exercises the same product flow.
- **Auth, workspaces and permissions.** These are table stakes, but nothing in the brief's journey depends on them.
- **Reassigning action items.** Checking them off and the cross-meeting view covered the brief.
- **AI extraction of action items for uploads.** The seeded meetings carry theirs from the script. Extraction is the next thing to add for uploads.
- **"Ask across meetings"** (cited answers to questions). It's the obvious next feature on top of search.
- **Searching summaries.** Their content comes from the transcript, so hits would just duplicate.

See [`Plan.md`](Plan.md) for the phase-by-phase plan and the reasoning behind each decision.

## Known limitations

- The first summary of a long meeting takes about 3 minutes on the free Groq tier. The paid tier makes it seconds, with no code change.
- Uploads have their speakers named "Speaker 1…N". Which invitee is which voice isn't known.
- The Open Graph preview card is English-only, because the default image font has no Devanagari glyphs.
- Times are shown in IST everywhere.

---

## Stack

- **Next.js 16** (App Router), TypeScript, Tailwind v4, deployed on Vercel.
- **Supabase:** Postgres for data and full-text search, and the Storage bucket `media` for recordings.
- **Sarvam AI:** text-to-speech for the seeded meetings, and speech-to-text (`saaras:v3`, code-mixed Hindi/English with speaker detection) for the Hinglish meeting and uploads.
- **Groq:** summaries, plus romanizing and translating Hinglish lines.
- **No auth.** All database access is server-side with the service role, and the browser never talks to Postgres.

## Setup

1. **Environment:** copy `.env.example` to `.env.local` and fill in:
   - the Supabase URL, publishable key and service role (secret) key
   - `DATABASE_URL`, only for applying SQL from your machine
   - `SARVAM_API_KEY`
   - `GROQ_API_KEY`
2. **Schema and data, in this order** (Supabase SQL editor, or `psql "$DATABASE_URL" -f …`):
   1. `supabase/migrations/20260930000000_core_schema.sql`
   2. `supabase/migrations/20261001000000_search.sql`
   3. `supabase/migrations/20261001100000_hinglish.sql`
   4. `supabase/migrations/20261001200000_sharing.sql`
   5. `supabase/seed.sql`, then `supabase/templates.sql`
3. **Smoke-test audio** (optional):
   ```sh
   python3 scripts/make-smoke-audio.py
   node --env-file=.env.local scripts/upload-media.mjs media/capture-smoke-test.wav smoke/capture-smoke-test.wav audio/wav
   ```
4. **Seed the meetings.** Clips are cached per line in `media/tts-cache/`, and transcriptions in `media/stt-cache/`, so re-runs are free. Add `--offline` to load without API calls; missing clips become silence.
   ```sh
   for m in mandi-sprint-planning q4-roadmap-review horizon-retail-discovery meera-arjun-1on1 platform-standup; do
     node --env-file=.env.local scripts/seed-meeting.mjs $m
   done
   ```
5. **Run it:** `pnpm install && pnpm dev`

## Deploy

Import the repo into Vercel and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` (summaries) and `SARVAM_API_KEY` (uploads). `DATABASE_URL` isn't needed there.

## Agent logs

Every prompt and final response from building this is in `.agent-logs/`, committed alongside the code it produced. See [`CAPTURE-TEST.md`](CAPTURE-TEST.md) for how they're captured.
