-- =====================================================================
-- Migration 0028: TEFAS — ingest log + health view
-- =====================================================================
-- Sprint-2 monitoring altyapısı.
--
-- tefas_ingest_log: her cron çalışmasının özet sonucu burada saklanır.
-- UI'da son N çalıştırma + failed/succeed istatistikleri gösterilebilir.
--
-- v_tefas_fund_prices_health: her aktif fon için en son fiyat tarihi
-- ve kaç gün eski olduğu — stale fonlar tek sorguda görülür.
-- =====================================================================

create table if not exists public.tefas_ingest_log (
  id              uuid primary key default gen_random_uuid(),
  ran_at          timestamptz not null default now(),
  duration_ms     int not null,
  requested       int not null,
  succeeded       int not null,
  upserted        int not null,
  failed_count    int not null,
  failed_codes    text[] not null default '{}'::text[],
  upsert_error    text,
  source          text not null default 'tefas',
  triggered_by    text not null default 'cron'  -- 'cron' / 'manual'
);

create index if not exists tefas_ingest_log_ran_at_idx
  on public.tefas_ingest_log(ran_at desc);

-- Reference data: herkes okur, sadece service_role yazar
alter table public.tefas_ingest_log enable row level security;
drop policy if exists tefas_ingest_log_read on public.tefas_ingest_log;
create policy tefas_ingest_log_read on public.tefas_ingest_log
  for select to authenticated using (true);

-- ---------- v_tefas_fund_prices_health ------------------------------
-- Her aktif fon için son fiyat tarihi + kaç gün stale.
-- Hiç fiyatı olmayan fonlar last_as_of=NULL, days_stale=NULL döner.
-- =====================================================================

create or replace view public.v_tefas_fund_prices_health as
select
  f.code         as fund_code,
  f.is_active,
  f.is_equity_intensive,
  f.is_free_fund,
  f.is_fx_denominated,
  p.as_of        as last_as_of,
  p.nav          as last_nav,
  p.source       as last_source,
  p.fetched_at   as last_fetched_at,
  case
    when p.as_of is null then null
    else (current_date - p.as_of)
  end            as days_stale
from public.funds f
left join lateral (
  select as_of, nav, source, fetched_at
  from public.fund_prices
  where fund_code = f.code
  order by as_of desc
  limit 1
) p on true
where f.is_active = true;
