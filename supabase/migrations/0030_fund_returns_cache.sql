-- =====================================================================
-- Migration 0030: fund_returns_cache
-- =====================================================================
-- Hesaplanmış (precomputed) brüt + reel + kategori-relatif getiri cache'i.
--
-- Sprint-3 PR-2 sadece BRÜT + REEL kolonları doldurur.
-- Net getiri ve stopaj uygulaması Sprint-3 PR-3'te ayrı kolonlarla eklenecek.
--
-- as_of kolonu: hesabın yapıldığı referans tarih (genelde en son NAV tarihi).
-- Aynı (fund_code, as_of) için tekrar hesaplama UPSERT olur.
--
-- Tüm kolonlar nullable; pencere için yeterli veri yoksa NULL kalır.
-- =====================================================================

create table if not exists public.fund_returns_cache (
  fund_code            text        not null references public.funds(code) on delete cascade,
  as_of                date        not null,
  -- Brüt getiri pencereleri (ondalık form: 0.15 = %15)
  gross_1d             numeric(10,6),
  gross_1w             numeric(10,6),
  gross_1m             numeric(10,6),
  gross_3m             numeric(10,6),
  gross_6m             numeric(10,6),
  gross_ytd            numeric(10,6),
  gross_1y             numeric(10,6),
  gross_3y_cagr        numeric(10,6),
  gross_5y_cagr        numeric(10,6),
  -- Reel getiri (Fisher, CPI ile düzeltilmiş)
  real_1y              numeric(10,6),
  real_3y_cagr         numeric(10,6),
  real_5y_cagr         numeric(10,6),
  -- Kategori medyanına göre fark (fund_value - category_median)
  vs_category_1y       numeric(10,6),
  vs_category_3y       numeric(10,6),
  -- Hesap metadata'sı
  computed_at          timestamptz not null default now(),
  computed_from_period char(7),                         -- reel hesabında kullanılan endeks dönemi
  warnings             text[]      not null default '{}'::text[],  -- "no_cpi_data", "insufficient_history" vb.
  primary key (fund_code, as_of)
);

create index if not exists fund_returns_cache_asof_idx
  on public.fund_returns_cache(as_of desc);
create index if not exists fund_returns_cache_fund_recent_idx
  on public.fund_returns_cache(fund_code, as_of desc);

-- Reference data: herkes okur, sadece service_role yazar
alter table public.fund_returns_cache enable row level security;
drop policy if exists fund_returns_cache_read on public.fund_returns_cache;
create policy fund_returns_cache_read on public.fund_returns_cache
  for select to authenticated using (true);

-- ---------- v_fund_returns_latest ------------------------------------
-- Her fon için en son as_of'taki cache satırı.
-- =====================================================================

create or replace view public.v_fund_returns_latest as
select distinct on (fund_code) *
from public.fund_returns_cache
order by fund_code, as_of desc;
