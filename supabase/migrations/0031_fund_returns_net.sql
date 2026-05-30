-- =====================================================================
-- Migration 0031: fund_returns_cache — net getiri kolonları
-- =====================================================================
-- Sprint-3 PR-3: brüt motorunun üzerine stopaj sonrası net getiri.
--
-- net = gross >= 0 ? gross * (1 - rate) : gross
--   - Pozitif kar üzerinde stopaj kesilir
--   - Zararda stopaj kesilmez (net = gross)
--   - rate null ise (BELIRSIZ/DOVIZ_BAZLI/SERBEST_FON) net null kalır;
--     UI'da "stopaj belirsiz" rozetiyle brüt değer gösterilir
--
-- applied_tax_kind / applied_tax_rate / tax_confidence / tax_source:
--   resolveTaxRulePure çıktısının dondurulmuş kopyası (audit + UI rozet).
-- =====================================================================

alter table public.fund_returns_cache
  add column if not exists net_1y              numeric(10,6),
  add column if not exists net_3y_cagr         numeric(10,6),
  add column if not exists net_5y_cagr         numeric(10,6),
  add column if not exists applied_tax_kind    text,
  add column if not exists applied_tax_rate    numeric(6,4),
  add column if not exists tax_confidence      text,
  add column if not exists tax_source          text;

-- view yeniden tanımla — yeni kolonları içersin
create or replace view public.v_fund_returns_latest as
select distinct on (fund_code) *
from public.fund_returns_cache
order by fund_code, as_of desc;
