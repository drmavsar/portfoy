-- ========================================================================
-- 0017 — Rate snapshots: son başarılı kur/altın/kripto fiyatlarını sakla
--
-- Truncgil/TCMB/Yahoo geçici fail ettiğinde getAssetRates() bu tabloyu
-- fallback olarak okur → Altın 0 ₺ benzeri stale cache regressionlarını
-- önler.
--
-- Tek satırlı tablo (id = 1 zorunlu). Her başarılı fetch'te upsert edilir.
-- ========================================================================

create table if not exists public.rate_snapshots (
  id          smallint primary key check (id = 1) default 1,
  rates       jsonb    not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- başlangıç satırı (idempotent)
insert into public.rate_snapshots (id, rates) values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- RLS: global veri (gold price vs.) — herhangi authenticated kullanıcı okuyup
-- yazabilir. Hassas veri değil.
alter table public.rate_snapshots enable row level security;

drop policy if exists "rate_snapshots_read" on public.rate_snapshots;
create policy "rate_snapshots_read" on public.rate_snapshots
  for select using (true);

drop policy if exists "rate_snapshots_write" on public.rate_snapshots;
create policy "rate_snapshots_write" on public.rate_snapshots
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "rate_snapshots_update" on public.rate_snapshots;
create policy "rate_snapshots_update" on public.rate_snapshots
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
