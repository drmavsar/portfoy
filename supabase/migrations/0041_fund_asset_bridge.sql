-- =====================================================================
-- Migration 0041: funds ↔ assets bridge
-- =====================================================================
-- Sprint-6 PR-B: Trade akışı için funds (155 satır) ↔ assets köprüsü.
--
-- assets.asset_class enum'da 'fund' var ama hiç fon kayıtlı değil.
-- Trade form fund_code'dan asset_id'ye resolve eder; bu mapping olmadan
-- trade INSERT FK violation verir.
--
-- Strategy: retro INSERT (155 fund) + trigger (yeni fonlar otomatik).
-- =====================================================================

-- 1. Mevcut tüm aktif fonlar için assets satırı (idempotent)
INSERT INTO public.assets (symbol, name, asset_class, currency, exchange, is_active)
SELECT
  f.code AS symbol,
  f.name,
  'fund'::asset_class AS asset_class,
  COALESCE(f.currency, 'TRY') AS currency,
  'TEFAS' AS exchange,
  f.is_active
FROM public.funds f
WHERE NOT EXISTS (
  SELECT 1 FROM public.assets a
  WHERE a.symbol = f.code AND a.asset_class = 'fund'::asset_class
);

-- 2. Trigger: yeni fund INSERT olunca assets'a otomatik düşsün
CREATE OR REPLACE FUNCTION public.sync_fund_to_asset() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.assets (symbol, name, asset_class, currency, exchange, is_active)
  VALUES (
    NEW.code,
    NEW.name,
    'fund'::asset_class,
    COALESCE(NEW.currency, 'TRY'),
    'TEFAS',
    NEW.is_active
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funds_after_insert_sync_asset ON public.funds;
CREATE TRIGGER funds_after_insert_sync_asset
  AFTER INSERT ON public.funds
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_fund_to_asset();

-- 3. Trigger: fund UPDATE (name değişikliği) → asset name de güncellensin
CREATE OR REPLACE FUNCTION public.sync_fund_update_to_asset() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE public.assets
    SET name = NEW.name,
        is_active = NEW.is_active,
        updated_at = now()
    WHERE symbol = NEW.code AND asset_class = 'fund'::asset_class;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funds_after_update_sync_asset ON public.funds;
CREATE TRIGGER funds_after_update_sync_asset
  AFTER UPDATE ON public.funds
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_fund_update_to_asset();
