# Plan: Fathom rebuild (`undertone`)

## What we're building and why in this order

Fathom's value is what happens **after** the call: watching the recording next to a transcript, reading a summary you can trust, pulling action items, clipping a moment and sending it to someone who wasn't there. The recording bot is plumbing. It's also the hardest and least differentiating part to rebuild, so **we fake the capture layer** and say so openly in the walkthrough. The time goes into the post-meeting experience.

The case the brief calls out is the **8-person, 60-minute call**. That's where naive UIs break: a transcript thousands of lines long, eight speakers to tell apart, a summary that can't just be "stuff the transcript into a prompt", and search that has to land you on the right second. We seed that meeting first and build every screen against it. A 2-minute toy call hides every problem that matters.

**Judged on:** speed (working product), product judgement (what's first, what's cut), UX/UI quality.

### Out of scope (deliberately)
- **Real meeting bot** (Zoom/Meet/Teams SDKs and a headless browser join). Replaced by seeded meetings plus an upload path.
- **Auth, workspaces, permissions.** There's one shared demo space, and a viewer's display name is typed in, not authenticated.
- **CRM sync** (HubSpot/Salesforce), Slack posting, billing, mobile apps.
- **Live, in-call transcription.** Everything is processed after the call.
- **Real calendar OAuth.** This is Phase 8, and only if there's time. Stubbed until then.

---

## Phase 0: Agent capture ✅
Hooks log every prompt and final response to `.agent-logs/`. See `CAPTURE-TEST.md`.

## Phase 1: Skeleton and deploy
**Goal:** the deployed URL renders a meetings list read from Supabase, and the schema is final enough that later phases only add rows, not reshape tables.

1. **Next.js app** (App Router, TypeScript, Tailwind), deployed on **Vercel**.
2. **Supabase:** Postgres for data and Storage (bucket `media`) for recordings and thumbnails. SQL migrations are checked into `supabase/migrations/`.
3. **No auth.** Every visitor sees the same demo. Server-side code uses the service role key, and the browser never writes to the database directly; writes go through route handlers / server actions. RLS stays on with public read-only policies.
4. **Core entities.** Full list and schema below.
5. **Pages:** `/` (meetings list) and `/meetings/[id]` (placeholder), reading real rows from one hand-inserted meeting.

**Done when:** a Vercel URL shows a meeting from Supabase, and a file in the `media` bucket plays in the browser.

**Needed from you:**
- A Supabase project: URL, anon key and service role key.
- A Vercel account linked to this repo, or a GitHub remote for it. The `vercel` and `supabase` CLIs aren't installed here; I can install them or you can connect through the dashboards.

### Data model

You listed meetings, participants, summaries, transcripts and highlights. The **bold** tables below are my additions: things the brief's user journey needs that would be painful to bolt on later.

| Table | Purpose | Key columns |
|---|---|---|
| `meetings` | One recorded call | `title`, `platform` (zoom/meet/teams/upload), `scheduled_start`, `started_at`, `ended_at`, `duration_ms`, `status` (`scheduled → joining → recording → processing → ready / failed`), `calendar_event_id`, `language` |
| `participants` | People on the call | `meeting_id`, `name`, `email`, `is_host`, `is_external`, `color`, `talk_time_ms` (derived, cached) |
| **`media_assets`** | Files for a meeting, kept separate so one meeting can have video + audio + thumbnail | `meeting_id`, `kind` (video/audio/thumbnail), `storage_path`, `mime`, `duration_ms`, `size_bytes` |
| `transcript_segments` | **Transcripts as rows, not a blob.** One row per utterance, needed for playback sync, click-to-seek, per-speaker stats and search | `meeting_id`, `seq`, `participant_id`, `speaker_label` (raw diarization label), `start_ms`, `end_ms`, `text`, `tsv` (generated `tsvector`, GIN-indexed) |
| **`chapters`** | Topic sections along the timeline. On a 60-minute call these are the main way to navigate | `meeting_id`, `start_ms`, `end_ms`, `title`, `summary` |
| **`summary_templates`** | "Switch templates": General, Sales, 1:1, Stand-up, Interview, … | `key`, `name`, `description`, `prompt`, `sections` (jsonb) |
| `summaries` | One per (meeting, template), generated lazily and cached | `meeting_id`, `template_id`, `status`, `content` (jsonb: sections → bullets, each bullet with `source_ms` so it links back to the moment), `model`; unique `(meeting_id, template_id)` |
| **`action_items`** | Their own rows, not text inside a summary, so they can be checked off, assigned, listed across meetings and linked to a timestamp | `meeting_id`, `text`, `assignee_participant_id`, `assignee_name`, `due_hint`, `source_ms`, `completed_at` |
| `highlights` | A marked moment or range. Doubles as the clip unit | `meeting_id`, `start_ms`, `end_ms`, `title`, `note`, `excerpt` (transcript text at creation), `created_by_name`, `created_at` |
| **`share_links`** | "Share a clip with someone not on the call" | `token` (unguessable), `target_type` (meeting/highlight), `target_id`, `created_at`, `expires_at`, `view_count` |
| **`calendar_events`** | Upcoming meetings and the "send notetaker?" toggle. Stubbed data in v1 | `provider`, `external_id`, `title`, `start`, `end`, `join_url`, `platform`, `attendees` (jsonb), `auto_record` |

**Conventions:**
- All times inside a recording are **integer milliseconds** from recording start. Wall-clock times are `timestamptz`.
- Primary keys are UUIDs.
- `created_by_name` is free text, since there's no auth.

