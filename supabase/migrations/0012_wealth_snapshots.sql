-- =====================================================================
-- Migration 0012: wealth_snapshots — yıl/dönem sonu toplam servet kayıtları
-- =====================================================================

create table if not exists public.wealth_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  period      text not null,   -- '2022', '2023-12', '2026-05-17' gibi
  total_try   numeric(18,2) not null,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, period)
);

create index if not exists wealth_snapshots_user_period_idx
  on public.wealth_snapshots(user_id, period);

alter table public.wealth_snapshots enable row level security;
drop policy if exists ws_own_read on public.wealth_snapshots;
create policy ws_own_read on public.wealth_snapshots
  for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ws_own_write on public.wealth_snapshots;
create policy ws_own_write on public.wealth_snapshots
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
