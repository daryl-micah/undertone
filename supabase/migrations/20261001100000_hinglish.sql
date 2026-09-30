-- Hinglish support: every line can be read as spoken (Devanagari + Latin), as
-- romanized Hinglish, or in English, and search matches all three.

-- Segments ----------------------------------------------------------------------

alter table transcript_segments
  add column text_romanized text,
  add column text_english text,
  add column hindi_ratio real not null default 0 check (hindi_ratio between 0 and 1);

-- English stemming over the English meaning, plus exact/prefix matching over the
-- words as spoken and as romanized.
drop index transcript_segments_tsv_idx;
alter table transcript_segments drop column tsv;
alter table transcript_segments add column tsv tsvector generated always as (
  to_tsvector('english', coalesce(text_english, text))
  || to_tsvector('simple', coalesce(text, '') || ' ' || coalesce(text_romanized, ''))
) stored;
create index transcript_segments_tsv_idx on transcript_segments using gin (tsv);

-- Meetings ----------------------------------------------------------------------

alter table meetings
  add column language_mix text not null default 'en' check (language_mix in ('en', 'hi-en', 'hi')),
  add column hindi_ratio real not null default 0 check (hindi_ratio between 0 and 1);

-- Highlights keep their excerpt in all three forms, so pages without the
-- transcript loaded (library, share pages) can follow the same toggle.
alter table highlights
  add column excerpt_romanized text,
  add column excerpt_english text;

-- Uploads can be phone recordings and screen captures, not just the seeded MP3s.
update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/flac',
  'video/mp4', 'video/webm',
  'image/jpeg', 'image/png', 'image/webp'
]
where id = 'media';

-- Search ------------------------------------------------------------------------

-- Each typed word must match under either config: English stems ("reconcile"
-- finds "reconciliation") or the literal word as a prefix, which covers
-- Devanagari ("कल") and romanized Hinglish ("kal").
create or replace function prefix_tsquery(q text) returns tsquery
language plpgsql immutable as $$
declare
  word text;
  term tsquery;
  result tsquery;
begin
  for word in
    select w from regexp_split_to_table(lower(coalesce(q, '')), '[\s[:punct:]]+') as w where w <> ''
  loop
    word := '''' || replace(word, '''', '''''') || ''':*';
    term := to_tsquery('simple', word) || to_tsquery('english', word);
    result := case when result is null then term else result && term end;
  end loop;
  return result;
end
$$;

drop function search_transcripts(text, text, meeting_platform, timestamptz, timestamptz, integer);
create function search_transcripts(
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
  language_mix text,
  seq integer,
  start_ms integer,
  speaker_name text,
  speaker_color text,
  headline text,
  headline_romanized text,
  headline_english text
)
language sql stable as $$
  select m.id, m.title, m.started_at, m.platform, m.language_mix, s.seq, s.start_ms,
         coalesce(p.name, s.speaker_label), p.color,
         ts_headline('simple', s.text, query, 'StartSel=«,StopSel=»,HighlightAll=true'),
         case when s.text_romanized is not null
           then ts_headline('simple', s.text_romanized, query, 'StartSel=«,StopSel=»,HighlightAll=true') end,
         case when s.text_english is not null
           then ts_headline('english', s.text_english, query, 'StartSel=«,StopSel=»,HighlightAll=true') end
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
    on (to_tsvector('english', coalesce(h.title, '') || ' ' || coalesce(h.note, '') || ' ' || coalesce(h.excerpt_english, h.excerpt, ''))
        || to_tsvector('simple', coalesce(h.excerpt, '') || ' ' || coalesce(h.excerpt_romanized, ''))) @@ query
  join meetings m on m.id = h.meeting_id
  order by h.created_at desc
  limit max_results
$$;