**Possible later additions** (not in Phase 1): `comments` (threaded on a timestamp) and `views` (who watched a share).

---

## Phase 2: Fake capture — realistic seeded meetings
**Goal:** data that behaves like a real recording, so every later phase is tested against something real.

**Seed script** (`scripts/seed`):
1. **Write the scripts.** Claude writes meeting scripts with realistic content: interruptions, cross-talk, decisions, owners, tangents.
   - **The hero meeting:** 8 people, about 60 minutes (for example a quarterly planning review), with known decisions and action items planted in it.
   - **3 or 4 supporting meetings:** a 1:1, a sales call, a stand-up and a 2-minute solo call, so cross-meeting search has something to find.
2. **Voice them.** Text-to-speech with one distinct voice per speaker produces **real audio whose timestamps we know exactly**, so transcript sync is correct by construction. Segments are concatenated into one mono MP3 (a 60-minute file at 64 kbps is about 29 MB, under Supabase's 50 MB per-file limit).
3. **Load everything.** Insert the participants, segments, media rows and derived `talk_time_ms`.

**Upload path:** `/upload` takes a real recording (your 2-minute call). It goes through a transcription API with speaker diarization, lands in the same tables, and proves the pipeline isn't hard-wired to seeds.

**Status simulation:** a "Send notetaker" action advances a meeting through `joining → recording → processing → ready` with timers, so the in-progress states have a UI.

> **Open decision (yours):** video vs. audio for seeded meetings. Real video for an 8-person, hour-long call isn't feasible to fake. **I recommend audio plus a client-rendered speaker grid** (tiles that light up for the active speaker, driven by the segments). It reads like a meeting recording and scales to 8 people. Uploaded real recordings play their actual video.

## Phase 3: Meeting page — playback against the transcript
This is the core screen, built against the hero meeting from day one.
- **Player:** custom controls, 1× / 1.5× / 2× speed, keyboard shortcuts (space, ←/→ 5 s, J/K/L).
- **Transcript** synced to playback:
  - The active line is highlighted and auto-scrolls. Following pauses when you scroll away, with a "Jump to now" pill to resume.
  - Click any line to seek there.
- **Speaker timeline:** a lane per participant under the scrubber showing when each person spoke, plus talk-time percentages. With 8 people this is how you see who dominated.
- **Chapters** mark the scrubber and appear as a jumpable list.
- **Scale:**
  - The transcript list is **virtualized** (thousands of segments).
  - Speaker colors come from a fixed 8+ color palette that stays readable in light and dark mode.
  - Consecutive lines by the same speaker are grouped.
- **In-meeting search:** matches are highlighted, with next/prev stepping and match markers on the timeline.

## Phase 4: AI summary, templates, action items
- **Summaries:** Claude API, run server-side and cached in `summaries`. Every bullet carries `source_ms`, so clicking it seeks the player. That's how you trust a summary.
- **Long meetings:** summarized per chapter first, then combined into the template (map-reduce). Pasting a whole 60-minute transcript into one prompt isn't the plan.
- **Template switcher:** 4 or 5 templates. A template's first generation streams in; after that, switching is instant from the cache.
- **Action items:**
  - Extracted with owner, due hint and timestamp.
  - Can be checked off, reassigned and copied as a list.
  - A cross-meeting "My action items" view filters by assignee name.

## Phase 5: Highlights and clips
- **Two ways to highlight:**
  - Press `H` or click the button while watching. This marks from 15 s back to now, adjustable.
  - Select text in the transcript to set an exact range.
- **Where highlights appear:** on the scrubber, in a Highlights tab on the meeting, and in a global Highlights library across meetings. That library answers "see where it lands".
- **Each highlight** has a title, note, author name and transcript excerpt, and plays as a bounded clip.

## Phase 6: Search across meetings
- **Engine:** Postgres full-text search over `transcript_segments`, `summaries` and `highlights`.
- **Results:** grouped by meeting, with the matching line, speaker and timestamp. Clicking a result opens the meeting **at that second**.
- **Filters:** participant, date range, platform.
- **Stretch:** "Ask across meetings", answering questions from search results with citations.

## Phase 7: Sharing with someone not on the call
- **Share links:** "Share" on a highlight or meeting creates a `share_links` token.
- **Public page** at `/s/[token]`, needing no account:
  - It plays only the clip's range, shows the transcript excerpt and speaker names, and links to "open full meeting" if the share allows it.
  - It has proper Open Graph tags, so a pasted link shows a preview card.
- **Views:** a view counter on the share.

## Phase 8: Home, calendar, notetaker states
- **Meetings home:** "Upcoming" (from `calendar_events`) with per-meeting "Notetaker will join" toggles, plus "Recent" with status chips, duration, participants and a summary preview.
- **Calendar connect:** stubbed. "Connect Google Calendar" loads realistic sample events. Real Google OAuth only if time allows.

## Phase 9: Polish and walkthrough
- **Loading, empty and error states:**
  - A meeting still processing.
  - A summary that failed.
  - A meeting with no action items.
- **Mobile and accessibility:**
  - The meeting page works on a phone, with the player on top and tabs for Transcript, Summary and Highlights.
  - Everything is reachable by keyboard.
- **Walkthrough (README):** what's real vs. faked (capture layer), what was cut and why, and how the 8-person hour-long call holds up.

---

## Cut order if time runs short
Cut from the bottom: 8 → Ask-across-meetings → upload path → cross-meeting action items view.

**Never cut:**
- the hero meeting (Phase 2)
- synced playback (Phase 3)
- summary with timestamped bullets (Phase 4)
- highlight → share (Phases 5 and 7)
