-- =====================================================================
-- Migration 0053: görünümler RLS'e uysun, anon erişimi kapansın
-- =====================================================================
-- Sorun (Supabase güvenlik denetimi, ERROR: security_definer_view):
-- public şemasındaki 14 görünüm security_invoker olmadan tanımlıydı →
-- sahibi (postgres) yetkisiyle çalışıp alttaki tabloların RLS'ini
-- atlıyordu. Görünümlerde anon'a da SELECT verildiği için yayınlanmış
-- anon anahtarıyla giriş yapmadan hesap bakiyeleri, harcamalar, nakit
-- akışı ve pozisyonlar okunabiliyordu; giriş yapan başka bir kullanıcı
-- da başkasının satırlarını görebiliyordu.
--
-- Çözüm:
--   1. security_invoker = true → görünüm sorgulayanın yetkisi ve RLS'iyle
--      çalışır. Alttaki tüm tablolarda authenticated için SELECT
--      politikası var (kullanıcı verisi: user_id = auth.uid(); ortak
--      veri: true), uygulama görünümleri oturumlu istemciyle okur; cron
--      ve servis işleri service_role (BYPASSRLS) kullanır → davranış aynı.
--   2. Görünümlerde anon yetkisi kaldırılır (savunma derinliği; uygulama
--      görünümleri anon olarak okumaz).
--   3. bootstrap_* SECURITY DEFINER fonksiyonlarında anon EXECUTE
--      kaldırılır (zaten auth.uid() yoksa hata veriyorlardı).
--
-- DİKKAT: CREATE OR REPLACE VIEW, WITH (...) verilmezse reloptions'ı
-- sıfırlar (security_invoker düşer). Bu görünümleri ileride yeniden
-- tanımlayan migration'lar WITH (security_invoker = true) yazmalı.
-- =====================================================================

ALTER VIEW public.v_account_balances           SET (security_invoker = true);
ALTER VIEW public.v_beneficiary_spend          SET (security_invoker = true);
ALTER VIEW public.v_monthly_cashflow           SET (security_invoker = true);
ALTER VIEW public.v_holdings_wac               SET (security_invoker = true);
ALTER VIEW public.v_portfolio_marked_to_market SET (security_invoker = true);
ALTER VIEW public.v_benchmark_year_end         SET (security_invoker = true);
ALTER VIEW public.v_cpi_monthly_yoy            SET (security_invoker = true);
ALTER VIEW public.v_fund_prices_latest         SET (security_invoker = true);
ALTER VIEW public.v_fund_returns_health        SET (security_invoker = true);
ALTER VIEW public.v_fund_returns_latest        SET (security_invoker = true);
ALTER VIEW public.v_fund_scores_health         SET (security_invoker = true);
ALTER VIEW public.v_fund_scores_latest         SET (security_invoker = true);
ALTER VIEW public.v_screener_today             SET (security_invoker = true);
ALTER VIEW public.v_tefas_fund_prices_health   SET (security_invoker = true);

REVOKE ALL ON public.v_account_balances           FROM anon;
REVOKE ALL ON public.v_account_last_activity      FROM anon;
REVOKE ALL ON public.v_beneficiary_spend          FROM anon;
REVOKE ALL ON public.v_monthly_cashflow           FROM anon;
REVOKE ALL ON public.v_holdings_wac               FROM anon;
REVOKE ALL ON public.v_portfolio_marked_to_market FROM anon;
REVOKE ALL ON public.v_benchmark_year_end         FROM anon;
REVOKE ALL ON public.v_cpi_monthly_yoy            FROM anon;
REVOKE ALL ON public.v_fund_prices_latest         FROM anon;
REVOKE ALL ON public.v_fund_returns_health        FROM anon;
REVOKE ALL ON public.v_fund_returns_latest        FROM anon;
REVOKE ALL ON public.v_fund_scores_health         FROM anon;
REVOKE ALL ON public.v_fund_scores_latest         FROM anon;
REVOKE ALL ON public.v_screener_today             FROM anon;
REVOKE ALL ON public.v_tefas_fund_prices_health   FROM anon;

REVOKE EXECUTE ON FUNCTION public.bootstrap_garanti_card(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_user_defaults() FROM anon;
