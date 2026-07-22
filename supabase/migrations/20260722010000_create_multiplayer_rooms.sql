create extension if not exists pgcrypto with schema extensions;

alter table public.game_sessions
  add column if not exists room_code_hash text,
  add column if not exists player_limit smallint,
  add column if not exists lobby_locked boolean not null default false,
  add column if not exists schema_version smallint not null default 1,
  add column if not exists finished_at timestamptz;

alter table public.game_sessions
  drop constraint if exists game_sessions_player_limit_check;
alter table public.game_sessions
  add constraint game_sessions_player_limit_check
  check (player_limit is null or player_limit between 2 and 6);

create unique index if not exists game_sessions_room_code_hash_idx
  on public.game_sessions (room_code_hash)
  where room_code_hash is not null;

create table if not exists public.game_members (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  is_host boolean not null default false,
  is_player boolean not null default true,
  sort_order smallint not null default 0,
  joined_at timestamptz not null default now(),
  removed_at timestamptz
);

create unique index if not exists game_members_active_user_idx
  on public.game_members (session_id, user_id)
  where removed_at is null;
create unique index if not exists game_members_active_name_idx
  on public.game_members (session_id, lower(btrim(display_name)))
  where removed_at is null;
create index if not exists game_members_session_idx
  on public.game_members (session_id, sort_order, joined_at);
create unique index if not exists game_members_one_active_host_idx
  on public.game_members (session_id)
  where is_host and removed_at is null;

create table if not exists public.game_rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  round_number smallint not null check (round_number > 0),
  grid_size smallint check (grid_size in (4, 5)),
  grid jsonb not null default '[]'::jsonb check (jsonb_typeof(grid) = 'array'),
  phase text not null default 'board_setup'
    check (phase in ('board_setup', 'playing', 'collecting', 'processing', 'review', 'finalized')),
  timer_duration_seconds integer not null default 180 check (timer_duration_seconds between 0 and 7200),
  timer_remaining_seconds integer not null default 180 check (timer_remaining_seconds between 0 and 7200),
  timer_started_at timestamptz,
  timer_paused_at timestamptz,
  frozen_revision uuid,
  results_revision uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz,
  finalized_at timestamptz,
  unique (session_id, round_number)
);

create index if not exists game_rounds_session_idx
  on public.game_rounds (session_id, round_number desc);

create table if not exists public.round_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  member_id uuid not null references public.game_members(id) on delete cascade,
  client_token uuid not null,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'missing')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, member_id),
  unique (round_id, client_token)
);

create index if not exists round_submissions_round_idx
  on public.round_submissions (round_id, status);
create index if not exists round_submissions_member_idx
  on public.round_submissions (member_id, updated_at desc);

create table if not exists public.submitted_words (
  id uuid primary key,
  submission_id uuid not null references public.round_submissions(id) on delete cascade,
  position integer not null check (position >= 0),
  raw_text text not null check (char_length(raw_text) between 1 and 80),
  normalized text not null check (char_length(normalized) between 1 and 80),
  ocr_confidence numeric(5,2) check (ocr_confidence between 0 and 100),
  created_at timestamptz not null default now(),
  unique (submission_id, position)
);

create index if not exists submitted_words_submission_idx
  on public.submitted_words (submission_id, position);
create index if not exists submitted_words_normalized_idx
  on public.submitted_words (normalized);

create table if not exists public.round_word_results (
  id uuid primary key default extensions.gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  submitted_word_id uuid not null references public.submitted_words(id) on delete cascade,
  results_revision uuid not null,
  format_valid boolean not null default false,
  minimum_length_valid boolean not null default false,
  dictionary_valid boolean not null default false,
  grid_valid boolean not null default false,
  self_duplicate boolean not null default false,
  cross_player_duplicate boolean not null default false,
  grid_path jsonb check (grid_path is null or jsonb_typeof(grid_path) = 'array'),
  base_score integer not null default 0 check (base_score >= 0),
  score integer not null default 0 check (score >= 0),
  is_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  unique (round_id, submitted_word_id)
);

create index if not exists round_word_results_round_idx
  on public.round_word_results (round_id, results_revision);

