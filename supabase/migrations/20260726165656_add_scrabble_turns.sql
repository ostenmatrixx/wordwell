-- Synchronized Scrabble turns and score submission.
alter table public.game_sessions
  add column if not exists scrabble_turn_order uuid[] not null default '{}'::uuid[],
  add column if not exists scrabble_turn_index integer not null default 0,
  add column if not exists scrabble_turn_number integer not null default 0,
  add column if not exists scrabble_pending_word text;

alter table public.game_sessions
  drop constraint if exists game_sessions_scrabble_turn_index_check,
  drop constraint if exists game_sessions_scrabble_turn_number_check,
  drop constraint if exists game_sessions_scrabble_pending_word_check;

alter table public.game_sessions
  add constraint game_sessions_scrabble_turn_index_check
    check (scrabble_turn_index >= 0),
  add constraint game_sessions_scrabble_turn_number_check
    check (scrabble_turn_number >= 0),
  add constraint game_sessions_scrabble_pending_word_check
    check (
      scrabble_pending_word is null
      or (scrabble_pending_word ~ '^[A-Z]+$' and char_length(scrabble_pending_word) between 1 and 80)
    );

-- Preserve already-running Scrabble rooms by adopting their existing lobby
-- order. Games started after this migration receive a newly shuffled order.
with active_orders as (
  select
    gs.id,
    array_agg(gm.id order by gm.sort_order, gm.joined_at, gm.id) as player_order
  from public.game_sessions gs
  join public.game_members gm
    on gm.session_id = gs.id
   and gm.is_player
   and gm.removed_at is null
  where gs.mode = 'scrabble'
    and gs.status = 'active'
    and gs.lobby_locked
    and cardinality(gs.scrabble_turn_order) = 0
  group by gs.id
)
update public.game_sessions gs
set
  scrabble_turn_order = active_orders.player_order,
  scrabble_turn_index = 0,
  scrabble_turn_number = 1,
  scrabble_pending_word = null,
  updated_at = now()
from active_orders
where gs.id = active_orders.id;

create or replace function public.advance_scrabble_turn_state(p_session_id uuid)
returns public.game_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
  v_player_count integer;
begin
  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found or v_session.mode <> 'scrabble' or v_session.status <> 'active' or not v_session.lobby_locked then
    raise exception 'Active Scrabble game required';
  end if;

  v_player_count := coalesce(cardinality(v_session.scrabble_turn_order), 0);
  if v_player_count < 2 then
    raise exception 'Scrabble turn order is not ready';
  end if;

  update public.game_sessions
  set
    scrabble_turn_index = mod(scrabble_turn_index + 1, v_player_count),
    scrabble_turn_number = scrabble_turn_number + 1,
    scrabble_pending_word = null,
    updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.start_scrabble_game(p_session_id uuid)
returns public.game_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
  v_turn_order uuid[];
begin
  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found or not public.is_room_host(p_session_id) then
    raise exception 'Host access required' using errcode = '42501';
  end if;
  if v_session.mode <> 'scrabble' or v_session.status <> 'active' then
    raise exception 'Active Scrabble room required';
  end if;

  if v_session.lobby_locked and cardinality(v_session.scrabble_turn_order) >= 2 then
    return v_session;
  end if;

  select array_agg(gm.id order by random())
  into v_turn_order
  from public.game_members gm
  where gm.session_id = p_session_id
    and gm.is_player
    and gm.removed_at is null;

  if coalesce(cardinality(v_turn_order), 0) < 2 then
    raise exception 'At least two players must join first';
  end if;

  update public.game_sessions
  set
    lobby_locked = true,
    scrabble_turn_order = v_turn_order,
    scrabble_turn_index = 0,
    scrabble_turn_number = 1,
    scrabble_pending_word = null,
    updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.check_scrabble_turn(
  p_session_id uuid,
  p_expected_turn_number integer,
  p_word text,
  p_dictionary_valid boolean
)
returns public.game_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
  v_member_id uuid;
  v_word text := upper(btrim(coalesce(p_word, '')));
begin
  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found or v_session.mode <> 'scrabble' or v_session.status <> 'active' or not v_session.lobby_locked then
    raise exception 'Active Scrabble game required';
  end if;
  if p_expected_turn_number is distinct from v_session.scrabble_turn_number then
    raise exception 'This turn has already changed';
  end if;
  if v_word !~ '^[A-Z]+$' or char_length(v_word) > 80 then
    raise exception 'Enter a word using letters only';
  end if;
  if p_dictionary_valid is null then
    raise exception 'Dictionary result is required';
  end if;

  v_member_id := public.current_room_member_id(p_session_id);
  if v_member_id is null
    or v_member_id is distinct from v_session.scrabble_turn_order[v_session.scrabble_turn_index + 1] then
    raise exception 'It is not your turn' using errcode = '42501';
  end if;
  if v_session.scrabble_pending_word is not null then
    if p_dictionary_valid and v_session.scrabble_pending_word = v_word then
      return v_session;
    end if;
    raise exception 'Score the checked word before continuing';
  end if;

  if p_dictionary_valid then
    update public.game_sessions
    set scrabble_pending_word = v_word, updated_at = now()
    where id = p_session_id
    returning * into v_session;
    return v_session;
  end if;

  return public.advance_scrabble_turn_state(p_session_id);
