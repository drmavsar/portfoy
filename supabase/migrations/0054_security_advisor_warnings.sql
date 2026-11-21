-- =====================================================================
-- Migration 0054: Supabase güvenlik denetimi — kalan WARN'lar
-- =====================================================================
-- 1. function_search_path_mutable (7 fonksiyon): search_path sabitlenir.
--    Gövdeler public'teki tip/tablolara (asset_class, tax_audit_operation,
--    tracked_funds…) niteliksiz başvurduğu için '' yerine public, pg_temp
--    (pg_temp sonda → geçici şema ile gölgeleme yok). Davranış aynı.
-- 2. extension_in_public: pg_trgm → extensions şeması. Yalnız iki GIN
--    indeksi kullanıyor (transactions.merchant_clean, assets.symbol);
--    indeksler opclass OID'iyle bağlı, taşıma sonrası çalışmaya devam
--    eder. Kod pg_trgm fonksiyonu çağırmıyor; extensions zaten
--    veritabanının ve PostgREST'in search_path'inde.
-- 3. anon/authenticated_security_definer_function_executable:
--    * tg_audit_log, tg_bootstrap_tracked_funds trigger fonksiyonu →
--      EXECUTE kaldırılır. Trigger tetiklenirken EXECUTE yetkisi
--      denetlenmez (yalnız CREATE TRIGGER'da); geri alınan bir deneme
--      işlemiyle doğrulandı: yetkisiz rol insert yaptı, trigger çalıştı.
--    * bootstrap_user_defaults, bootstrap_garanti_card → SECURITY INVOKER.
--      Yalnız çağıranın kendi satırlarını (user_id = auth.uid()) ekliyor;
--      ilgili tablolarda owner_modify RLS politikaları var. Geri alınan bir
--      deneme işleminde authenticated rolüyle iki fonksiyon da tüm
--      satırları ekledi (1 portföy, 1 kişi, 23 kategori, 8 saklama yeri,
--      5 kural).
-- 4. auth_leaked_password_protection: SQL ile değil, Dashboard →
--    Authentication ayarından açılır (bu migration'ın dışında).
-- =====================================================================

ALTER FUNCTION public.tg_set_updated_at()           SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_apply_owner_rls(regclass)  SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_fund_tax_rules_audit()     SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_bootstrap_tracked_funds()  SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_fund_to_asset()          SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_fund_update_to_asset()   SET search_path = public, pg_temp;
ALTER FUNCTION public.real_value_series()           SET search_path = public, pg_temp;

ALTER EXTENSION pg_trgm SET SCHEMA extensions;

REVOKE EXECUTE ON FUNCTION public.tg_audit_log()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_bootstrap_tracked_funds() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.bootstrap_user_defaults()                    SECURITY INVOKER;
ALTER FUNCTION public.bootstrap_garanti_card(uuid, text, text)     SECURITY INVOKER;
