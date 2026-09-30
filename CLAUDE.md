# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A rebuild of Fathom (meeting notetaker) for a timed assessment judged on speed, product judgement and UX. `Plan.md` is the source of truth for phase order, scope, and what is deliberately cut. Read it before starting a phase. The meeting-capture bot is faked on purpose: meetings are seeded or uploaded, never recorded live. Every screen should work well for the seeded 8-person, 60-minute meeting, not just short calls.

## Commands

```sh
pnpm dev            # local dev server
pnpm build          # production build (also runs the TypeScript check)
pnpm lint           # eslint
python3 scripts/make-smoke-audio.py   # regenerate placeholder audio for the seed meeting
node --env-file=.env.local scripts/upload-media.mjs <file> <storage-path> <mime>   # upload to the `media` bucket
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
- **Media:** stored in the public Supabase Storage bucket `media`, at most 50 MB per file. `media_assets.storage_path` is the path inside the bucket, and `mediaUrl()` turns it into a public URL.
- **Styling:** design tokens are CSS variables in `src/app/globals.css`, exposed as Tailwind colors (`bg-surface`, `text-muted`, `border-border`, `text-accent`, …), with dark-mode values. Speakers get a color key (`participants.color`) that maps to a `--spk-*` variable through `speakerColor()` in `src/lib/speakers.ts`. There are 10 colors so an 8-person call stays distinguishable.

## Repo conventions

- `.agent-logs/` is written automatically by the hooks in `.claude/settings.json` (`.claude/hooks/capture.py`). It's part of the submission. Never edit, tidy or delete log entries, and never gitignore it. See `CAPTURE-TEST.md`.
- Commit only when the user asks, and follow `AGENTS.md` §7, which forbids AI attribution trailers.