create table if not exists public.word_overrides (
  id uuid primary key default extensions.gen_random_uuid(),
  round_word_result_id uuid not null references public.round_word_results(id) on delete cascade,
  check_type text not null check (check_type in ('dictionary', 'grid_path')),
  reason text not null check (char_length(btrim(reason)) between 1 and 120),
  host_member_id uuid not null references public.game_members(id),
  created_at timestamptz not null default now()
);

create index if not exists word_overrides_result_idx
  on public.word_overrides (round_word_result_id, created_at);

create table if not exists public.score_entries (
  id uuid primary key,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  member_id uuid not null references public.game_members(id) on delete cascade,
  word text not null check (word ~ '^[A-Z]+$' and char_length(word) between 1 and 80),
  points integer not null check (points > 0),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.game_members(id),
  void_reason text check (void_reason is null or char_length(btrim(void_reason)) between 1 and 120)
);

create index if not exists score_entries_session_idx
  on public.score_entries (session_id, created_at);
create index if not exists score_entries_member_idx
  on public.score_entries (member_id, created_at);

-- SECURITY DEFINER membership checks prevent recursive RLS lookups.
create or replace function public.is_room_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_members gm
    where gm.session_id = p_session_id
      and gm.user_id = (select auth.uid())
      and gm.removed_at is null
  );
$$;

create or replace function public.is_room_host(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_members gm
    where gm.session_id = p_session_id
      and gm.user_id = (select auth.uid())
      and gm.is_host
      and gm.removed_at is null
  );
$$;

create or replace function public.current_room_member_id(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select gm.id
  from public.game_members gm
  where gm.session_id = p_session_id
    and gm.user_id = (select auth.uid())
    and gm.removed_at is null
  limit 1;
$$;

alter table public.game_members enable row level security;
alter table public.game_rounds enable row level security;
alter table public.round_submissions enable row level security;
alter table public.submitted_words enable row level security;
alter table public.round_word_results enable row level security;
alter table public.word_overrides enable row level security;
alter table public.score_entries enable row level security;

drop policy if exists "Room members can read shared sessions" on public.game_sessions;
create policy "Room members can read shared sessions"
  on public.game_sessions for select to authenticated
  using (public.is_room_member(id));

drop policy if exists "Room members can read the roster" on public.game_members;
create policy "Room members can read the roster"
  on public.game_members for select to authenticated
  using (public.is_room_member(session_id));

drop policy if exists "Room members can read rounds" on public.game_rounds;
create policy "Room members can read rounds"
  on public.game_rounds for select to authenticated
  using (public.is_room_member(session_id));

drop policy if exists "Room members can read readiness" on public.round_submissions;
create policy "Room members can read readiness"
  on public.round_submissions for select to authenticated
  using (
    exists (
      select 1 from public.game_rounds gr
      where gr.id = round_id and public.is_room_member(gr.session_id)
    )
  );

drop policy if exists "Owners read words before reveal and members after reveal" on public.submitted_words;
create policy "Owners read words before reveal and members after reveal"
  on public.submitted_words for select to authenticated
  using (
    exists (
      select 1
      from public.round_submissions rs
      join public.game_rounds gr on gr.id = rs.round_id
      join public.game_members gm on gm.id = rs.member_id
      where rs.id = submission_id
        and public.is_room_member(gr.session_id)
        and (gm.user_id = (select auth.uid()) or gr.phase in ('review', 'finalized'))
    )
  );

drop policy if exists "Members read published results" on public.round_word_results;
create policy "Members read published results"
  on public.round_word_results for select to authenticated
  using (
    exists (
      select 1 from public.game_rounds gr
      where gr.id = round_id
        and gr.phase in ('review', 'finalized')
        and public.is_room_member(gr.session_id)
    )
  );

drop policy if exists "Members read published overrides" on public.word_overrides;
create policy "Members read published overrides"
  on public.word_overrides for select to authenticated
  using (
    exists (
      select 1
      from public.round_word_results rwr
      join public.game_rounds gr on gr.id = rwr.round_id
      where rwr.id = round_word_result_id
        and gr.phase in ('review', 'finalized')
        and public.is_room_member(gr.session_id)
    )
  );

drop policy if exists "Room members read Scrabble scores" on public.score_entries;
create policy "Room members read Scrabble scores"
  on public.score_entries for select to authenticated
  using (public.is_room_member(session_id));

grant select on public.game_members, public.game_rounds, public.round_submissions,
  public.submitted_words, public.round_word_results, public.word_overrides,
  public.score_entries to authenticated;
grant all on public.game_members, public.game_rounds, public.round_submissions,
  public.submitted_words, public.round_word_results, public.word_overrides,
  public.score_entries to service_role;

create or replace function public.create_room(
  p_mode text,
  p_player_limit integer,
  p_host_player_name text default null,
  p_grid_size integer default 4,
  p_timer_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := extensions.gen_random_uuid();
  v_member_id uuid := extensions.gen_random_uuid();
  v_round_id uuid;
  v_code text;
  v_hash text;
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_host_name text := nullif(btrim(p_host_player_name), '');
  v_attempt integer;
  v_index integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_mode not in ('scrabble', 'boggle', 'scribbage') then raise exception 'Unsupported game mode'; end if;
  if p_player_limit not between 2 and 6 then raise exception 'Player limit must be between 2 and 6'; end if;
  if p_grid_size not in (4, 5) then raise exception 'Grid size must be 4 or 5'; end if;
  if p_timer_seconds not between 0 and 7200 then raise exception 'Timer must be between 0 and 7200 seconds'; end if;
  if v_host_name is not null and char_length(v_host_name) > 30 then raise exception 'Player name is too long'; end if;

  for v_attempt in 1..20 loop
    v_code := '';
    v_bytes := extensions.gen_random_bytes(6);
    for v_index in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_index) % char_length(v_alphabet)) + 1, 1);
    end loop;
    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
    exit when not exists (select 1 from public.game_sessions where room_code_hash = v_hash);
    v_code := null;
  end loop;
  if v_code is null then raise exception 'Could not allocate a room code'; end if;

  insert into public.game_sessions (
    id, user_id, device_id, mode, players, entries, status,
    room_code_hash, player_limit, lobby_locked, schema_version
  ) values (
    v_session_id, v_user_id, v_user_id, p_mode, '[]'::jsonb, '[]'::jsonb, 'active',
    v_hash, p_player_limit, false, 2
  );

  insert into public.game_members (id, session_id, user_id, display_name, is_host, is_player, sort_order)
  values (v_member_id, v_session_id, v_user_id, coalesce(v_host_name, 'Host'), true, v_host_name is not null, 0);

  if p_mode in ('boggle', 'scribbage') then
    insert into public.game_rounds (
      session_id, round_number, grid_size, timer_duration_seconds, timer_remaining_seconds
    ) values (v_session_id, 1, p_grid_size, p_timer_seconds, p_timer_seconds)
    returning id into v_round_id;
  end if;

  return jsonb_build_object(
    'sessionId', v_session_id, 'memberId', v_member_id, 'roomCode', v_code,
    'roundId', v_round_id, 'isHost', true
  );
