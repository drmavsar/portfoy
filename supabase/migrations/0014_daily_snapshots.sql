-- =====================================================================
-- Migration 0014: daily_snapshots — günlük servet snapshot'ları
-- =====================================================================
-- Her gün için kullanıcının toplam serveti + varlık sınıfı kırılımı +
-- kişi-bazlı hisse MV. Stacked area ve kişi-bazlı tarihsel grafikler
-- için. Page-load tetikli capture: o gün için satır yoksa eklenir.

create table if not exists public.daily_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  snapshot_date   date not null,
  -- Toplam servet
  total_wealth    numeric(18,2) not null default 0,
  -- Varlık sınıfı bazlı (TRY)
  cash_try        numeric(18,2) not null default 0,
  fx_try          numeric(18,2) not null default 0,
  metal_try       numeric(18,2) not null default 0,
  equity_mv       numeric(18,2) not null default 0,
  crypto_try      numeric(18,2) not null default 0,
  -- Kişi-bazlı hisse MV (beneficiary_id → tutar JSON)
  -- ör. {"<uuid-mehmet>": 2405330, "<uuid-ab>": 294009, ...}
  equity_by_person jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists daily_snapshots_user_date_idx
  on public.daily_snapshots(user_id, snapshot_date desc);

alter table public.daily_snapshots enable row level security;

drop policy if exists ds_own_read on public.daily_snapshots;
create policy ds_own_read on public.daily_snapshots
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists ds_own_write on public.daily_snapshots;
create policy ds_own_write on public.daily_snapshots
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
