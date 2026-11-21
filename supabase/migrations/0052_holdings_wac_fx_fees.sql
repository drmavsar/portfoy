-- =====================================================================
-- Migration 0052: v_holdings_wac — döviz işlemlerde masraf da kurla TL
-- =====================================================================
-- Sorun: ABD hisselerinde (currency = 'USD') komisyon işlemin para
-- biriminde girilir ($1,50). Görünüm fiyatı fx_rate_to_try ile TL'ye
-- çeviriyor ama masrafı çevirmiyordu → $1,50 maliyete 1,50 TL olarak
-- ekleniyordu (NVDA/HOOD'da lot başına ~74 TL eksik maliyet).
-- fifo-processor.ts aynı düzeltmeyi alır; XIRR/benchmark/özet akışları
-- masrafı zaten kurla çeviriyordu.
--
-- Çözüm: lots CTE'sinde tek bir fx çarpanı (TRY → 1, diğerleri işlem anı
-- kuru, yoksa 1) hem fiyata hem masrafa uygulanır. TL işlemlerde sonuç
-- birebir aynı. Sütun adları/tipleri/sırası aynı → CREATE OR REPLACE;
-- bağımlı v_portfolio_marked_to_market etkilenmez. total_buy_fees_try
-- artık adıyla uyumlu olarak TL.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_holdings_wac AS
WITH lots AS (
  SELECT
    tr.id,
    tr.user_id,
    tr.portfolio_id,
    tr.asset_id,
    tr.side,
    tr.executed_at,
    tr.quantity,
    COALESCE(tr.fees, 0::numeric) * COALESCE(
      CASE
        WHEN tr.currency = 'TRY'::text THEN 1::numeric
        ELSE tr.fx_rate_to_try
      END, 1::numeric) AS fees,
    tr.price * COALESCE(
      CASE
        WHEN tr.currency = 'TRY'::text THEN 1::numeric
        ELSE tr.fx_rate_to_try
      END, 1::numeric) AS unit_try
  FROM public.trades tr
),
sold AS (
  SELECT user_id, portfolio_id, asset_id, SUM(quantity) AS sold_qty
  FROM lots
  WHERE side = 'sell'::trade_side
  GROUP BY user_id, portfolio_id, asset_id
),
buys AS (
  SELECT
    l.*,
    COALESCE(s.sold_qty, 0::numeric) AS sold_qty,
    SUM(l.quantity) OVER (
      PARTITION BY l.user_id, l.portfolio_id, l.asset_id
      ORDER BY l.executed_at, l.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cum_qty
  FROM lots l
  LEFT JOIN sold s
    ON s.user_id = l.user_id
   AND s.portfolio_id = l.portfolio_id
   AND s.asset_id = l.asset_id
  WHERE l.side = 'buy'::trade_side
),
open_lots AS (
  -- Lotun satışlarca tüketilmeyen kısmı: kümülatif alım − toplam satış,
  -- 0 ile lot adedi arasında sınırlı.
  SELECT
    b.*,
    GREATEST(0::numeric, LEAST(b.quantity, b.cum_qty - b.sold_qty)) AS open_qty
  FROM buys b
),
agg AS (
  SELECT
    user_id,
    portfolio_id,
    asset_id,
    SUM(quantity) AS bought_qty,
    MAX(sold_qty) AS sold_qty,
    SUM(open_qty) AS open_qty,
    SUM(
      CASE WHEN quantity > 0::numeric
           THEN open_qty * unit_try + fees * (open_qty / quantity)
           ELSE 0::numeric END
    ) AS open_cost_try,
    SUM(fees) AS total_buy_fees_try
  FROM open_lots
  GROUP BY user_id, portfolio_id, asset_id
)
SELECT
  user_id,
  portfolio_id,
  asset_id,
  bought_qty - sold_qty AS quantity,
  CASE WHEN open_qty > 0::numeric
       THEN open_cost_try / open_qty
       ELSE 0::numeric
  END AS wac_try,
  open_cost_try AS cost_basis_try,
  total_buy_fees_try
FROM agg
WHERE bought_qty - sold_qty > 0::numeric;
