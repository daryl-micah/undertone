-- Summary templates. Safe to re-run: upserts by key.
-- Each section's `instructions` goes to the model verbatim; `title` is what users see.

insert into summary_templates (key, name, description, prompt, sections, sort_order) values
('general', 'General', 'A balanced recap for anyone who missed the meeting.',
 'Summarize the meeting for a colleague who missed it and has two minutes.',
 '[{"key":"overview","title":"Overview","instructions":"1-2 bullets: why the meeting happened and its main outcome."},
   {"key":"decisions","title":"Decisions","instructions":"Every decision actually made, with who made or owns it. Proposals that were not agreed do not belong here. Most important first. Max 8."},
   {"key":"takeaways","title":"Key takeaways","instructions":"The most important facts, numbers and insights discussed that are not decisions. Keep exact figures. Max 6."},
   {"key":"open","title":"Open questions","instructions":"Things explicitly left undecided or needing follow-up discussion. Max 4."},
   {"key":"next_steps","title":"Next steps","instructions":"Only concrete commitments someone agreed to, as \"Owner: task (due as spoken)\". Skip estimates, opinions and proposals. Most important first. Max 10."}]', 1),
('sales', 'Sales discovery', 'Pain, budget, timeline and decision process from a customer call.',
 'Summarize this sales call for the seller''s team and CRM.',
 '[{"key":"pain","title":"Pain points","instructions":"The customer''s problems in their own terms, with any numbers they gave. Max 5."},
   {"key":"budget","title":"Budget","instructions":"Pricing discussed and the customer''s reaction. Max 3."},
   {"key":"timeline","title":"Timeline","instructions":"Deadlines and events driving the purchase. Max 3."},
   {"key":"decision","title":"Decision process","instructions":"Who decides, who can block, and what they need to see. Max 4."},
   {"key":"objections","title":"Objections and risks","instructions":"Blockers and concerns raised, and how they were answered. Max 4."},
   {"key":"next_steps","title":"Next steps","instructions":"Agreed commitments as \"Owner: task (due as spoken)\". Max 6."}]', 2),
('one_on_one', '1:1', 'Wins, blockers, feedback and commitments between two people.',
 'Summarize this 1:1 between a manager and their report. Be warm but factual.',
 '[{"key":"wins","title":"Wins","instructions":"Max 4."},
   {"key":"blockers","title":"Blockers","instructions":"What is in the way and what was agreed about it. Max 4."},
   {"key":"feedback","title":"Feedback","instructions":"Feedback given in either direction, stated plainly. Max 4."},
   {"key":"commitments","title":"Commitments","instructions":"As \"Owner: task (due as spoken)\". Max 6."}]', 3),
('standup', 'Stand-up', 'Per-person updates and blockers.',
 'Summarize this stand-up so someone can scan it in 30 seconds.',
 '[{"key":"per_person","title":"Updates by person","instructions":"One bullet per person: \"Name: done; next\". Max one bullet per person."},
   {"key":"blockers","title":"Blockers","instructions":"Each blocker and who is unblocking it. Max 5."}]', 4),
('decisions', 'Decisions & risks', 'For large planning calls: what was decided, by whom, and what is still open.',
 'Extract the decision record of this meeting for people who need to act on it.',
 '[{"key":"decisions","title":"Decisions made","instructions":"Each decision with the reasoning in a short clause and who owns it. Max 10."},
   {"key":"rejected","title":"Options considered and not chosen","instructions":"Alternatives that were discussed and set aside, and why. Max 5."},
   {"key":"open","title":"Open questions","instructions":"Max 5."},
   {"key":"risks","title":"Risks raised","instructions":"Each risk, its deadline if any, and the mitigation agreed. Max 6."}]', 5)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  prompt = excluded.prompt,
  sections = excluded.sections,
  sort_order = excluded.sort_order;

-- Template content changed, so cached summaries are stale.
delete from summaries;
