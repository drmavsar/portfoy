-- =====================================================================
-- Migration 0046: v_holdings_wac — açık pozisyon maliyeti FIFO ile
-- =====================================================================
-- Sorun: 0040'taki görünüm maliyeti "tüm zamanların alımları / tüm alınan
-- adet" (ömür boyu ortalama) ile hesaplıyordu; satıştan sonra sıfırlanmıyordu.
-- Gerçekleşen K/Z ise realized_lots'ta FIFO ile hesaplanıyor. İki yöntem
-- karışınca aynı kâr iki kez sayılıyordu (gerçekleşen + gerçekleşmemiş).
--   Örnek: 100 @10 al, 100 @20 al, 100 @25 sat → FIFO gerçekleşen 1.500;
--   eski görünüm kalan 100 adedi 15'ten değerliyor → gerçekleşmemiş 1.000;
--   toplam 2.500 (doğrusu 2.000).
-- Canlı veride 8 pozisyonda maliyet toplam ~60.600 TL düşük çıkıyordu.
--
-- Çözüm: açık lotlar FIFO ile türetilir — fifo-processor.ts ile aynı kural:
--   * lot sırası (executed_at, id)
--   * satışlar en eski lotu tüketir → toplamda tüketilen = sıradaki ilk
--     SUM(satış adedi) adet
--   * alım masrafı lota tüketilmeyen adet oranında kalır
-- Yayına almadan önce doğrulandı: 19/19 açık pozisyonda
--   cost_basis = alım maliyeti − realized_lots tüketilen maliyet (sapma 0,00).
--
-- Sütun adları/tipleri/sırası aynı → CREATE OR REPLACE; bağımlı
-- v_portfolio_marked_to_market etkilenmez. total_buy_fees_try anlamı
-- korunur (tüm alım masrafları, denetim alanı).
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
    COALESCE(tr.fees, 0::numeric) AS fees,
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
