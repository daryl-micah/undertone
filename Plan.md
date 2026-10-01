# Plan: Fathom rebuild (`undertone`)

## The pitch

**Undertone is a Fathom-style notetaker built for how Indian teams actually talk: Hindi and English mixed mid-sentence.**

A stand-up in Bengaluru doesn't happen in English. It happens in Hinglish: "यार, ये ticket अभी भी blocked है, backend से API contract नहीं आया।" Fathom's transcription, summaries and search are built for one language at a time, so they mangle this. Hindi words get transliterated into nonsense, summaries lose half the meaning, and you can't search for what was said.

Undertone handles it end to end:
- The transcript keeps what was said as it was said: Hindi in Devanagari, English in Latin script.
- Every line can also be read as romanized Hinglish (the way people type it) or in English.
- Search finds a line whether you type the Hindi, the romanized version or the English meaning.
- Summaries and action items are always in English, and still cite the exact moment.

Everything else in this plan, the synced playback, summaries, highlights, search and sharing, is the Fathom baseline that the Hinglish support sits on.

> **Numbering note:** Hinglish support was inserted as Phase 5 on 2026-10-01, after Phases 1–6 were built. Highlights and search moved to Phases 6 and 7. Commit messages up to `bb7a88b` use the old numbers ("Phase 5: highlights", "Phase 6: search").

## What we're building and why in this order

Fathom's value is what happens **after** the call: watching the recording next to a transcript, reading a summary you can trust, pulling action items, clipping a moment and sending it to someone who wasn't there. The recording bot is plumbing. It's also the hardest and least differentiating part to rebuild, so **we fake the capture layer** and say so openly in the walkthrough. The time goes into the post-meeting experience.

The case the brief calls out is the **8-person, 60-minute call**. That's where naive UIs break: a transcript thousands of lines long, eight speakers to tell apart, a summary that can't just be "stuff the transcript into a prompt", and search that has to land you on the right second. We seed that meeting first and build every screen against it. A 2-minute toy call hides every problem that matters.

**Judged on:** speed (working product), product judgement (what's first, what's cut), UX/UI quality.

### Out of scope (deliberately)
- **Real meeting bot** (Zoom/Meet/Teams SDKs and a headless browser join). Replaced by seeded meetings plus an upload path.
- **Auth, workspaces, permissions.** There's one shared demo space, and a viewer's display name is typed in, not authenticated.
- **CRM sync** (HubSpot/Salesforce), Slack posting, billing, mobile apps.
- **Live, in-call transcription.** Everything is processed after the call.
- **Real calendar OAuth.** This is Phase 9, and only if there's time. Stubbed until then.

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
1. **Write the scripts.** Hand-authored scripts in `seed/meetings/` (`<slug>.json` for metadata and cast, `<slug>.script` for chapters, lines and inline `{action: …}` tags). The content is realistic: interruptions, tangents, disagreements, decisions and owners.
   - **The hero meeting:** 8 people, about 60 minutes (for example a quarterly planning review), with known decisions and action items planted in it.
   - **3 or 4 supporting meetings:** a 1:1, a sales call, a stand-up and a 2-minute solo call, so cross-meeting search has something to find.