end;
$$;

create or replace function public.join_room(p_room_code text, p_player_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code text := upper(regexp_replace(coalesce(p_room_code, ''), '[^A-Z0-9]', '', 'g'));
  v_name text := btrim(coalesce(p_player_name, ''));
  v_session public.game_sessions%rowtype;
  v_member public.game_members%rowtype;
  v_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(v_code) <> 6 then raise exception 'Room code must be 6 characters'; end if;
  if char_length(v_name) not between 1 and 30 then raise exception 'Player name must be 1 to 30 characters'; end if;

  select * into v_session
  from public.game_sessions
  where room_code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
    and status = 'active'
  for update;
  if not found then raise exception 'Room not found'; end if;

  select * into v_member from public.game_members
  where session_id = v_session.id and user_id = v_user_id and removed_at is null;
  if found then
    return jsonb_build_object('sessionId', v_session.id, 'memberId', v_member.id, 'isHost', v_member.is_host);
  end if;
  if v_session.lobby_locked then raise exception 'This room is already in progress'; end if;
  if exists (
    select 1 from public.game_members
    where session_id = v_session.id and removed_at is null and lower(btrim(display_name)) = lower(v_name)
  ) then raise exception 'That player name is already in use'; end if;
  select count(*) into v_count from public.game_members
  where session_id = v_session.id and removed_at is null and is_player;
  if v_count >= v_session.player_limit then raise exception 'This room is full'; end if;

  insert into public.game_members (session_id, user_id, display_name, is_player, sort_order)
  values (v_session.id, v_user_id, v_name, true, v_count + 1)
  returning * into v_member;
  return jsonb_build_object('sessionId', v_session.id, 'memberId', v_member.id, 'isHost', false);
end;
$$;

create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_session_id uuid; v_locked boolean; v_is_host boolean;
begin
  select session_id, is_host into v_session_id, v_is_host from public.game_members where id = p_member_id;
  if not found or not public.is_room_host(v_session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  select lobby_locked into v_locked from public.game_sessions where id = v_session_id for update;
  if v_locked then raise exception 'Players cannot be removed after play starts'; end if;
  if v_is_host then raise exception 'The host cannot be removed'; end if;
  update public.game_members set removed_at = now() where id = p_member_id and removed_at is null;
end;
$$;

create or replace function public.confirm_board(p_round_id uuid, p_grid jsonb)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase <> 'board_setup' then raise exception 'The board is already locked'; end if;
  if jsonb_typeof(p_grid) <> 'array' or jsonb_array_length(p_grid) <> v_round.grid_size then raise exception 'Grid dimensions are invalid'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_grid) row_value
    where jsonb_typeof(row_value) <> 'array'
      or jsonb_array_length(row_value) <> v_round.grid_size
      or exists (select 1 from jsonb_array_elements_text(row_value) cell where cell !~ '^(?:[A-Z]|QU)$')
  ) then raise exception 'Each grid cell must be A-Z or QU'; end if;
  update public.game_rounds set grid = p_grid where id = p_round_id returning * into v_round;
  return v_round;
