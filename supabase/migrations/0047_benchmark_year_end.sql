-- =====================================================================
-- Migration 0047: v_benchmark_year_end — seri × yıl başına son nokta
-- =====================================================================
-- Özet "Reel Getiri" tablosu her benchmark serisinin yalnız YIL SONU (cari
-- yıl için en güncel) değerine ihtiyaç duyar. Eskiden benchmark_points'in
-- tamamı filtresiz/sayfasız okunuyordu; PostgREST 1000 satır sınırı EN ESKİ
-- 1000 satırı döndürdüğünden (5.665 satır vardı) son yıllar "—" ya da yıl
-- ortası değerle görünüyordu. Bu görünüm seri×yıl başına tek satır (~30)
-- döndürür.
-- Piyasa verisi (kullanıcıya özel değil) → sahibi postgres; RLS gerekmez.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_benchmark_year_end AS
SELECT DISTINCT ON (bp.series_id, date_part('year', bp.as_of))
  bp.series_id,
  bs.code,
  bs.name,
  bp.as_of,
  bp.value
FROM public.benchmark_points bp
JOIN public.benchmark_series bs ON bs.id = bp.series_id
ORDER BY bp.series_id, date_part('year', bp.as_of), bp.as_of DESC;

GRANT SELECT ON public.v_benchmark_year_end TO authenticated, service_role;
