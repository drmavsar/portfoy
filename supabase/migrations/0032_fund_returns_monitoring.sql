-- =====================================================================
-- Migration 0032: fund_returns ingest log + health view
-- =====================================================================
-- Sprint-3 PR-4: daily refresh cron'unun her çalışmasının özet sonucu.
-- tefas_ingest_log paralelinde — cache refresh sağlığı izlenebilsin.
--
-- v_fund_returns_health: her aktif fon için son returns cache satırı
-- + kaç gün stale + en kritik warning'ler.
-- =====================================================================

create table if not exists public.fund_returns_ingest_log (
  id              uuid primary key default gen_random_uuid(),
  ran_at          timestamptz not null default now(),
  duration_ms     int not null,
  processed       int not null,
  upserted        int not null,
  skipped_count   int not null,
  skipped_codes   text[] not null default '{}'::text[],
  error           text,
  triggered_by    text not null default 'cron'
);

create index if not exists fund_returns_ingest_log_ran_at_idx
  on public.fund_returns_ingest_log(ran_at desc);

alter table public.fund_returns_ingest_log enable row level security;
drop policy if exists fund_returns_ingest_log_read on public.fund_returns_ingest_log;
create policy fund_returns_ingest_log_read on public.fund_returns_ingest_log
  for select to authenticated using (true);

-- ---------- v_fund_returns_health -----------------------------------
-- Her aktif fon için son cache as_of'u, kaç gün stale, kritik warning'ler.
-- =====================================================================

create or replace view public.v_fund_returns_health as
select
  f.code         as fund_code,
  f.is_equity_intensive,
  f.is_free_fund,
  f.is_fx_denominated,
  r.as_of        as last_as_of,
  r.computed_at  as last_computed_at,
  r.tax_confidence,
  r.applied_tax_kind,
  r.applied_tax_rate,
  r.warnings,
  case
    when r.as_of is null then null
    else (current_date - r.as_of)
  end            as days_stale,
  (r.gross_1y is not null)        as has_1y,
  (r.gross_3y_cagr is not null)   as has_3y,
  (r.gross_5y_cagr is not null)   as has_5y,
  (r.real_1y is not null)         as has_real_1y,
  (r.net_1y is not null)          as has_net_1y
from public.funds f
left join lateral (
  select *
  from public.fund_returns_cache
  where fund_code = f.code
  order by as_of desc
  limit 1
) r on true
where f.is_active = true;