end;
$$;

create or replace function public.start_round(p_round_id uuid)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase <> 'board_setup' or jsonb_array_length(v_round.grid) = 0 then raise exception 'Confirm the board before starting'; end if;
  update public.game_sessions set lobby_locked = true, updated_at = now() where id = v_round.session_id;
  update public.game_rounds set phase = 'playing', started_at = now(), timer_started_at = now(), timer_paused_at = null
  where id = p_round_id returning * into v_round;
  return v_round;
end;
$$;

create or replace function public.pause_round(p_round_id uuid)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype; v_remaining integer;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase <> 'playing' or v_round.timer_started_at is null or v_round.timer_paused_at is not null then raise exception 'Round timer is not running'; end if;
  v_remaining := greatest(0, v_round.timer_remaining_seconds - floor(extract(epoch from (now() - v_round.timer_started_at)))::integer);
  update public.game_rounds set timer_remaining_seconds = v_remaining, timer_paused_at = now()
  where id = p_round_id returning * into v_round;
  return v_round;
end;
$$;

create or replace function public.resume_round(p_round_id uuid)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase <> 'playing' or v_round.timer_paused_at is null then raise exception 'Round timer is not paused'; end if;
  update public.game_rounds set timer_started_at = now(), timer_paused_at = null
  where id = p_round_id returning * into v_round;
  return v_round;
end;
$$;

create or replace function public.reset_round_timer(p_round_id uuid)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase <> 'playing' then raise exception 'Only a playing round timer can be reset'; end if;
  update public.game_rounds set
    timer_remaining_seconds = timer_duration_seconds,
    timer_started_at = now(),
    timer_paused_at = null
  where id = p_round_id returning * into v_round;
  return v_round;
end;
$$;

create or replace function public.open_submissions(p_round_id uuid)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase not in ('playing', 'collecting') then raise exception 'Round cannot collect submissions'; end if;
  update public.game_rounds set phase = 'collecting', timer_remaining_seconds = case
    when timer_started_at is null then timer_remaining_seconds
    when timer_paused_at is null then greatest(0, timer_remaining_seconds - floor(extract(epoch from (now() - timer_started_at)))::integer)
    else timer_remaining_seconds end,
    timer_paused_at = coalesce(timer_paused_at, now())
  where id = p_round_id returning * into v_round;
  return v_round;
end;
$$;

