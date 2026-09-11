-- ===========================================================================
-- Overlap — initial schema
--
-- Design summary
--   * Organizers are Supabase Auth users (magic-link). They own polls.
--   * Participants have no accounts. They never touch tables directly:
--       - reads go through the SECURITY DEFINER function get_public_poll()
--       - writes go through the submit-response Edge Function (service role)
--   * Row Level Security is enabled on every table. The anon role has NO
--     table-level policies at all; it can only call get_public_poll().
-- ===========================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.polls (
  id               uuid primary key default gen_random_uuid(),
  organizer_id     uuid not null references auth.users (id) on delete cascade,
  title            text not null check (char_length(btrim(title)) between 1 and 160),
  description      text check (description is null or char_length(description) <= 2000),
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  time_zone        text not null check (char_length(time_zone) between 1 and 64),
  deadline         timestamptz,
  status           text not null default 'open' check (status in ('open', 'closed')),
  allow_maybe      boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index polls_organizer_idx on public.polls (organizer_id, created_at desc);

create table public.time_slots (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls (id) on delete cascade,
  starts_at timestamptz not null,
  unique (poll_id, starts_at)
);

create index time_slots_poll_idx on public.time_slots (poll_id, starts_at);

create table public.responses (
  id              uuid primary key default gen_random_uuid(),
  poll_id         uuid not null references public.polls (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  email           text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  -- SHA-256 hex digest of the participant's edit token. The raw token is
  -- shown to the participant once and never stored.
  edit_token_hash text not null unique check (edit_token_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index responses_poll_idx on public.responses (poll_id, updated_at desc);

create table public.availability (
  response_id uuid not null references public.responses (id) on delete cascade,
  slot_id     uuid not null references public.time_slots (id) on delete cascade,
  state       text not null check (state in ('yes', 'maybe')),
  primary key (response_id, slot_id)
);

create index availability_slot_idx on public.availability (slot_id);

-- Used by the Edge Function for rate limiting. Stores only a salted hash of
-- the client IP, never the IP itself. Rows are pruned by the function.
create table public.submission_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  poll_id    uuid,
  created_at timestamptz not null default now()
);

create index submission_log_ip_idx on public.submission_log (ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity: validate IANA time zone names and maintain updated_at
-- ---------------------------------------------------------------------------

create or replace function public.assert_valid_time_zone()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown time zone: %', new.time_zone
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger polls_validate_time_zone
  before insert or update of time_zone on public.polls
  for each row execute function public.assert_valid_time_zone();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger polls_set_updated_at
  before update on public.polls
  for each row execute function public.set_updated_at();

create trigger responses_set_updated_at
  before update on public.responses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.polls          enable row level security;
alter table public.time_slots     enable row level security;
alter table public.responses      enable row level security;
alter table public.availability   enable row level security;
alter table public.submission_log enable row level security;

-- Organizers: full control over their own polls.
create policy "organizer selects own polls" on public.polls
  for select to authenticated using (organizer_id = auth.uid());
create policy "organizer inserts own polls" on public.polls
  for insert to authenticated with check (organizer_id = auth.uid());
create policy "organizer updates own polls" on public.polls
  for update to authenticated using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "organizer deletes own polls" on public.polls
  for delete to authenticated using (organizer_id = auth.uid());

-- Time slots belong to the organizer of the parent poll.
create policy "organizer manages own slots" on public.time_slots
  for all to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and p.organizer_id = auth.uid()))
  with check (exists (select 1 from public.polls p where p.id = poll_id and p.organizer_id = auth.uid()));

-- Organizers may read and delete responses to their polls, but never create
-- or edit them (that would let an organizer forge a participant's answer).
create policy "organizer reads responses" on public.responses
  for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and p.organizer_id = auth.uid()));
create policy "organizer deletes responses" on public.responses
  for delete to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and p.organizer_id = auth.uid()));

create policy "organizer reads availability" on public.availability
  for select to authenticated
  using (exists (
    select 1 from public.responses r join public.polls p on p.id = r.poll_id
    where r.id = response_id and p.organizer_id = auth.uid()));

-- submission_log: no policies. Only the service role (Edge Function) uses it.

-- Defense in depth: the anon role gets no table privileges at all, so even a
-- future policy mistake cannot expose data to unauthenticated clients.
revoke all on all tables in schema public from anon;

-- The organizer-facing client must never read edit_token_hash. Column-level
-- privileges enforce this regardless of RLS.
revoke all on public.responses from authenticated, anon;
grant select (id, poll_id, name, email, created_at, updated_at), delete on public.responses to authenticated;

revoke all on public.submission_log from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Public read access: a single function that returns exactly the fields a
-- participant is allowed to see. Emails and organizer identity are omitted.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_poll(p_poll_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'poll', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'description', p.description,
      'durationMinutes', p.duration_minutes,
      'timeZone', p.time_zone,
      'deadline', p.deadline,
      'status', p.status,
      'allowMaybe', p.allow_maybe
    ),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'startsAt', s.starts_at) order by s.starts_at)
      from public.time_slots s where s.poll_id = p.id
    ), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'updatedAt', r.updated_at,
        'availability', coalesce((
          select jsonb_object_agg(a.slot_id, a.state)
          from public.availability a where a.response_id = r.id
        ), '{}'::jsonb)
      ) order by r.created_at)
      from public.responses r where r.poll_id = p.id
    ), '[]'::jsonb)
  )
  from public.polls p
  where p.id = p_poll_id;
$$;

revoke all on function public.get_public_poll(uuid) from public;
grant execute on function public.get_public_poll(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Organizer convenience: response counts for the dashboard list.
-- Runs under the caller's RLS, so it only sees the caller's own polls.
-- ---------------------------------------------------------------------------

create or replace view public.poll_overview
with (security_invoker = true)
as
  select
    p.id, p.title, p.status, p.time_zone, p.deadline, p.created_at, p.updated_at,
    (select count(r.id) from public.responses r where r.poll_id = p.id)::int as response_count,
    (select max(r.updated_at) from public.responses r where r.poll_id = p.id) as last_response_at,
    (select count(s.id) from public.time_slots s where s.poll_id = p.id)::int as slot_count
  from public.polls p;

grant select on public.poll_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Participant edit flow: look up a response by its edit token so the form can
-- be pre-filled. Only the token holder can do this; the hash is never returned.
-- ---------------------------------------------------------------------------

create or replace function public.get_response_by_token(p_poll_id uuid, p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'email', r.email,
    'availability', coalesce((
      select jsonb_object_agg(a.slot_id, a.state) from public.availability a where a.response_id = r.id
    ), '{}'::jsonb)
  )
  from public.responses r
  where r.poll_id = p_poll_id
    and p_token ~ '^[A-Za-z0-9_-]{40,50}$'
    and r.edit_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;

revoke all on function public.get_response_by_token(uuid, text) from public;
grant execute on function public.get_response_by_token(uuid, text) to anon, authenticated;
