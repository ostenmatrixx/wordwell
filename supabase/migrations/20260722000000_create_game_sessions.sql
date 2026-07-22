create table if not exists public.game_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  mode text not null check (mode in ('scrabble', 'boggle', 'scribbage')),
  players jsonb not null default '[]'::jsonb check (jsonb_typeof(players) = 'array'),
  entries jsonb not null default '[]'::jsonb check (jsonb_typeof(entries) = 'array'),
  status text not null default 'active' check (status in ('active', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_sessions_user_updated_idx
  on public.game_sessions (user_id, updated_at desc);

alter table public.game_sessions enable row level security;

grant select, insert, update on table public.game_sessions to authenticated;
grant all on table public.game_sessions to service_role;

drop policy if exists "Players can read their own sessions" on public.game_sessions;
create policy "Players can read their own sessions"
  on public.game_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Players can insert their own sessions" on public.game_sessions;
create policy "Players can insert their own sessions"
  on public.game_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update their own sessions" on public.game_sessions;
create policy "Players can update their own sessions"
  on public.game_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
