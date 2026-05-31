-- =====================================================================
-- Migration 0042: realized_lots extension (Sprint-6 PR-D)
-- =====================================================================
-- Mevcut realized_lots tablosuna FIFO sell processor + stopaj kayıtları
-- için kolonlar ekler. Pure data model değişikliği; trigger eklenmez —
-- processor TS-side'da (testable). Idempotency için (sell_trade_id,
-- buy_trade_id) unique constraint'i opsiyonel olarak buraya konabilirdi
-- ama buy_trade_id geçmişte nullable kaldığı için processor'da
-- EXISTS skip ile sağlanır.
-- =====================================================================

-- 1. Method (FIFO/HIFO) — v1 sadece FIFO yazar; HIFO Sprint-7 UI ile aktif
alter table public.realized_lots
  add column if not exists method text not null default 'FIFO'
    check (method in ('FIFO','HIFO'));

-- 2. Holding period (vergi avantajı / Sprint-7 analiz)
alter table public.realized_lots
  add column if not exists holding_period_days int;

-- 3. Snapshot of tax rule applied at sell time (rule may change later)
alter table public.realized_lots
  add column if not exists applied_tax_rule_id uuid
    references public.fund_tax_rules(id) on delete set null;

alter table public.realized_lots
  add column if not exists applied_tax_kind fund_tax_kind;

alter table public.realized_lots
  add column if not exists applied_tax_rate numeric(6,4);

alter table public.realized_lots
  add column if not exists tax_confidence fund_tax_confidence;

alter table public.realized_lots
  add column if not exists tax_source text
    check (tax_source in ('FUND','CATEGORY','TAX_KIND_DEFAULT','NONE') or tax_source is null);

-- 4. Stopaj hesabı bileşenleri
-- tax_basis: vergiye tabi tutar (zarar varsa 0, kâr varsa realized_pnl_try)
alter table public.realized_lots
  add column if not exists tax_basis_try numeric(18,4) not null default 0;

alter table public.realized_lots
  add column if not exists withholding_try numeric(18,4) not null default 0;

-- 5. Bu lot'a düşen sell fees payı (proceeds zaten net olduğundan audit kolonu)
alter table public.realized_lots
  add column if not exists fees_allocated_try numeric(18,4) not null default 0;

-- 6. Manuel stopaj override flag — kullanıcı trade.taxes > 0 girdiyse
-- sistem hesaplaması bypass edilir, audit için flag tutulur
alter table public.realized_lots
  add column if not exists manual_tax_override boolean not null default false;

-- 7. Net realized P/L: proceeds - cost_basis - withholding
-- (realized_pnl_try generated kolonu zaten var; net ek bilgi)
alter table public.realized_lots
  add column if not exists net_realized_pnl_try numeric(18,4)
    generated always as (proceeds_try - cost_basis_try - withholding_try) stored;

-- 8. Idempotency helper index: sell trade için lot lookup
create index if not exists realized_lots_sell_trade_idx
  on public.realized_lots(sell_trade_id);

-- 9. Audit / debugging için processor versiyonu
alter table public.realized_lots
  add column if not exists processor_version text;

comment on column public.realized_lots.method is
  'Lot eşleştirme yöntemi. v1 sadece FIFO; HIFO Sprint-7''de UI ile aktif olur.';
comment on column public.realized_lots.holding_period_days is
  'Buy.executed_at ile sell.executed_at arasındaki gün sayısı (tam gün).';
comment on column public.realized_lots.applied_tax_rule_id is
  'Sell anında resolveTaxRule sonucu eşleşen fund_tax_rules.id snapshot''ı. Sonradan kural değişirse bu kayıt değişmez.';
comment on column public.realized_lots.applied_tax_kind is
  'Resolved tax kind snapshot (HSYF_0_STOPAJ / GENEL_17_5 / DOVIZ_BAZLI / SERBEST_FON / BELIRSIZ).';
comment on column public.realized_lots.applied_tax_rate is
  'Resolved withholding rate snapshot (0.0000–1.0000); null = BELIRSIZ/DOVIZ_BAZLI/SERBEST_FON.';
comment on column public.realized_lots.tax_basis_try is
  'Vergiye tabi tutar. Zarar lot''larda 0, kâr lot''larda realized_pnl_try.';
comment on column public.realized_lots.withholding_try is
  'Hesaplanan stopaj (TRY). manual_tax_override=true ise kullanıcı override değeri (sell.taxes pro-rata).';
comment on column public.realized_lots.fees_allocated_try is
  'Bu lot''a düşen sell fees payı (consumed_qty / sell.quantity oranlı).';
comment on column public.realized_lots.manual_tax_override is
  'true ise trade.taxes > 0 kullanılmış; tax_rule hesaplaması bypass.';
comment on column public.realized_lots.net_realized_pnl_try is
  'Net realized P/L = proceeds - cost_basis - withholding. Generated column.';
