-- =====================================================================
-- Migration 0050: veri düzeltmeleri (yıl geçişi hazırlığı)
-- Yalnız veri (DDL yok); production'a 2026-10-04'te uygulandı.
-- =====================================================================
-- 1) fund_tax_rules: test sırasında eklenip etkin kalmış "AUDIT_PROBE_DELETE"
--    kuralı pasifleştirilir (BELIRSIZ türüne bağlı, oranı yok; hiçbir
--    gerçekleşen lot ona bağlı değil — doğrulandı). Silmek yerine is_active =
--    false: kural yönetiminin kendi deseni, denetim kaydına DEACTIVATE düşer.
-- 2) benchmark_points XU100: 20 Tem–3 Ağu 2026 arası 11 iş günü eksikti
--    (günlük cron yalnız "bugünün" TradingView kapanışını yazıyor; kaçan gün
--    kalıcı boşluk). Ayrıca Ağustos'tan beri 12 günde TradingView değeri kapanış
--    seansı tamamlanmadan alınmış (resmi kapanıştan %0,1–0,9 sapma; ertesi
--    hafta sonu kaydı doğru değeri gösteriyor). Değerler borsapy (İş Yatırım)
--    resmi günlük kapanışlarıdır. İdempotent (UPSERT).
-- =====================================================================

UPDATE public.fund_tax_rules SET is_active = false
WHERE description = 'AUDIT_PROBE_DELETE' AND is_active;

INSERT INTO public.benchmark_points (series_id, as_of, value)
SELECT s.id, v.as_of, v.value
FROM public.benchmark_series s
CROSS JOIN (VALUES
  ('2026-07-20'::date, 14070.98),
  ('2026-07-21'::date, 13974.14),
  ('2026-07-22'::date, 14138.85),
  ('2026-07-23'::date, 14077.67),
  ('2026-07-24'::date, 13943.87),
  ('2026-07-27'::date, 13774.77),
  ('2026-07-28'::date, 13687.86),
  ('2026-07-29'::date, 13501.55),
  ('2026-07-30'::date, 13292.93),
  ('2026-07-31'::date, 13458.1),
  ('2026-08-03'::date, 13410.54),
  ('2026-08-05'::date, 13703.13),
  ('2026-08-11'::date, 13704.52),
  ('2026-09-01'::date, 14229.01),
  ('2026-09-02'::date, 14050.56),
  ('2026-09-14'::date, 14235.83),
  ('2026-09-15'::date, 13892.3),
  ('2026-09-16'::date, 13122.58),
  ('2026-09-18'::date, 13284.42),
  ('2026-09-23'::date, 13251.85),
  ('2026-09-25'::date, 12899.35),
  ('2026-09-29'::date, 12290.58),
  ('2026-09-30'::date, 11947.18)
) AS v(as_of, value)
WHERE s.code = 'XU100'
ON CONFLICT (series_id, as_of) DO UPDATE SET value = EXCLUDED.value;
