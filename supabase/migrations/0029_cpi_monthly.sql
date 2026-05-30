-- =====================================================================
-- Migration 0029: CPI Monthly (TÜFE / EVDS)
-- =====================================================================
-- Aylık enflasyon endeksi — TCMB EVDS API'sinden çekilir.
-- Reel getiri hesabı (Fisher denklemi) bu tablo üzerinden yapılır.
--
-- series_code: ileride alt sepetler eklenebilsin diye PK'nın parçası.
--   İlk değer: 'CPI_TR_GENERAL' (TÜFE Genel, TP.FG.J0)
-- monthly_change_pct: redundant ama hızlı sorgu için saklanır
--   (ETL adımında tek seferlik hesaplanır; her okumada türetme gerekmez).
-- is_final: TÜİK ilk yayında 'final' (true). Revize ederse false → true
--   bu kolon üzerinden takip edilebilir, audit revizyon takibi için.
-- =====================================================================

create table if not exists public.cpi_monthly (
  series_code           text        not null,
  period_month          char(7)     not null,                 -- "YYYY-MM"
  index_value           numeric(14,4) not null check (index_value > 0),
  monthly_change_pct    numeric(8,4),                         -- m/m değişim; ilk periyot için NULL
  source                text        not null default 'TCMB_EVDS',
  fetched_at            timestamptz not null default now(),
  is_final              boolean     not null default true,
  notes                 text,
  primary key (series_code, period_month),
  constraint cpi_monthly_period_format check (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

create index if not exists cpi_monthly_period_idx
  on public.cpi_monthly(period_month desc);
create index if not exists cpi_monthly_series_idx
  on public.cpi_monthly(series_code, period_month desc);

-- Reference data: herkes okur, sadece service_role yazar
alter table public.cpi_monthly enable row level security;
drop policy if exists cpi_monthly_read on public.cpi_monthly;
create policy cpi_monthly_read on public.cpi_monthly
  for select to authenticated using (true);

-- ---------- v_cpi_monthly_yoy: y/y değişim ---------------------------
-- 12 ay önceki endeksle karşılaştırma — Sprint-3 PR-2'de fund returns
-- 1Y reel getirisi için kullanılır.
-- =====================================================================

create or replace view public.v_cpi_monthly_yoy as
select
  c.series_code,
  c.period_month,
  c.index_value,
  c.monthly_change_pct,
  prev.index_value as index_12mo_ago,
  case
    when prev.index_value > 0
    then ((c.index_value / prev.index_value) - 1)
    else null
  end as yoy_change,
  c.is_final,
  c.source,
  c.fetched_at
from public.cpi_monthly c
left join public.cpi_monthly prev
  on prev.series_code = c.series_code
 and prev.period_month = to_char(
       to_date(c.period_month || '-01', 'YYYY-MM-DD') - interval '12 months',
       'YYYY-MM');