create or replace function public.create_next_round(
  p_session_id uuid,
  p_grid_size integer default 4,
  p_timer_seconds integer default 180
)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype; v_number integer;
begin
  if not public.is_room_host(p_session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if p_grid_size not in (4, 5) or p_timer_seconds not between 0 and 7200 then raise exception 'Invalid round settings'; end if;
  perform 1 from public.game_sessions where id = p_session_id and status = 'active' and mode in ('boggle', 'scribbage') for update;
  if not found then raise exception 'Active grid-game room not found'; end if;
  if exists (select 1 from public.game_rounds where session_id = p_session_id and phase <> 'finalized') then raise exception 'Finish the current round first'; end if;
  select coalesce(max(round_number), 0) + 1 into v_number from public.game_rounds where session_id = p_session_id;
  insert into public.game_rounds (session_id, round_number, grid_size, timer_duration_seconds, timer_remaining_seconds)
  values (p_session_id, v_number, p_grid_size, p_timer_seconds, p_timer_seconds) returning * into v_round;
  return v_round;
end;
$$;

create or replace function public.start_scrabble_game(p_session_id uuid)
returns public.game_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare v_session public.game_sessions%rowtype;
begin
  select * into v_session from public.game_sessions where id = p_session_id for update;
  if not found or not public.is_room_host(p_session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_session.mode <> 'scrabble' or v_session.status <> 'active' then raise exception 'Active Scrabble room required'; end if;
  update public.game_sessions set lobby_locked = true, updated_at = now()
  where id = p_session_id returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.confirm_submission(
  p_round_id uuid,
  p_client_token uuid,
  p_revision integer,
  p_words jsonb
)
returns public.round_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.game_rounds%rowtype;
  v_member_id uuid;
  v_submission public.round_submissions%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or v_round.phase not in ('playing', 'collecting') then raise exception 'This round is closed'; end if;
  v_member_id := public.current_room_member_id(v_round.session_id);
  if v_member_id is null or not exists (select 1 from public.game_members where id = v_member_id and is_player) then raise exception 'Player access required' using errcode = '42501'; end if;
  if p_revision < 1 or jsonb_typeof(p_words) <> 'array' or jsonb_array_length(p_words) > 250 then raise exception 'Invalid submission'; end if;

  select * into v_submission from public.round_submissions
  where round_id = p_round_id and member_id = v_member_id for update;
  if found and v_submission.revision > p_revision then raise exception 'A newer submission is already saved'; end if;
  if found and v_submission.revision = p_revision and v_submission.client_token = p_client_token then return v_submission; end if;

  insert into public.round_submissions (round_id, member_id, client_token, revision, status, confirmed_at, updated_at)
  values (p_round_id, v_member_id, p_client_token, p_revision, 'confirmed', now(), now())
  on conflict (round_id, member_id) do update set
    client_token = excluded.client_token, revision = excluded.revision, status = 'confirmed',
    confirmed_at = now(), updated_at = now()
  returning * into v_submission;

  delete from public.submitted_words where submission_id = v_submission.id;
  insert into public.submitted_words (id, submission_id, position, raw_text, normalized, ocr_confidence)
  select
    coalesce(nullif(word->>'id', '')::uuid, extensions.gen_random_uuid()),
    v_submission.id,
    ordinality::integer - 1,
    btrim(word->>'rawText'),
    upper(btrim(coalesce(word->>'normalized', word->>'rawText'))),
    case when word ? 'confidence' then (word->>'confidence')::numeric else null end
  from jsonb_array_elements(p_words) with ordinality as item(word, ordinality)
  where char_length(btrim(coalesce(word->>'rawText', ''))) between 1 and 80;
  return v_submission;
end;
$$;

create or replace function public.close_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype; v_revision uuid := extensions.gen_random_uuid();
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase not in ('playing', 'collecting') then raise exception 'Round is not open'; end if;
  insert into public.round_submissions (round_id, member_id, client_token, revision, status, created_at, updated_at)
  select p_round_id, gm.id, extensions.gen_random_uuid(), 1, 'missing', now(), now()
  from public.game_members gm
  where gm.session_id = v_round.session_id and gm.is_player and gm.removed_at is null
  on conflict (round_id, member_id) do nothing;
  update public.game_rounds set phase = 'processing', closed_at = now(), frozen_revision = v_revision,
    timer_remaining_seconds = case
      when timer_started_at is null or timer_paused_at is not null then timer_remaining_seconds
      else greatest(0, timer_remaining_seconds - floor(extract(epoch from (now() - timer_started_at)))::integer) end,
    timer_paused_at = coalesce(timer_paused_at, now())
  where id = p_round_id;
  return jsonb_build_object('roundId', p_round_id, 'frozenRevision', v_revision);
end;
$$;

create or replace function public.get_frozen_round_snapshot(p_round_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase not in ('processing', 'review', 'finalized') or v_round.frozen_revision is null then raise exception 'Round is not frozen'; end if;
  return jsonb_build_object(
    'round', to_jsonb(v_round),
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'submissionId', rs.id, 'memberId', rs.member_id, 'playerName', gm.display_name,
        'status', rs.status, 'words', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sw.id, 'rawText', sw.raw_text, 'normalized', sw.normalized,
            'confidence', sw.ocr_confidence, 'position', sw.position
          ) order by sw.position) from public.submitted_words sw where sw.submission_id = rs.id
        ), '[]'::jsonb)
      ) order by gm.sort_order)
      from public.round_submissions rs join public.game_members gm on gm.id = rs.member_id
      where rs.round_id = p_round_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.publish_round_results(
  p_round_id uuid,
  p_frozen_revision uuid,
  p_results jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype; v_results_revision uuid := extensions.gen_random_uuid();
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase <> 'processing' or v_round.frozen_revision is distinct from p_frozen_revision then raise exception 'Frozen round revision does not match'; end if;
  if jsonb_typeof(p_results) <> 'array' then raise exception 'Results must be an array'; end if;
  if jsonb_array_length(p_results) <> (select count(*) from public.submitted_words sw join public.round_submissions rs on rs.id = sw.submission_id where rs.round_id = p_round_id) then raise exception 'Every submitted word must have one result'; end if;

  delete from public.round_word_results where round_id = p_round_id;
  insert into public.round_word_results (
    round_id, submitted_word_id, results_revision, format_valid, minimum_length_valid,
    dictionary_valid, grid_valid, self_duplicate, cross_player_duplicate, grid_path,
    base_score, score, is_eligible
  )
  select p_round_id, (result->>'wordId')::uuid, v_results_revision,
    coalesce((result->>'formatValid')::boolean, false),
    coalesce((result->>'minimumLengthValid')::boolean, false),
    coalesce((result->>'dictionaryValid')::boolean, false),
    coalesce((result->>'gridValid')::boolean, false),
    coalesce((result->>'selfDuplicate')::boolean, false),
    coalesce((result->>'crossPlayerDuplicate')::boolean, false),
    result->'gridPath',
    greatest(0, coalesce((result->>'baseScore')::integer, 0)),
    greatest(0, coalesce((result->>'score')::integer, 0)),
    coalesce((result->>'eligible')::boolean, false)
  from jsonb_array_elements(p_results) result
  where exists (
    select 1 from public.submitted_words sw join public.round_submissions rs on rs.id = sw.submission_id
    where sw.id = (result->>'wordId')::uuid and rs.round_id = p_round_id
  );
  if (select count(*) from public.round_word_results where round_id = p_round_id) <> jsonb_array_length(p_results) then raise exception 'Results contain unknown or duplicate words'; end if;
  update public.game_rounds set phase = 'review', results_revision = v_results_revision where id = p_round_id;
  return v_results_revision;
end;
$$;

create or replace function public.apply_word_override(
  p_result_id uuid,
  p_check_type text,
  p_reason text
)
returns public.round_word_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.round_word_results%rowtype;
  v_session_id uuid;
  v_host_id uuid;
  v_dictionary_ok boolean;
  v_grid_ok boolean;
  v_other_checks boolean;
begin
  select rwr.* into v_result
  from public.round_word_results rwr join public.game_rounds gr on gr.id = rwr.round_id
  where rwr.id = p_result_id and gr.phase = 'review' for update of rwr;
  if found then
    select session_id into v_session_id from public.game_rounds where id = v_result.round_id;
  end if;
  if not found or not public.is_room_host(v_session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if p_check_type not in ('dictionary', 'grid_path') or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 120 then raise exception 'Invalid override'; end if;
  v_host_id := public.current_room_member_id(v_session_id);
  if p_check_type = 'dictionary' and v_result.dictionary_valid then raise exception 'Dictionary check already passes'; end if;
  if p_check_type = 'grid_path' and v_result.grid_valid then raise exception 'Grid path check already passes'; end if;
  if exists (
    select 1 from public.word_overrides
    where round_word_result_id = p_result_id and check_type = p_check_type
  ) then raise exception 'That check has already been overridden'; end if;
  insert into public.word_overrides (round_word_result_id, check_type, reason, host_member_id)
  values (p_result_id, p_check_type, btrim(p_reason), v_host_id);
  v_dictionary_ok := v_result.dictionary_valid or exists (
    select 1 from public.word_overrides where round_word_result_id = p_result_id and check_type = 'dictionary'
  );
  v_grid_ok := v_result.grid_valid or exists (
    select 1 from public.word_overrides where round_word_result_id = p_result_id and check_type = 'grid_path'
  );
  v_other_checks := v_result.format_valid and v_result.minimum_length_valid
    and not v_result.self_duplicate and not v_result.cross_player_duplicate
    and v_dictionary_ok and v_grid_ok;
  update public.round_word_results set is_eligible = v_other_checks,
    score = case when v_other_checks then base_score else 0 end
  where id = p_result_id returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.refresh_session_snapshot(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.game_sessions gs set
    players = coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gm.id, 'name', gm.display_name,
        'score', coalesce((select sum(rwr.score)
          from public.round_word_results rwr
          join public.submitted_words sw on sw.id = rwr.submitted_word_id
          join public.round_submissions rs on rs.id = sw.submission_id
          join public.game_rounds gr on gr.id = rs.round_id
          where rs.member_id = gm.id and gr.phase = 'finalized'), 0)
          + coalesce((select sum(se.points) from public.score_entries se
            where se.member_id = gm.id and se.voided_at is null), 0)
      ) order by gm.sort_order)
      from public.game_members gm where gm.session_id = p_session_id and gm.is_player and gm.removed_at is null
    ), '[]'::jsonb),
    entries = coalesce((
      select jsonb_agg(entry order by created_at) from (
        select jsonb_build_object('id', se.id, 'word', se.word, 'points', se.points, 'playerId', se.member_id, 'createdAt', se.created_at) entry, se.created_at
        from public.score_entries se where se.session_id = p_session_id and se.voided_at is null
        union all
        select jsonb_build_object('id', sw.id, 'word', sw.normalized, 'points', rwr.score, 'playerId', rs.member_id, 'createdAt', gr.finalized_at), gr.finalized_at
        from public.round_word_results rwr
        join public.submitted_words sw on sw.id = rwr.submitted_word_id
        join public.round_submissions rs on rs.id = sw.submission_id
        join public.game_rounds gr on gr.id = rs.round_id
        where gr.session_id = p_session_id and gr.phase = 'finalized' and rwr.score > 0
      ) snapshot_entries
    ), '[]'::jsonb),
    updated_at = now()
  where gs.id = p_session_id;
