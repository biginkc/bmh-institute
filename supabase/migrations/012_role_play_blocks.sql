-- Role-play lesson blocks embed Closer Lab and cache completion results for reports.

alter table public.content_blocks
  drop constraint if exists content_blocks_block_type_check;

alter table public.content_blocks
  add constraint content_blocks_block_type_check check (block_type in (
    'video','text','pdf','image','audio','download','external_link','embed','role_play','divider','callout'
  ));

create table if not exists public.role_play_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  block_id uuid not null references public.content_blocks(id) on delete cascade,
  scenario_id text not null,
  attempt_id text not null,
  score numeric,
  goals_met jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  unique (user_id, attempt_id)
);

alter table public.role_play_results enable row level security;

drop policy if exists role_play_results_self_insert on public.role_play_results;
create policy role_play_results_self_insert on public.role_play_results
  for insert with check (user_id = auth.uid());

drop policy if exists role_play_results_self_update on public.role_play_results;
create policy role_play_results_self_update on public.role_play_results
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists role_play_results_self_read on public.role_play_results;
create policy role_play_results_self_read on public.role_play_results
  for select using (user_id = auth.uid());

drop policy if exists role_play_results_admin_read on public.role_play_results;
create policy role_play_results_admin_read on public.role_play_results
  for select using (public.is_admin(auth.uid()));

create index if not exists idx_role_play_results_user on public.role_play_results (user_id);
create index if not exists idx_role_play_results_block on public.role_play_results (block_id);
