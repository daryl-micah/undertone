-- Core schema for undertone (Fathom rebuild).
-- Conventions: uuid PKs; times inside a recording are integer milliseconds from
-- recording start (*_ms); wall-clock times are timestamptz.

create extension if not exists pgcrypto with schema extensions;

create type meeting_platform as enum ('zoom', 'meet', 'teams', 'upload');
create type meeting_status as enum ('scheduled', 'joining', 'recording', 'processing', 'ready', 'failed');
create type media_kind as enum ('video', 'audio', 'thumbnail');
create type generation_status as enum ('pending', 'generating', 'ready', 'failed');
create type share_target as enum ('meeting', 'highlight');

-- Calendar (stubbed provider data until real OAuth) ---------------------------

create table calendar_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'google',
  external_id  text,
  title        text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  join_url     text,
  platform     meeting_platform,
  attendees    jsonb not null default '[]'::jsonb,  -- [{name, email}]
  auto_record  boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (provider, external_id)
);

-- Meetings --------------------------------------------------------------------

create table meetings (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  platform           meeting_platform not null,
  status             meeting_status not null default 'ready',
  calendar_event_id  uuid references calendar_events (id) on delete set null,
  scheduled_start    timestamptz,
  started_at         timestamptz,
  ended_at           timestamptz,
  duration_ms        integer check (duration_ms >= 0),
  language           text not null default 'en',
  created_at         timestamptz not null default now()
);
create index meetings_started_at_idx on meetings (started_at desc nulls last);

create table participants (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings (id) on delete cascade,
  name          text not null,
  email         text,
  is_host       boolean not null default false,
  is_external   boolean not null default false,
  color         text,                      -- palette key assigned per meeting
  talk_time_ms  integer not null default 0, -- derived from segments, cached
  created_at    timestamptz not null default now()
);
create index participants_meeting_idx on participants (meeting_id);

create table media_assets (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings (id) on delete cascade,
  kind          media_kind not null,
  storage_path  text not null,             -- path inside the `media` bucket
  mime          text not null,
  duration_ms   integer,
  size_bytes    bigint,
  created_at    timestamptz not null default now(),
  unique (meeting_id, kind)
);

-- Transcript: one row per utterance so playback sync, seek and search are cheap.

create table transcript_segments (
  id              uuid primary key default gen_random_uuid(),
  meeting_id      uuid not null references meetings (id) on delete cascade,
  seq             integer not null,
  participant_id  uuid references participants (id) on delete set null,
  speaker_label   text not null,           -- raw diarization label, e.g. "SPEAKER_03"
  start_ms        integer not null check (start_ms >= 0),
  end_ms          integer not null,
  text            text not null,
  tsv             tsvector generated always as (to_tsvector('english', text)) stored,
  check (end_ms >= start_ms),
  unique (meeting_id, seq)
);
create index transcript_segments_time_idx on transcript_segments (meeting_id, start_ms);
create index transcript_segments_tsv_idx on transcript_segments using gin (tsv);

create table chapters (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings (id) on delete cascade,
  start_ms    integer not null,
  end_ms      integer not null,
  title       text not null,
  summary     text,
  check (end_ms >= start_ms)
);
create index chapters_meeting_idx on chapters (meeting_id, start_ms);

-- AI output --------------------------------------------------------------------

create table summary_templates (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,        -- 'general', 'sales', ...
  name         text not null,
  description  text not null,
  prompt       text not null,
  sections     jsonb not null,              -- [{key, title, instructions}]
  sort_order   integer not null default 0
);

create table summaries (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references meetings (id) on delete cascade,
  template_id  uuid not null references summary_templates (id) on delete cascade,
  status       generation_status not null default 'pending',
  -- {sections: [{key, title, bullets: [{text, source_ms}]}]}
  content      jsonb,
  model        text,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (meeting_id, template_id)
);

create table action_items (
  id                       uuid primary key default gen_random_uuid(),
  meeting_id               uuid not null references meetings (id) on delete cascade,
  text                     text not null,
  assignee_participant_id  uuid references participants (id) on delete set null,
  assignee_name            text,
  due_hint                 text,            -- as spoken: "by Friday", "next sprint"
  source_ms                integer,
  completed_at             timestamptz,
  created_at               timestamptz not null default now()
);
create index action_items_meeting_idx on action_items (meeting_id);
create index action_items_assignee_idx on action_items (lower(assignee_name));

-- Highlights & sharing ---------------------------------------------------------

create table highlights (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references meetings (id) on delete cascade,
  start_ms         integer not null,
  end_ms           integer not null,
  title            text,
  note             text,
  excerpt          text,                    -- transcript text at creation time
  created_by_name  text not null default 'Guest',
  created_at       timestamptz not null default now(),
  check (end_ms > start_ms)
);
create index highlights_meeting_idx on highlights (meeting_id, start_ms);
create index highlights_created_idx on highlights (created_at desc);

create table share_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  target_type  share_target not null,
  target_id    uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  view_count   integer not null default 0
);
create index share_links_target_idx on share_links (target_type, target_id);

-- Row level security -------------------------------------------------------------
-- No auth: the server uses the service role for all writes. Anonymous clients may
-- read demo content, but never share_links (tokens must not be enumerable).

alter table calendar_events     enable row level security;
alter table meetings            enable row level security;
alter table participants        enable row level security;
alter table media_assets        enable row level security;
alter table transcript_segments enable row level security;
alter table chapters            enable row level security;
alter table summary_templates   enable row level security;
alter table summaries           enable row level security;
alter table action_items        enable row level security;
alter table highlights          enable row level security;
alter table share_links         enable row level security;

create policy "public read" on calendar_events     for select to anon, authenticated using (true);
create policy "public read" on meetings            for select to anon, authenticated using (true);
create policy "public read" on participants        for select to anon, authenticated using (true);
create policy "public read" on media_assets        for select to anon, authenticated using (true);
create policy "public read" on transcript_segments for select to anon, authenticated using (true);
create policy "public read" on chapters            for select to anon, authenticated using (true);
create policy "public read" on summary_templates   for select to anon, authenticated using (true);
create policy "public read" on summaries           for select to anon, authenticated using (true);
create policy "public read" on action_items        for select to anon, authenticated using (true);
create policy "public read" on highlights          for select to anon, authenticated using (true);

-- Storage: public-read bucket for recordings and thumbnails (50 MB/file on free tier).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
