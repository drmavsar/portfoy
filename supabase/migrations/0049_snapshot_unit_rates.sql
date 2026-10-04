-- =====================================================================
-- Migration 0049: günlük snapshot'a birim kurları + hesap son hareket görünümü
-- =====================================================================
-- 1) daily_snapshots'a o günün USD/TRY, EUR/TRY ve gram altın (TRY) kuru.
--    Servetin dolar/euro/altın cinsinden değişimi (dün, 30 gün, yıl başı)
--    ancak her günün KENDİ kuruyla doğru hesaplanır; bugünkü kurla bölmek
--    kur hareketini yok sayar. Geçmiş satırlar benchmark_points'ten (aynı
--    kaynak: canlidoviz) o güne ≤ en yakın değerle doldurulur.
-- 2) v_account_last_activity: hesap başına son işlem tarihi — "bayat bakiye"
--    uyarısı (bakiye güncellendikten sonra hareket girilmiş mi?).
--    Kullanıcı verisi → security_invoker: transactions RLS'i uygulanır.
-- =====================================================================

ALTER TABLE public.daily_snapshots
  ADD COLUMN IF NOT EXISTS usdtry numeric(18,6),
  ADD COLUMN IF NOT EXISTS eurtry numeric(18,6),
  ADD COLUMN IF NOT EXISTS xau_gram_try numeric(18,6);

COMMENT ON COLUMN public.daily_snapshots.usdtry IS 'Snapshot anındaki USD/TRY';
COMMENT ON COLUMN public.daily_snapshots.eurtry IS 'Snapshot anındaki EUR/TRY';
COMMENT ON COLUMN public.daily_snapshots.xau_gram_try IS 'Snapshot anındaki gram altın (TRY)';

WITH s AS (
  SELECT bs.id, bs.code FROM public.benchmark_series bs
  WHERE bs.code IN ('USDTRY', 'EURTRY', 'XAUTRY')
)
UPDATE public.daily_snapshots ds SET
  usdtry = COALESCE(ds.usdtry, (
    SELECT bp.value FROM public.benchmark_points bp JOIN s ON s.id = bp.series_id
    WHERE s.code = 'USDTRY' AND bp.as_of <= ds.snapshot_date
    ORDER BY bp.as_of DESC LIMIT 1)),
  eurtry = COALESCE(ds.eurtry, (
    SELECT bp.value FROM public.benchmark_points bp JOIN s ON s.id = bp.series_id
    WHERE s.code = 'EURTRY' AND bp.as_of <= ds.snapshot_date
    ORDER BY bp.as_of DESC LIMIT 1)),
  xau_gram_try = COALESCE(ds.xau_gram_try, (
    SELECT bp.value FROM public.benchmark_points bp JOIN s ON s.id = bp.series_id
    WHERE s.code = 'XAUTRY' AND bp.as_of <= ds.snapshot_date
    ORDER BY bp.as_of DESC LIMIT 1))
WHERE ds.usdtry IS NULL OR ds.eurtry IS NULL OR ds.xau_gram_try IS NULL;

CREATE OR REPLACE VIEW public.v_account_last_activity
WITH (security_invoker = true) AS
SELECT
  t.account_id,
  max(t.occurred_on) AS last_txn_on,
  count(*)::int AS txn_count
FROM public.transactions t
WHERE t.deleted_at IS NULL
  AND t.status = 'committed'
  AND t.account_id IS NOT NULL
GROUP BY t.account_id;

GRANT SELECT ON public.v_account_last_activity TO authenticated, service_role;
