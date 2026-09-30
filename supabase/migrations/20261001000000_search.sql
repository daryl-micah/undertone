-- Cross-meeting search.
--
-- Every word typed becomes a prefix term, so "reconcile" finds "reconciliation"
-- (their stems differ: reconcil / reconcili) and partial words work while typing.

create or replace function prefix_tsquery(q text) returns tsquery
language sql immutable as $$
  select case when terms = '' then null else to_tsquery('english', terms) end
  from (
    select coalesce(string_agg(t || ':*', ' & '), '') as terms
    from regexp_split_to_table(lower(coalesce(q, '')), '[^a-z0-9]+') as t
    where t <> ''
  ) s
$$;

create or replace function search_transcripts(
  q text,
  speaker text default null,
  platform_filter meeting_platform default null,
  from_date timestamptz default null,
  to_date timestamptz default null,
  max_results integer default 300
)
returns table (
  meeting_id uuid,
  meeting_title text,
  meeting_started_at timestamptz,
  platform meeting_platform,
  seq integer,
  start_ms integer,
  speaker_name text,
  speaker_color text,
  headline text
)
language sql stable as $$
  select m.id, m.title, m.started_at, m.platform, s.seq, s.start_ms,
         coalesce(p.name, s.speaker_label), p.color,
         ts_headline('english', s.text, query, 'StartSel=«,StopSel=»,HighlightAll=true')
  from prefix_tsquery(q) as query
  join transcript_segments s on s.tsv @@ query
  join meetings m on m.id = s.meeting_id
  left join participants p on p.id = s.participant_id
  where (speaker is null or p.name = speaker)
    and (platform_filter is null or m.platform = platform_filter)
    and (from_date is null or m.started_at >= from_date)
    and (to_date is null or m.started_at < to_date)
  order by m.started_at desc, s.seq
  limit max_results
$$;

create or replace function search_highlights(q text, max_results integer default 50)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  start_ms integer,
  end_ms integer,
  title text,
  excerpt text,
  created_by_name text
)
language sql stable as $$
  select h.id, h.meeting_id, m.title, h.start_ms, h.end_ms, h.title, h.excerpt, h.created_by_name
  from prefix_tsquery(q) as query
  join highlights h
    on to_tsvector('english', coalesce(h.title, '') || ' ' || coalesce(h.note, '') || ' ' || coalesce(h.excerpt, '')) @@ query
  join meetings m on m.id = h.meeting_id
  order by h.created_at desc
  limit max_results
$$;
