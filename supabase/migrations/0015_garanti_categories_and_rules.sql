-- ========================================================================
-- 0015 — Garanti ekstre kategorileri + sınıflandırma kuralları
--
-- Garanti BBVA ekstre etiketleri (Market, Yeme/İçme, ...) için kategori
-- oluşturur ve gerçek ekstre verisinden çıkarılmış sık geçen merchant
-- pattern'leri için kural ekler. user_id ile sahiplenir; idempotent (slug
-- veya isim unique olduğu için on conflict).
--
-- ÇALIŞTIRMA: Supabase SQL editöründe oturum açtıktan sonra çalıştır.
--   - auth.uid() ile çalışır → girişli kullanıcının verilerine eklenir.
-- ========================================================================

do $$
declare
  v_user_id uuid := auth.uid();
  v_market uuid; v_yeme uuid; v_ev uuid; v_egitim uuid;
  v_kisisel uuid; v_eglence uuid; v_giyim uuid;
  v_saglik uuid; v_ulasim uuid; v_vergi uuid; v_diger uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() null — giriş yapılmamış. Supabase Dashboard "SQL Editor"da çalıştırmadan önce login ol.';
  end if;

  ------------------------------------------------------------------------
  -- 1) Kategoriler (Garanti Etiket'leri ile birebir uyumlu slug'lar)
  ------------------------------------------------------------------------
  insert into public.categories (user_id, name, slug, kind, icon, color) values
    (v_user_id, 'Market',        'market',        'expense', '🛒', '#4cc9b0'),
    (v_user_id, 'Yeme / İçme',   'yeme-icme',     'expense', '🍔', '#e26a8f'),
    (v_user_id, 'Ev / Dekorasyon','ev-dekorasyon','expense', '🏠', '#d4a056'),
    (v_user_id, 'Eğitim',        'egitim',        'expense', '📚', '#6ea8fe'),
    (v_user_id, 'Kişisel Hizmet','kisisel-hizmet','expense', '✂️', '#b388f2'),
    (v_user_id, 'Eğlence / Hobi','eglence-hobi',  'expense', '🎬', '#a4cc4c'),
    (v_user_id, 'Giyim / Aksesuar','giyim',       'expense', '👕', '#f08c54'),
    (v_user_id, 'Sağlık',        'saglik',        'expense', '💊', '#f25555'),
    (v_user_id, 'Ulaşım',        'ulasim',        'expense', '🚗', '#5fa8d3'),
    (v_user_id, 'Vergi / Resmi', 'vergi',         'expense', '🏛️', '#9aa0a6'),
    (v_user_id, 'Diğer',         'diger',         'expense', '📦', '#aaaaaa')
  on conflict (user_id, slug) do nothing;

  -- ID'leri yakala (yeni eklenen veya zaten var olan)
  select id into v_market   from public.categories where user_id=v_user_id and slug='market';
  select id into v_yeme     from public.categories where user_id=v_user_id and slug='yeme-icme';
  select id into v_ev       from public.categories where user_id=v_user_id and slug='ev-dekorasyon';
  select id into v_egitim   from public.categories where user_id=v_user_id and slug='egitim';
  select id into v_kisisel  from public.categories where user_id=v_user_id and slug='kisisel-hizmet';
  select id into v_eglence  from public.categories where user_id=v_user_id and slug='eglence-hobi';
  select id into v_giyim    from public.categories where user_id=v_user_id and slug='giyim';
  select id into v_saglik   from public.categories where user_id=v_user_id and slug='saglik';
  select id into v_ulasim   from public.categories where user_id=v_user_id and slug='ulasim';
  select id into v_vergi    from public.categories where user_id=v_user_id and slug='vergi';
  select id into v_diger    from public.categories where user_id=v_user_id and slug='diger';

  ------------------------------------------------------------------------
  -- 2) Sınıflandırma kuralları
  --    Gerçek Garanti ekstre verisinden çıkarılan en sık merchant pattern'leri.
  --    Önce spesifik (priority düşük), sonra generic etiket-bazlı fallback.
  --    Aynı isimle kural varsa atla (name unique kontrolü).
  ------------------------------------------------------------------------

  -- helper: ekle (varsa atla)
  -- (anonymous block içinde fonksiyon tanımlayamadığımız için inline)
  insert into public.classification_rules
    (user_id, name, priority, match_merchant_ilike, set_category_id)
  values
    -- ---- MARKET (spesifik) — priority 10
    (v_user_id, 'Market · A101',          10, '%A101%',       v_market),
    (v_user_id, 'Market · Migros',        10, '%MIGROS%',     v_market),
    (v_user_id, 'Market · BIM',           10, '%BIM %',       v_market),
    (v_user_id, 'Market · Şok',           10, '%ŞOK %',       v_market),
    (v_user_id, 'Market · Carrefour',     10, '%CARREFOUR%',  v_market),
    (v_user_id, 'Market · Mopaş',         10, '%MOPAŞ%',      v_market),
    (v_user_id, 'Market · Coşkun',        15, '%COŞKUN%',     v_market),
    (v_user_id, 'Market · Huzur Fırın',   15, '%HUZUR%',      v_market),
    (v_user_id, 'Market · Simitçi',       15, '%SİMİTÇİ%',    v_market),
    (v_user_id, 'Market · Tarihi Karaköy',15, '%TARİHİ KARAKÖY%', v_market),
    (v_user_id, 'Market · Ödeal',         15, '%ÖDEAL%',      v_market),
    (v_user_id, 'Market · Hepsiburada',   15, '%HEPSİPAY%',   v_market),
    (v_user_id, 'Market · iyzico',        15, '%IYZICO%',     v_market),

    -- ---- YEME / İÇME (spesifik) — priority 10
    (v_user_id, 'Yeme · Özlem Kurt',      10, '%ÖZLEM KURT%', v_yeme),
    (v_user_id, 'Yeme · Orivhi',          10, '%ORİVHİ%',     v_yeme),
    (v_user_id, 'Yeme · Nazilli Pide',    10, '%NAZILLI%',    v_yeme),
    (v_user_id, 'Yeme · Fabrika Kitchen', 10, '%FABRİKA%',    v_yeme),
    (v_user_id, 'Yeme · Atölye',          10, '%ATÖLYE%',     v_yeme),
    (v_user_id, 'Yeme · YemekSepeti',     10, '%YEMEKSEPET%', v_yeme),
    (v_user_id, 'Yeme · Getir',           10, '%GETIR%',      v_yeme),
    (v_user_id, 'Yeme · Trendyol Yemek',  10, '%TRENDYOL%YEMEK%', v_yeme),
    (v_user_id, 'Yeme · EMDO',            15, '%EMDO%',       v_yeme),
    (v_user_id, 'Yeme · Param/Yemek',     15, '%PARAM%',      v_yeme),

    -- ---- EV / DEKORASYON
    (v_user_id, 'Ev · Şans Reklam',       10, '%ŞANS REKLAM%', v_ev),
    (v_user_id, 'Ev · IKEA',              10, '%IKEA%',       v_ev),
    (v_user_id, 'Ev · Bauhaus',           10, '%BAUHAUS%',    v_ev),
    (v_user_id, 'Ev · Koçtaş',            10, '%KOÇTAŞ%',     v_ev),

    -- ---- EĞİTİM
    (v_user_id, 'Eğitim · Astra Yapı',    10, '%ASTRA%',      v_egitim),
    (v_user_id, 'Eğitim · Udemy',         10, '%UDEMY%',      v_egitim),

    -- ---- EĞLENCE / HOBİ
    (v_user_id, 'Eğlence · Spotify',      10, '%SPOTIFY%',    v_eglence),
    (v_user_id, 'Eğlence · Netflix',      10, '%NETFLIX%',    v_eglence),
    (v_user_id, 'Eğlence · Apple',        10, '%APPLE.COM%',  v_eglence),
    (v_user_id, 'Eğlence · YouTube',      10, '%YOUTUBE%',    v_eglence),

    -- ---- GİYİM
    (v_user_id, 'Giyim · LCW',            10, '%LCW%',        v_giyim),
    (v_user_id, 'Giyim · Defacto',        10, '%DEFACTO%',    v_giyim),
    (v_user_id, 'Giyim · Koton',          10, '%KOTON%',      v_giyim),
    (v_user_id, 'Giyim · Trendyol',       10, '%TRENDYOL %',  v_giyim),
    (v_user_id, 'Giyim · Columbia',       15, '%COLUMBIA%',   v_giyim),

    -- ---- SAĞLIK
    (v_user_id, 'Sağlık · Eczane',        10, '%ECZANE%',     v_saglik),
    (v_user_id, 'Sağlık · Hastane',       10, '%HASTANE%',    v_saglik),

    -- ---- ULAŞIM
    (v_user_id, 'Ulaşım · BiTaksi',       10, '%BITAKSI%',    v_ulasim),
    (v_user_id, 'Ulaşım · Uber',          10, '%UBER%',       v_ulasim),
    (v_user_id, 'Ulaşım · Shell',         10, '%SHELL%',      v_ulasim),
    (v_user_id, 'Ulaşım · BP',            10, '%BP %',        v_ulasim),
    (v_user_id, 'Ulaşım · Opet',          10, '%OPET%',       v_ulasim),
    (v_user_id, 'Ulaşım · Otoyol/HGS',    10, '%HGS%',        v_ulasim),

    -- ---- VERGİ / RESMİ
    (v_user_id, 'Vergi · Gelir İdaresi',  10, '%GIB%',        v_vergi),
    (v_user_id, 'Vergi · Belediye',       10, '%BELEDIYE%',   v_vergi),

    -- ---- DİĞER fallback'leri (priority yüksek — son çare)
    (v_user_id, 'Diğer · Bonus Kampanya', 90, '%BONUS%MARKET KAMPANYAS%', v_diger),
    (v_user_id, 'Diğer · Cep Şube Ödeme', 90, '%CEP ŞUBE ÖDEME%', null)
  on conflict do nothing;

  -- "Cep Şube Ödeme" kuralını is_transfer=true olarak işaretle
  update public.classification_rules
     set set_is_transfer = true
   where user_id = v_user_id
     and name = 'Diğer · Cep Şube Ödeme';

  raise notice 'Garanti kategorileri + sınıflandırma kuralları eklendi (user_id=%)', v_user_id;
end $$;
