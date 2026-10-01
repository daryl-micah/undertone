-- "Join with link": meetings the notetaker was sent into by pasting a meeting URL.
alter table meetings add column join_url text;
