alter table public.game_sessions
  add column if not exists board_source text not null default 'physical';

alter table public.game_sessions
  drop constraint if exists game_sessions_board_source_check;
alter table public.game_sessions
  add constraint game_sessions_board_source_check
  check (board_source in ('physical', 'generated'));

-- A versioned entry point keeps already-installed PWAs compatible with the
-- original five-argument create_room function during a staged deployment.
create or replace function public.create_room_v2(
  p_mode text,
  p_player_limit integer,
  p_host_player_name text default null,
  p_grid_size integer default 4,
  p_timer_seconds integer default 180,
  p_board_source text default 'physical'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room jsonb;
  v_session_id uuid;
begin
  if p_board_source not in ('physical', 'generated') then
    raise exception 'Unsupported board source';
  end if;
  if p_board_source = 'generated' and p_mode <> 'scribbage' then
    raise exception 'Generated boards are only available for Word Factory';
  end if;
  if p_board_source = 'generated' and p_timer_seconds not in (120, 180, 300) then
    raise exception 'Generated games require a 2, 3, or 5 minute timer';
  end if;

  v_room := public.create_room(
    p_mode,
    p_player_limit,
    p_host_player_name,
    p_grid_size,
    p_timer_seconds
  );
  v_session_id := (v_room->>'sessionId')::uuid;

  update public.game_sessions
  set board_source = p_board_source, schema_version = 3, updated_at = now()
  where id = v_session_id;

  return v_room;
end;
$$;

create or replace function public.start_generated_round(
  p_round_id uuid,
  p_grid jsonb
)
returns public.game_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.game_rounds%rowtype;
  v_session public.game_sessions%rowtype;
  v_player_count integer;
  v_starts_at timestamptz := now() + interval '3 seconds';
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found then raise exception 'Round not found'; end if;
  select * into v_session from public.game_sessions where id = v_round.session_id for update;

  if not public.is_room_host(v_round.session_id) then
    raise exception 'Host access required' using errcode = '42501';
  end if;
  if v_session.status <> 'active' or v_session.mode <> 'scribbage' or v_session.board_source <> 'generated' then
    raise exception 'A generated Word Factory room is required';
  end if;
  if v_round.phase <> 'board_setup' then raise exception 'The round has already started'; end if;
  if v_round.timer_duration_seconds not in (120, 180, 300) then
    raise exception 'Generated games require a 2, 3, or 5 minute timer';
  end if;
  if jsonb_typeof(p_grid) <> 'array' or jsonb_array_length(p_grid) <> v_round.grid_size then
    raise exception 'Grid dimensions are invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_grid) row_value
    where jsonb_typeof(row_value) <> 'array'
      or jsonb_array_length(row_value) <> v_round.grid_size
      or exists (
        select 1 from jsonb_array_elements_text(row_value) cell
        where cell !~ '^(?:[A-Z]|QU)$'
      )
  ) then raise exception 'Each grid cell must be A-Z or QU'; end if;

  select count(*) into v_player_count
  from public.game_members
  where session_id = v_round.session_id and is_player and removed_at is null;
  if v_player_count < 2 then raise exception 'At least two players must join first'; end if;

  update public.game_sessions
  set lobby_locked = true, updated_at = now()
  where id = v_round.session_id;

  update public.game_rounds
  set grid = p_grid,
      phase = 'playing',
      started_at = v_starts_at,
      timer_started_at = v_starts_at,
      timer_paused_at = null,
      timer_remaining_seconds = timer_duration_seconds
  where id = p_round_id
  returning * into v_round;
  return v_round;
end;
$$;

-- Replaces the original function without changing its signature. Physical
-- games keep their existing submit-after-play behavior; generated games are
-- additionally bounded by the server clock and pause state.
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
  v_board_source text;
  v_member_id uuid;
  v_submission public.round_submissions%rowtype;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or v_round.phase not in ('playing', 'collecting') then
    raise exception 'This round is closed';
  end if;
  select board_source into v_board_source from public.game_sessions where id = v_round.session_id;
  if v_board_source = 'generated' then
    if v_round.phase <> 'playing' then raise exception 'This generated round is closed'; end if;
    if v_round.timer_started_at is null or now() < v_round.timer_started_at then
      raise exception 'The countdown is still running';
    end if;
    if v_round.timer_paused_at is not null then raise exception 'The round is paused'; end if;
    if now() >= v_round.timer_started_at + make_interval(secs => v_round.timer_remaining_seconds) then
      raise exception 'The timer has ended';
    end if;
  end if;

  v_member_id := public.current_room_member_id(v_round.session_id);
  if v_member_id is null or not exists (
    select 1 from public.game_members where id = v_member_id and is_player and removed_at is null
  ) then raise exception 'Player access required' using errcode = '42501'; end if;
  if p_revision < 1 or jsonb_typeof(p_words) <> 'array' or jsonb_array_length(p_words) > 250 then
    raise exception 'Invalid submission';
  end if;

  select * into v_submission from public.round_submissions
  where round_id = p_round_id and member_id = v_member_id for update;
  if found and v_submission.revision > p_revision then raise exception 'A newer submission is already saved'; end if;
  if found and v_submission.revision = p_revision and v_submission.client_token = p_client_token then
    return v_submission;
  end if;

  insert into public.round_submissions (
    round_id, member_id, client_token, revision, status, confirmed_at, updated_at
  ) values (
    p_round_id, v_member_id, p_client_token, p_revision, 'confirmed', now(), now()
  )
  on conflict (round_id, member_id) do update set
    client_token = excluded.client_token,
    revision = excluded.revision,
    status = 'confirmed',
    confirmed_at = now(),
    updated_at = now()
  returning * into v_submission;

  delete from public.submitted_words where submission_id = v_submission.id;
  insert into public.submitted_words (
    id, submission_id, position, raw_text, normalized, ocr_confidence
  )
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

create or replace function public.expire_generated_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.game_rounds%rowtype;
  v_board_source text;
begin
  select * into v_round from public.game_rounds where id = p_round_id for update;
  if not found or not public.is_room_host(v_round.session_id) then
    raise exception 'Host access required' using errcode = '42501';
  end if;
  select board_source into v_board_source from public.game_sessions where id = v_round.session_id;
  if v_board_source <> 'generated' or v_round.phase <> 'playing' then
    raise exception 'An active generated round is required';
  end if;
  if v_round.timer_paused_at is not null then raise exception 'The round is paused'; end if;
  if v_round.timer_started_at is null
    or now() < v_round.timer_started_at + make_interval(secs => v_round.timer_remaining_seconds) then
    raise exception 'The timer is still running';
  end if;
  return public.close_round(p_round_id);
end;
$$;

revoke all on function public.create_room_v2(text, integer, text, integer, integer, text),
  public.start_generated_round(uuid, jsonb), public.expire_generated_round(uuid)
from public, anon;

grant execute on function public.create_room_v2(text, integer, text, integer, integer, text),
  public.start_generated_round(uuid, jsonb), public.expire_generated_round(uuid)
to authenticated;