end;
$$;

create or replace function public.finalize_round(p_round_id uuid)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase <> 'review' or v_round.results_revision is null then raise exception 'Round results are not ready'; end if;
  update public.game_rounds set phase = 'finalized', finalized_at = now() where id = p_round_id returning * into v_round;
  perform public.refresh_session_snapshot(v_round.session_id);
  return v_round;
end;
$$;

create or replace function public.reopen_latest_round(p_round_id uuid)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare v_round public.game_rounds%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if v_round.phase <> 'finalized' or exists (select 1 from public.game_rounds where session_id = v_round.session_id and round_number > v_round.round_number) then raise exception 'Only the latest finalized round can be reopened'; end if;
  update public.game_rounds set phase = 'review', finalized_at = null where id = p_round_id returning * into v_round;
  perform public.refresh_session_snapshot(v_round.session_id);
  return v_round;
end;
$$;

create or replace function public.submit_scrabble_entry(
  p_session_id uuid,
  p_client_entry_id uuid,
  p_word text,
  p_points integer
)
returns public.score_entries
language plpgsql
security definer
set search_path = ''
as $$
declare v_session_id uuid; v_member_id uuid; v_entry public.score_entries%rowtype; v_word text := upper(btrim(coalesce(p_word, '')));
begin
  select gm.session_id, gm.id into v_session_id, v_member_id
  from public.game_members gm join public.game_sessions gs on gs.id = gm.session_id
  where gm.user_id = (select auth.uid()) and gm.removed_at is null and gm.is_player
    and gm.session_id = p_session_id and gs.mode = 'scrabble' and gs.status = 'active'
    and gs.lobby_locked;
  if not found then raise exception 'Active Scrabble player membership required' using errcode = '42501'; end if;
  if v_word !~ '^[A-Z]+$' or char_length(v_word) > 80 or p_points <= 0 then raise exception 'Word and positive points are required'; end if;
  insert into public.score_entries (id, session_id, member_id, word, points)
  values (p_client_entry_id, v_session_id, v_member_id, v_word, p_points)
  on conflict (id) do nothing;
  select * into v_entry from public.score_entries where id = p_client_entry_id;
  if v_entry.member_id is distinct from v_member_id then raise exception 'Entry id is already in use'; end if;
  perform public.refresh_session_snapshot(v_session_id);
  return v_entry;