end;
$$;

create or replace function public.pass_scrabble_turn(
  p_session_id uuid,
  p_expected_turn_number integer
)
returns public.game_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
  v_member_id uuid;
begin
  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found or v_session.mode <> 'scrabble' or v_session.status <> 'active' or not v_session.lobby_locked then
    raise exception 'Active Scrabble game required';
  end if;
  if p_expected_turn_number is distinct from v_session.scrabble_turn_number then
    raise exception 'This turn has already changed';
  end if;

  v_member_id := public.current_room_member_id(p_session_id);
  if v_member_id is null
    or v_member_id is distinct from v_session.scrabble_turn_order[v_session.scrabble_turn_index + 1] then
    raise exception 'It is not your turn' using errcode = '42501';
  end if;
  if v_session.scrabble_pending_word is not null then
    raise exception 'The checked word must be scored or skipped by the host';
  end if;

  return public.advance_scrabble_turn_state(p_session_id);
end;
$$;

create or replace function public.skip_scrabble_turn(
  p_session_id uuid,
  p_expected_turn_number integer
)
returns public.game_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
begin
  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found or not public.is_room_host(p_session_id) then
    raise exception 'Host access required' using errcode = '42501';
  end if;
  if v_session.mode <> 'scrabble' or v_session.status <> 'active' or not v_session.lobby_locked then
    raise exception 'Active Scrabble game required';
  end if;
  if p_expected_turn_number is distinct from v_session.scrabble_turn_number then
    raise exception 'This turn has already changed';
  end if;

  return public.advance_scrabble_turn_state(p_session_id);
end;
$$;

drop function if exists public.submit_scrabble_entry(uuid, uuid, text, integer);

create function public.submit_scrabble_entry(
  p_session_id uuid,
  p_client_entry_id uuid,
  p_word text,
  p_points integer,
  p_expected_turn_number integer
)
returns public.score_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
  v_member_id uuid;
  v_entry public.score_entries%rowtype;
  v_word text := upper(btrim(coalesce(p_word, '')));
begin
  v_member_id := public.current_room_member_id(p_session_id);
  if v_member_id is null then
    raise exception 'Active Scrabble player membership required' using errcode = '42501';
  end if;

  select * into v_entry
  from public.score_entries
  where id = p_client_entry_id;
  if found then
    if v_entry.session_id is distinct from p_session_id
      or v_entry.member_id is distinct from v_member_id
      or v_entry.word is distinct from v_word
      or v_entry.points is distinct from p_points then
      raise exception 'Entry id is already in use';
    end if;
    return v_entry;
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found or v_session.mode <> 'scrabble' or v_session.status <> 'active' or not v_session.lobby_locked then
    raise exception 'Active Scrabble game required';
  end if;
  if p_expected_turn_number is distinct from v_session.scrabble_turn_number then
    raise exception 'This turn has already changed';
  end if;
  if v_member_id is distinct from v_session.scrabble_turn_order[v_session.scrabble_turn_index + 1] then
    raise exception 'It is not your turn' using errcode = '42501';
  end if;
  if v_word !~ '^[A-Z]+$' or char_length(v_word) > 80 or p_points <= 0 then
    raise exception 'Word and positive points are required';
  end if;
  if v_session.scrabble_pending_word is null or v_session.scrabble_pending_word <> v_word then
    raise exception 'Score the word that was checked this turn';
  end if;

  insert into public.score_entries (id, session_id, member_id, word, points)
  values (p_client_entry_id, p_session_id, v_member_id, v_word, p_points)
  returning * into v_entry;

  perform public.advance_scrabble_turn_state(p_session_id);
  perform public.refresh_session_snapshot(p_session_id);
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
  if not public.is_room_host(p_session_id) then
    raise exception 'Host access required' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.game_rounds
    where session_id = p_session_id and phase not in ('finalized')
  ) then
    raise exception 'Finalize the current round first';
  end if;

  perform public.refresh_session_snapshot(p_session_id);
  update public.game_sessions
  set
    status = 'complete',
    lobby_locked = true,
    scrabble_pending_word = null,
    finished_at = now(),
    updated_at = now()
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

revoke all on function public.advance_scrabble_turn_state(uuid) from public, anon, authenticated;
revoke all on function public.check_scrabble_turn(uuid, integer, text, boolean),
  public.pass_scrabble_turn(uuid, integer),
  public.skip_scrabble_turn(uuid, integer),
  public.submit_scrabble_entry(uuid, uuid, text, integer, integer)
from public, anon;

grant execute on function public.check_scrabble_turn(uuid, integer, text, boolean),
  public.pass_scrabble_turn(uuid, integer),
  public.skip_scrabble_turn(uuid, integer),
  public.submit_scrabble_entry(uuid, uuid, text, integer, integer)
to authenticated;
