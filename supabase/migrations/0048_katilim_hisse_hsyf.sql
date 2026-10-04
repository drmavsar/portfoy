-- =====================================================================
-- Migration 0048: Katılım hisse fonları → Hisse Senedi Yoğun Fon (stopaj %0)
-- =====================================================================
-- Sorun: 0021 KATILIM_HISSE kategorisini GENEL_17_5 (%17,5 stopaj), 0025 bu
-- kategorideki 26 fonu is_equity_intensive=false olarak tohumlamıştı. Oysa
-- 26 fonun 26'sının TEFAS adında "(Hisse Senedi Yoğun Fon)" geçiyor: portföyün
-- ≥%80'i BIST hissesi → HSYF → stopaj %0. Kardeş kategori
-- KATILIM_HSYF_SERBEST zaten HSYF_0_STOPAJ.
-- Etki: vergi skoru (persona ağırlığı ~0.20) ve net getiri bu fonlarda
-- haksız düşüktü; satışta %17,5 stopaj öngörülüyordu.
-- Denetim (uygulama öncesi): kategori düzeyinde ezici kural yok; tek fon
-- kuralı PUK için zaten HSYF_0 (mevcut 3 gerçekleşen lot %0 ile doğru).
--
-- Geri dönüş: default_tax_kind = 'GENEL_17_5'; ilgili fonlarda
-- is_equity_intensive = false.
-- =====================================================================

UPDATE public.fund_categories
SET default_tax_kind = 'HSYF_0_STOPAJ'
WHERE code = 'KATILIM_HISSE';

UPDATE public.funds f
SET is_equity_intensive = true
FROM public.fund_categories fc
WHERE fc.id = f.category_id
  AND fc.code = 'KATILIM_HISSE'
  AND (upper(f.name) LIKE '%YOĞUN%' OR upper(f.name) LIKE '%YOGUN%');