end;
$$;

create or replace function public.void_scrabble_entry(p_entry_id uuid, p_reason text)
returns public.score_entries
language plpgsql
security definer
set search_path = ''
as $$
declare v_entry public.score_entries%rowtype; v_actor uuid;
begin
  select * into v_entry from public.score_entries where id = p_entry_id for update;
  if not found then raise exception 'Score entry not found'; end if;
  v_actor := public.current_room_member_id(v_entry.session_id);
  if v_actor is null or (v_actor <> v_entry.member_id and not public.is_room_host(v_entry.session_id)) then raise exception 'Entry owner or host access required' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 120 then raise exception 'A correction reason is required'; end if;
  update public.score_entries set voided_at = coalesce(voided_at, now()), voided_by = coalesce(voided_by, v_actor), void_reason = coalesce(void_reason, btrim(p_reason))
  where id = p_entry_id returning * into v_entry;
  perform public.refresh_session_snapshot(v_entry.session_id);
  return v_entry;
end;
$$;

create or replace function public.finish_game(p_session_id uuid)
returns public.game_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare v_session public.game_sessions%rowtype;
begin
  if not public.is_room_host(p_session_id) then raise exception 'Host access required' using errcode = '42501'; end if;
  if exists (select 1 from public.game_rounds where session_id = p_session_id and phase not in ('finalized')) then raise exception 'Finalize the current round first'; end if;
  perform public.refresh_session_snapshot(p_session_id);
  update public.game_sessions set status = 'complete', lobby_locked = true, finished_at = now(), updated_at = now()
  where id = p_session_id returning * into v_session;
  return v_session;
