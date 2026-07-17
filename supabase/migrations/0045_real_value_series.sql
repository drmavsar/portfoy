-- =====================================================================
-- Reel Değer serisi: yıllık net servet snapshot'larını, ilgili yıl-sonu
-- USD/EUR/gram-altın kuru ve TÜFE endeksi ile eşler. Raporlar → Reel Değer
-- sekmesi bu fonksiyonu okur; böylece nominal TL büyümesinin ne kadarının
-- gerçek (enflasyon/altın/döviz karşısında) olduğu görülür.
--
-- SECURITY INVOKER: wealth_snapshots RLS (ws_own_read) çağıran kullanıcıya
-- göre uygulanır — herkes yalnızca kendi servet snapshot'larını görür.
-- benchmark_points / cpi_monthly authenticated'a açık referans verisidir.
-- =====================================================================

create or replace function public.real_value_series()
returns table (
  period    text,
  total_try numeric,
  usd_try   numeric,
  eur_try   numeric,
  gram_gold numeric,
  cpi_index numeric
)
language sql
security invoker
stable
as $$
  select
    ws.period,
    ws.total_try,
    (select bp.value
       from public.benchmark_points bp
       join public.benchmark_series s on s.id = bp.series_id
      where s.code = 'USDTRY'
        and bp.as_of <= make_date((ws.period)::int, 12, 31)
      order by bp.as_of desc
      limit 1) as usd_try,
    (select bp.value
       from public.benchmark_points bp
       join public.benchmark_series s on s.id = bp.series_id
      where s.code = 'EURTRY'
        and bp.as_of <= make_date((ws.period)::int, 12, 31)
      order by bp.as_of desc
      limit 1) as eur_try,
    (select bp.value
       from public.benchmark_points bp
       join public.benchmark_series s on s.id = bp.series_id
      where s.code = 'XAUTRY'
        and bp.as_of <= make_date((ws.period)::int, 12, 31)
      order by bp.as_of desc
      limit 1) as gram_gold,
    (select cm.index_value
       from public.cpi_monthly cm
      where cm.series_code = 'CPI_TR_GENERAL'
        and cm.period_month::text <= to_char(make_date((ws.period)::int, 12, 31), 'YYYY-MM')
      order by cm.period_month desc
      limit 1) as cpi_index
  from public.wealth_snapshots ws
  where ws.period ~ '^[0-9]{4}$'
  order by ws.period;
$$;

grant execute on function public.real_value_series() to authenticated;
