-- =====================================================================
-- Migration 0027: TEFAS — fund_prices
-- =====================================================================
-- Günlük NAV + (mümkünse) büyüklük metrikleri. Birden fazla kaynak
-- desteklenir (source kolonu). (fund_code, as_of) unique — günde tek
-- snapshot (genellikle TEFAS akşam yayını).
--
-- Önemli not (2026 sonrası TEFAS API değişikliği):
-- TEFAS yeni API'si market_cap / number_of_investors / number_of_shares
-- alanlarını tarihsel olarak artık yayınlamıyor. Bu kolonlar null kalabilir;
-- ileride alternatif kaynak (KAP, fund prospectus) bulunduğunda dolacak.
-- Sprint-2'de POC için bu kolonlar nullable bırakıldı.
-- =====================================================================

create table if not exists public.fund_prices (
  fund_code                   text not null references public.funds(code) on delete cascade,
  as_of                       date not null,
  nav                         numeric(20,6) not null check (nav > 0),
  total_value_try             numeric(20,2),       -- Fon toplam büyüklüğü (TEFAS yeni API'sinde yok)
  investor_count              int,                 -- Yatırımcı sayısı (TEFAS yeni API'sinde yok)
  share_count                 numeric(24,6),       -- Dolaşımdaki pay (TEFAS yeni API'sinde yok)
  management_fee_annual_pct   numeric(6,4),        -- Yıllık yönetim ücreti
  expense_ratio_pct           numeric(6,4),        -- Fon işletim gider kesintisi
  source                      text not null default 'tefas',
  fetched_at                  timestamptz not null default now(),
  primary key (fund_code, as_of)
);

create index if not exists fund_prices_asof_idx
  on public.fund_prices(as_of desc);
create index if not exists fund_prices_fund_recent_idx
  on public.fund_prices(fund_code, as_of desc);

-- Reference data: herkes okur, sadece service_role yazar
alter table public.fund_prices enable row level security;
drop policy if exists fund_prices_read on public.fund_prices;
create policy fund_prices_read on public.fund_prices
  for select to authenticated using (true);

-- Latest NAV view — son fiyatı tek sorguda almak için (Sprint-3 reuse)
create or replace view public.v_fund_prices_latest as
select distinct on (fund_code)
  fund_code, as_of, nav,
  total_value_try, investor_count, share_count,
  management_fee_annual_pct, expense_ratio_pct,
  source, fetched_at
from public.fund_prices
order by fund_code, as_of desc;
