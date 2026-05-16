-- =====================================================================
-- Migration 0011: trades tablosuna beneficiary_id (sahiplik)
-- =====================================================================
-- Sample TRADES'te "ben" alanı (Ben / Ahmet Burak / Salih) vardı; DB
-- tarafında trades.beneficiary_id şu ana kadar yoktu. Portföy bazlı
-- ayrım yerine her trade'i bir kişiye atayabilelim.
-- =====================================================================

alter table public.trades
  add column if not exists beneficiary_id uuid references public.beneficiaries(id) on delete set null;

create index if not exists trades_beneficiary_idx on public.trades(beneficiary_id);

-- v_holdings_wac'a beneficiary kırılımı eklemiyoruz şimdilik; sayfa
-- aggregate'i client-side filtreleyecek.
