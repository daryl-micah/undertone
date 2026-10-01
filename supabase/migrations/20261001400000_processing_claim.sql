-- Upload processing claims the meeting atomically, so two concurrent requests
-- can't both transcribe it. A claim older than the function time limit is
-- treated as abandoned and can be retaken.
alter table meetings add column processing_started_at timestamptz;
