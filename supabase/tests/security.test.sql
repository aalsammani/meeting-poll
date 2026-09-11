-- pgTAP tests for authorization-sensitive behavior.
-- Run locally with:  supabase test db
begin;
select plan(9);

-- Two organizers.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'alice@example.edu'),
  ('00000000-0000-4000-8000-000000000002', 'bob@example.edu');

-- Alice creates a poll with two slots and one response (as the service role).
insert into public.polls (id, organizer_id, title, duration_minutes, time_zone)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Alice poll', 60, 'America/New_York');
insert into public.time_slots (id, poll_id, starts_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-10-05 14:00+00'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2026-10-06 14:00+00');
insert into public.responses (id, poll_id, name, email, edit_token_hash)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Carol', 'carol@example.edu', repeat('a', 64));
insert into public.availability values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'yes');

-- 1–3: anonymous users cannot read tables directly.
set local role anon;
select throws_ok('select * from public.polls', '42501', null, 'anon cannot select polls');
select throws_ok('select * from public.responses', '42501', null, 'anon cannot select responses');
select throws_ok('select * from public.submission_log', '42501', null, 'anon cannot select submission_log');

-- 4–5: anonymous users can read the public bundle, which omits emails.
select is(
  (select public.get_public_poll('10000000-0000-4000-8000-000000000001')->'poll'->>'title'),
  'Alice poll', 'anon can read public poll via RPC');
select ok(
  (select public.get_public_poll('10000000-0000-4000-8000-000000000001')::text) not like '%carol@example.edu%',
  'public bundle never contains participant emails');

-- 6–7: Bob cannot see or delete Alice's poll.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.polls), 0::bigint, 'Bob sees no polls belonging to Alice');
delete from public.polls where id = '10000000-0000-4000-8000-000000000001'; -- filtered by RLS, affects 0 rows
select throws_ok(
  $$insert into public.time_slots (poll_id, starts_at) values ('10000000-0000-4000-8000-000000000001', '2026-10-07 14:00+00')$$,
  '42501', null, 'Bob cannot add slots to Alice''s poll');

-- 8–9: Alice can see her poll but cannot read edit tokens or forge responses.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.polls), 1::bigint, 'Alice still sees her own poll (Bob''s delete did nothing)');
select throws_ok(
  $$insert into public.responses (poll_id, name, edit_token_hash) values ('10000000-0000-4000-8000-000000000001', 'Forged', repeat('b', 64))$$,
  '42501', null, 'organizer cannot insert responses');

select * from finish();
rollback;