end;
$$;

revoke all on function public.is_room_member(uuid) from public, anon;
revoke all on function public.is_room_host(uuid) from public, anon;
revoke all on function public.current_room_member_id(uuid) from public, anon;
revoke all on function public.refresh_session_snapshot(uuid) from public, anon;
grant execute on function public.is_room_member(uuid), public.is_room_host(uuid), public.current_room_member_id(uuid) to authenticated;

revoke all on function public.create_room(text, integer, text, integer, integer),
  public.join_room(text, text), public.remove_member(uuid), public.confirm_board(uuid, jsonb),
  public.start_round(uuid), public.pause_round(uuid), public.resume_round(uuid),
  public.reset_round_timer(uuid), public.open_submissions(uuid), public.create_next_round(uuid, integer, integer), public.start_scrabble_game(uuid),
  public.confirm_submission(uuid, uuid, integer, jsonb), public.close_round(uuid),
  public.get_frozen_round_snapshot(uuid), public.publish_round_results(uuid, uuid, jsonb),
  public.apply_word_override(uuid, text, text), public.finalize_round(uuid),
  public.reopen_latest_round(uuid), public.submit_scrabble_entry(uuid, uuid, text, integer),
  public.void_scrabble_entry(uuid, text), public.finish_game(uuid)
from public, anon;

grant execute on function public.create_room(text, integer, text, integer, integer),
  public.join_room(text, text), public.remove_member(uuid), public.confirm_board(uuid, jsonb),
  public.start_round(uuid), public.pause_round(uuid), public.resume_round(uuid),
  public.reset_round_timer(uuid), public.open_submissions(uuid), public.create_next_round(uuid, integer, integer), public.start_scrabble_game(uuid),
  public.confirm_submission(uuid, uuid, integer, jsonb), public.close_round(uuid),
  public.get_frozen_round_snapshot(uuid), public.publish_round_results(uuid, uuid, jsonb),
  public.apply_word_override(uuid, text, text), public.finalize_round(uuid),
  public.reopen_latest_round(uuid), public.submit_scrabble_entry(uuid, uuid, text, integer),
  public.void_scrabble_entry(uuid, text), public.finish_game(uuid)
to authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'game_sessions', 'game_members', 'game_rounds', 'round_submissions',
    'submitted_words', 'round_word_results', 'word_overrides', 'score_entries'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;
