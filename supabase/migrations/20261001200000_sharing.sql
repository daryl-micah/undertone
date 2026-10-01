-- Sharing with someone who wasn't on the call.

alter table share_links
  add column allow_full_meeting boolean not null default false,
  add column created_by_name text;

-- Count a view and return the share in one statement, so concurrent opens never
-- lose a count. Expired links return nothing.
create or replace function record_share_view(share_token text)
returns setof share_links
language sql volatile as $$
  update share_links
  set view_count = view_count + 1
  where token = share_token and (expires_at is null or expires_at > now())
  returning *;
$$;
