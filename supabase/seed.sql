-- Phase 1 seed: summary templates + one small hand-written meeting to prove the
-- pipeline end to end. The realistic seeded meetings (incl. the 8-person hour)
-- arrive in Phase 2 via scripts/seed.

insert into summary_templates (key, name, description, prompt, sections, sort_order) values
('general', 'General', 'A balanced recap for any meeting.',
 'Summarize the meeting for someone who missed it.',
 '[{"key":"purpose","title":"Purpose"},{"key":"takeaways","title":"Key takeaways"},{"key":"topics","title":"Topics"},{"key":"next_steps","title":"Next steps"}]', 1),
('sales', 'Sales discovery', 'Pain, budget, timeline and decision process from a customer call.',
 'Summarize this sales call from the seller''s point of view.',
 '[{"key":"pain","title":"Pain points"},{"key":"budget","title":"Budget"},{"key":"timeline","title":"Timeline"},{"key":"decision","title":"Decision process"},{"key":"objections","title":"Objections"},{"key":"next_steps","title":"Next steps"}]', 2),
('one_on_one', '1:1', 'Wins, blockers, feedback and commitments between two people.',
 'Summarize this 1:1 between a manager and a report.',
 '[{"key":"wins","title":"Wins"},{"key":"blockers","title":"Blockers"},{"key":"feedback","title":"Feedback"},{"key":"commitments","title":"Commitments"}]', 3),
('standup', 'Stand-up', 'Per-person yesterday / today / blockers.',
 'Summarize this stand-up per person.',
 '[{"key":"per_person","title":"Updates by person"},{"key":"blockers","title":"Blockers"}]', 4),
('decisions', 'Decisions & risks', 'For large planning calls: what was decided, by whom, and what is still open.',
 'List decisions, open questions and risks, attributing each to the people involved.',
 '[{"key":"decisions","title":"Decisions made"},{"key":"open","title":"Open questions"},{"key":"risks","title":"Risks raised"},{"key":"owners","title":"Owners"}]', 5);

-- Smoke-test meeting (fixed ids so scripts can reference it) --------------------

insert into meetings (id, title, platform, status, started_at, ended_at, duration_ms)
values ('00000000-0000-4000-8000-000000000001', 'Capture smoke test', 'meet', 'ready',
        '2026-09-30T09:00:00Z', '2026-09-30T09:00:36Z', 36000);

insert into participants (id, meeting_id, name, email, is_host, color, talk_time_ms) values
('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Daryl Micah', 'daryl@example.com', true, 'violet', 18000),
('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Priya Raman', 'priya@example.com', false, 'teal', 12000),
('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001', 'Sam Okafor', 'sam@acme.example', false, 'amber', 6000);
update participants set is_external = true where id = '00000000-0000-4000-8000-0000000000a3';

insert into transcript_segments (meeting_id, seq, participant_id, speaker_label, start_ms, end_ms, text) values
('00000000-0000-4000-8000-000000000001', 1, '00000000-0000-4000-8000-0000000000a1', 'SPEAKER_00',     0,  6000, 'Okay, we are recording. This is a quick test to make sure the notes come through.'),
('00000000-0000-4000-8000-000000000001', 2, '00000000-0000-4000-8000-0000000000a2', 'SPEAKER_01',  6000, 12000, 'Sounds good. I can see the notetaker joined as a participant.'),
('00000000-0000-4000-8000-000000000001', 3, '00000000-0000-4000-8000-0000000000a3', 'SPEAKER_02', 12000, 18000, 'Same on my side. Should we try a decision and an action item?'),
('00000000-0000-4000-8000-000000000001', 4, '00000000-0000-4000-8000-0000000000a1', 'SPEAKER_00', 18000, 24000, 'Yes. Decision: we ship the transcript view before the summary view.'),
('00000000-0000-4000-8000-000000000001', 5, '00000000-0000-4000-8000-0000000000a2', 'SPEAKER_01', 24000, 30000, 'Then I will write up the template list by Friday.'),
('00000000-0000-4000-8000-000000000001', 6, '00000000-0000-4000-8000-0000000000a1', 'SPEAKER_00', 30000, 36000, 'Great, that is everything. Stopping the recording now.');

insert into chapters (meeting_id, start_ms, end_ms, title) values
('00000000-0000-4000-8000-000000000001',     0, 18000, 'Checking the notetaker'),
('00000000-0000-4000-8000-000000000001', 18000, 36000, 'Decision and follow-up');

insert into action_items (meeting_id, text, assignee_participant_id, assignee_name, due_hint, source_ms) values
('00000000-0000-4000-8000-000000000001', 'Write up the summary template list', '00000000-0000-4000-8000-0000000000a2', 'Priya Raman', 'by Friday', 24000);

insert into highlights (meeting_id, start_ms, end_ms, title, excerpt, created_by_name) values
('00000000-0000-4000-8000-000000000001', 18000, 24000, 'Transcript view ships first',
 'Decision: we ship the transcript view before the summary view.', 'Daryl Micah');

insert into media_assets (meeting_id, kind, storage_path, mime, duration_ms) values
('00000000-0000-4000-8000-000000000001', 'audio', 'smoke/capture-smoke-test.wav', 'audio/wav', 36000);
