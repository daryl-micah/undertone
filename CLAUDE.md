# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A rebuild of Fathom (meeting notetaker) for a timed assessment judged on speed, product judgement and UX. **The pitch:** it's built for how Indian teams actually talk, Hindi and English mixed mid-sentence (see "The pitch" in `Plan.md`). `Plan.md` is the source of truth for phase order, scope, and what is deliberately cut. Read it before starting a phase. The meeting-capture bot is faked on purpose: meetings are seeded or uploaded, never recorded live. Every screen should work well for the seeded 8-person, 60-minute meeting, not just short calls.

## Commands

```sh
pnpm dev            # local dev server
pnpm build          # production build (also runs the TypeScript check)
pnpm lint           # eslint
python3 scripts/make-smoke-audio.py   # regenerate placeholder audio for the seed meeting
node --env-file=.env.local scripts/upload-media.mjs <file> <storage-path> <mime>   # upload to the `media` bucket
node --env-file=.env.local scripts/seed-meeting.mjs <slug> [--no-load]            # voice + load a seeded meeting
```

There is no test suite yet. Verify with `pnpm lint && pnpm build`, then load the pages.

The schema and seed have no local Supabase. They were validated with a throwaway `postgres:17-alpine` container plus a shim for Supabase-only objects (the `extensions` schema, the `anon`/`authenticated` roles and `storage.buckets`). In a real project, apply them through the Supabase SQL editor or CLI.

## Architecture

- **Next.js 16.3.7, App Router.** Per the block in `AGENTS.md`, check `node_modules/next/dist/docs/` before using Next APIs. Cache Components (`cacheComponents`) is **off**, so the previous caching model applies. Pages that read the DB call `await connection()` so they render per request instead of at build time. Type route props with the global `PageProps<"/route/[param]">` helper; `params` is a Promise.
- **No auth, server-only data access.** `src/lib/supabase.ts` (marked `server-only`) creates a service-role client. All reads go through `src/lib/data.ts` in Server Components, and writes will go through server actions or route handlers. The browser never talks to Postgres. Row-level security grants anonymous users read access only, and none on `share_links`, so tokens can't be listed. Without env vars, `isConfigured()` is false and pages render `<SetupNotice />` instead of throwing, so the app builds and deploys before keys exist.
- **Data model** (`supabase/migrations/`, with row types hand-mirrored in `src/lib/types.ts`; keep the two in sync when changing the schema):
  - All times within a recording are **integer milliseconds** from recording start (`*_ms`). Wall-clock times are `timestamptz`.
  - Transcripts are **one row per line** in `transcript_segments`, with a generated `tsv` column and a GIN index for search. Supabase returns at most 1,000 rows per request, so long transcripts must be paged; `allSegments()` in `data.ts` does this.
  - `summaries` has one row per (meeting, template), generated on demand and cached. Bullets carry `source_ms` so they can link back to the moment.
  - `action_items` and `highlights` are separate rows, not text inside a summary.
  - `share_links` point to a meeting or a highlight through `target_type` and `target_id`.
- **Fake capture layer:** `scripts/seed-meeting.mjs` reads `seed/meetings/<slug>.json` (metadata and cast, with a Sarvam `voice` per person) and `<slug>.script` (`## Chapter`, `key: line`, optional trailing `{action: text; due: …; owner: key}`). It voices each line separately with Sarvam `bulbul:v3` (`en-IN`), caching the clips by content hash in `media/tts-cache/`, and lays them end to end with deterministic pauses, so segment timings are exact. It encodes one MP3 with `ffmpeg-static` and replaces the meeting in Supabase wholesale (delete by fixed id, then insert; child rows cascade). Editing a line re-voices only that line. The pnpm build script for `ffmpeg-static` is allowed in `pnpm-workspace.yaml`.
- **Hinglish:** `src/lib/hinglish.mjs`, `sarvam.mjs` and `groq-core.mjs` are plain `.mjs` so both Node scripts and the Next app import them (`groq.ts` wraps `groq-core.mjs`; `server-only` can't be imported from Node).
  - `processLanguage(db, meetingId)` sets each segment's `hindi_ratio` (share of Devanagari words) and the meeting's `hindi_ratio` and `language_mix` (`en` / `hi-en` / `hi`). It then fills `text_romanized` and `text_english` for lines with Hindi via batched Groq calls, retrying or splitting a batch until every input id has exactly one output. It's safe to re-run.
  - The seed script calls it for every meeting, and so does the upload processor.
  - Transcribed meetings (`"transcribe": true` in the seed JSON, and every upload) use Sarvam batch STT, `saaras:v3` in `codemix` mode with diarization. The REST endpoint is limited to 30 s and has no diarization. The seed maps diarized speakers to the cast by overlap with the voicing timeline and prints the agreement percentage.
  - The transcript toggle (`?script=mixed|romanized|english`) goes through `segmentText` / `excerptText` in `src/lib/script.ts`. Highlights store `excerpt_romanized` and `excerpt_english`, so pages without the transcript can follow it.
  - `tsv` indexes English stems of `coalesce(text_english, text)` plus `simple` words of `text` and `text_romanized`. `prefix_tsquery` ORs both configs per word, so "कल", "kal" and "tomorrow" all find the same line.
  - Summaries read `text_english ?? text` and are always in English.
- **Uploads:** `/upload` → `POST /api/uploads` (creates a `processing` meeting and a signed Storage URL; the browser uploads directly, because Vercel caps request bodies at 4.5 MB) → `POST /api/uploads/[id]/process` (NDJSON progress; transcribe, store, `processLanguage`, mark `ready` or `failed`).
- **PostgREST bulk inserts:** a key missing from some rows is sent as `null`, not the column default. Give every row the same keys.
- **Media:** stored in the public Supabase Storage bucket `media`, at most 50 MB per file. `media_assets.storage_path` is the path inside the bucket, and `mediaUrl()` turns it into a public URL.
- **Styling:** design tokens are CSS variables in `src/app/globals.css`, exposed as Tailwind colors (`bg-surface`, `text-muted`, `border-border`, `text-accent`, …), with dark-mode values. Speakers get a color key (`participants.color`) that maps to a `--spk-*` variable through `speakerColor()` in `src/lib/speakers.ts`. There are 10 colors so an 8-person call stays distinguishable.

## Repo conventions

- `.agent-logs/` is written automatically by the hooks in `.claude/settings.json` (`.claude/hooks/capture.py`). It's part of the submission. Never edit, tidy or delete log entries, and never gitignore it. See `CAPTURE-TEST.md`.
- Commit only when the user asks, and follow `AGENTS.md` §7, which forbids AI attribution trailers.
