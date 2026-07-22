-- JavaScript serializes a missing path as JSON null. Store that value as SQL
-- NULL so it satisfies the round_word_results grid_path constraint.
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
declare
  v_round public.game_rounds%rowtype;
  v_results_revision uuid := extensions.gen_random_uuid();
begin
  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found or not public.is_room_host(v_round.session_id) then
    raise exception 'Host access required' using errcode = '42501';
  end if;
  if v_round.phase <> 'processing' or v_round.frozen_revision is distinct from p_frozen_revision then
    raise exception 'Frozen round revision does not match';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'Results must be an array';
  end if;
  if jsonb_array_length(p_results) <> (
    select count(*)
    from public.submitted_words sw
    join public.round_submissions rs on rs.id = sw.submission_id
    where rs.round_id = p_round_id
  ) then
    raise exception 'Every submitted word must have one result';
  end if;

  delete from public.round_word_results where round_id = p_round_id;
  insert into public.round_word_results (
    round_id, submitted_word_id, results_revision, format_valid, minimum_length_valid,
    dictionary_valid, grid_valid, self_duplicate, cross_player_duplicate, grid_path,
    base_score, score, is_eligible
  )
  select
    p_round_id,
    (result->>'wordId')::uuid,
    v_results_revision,
    coalesce((result->>'formatValid')::boolean, false),
    coalesce((result->>'minimumLengthValid')::boolean, false),
    coalesce((result->>'dictionaryValid')::boolean, false),
    coalesce((result->>'gridValid')::boolean, false),
    coalesce((result->>'selfDuplicate')::boolean, false),
    coalesce((result->>'crossPlayerDuplicate')::boolean, false),
    nullif(result->'gridPath', 'null'::jsonb),
    greatest(0, coalesce((result->>'baseScore')::integer, 0)),
    greatest(0, coalesce((result->>'score')::integer, 0)),
    coalesce((result->>'eligible')::boolean, false)
  from jsonb_array_elements(p_results) result
  where exists (
    select 1
    from public.submitted_words sw
    join public.round_submissions rs on rs.id = sw.submission_id
    where sw.id = (result->>'wordId')::uuid
      and rs.round_id = p_round_id
  );

  if (select count(*) from public.round_word_results where round_id = p_round_id) <> jsonb_array_length(p_results) then
    raise exception 'Results contain unknown or duplicate words';
  end if;

  update public.game_rounds
  set phase = 'review', results_revision = v_results_revision
  where id = p_round_id;

  return v_results_revision;
end;
$$;