2. **Voice them.** **Sarvam AI** text-to-speech (`bulbul:v3`, `en-IN`), with one distinct voice per speaker, produces **real audio whose timestamps we know exactly**, so transcript sync is correct by construction. Segments are concatenated into one mono MP3 (a 60-minute file at 64 kbps is about 29 MB, under Supabase's 50 MB per-file limit).
3. **Load everything.** Insert the participants, segments, media rows and derived `talk_time_ms`.

**Upload path:** `/upload` takes a real recording (your 2-minute call). It goes through Sarvam speech-to-text with speaker diarization, lands in the same tables, and proves the pipeline isn't hard-wired to seeds.

**Status simulation:** a "Send notetaker" action advances a meeting through `joining → recording → processing → ready` with timers, so the in-progress states have a UI.

> **Open decision (yours):** video vs. audio for seeded meetings. Real video for an 8-person, hour-long call isn't feasible to fake. **I recommend audio plus a client-rendered speaker grid** (tiles that light up for the active speaker, driven by the segments). It reads like a meeting recording and scales to 8 people. Uploaded real recordings play their actual video.

## Phase 3: Meeting page — playback against the transcript ✅
This is the core screen, built against the hero meeting from day one.
- **Player:** custom controls, 1× / 1.5× / 2× speed, keyboard shortcuts (space, ←/→ 5 s, J/K/L).
- **Transcript** synced to playback:
  - The active line is highlighted and auto-scrolls. Following pauses when you scroll away, with a "Jump to now" pill to resume.
  - Click any line to seek there.
- **Speaker timeline:** a lane per participant under the scrubber showing when each person spoke, plus talk-time percentages. With 8 people this is how you see who dominated.
- **Chapters** mark the scrubber and appear as a jumpable list.
- **Scale:**
  - The transcript is **not virtualized**, a deliberate change from the original plan. Even a dense hour is about 400–1,500 lines, and memoized turn blocks re-render only when the active line changes. Virtualizing variable-height rows would make jumping to a distant search match or `?t=` link unreliable.
  - Speaker colors come from a fixed 8+ color palette that stays readable in light and dark mode.
  - Consecutive lines by the same speaker are grouped.
- **In-meeting search:** matches are highlighted, with next/prev stepping and match markers on the timeline.

## Phase 4: AI summary, templates, action items ✅
- **Summaries:** Groq `openai/gpt-oss-120b` with strict JSON-schema output, run server-side and cached in `summaries`. The model cites transcript line numbers and the server maps them to `source_ms`, which is more reliable than asking for timestamps. Every bullet's timestamp chip seeks the player.
- **Long meetings:** the free tier allows 8,000 tokens per minute, and the hour-long transcript is about 12k tokens, so map-reduce is required, not optional.
  - Groups of chapters are condensed into cited notes, stored once per meeting in `chapters.summary` (about 2m45s for the hero meeting, paced by the rate limit).
  - Each template is then one request over those notes (about 4 seconds).
  - Short meetings go straight from the transcript.
  - A 429 means wait for `retry-after` and try again.
- **Template switcher:** 5 templates with per-section instructions, in `supabase/templates.sql` (re-runnable upsert).
  - The endpoint streams **progress** as NDJSON rather than tokens: the output is structured JSON, and Groq finishes each step in seconds anyway.
  - General summaries are pre-generated for the seeded meetings.
- **Action items:**
  - Checked off with immediate saving, and copied as a markdown checklist.
  - A cross-meeting `/action-items` page groups them by owner, with Open / Done / All filters, and links to the moment each was said.
  - **Cut:** reassigning. **Deferred:** AI extraction. Seeded meetings carry their action items from the script, so extraction only matters for uploads and belongs with the upload path.

## Phase 5: Hinglish support
The main differentiator. Built on top of Phases 1–4 and threaded through everything after.

1. **Schema.**
   - `transcript_segments`: `text_romanized`, `text_english` (nullable) and `hindi_ratio` (0–1).
   - `meetings`: `language_mix` (`en`, `hi-en` or `hi`) and `hindi_ratio`.
   - `tsv` is rebuilt as `english(coalesce(text_english, text)) || simple(text || text_romanized)`, and `search_transcripts` matches a query under both configs. So "deadline" finds a Hindi line whose translation says deadline, and "kal" or "कल" find the line directly.
2. **A seeded Hinglish meeting:** a 4–5 person sprint planning at a Bengaluru startup, 10–15 minutes, written as people actually speak (Hindi in Devanagari, English in Latin script), with decisions, owners and action items.
   - Voiced with Sarvam `bulbul:v3` Hindi (`hi-IN`) voices.
   - **The script is not the transcript.** The audio is transcribed with Sarvam STT (`saaras:v3`, `codemix` mode, diarization), and that output is stored as the segments. Diarized speakers are mapped to the cast by overlap with the known voicing timeline. This is the honest test of whether the pipeline handles real code-mixed speech.
   - The script is saved in `seed/meetings/` for a naturalness review **before** anything is voiced.
3. **Transliteration and translation:** every segment with Hindi gets `text_romanized` and `text_english` from Groq, batched with strict JSON and exactly one output per input id. It shares the rate-limit retry logic. One shared function serves the seed pipeline and the upload path.
4. **Summaries:** Hinglish meetings feed `text_english` into the existing map-reduce, still citing original line numbers. Summaries are always in English.
5. **UI:**
   - A **Mixed / Romanized / English** transcript toggle, only when `language_mix = 'hi-en'`, persisted in the URL (`?script=`).
   - A language badge on meeting cards ("Hinglish · 55% Hindi"), and the Hinglish meeting pinned first on the home page.
   - Highlight excerpts respect the same toggle. The share pages in Phase 8 will too.
6. **Upload path:** a real recording goes through the same pipeline: `saaras:v3` in `codemix` mode, then transliteration and translation.

## Phase 6: Highlights and clips ✅
- **Two ways to highlight:**
  - Press `H` or click the button while watching. This marks from 15 s back to now, adjustable.
  - Select text in the transcript to set an exact range.
- **Where highlights appear:** on the scrubber, in a Highlights tab on the meeting, and in a global Highlights library across meetings. That library answers "see where it lands".
- **Each highlight** has a title, note, author name and transcript excerpt, and plays as a bounded clip.

## Phase 7: Search across meetings ✅
- **Engine:** Postgres full-text search through RPCs (`search_transcripts`, `search_highlights`, in `supabase/migrations/20261001000000_search.sql`).
  - Every typed word becomes a prefix term, so "reconcile" finds "reconciliation" (their stems differ) and search works mid-word. That gives 49 hits instead of 4 for plain stemming.
  - `ts_headline` marks the matched words, including stemmed matches.
- **`/search`:** results are grouped by meeting, most matches first. Each hit shows the speaker, the time and the highlighted line, with "Show N more" for the rest.
  - A hit opens the meeting at that second, with the term already in the transcript search: `?t=…&q=…`.
  - Matching highlights are listed above the transcript hits.
- **Filters:** said-by (speaker of the line), platform and date range. The URL is the state, so a search is linkable and results are server-rendered.
- **Header search** on every page; "/" focuses it.
- **Not searched:** summaries, whose content comes from the transcript, so their hits would duplicate transcript hits.
- **Deferred:** "Ask across meetings" (cited answers with Groq). It's the next thing to add if time allows.

## Phase 8: Sharing with someone not on the call ✅
- **Share dialog** on every highlight (Highlights tab) and on the meeting header.
  - Copy link, plus "Share via…" (the browser's native share sheet) where it exists, and the view count.
  - Highlight links can opt in to "Let them open the full meeting" (`share_links.allow_full_meeting`). A different permission gives a different link.
  - Sharing the same thing twice reuses the existing link, so there's one URL and one view count.
  - A Hinglish reader's `?script=` mode is carried into the link.
- **Public `/s/[token]`**, needing no account:
  - **Clips:** a bounded player that stops at the clip end, the clip's transcript with speakers (the current line highlighted, click to jump), and the sharer's note. It has the same Mixed / Romanized / English toggle. "Open the full meeting" appears only when allowed.
  - **Meetings:** the General summary (timestamps link into the recording) and read-only action items, since people outside the meeting don't tick off the team's tasks.
  - Expired or unknown links get a friendly page.
- **Open Graph:** title, description and a generated 1200×630 card, marked `noindex`. The card is in English: the default image font has no Devanagari, and an English preview reads for anyone the link is pasted to.
- **Views:** counted atomically by `record_share_view()`. Link-preview bots (WhatsApp, Slack and so on) don't count.

## Phase 9: Home, calendar, notetaker states ✅
- **Calendar connect (stubbed):** "Connect Google Calendar" upserts 7 sample events placed around now (`src/lib/demo-calendar.ts`). One is always happening right now, so the notetaker can be sent in on demand. Reconnecting refreshes their times, and Disconnect removes them.
- **Upcoming** on the home page, grouped by IST day:
  - A per-event "Notetaker will join" switch. The all-hands defaults off, and an in-person lunch with no video link says the notetaker can't join.
  - "Send notetaker now" on an event that's live, and a link to its meeting once it has one ("Recording", "Notes ready").
- **Notetaker states**, simulated and labelled as such on the page:
  - **joining:** the waiting room, admitted after a few seconds.
  - **recording:** a live timer, the invitees' tiles and Stop.
  - **processing:** "upload the recording".
  - The upload attaches to that same meeting (`POST /api/uploads` with `meetingId`), so calendar → notetaker → recording → transcript works end to end. Diarized speakers replace the invitee placeholders, because which invitee is which voice can't be known.
- **Join with link:** paste a Zoom, Meet or Teams URL on the home page (`parseMeetingLink`, which rejects lookalike domains) to send the notetaker into your own call, without a calendar event. It runs the same simulated states, then the upload. The recording screen asks for calls under 3 minutes (the timer turns amber after 3:00), and uploads are capped at 5 minutes to protect transcription credits.
- **Recent:** each meeting shows the first line of its General summary.
- **Times in IST** throughout (`TIME_ZONE` in `src/lib/format.ts`). The product is for Indian teams, and a fixed zone avoids hydration mismatches.

## Phase 10: Polish and walkthrough ✅
- **States:**
  - Global error page (Next 16's `retry()`) and not-found page.
  - A loading skeleton for the meeting page, shown instantly once Next has prefetched the meeting route's loading shell.
  - Already in place and checked: processing and failed meetings, a failed summary with Try again, and empty action items and highlights.
- **Phones:** the meeting page is the player on top, then tabs where **Transcript** is a phone-only tab next to Summary, Chapters, Action items, Highlights and Speakers. It's one transcript instance, shown and hidden with CSS, so following playback and search don't run twice. Desktop is unchanged.
- **Keyboard and accessibility:**
  - A visible `:focus-visible` ring everywhere, and a focusable scrubber (←/→ skip 5 s).
  - axe (WCAG 2 A/AA) reports no violations on home, meeting, Hinglish meeting, search and highlights. That took darker light-mode teal, sky and orange speaker colors (contrast was 3.6–4.1:1) and a role on the "happening now" dot.
- **Walkthrough:** `README.md` covers the pitch, a 5-minute tour, what's real vs. faked (including the silent placeholder audio), how the 8-person hour holds up (measured), the Hinglish pipeline's results, what was cut and why, and setup and deploy.

---

## Cut order if time runs short
Cut from the bottom: 9 → Ask-across-meetings → upload path → cross-meeting action items view.

**Never cut:**
- the hero meeting (Phase 2)
- synced playback (Phase 3)
- summary with timestamped bullets (Phase 4)
- Hinglish transcript, toggle and search (Phase 5): it's the pitch
- highlight → share (Phases 6 and 8)
