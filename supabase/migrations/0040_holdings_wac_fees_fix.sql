-- =====================================================================
-- Migration 0040: v_holdings_wac fees-dahil cost basis fix
-- =====================================================================
-- Sprint-6 PR-B: WAC fees fix.
--
-- Sorun (Sprint-0.5 audit'ten): v_holdings_wac mevcut formülü trades.fees'i
-- ignore eder. 635 TL komisyon ödenmiş alımda bile cost basis komisyonsuz
-- görünür. Sonuç: unrealized P/L abartılmış (gerçek nakit çıkışından eksik).
--
-- Çözüm: gross_cost_try = SUM(qty × price × fx + fees) WHERE side='buy'
--
-- Bağımlı view: v_portfolio_marked_to_market — birlikte yeniden create.
-- =====================================================================

-- 1. v_holdings_wac yeniden tanımla (fees dahil)
DROP VIEW IF EXISTS public.v_portfolio_marked_to_market CASCADE;
DROP VIEW IF EXISTS public.v_holdings_wac CASCADE;

CREATE VIEW public.v_holdings_wac AS
WITH lots AS (
  SELECT
    tr.user_id,
    tr.portfolio_id,
    tr.asset_id,
    tr.side,
    tr.quantity,
    tr.price,
    tr.currency,
    COALESCE(tr.fx_rate_to_try, 1::numeric) AS fx,
    COALESCE(tr.fees, 0::numeric) AS fees,
    tr.price * COALESCE(
      CASE
        WHEN tr.currency = 'TRY'::text THEN 1::numeric
        ELSE tr.fx_rate_to_try
      END, 1::numeric) AS unit_try
  FROM public.trades tr
),
agg AS (
  SELECT
    lots.user_id,
    lots.portfolio_id,
    lots.asset_id,
    SUM(
      CASE WHEN lots.side = 'buy'::trade_side THEN lots.quantity
           ELSE -lots.quantity END
    ) AS quantity,
    -- KRİTİK FIX: buy trade'lerinin fees'i gross_cost_try'a eklenir
    SUM(
      CASE WHEN lots.side = 'buy'::trade_side
           THEN lots.quantity * lots.unit_try + lots.fees
           ELSE 0::numeric END
    ) AS gross_cost_try,
    SUM(
      CASE WHEN lots.side = 'buy'::trade_side THEN lots.quantity
           ELSE 0::numeric END
    ) AS bought_qty,
    SUM(
      CASE WHEN lots.side = 'sell'::trade_side THEN lots.quantity
           ELSE 0::numeric END
    ) AS sold_qty,
    -- Audit field: fees toplamını ayrıca tutuyoruz
    SUM(
      CASE WHEN lots.side = 'buy'::trade_side THEN lots.fees
           ELSE 0::numeric END
    ) AS total_buy_fees_try
  FROM lots
  GROUP BY lots.user_id, lots.portfolio_id, lots.asset_id
)
SELECT
  user_id,
  portfolio_id,
  asset_id,
  quantity,
  CASE WHEN bought_qty > 0::numeric
       THEN gross_cost_try / bought_qty
       ELSE 0::numeric
  END AS wac_try,
  CASE WHEN bought_qty > 0::numeric
       THEN (gross_cost_try / bought_qty) * quantity
       ELSE 0::numeric
  END AS cost_basis_try,
  total_buy_fees_try
FROM agg
WHERE quantity > 0::numeric;

-- RLS via parent permissions (view permissions inherit)
ALTER VIEW public.v_holdings_wac OWNER TO postgres;

-- 2. v_portfolio_marked_to_market — bağımlıydı, yeniden create
CREATE VIEW public.v_portfolio_marked_to_market AS
SELECT
  h.user_id,
  h.portfolio_id,
  h.asset_id,
  ast.symbol,
  ast.name,
  ast.asset_class,
  h.quantity,
  h.wac_try,
  h.cost_basis_try,
  ps.close AS last_price,
  ps.as_of AS priced_at,
  h.quantity * COALESCE(ps.close, h.wac_try) AS market_value_try,
  h.quantity * COALESCE(ps.close, h.wac_try) - h.cost_basis_try AS unrealized_pnl_try,
  CASE
    WHEN h.cost_basis_try > 0::numeric
    THEN (h.quantity * COALESCE(ps.close, h.wac_try) - h.cost_basis_try) / h.cost_basis_try
    ELSE NULL::numeric
  END AS unrealized_pnl_pct
FROM public.v_holdings_wac h
JOIN public.assets ast ON ast.id = h.asset_id
LEFT JOIN LATERAL (
  SELECT price_snapshots.close, price_snapshots.as_of
  FROM public.price_snapshots
  WHERE price_snapshots.asset_id = h.asset_id
  ORDER BY price_snapshots.as_of DESC
  LIMIT 1
) ps ON true;

ALTER VIEW public.v_portfolio_marked_to_market OWNER TO postgres;
