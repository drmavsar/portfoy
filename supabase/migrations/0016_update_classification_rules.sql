-- ========================================================================
-- 0016 — Garanti sınıflandırma kurallarını gerçek kullanıcı işaretlerine göre güncelle
--
-- Mehmet örnek ekstre yükleyip her satıra olması gereken kategoriyi
-- işaretledi. Bu migration:
--   1) Hatalı eski kuralları DÜZELTİR (Simitçi → Yeme/İçme, Tarihi Karaköy →
--      Pastane, Spotify/Netflix/Apple/YouTube → Dijital Platform, ...)
--   2) Yeni gözlemlenmiş pattern'leri EKLER (Erikli → Su, Amazon → Giyim,
--      Digiturk → Dijital, Kırtasiye → Eğitim, Vergi Dairesi → Vergi, ...)
--   3) Çok geniş tutulmuş "Market · iyzico" kuralını siler (iyzico Erikli/
--      Amazon farklı yerlere yönlendiren payment gateway).
--
-- ÇALIŞTIRMA: Supabase SQL Editor. v_user satırındaki UUID'i kendinkiyle
-- değiştir (Editor postgres ile çalışır → auth.uid() null).
-- ========================================================================

do $$
declare
  v_user uuid := coalesce(auth.uid(), 'REPLACE-WITH-YOUR-UUID'::uuid);
  v_market uuid; v_yeme uuid; v_pastane uuid; v_restoran uuid;
  v_dijital uuid; v_giyim uuid; v_egitim uuid; v_ulasim uuid;
  v_vergi uuid;  v_su uuid;
  v_mehmet uuid; v_ev uuid;
begin
  if v_user is null then
    raise exception 'user_id null. UUID değiştir.';
  end if;

  -- kategori ID'lerini slug ile yakala (UUID'ler instance bazlı değişir)
  select id into v_market   from public.categories where user_id=v_user and slug='market';
  select id into v_yeme     from public.categories where user_id=v_user and slug='yeme-icme';
  select id into v_pastane  from public.categories where user_id=v_user and slug='pastane';
  select id into v_restoran from public.categories where user_id=v_user and slug='restoran';
  select id into v_dijital  from public.categories where user_id=v_user and slug='dijital-platform';
  select id into v_giyim    from public.categories where user_id=v_user and slug='giyim';
  select id into v_egitim   from public.categories where user_id=v_user and slug='egitim';
  select id into v_ulasim   from public.categories where user_id=v_user and slug='ulasim';
  select id into v_vergi    from public.categories where user_id=v_user and slug='vergi';
  select id into v_su       from public.categories where user_id=v_user and slug='su';

  -- beneficiary (kişi): Mehmet (kişisel) ve Ev (hane) — slug/name fuzzy lookup
  select id into v_mehmet from public.beneficiaries
    where user_id=v_user and (slug='mehmet' or name ilike 'mehmet%')
    and archived_at is null
    order by created_at limit 1;
  select id into v_ev from public.beneficiaries
    where user_id=v_user
      and (slug in ('ev','aile','hane','genel') or name ilike '%ev%' or name ilike '%aile%' or name ilike '%hane%')
      and archived_at is null
    order by created_at limit 1;

  ------------------------------------------------------------------------
  -- 1) DÜZELTMELER (mevcut kural → doğru kategori)
  ------------------------------------------------------------------------

  -- Simitçi Hamza → Yeme/İçme (gerçekte simit/börek/içecek)
  update public.classification_rules
     set name = 'Yeme · Simitçi Hamza', set_category_id = v_yeme
   where user_id = v_user and match_merchant_ilike = '%SİMİTÇİ%';

  -- Tarihi Karaköy → Pastane (börek/fırın)
  update public.classification_rules
     set name = 'Pastane · Tarihi Karaköy', set_category_id = v_pastane
   where user_id = v_user and match_merchant_ilike = '%TARİHİ KARAKÖY%';

  -- Hepsipay → Giyim/Aksesuar (Hepsiburada çoğunlukla giyim)
  update public.classification_rules
     set name = 'Giyim · Hepsiburada', set_category_id = v_giyim
   where user_id = v_user and match_merchant_ilike = '%HEPSİPAY%';

  -- Spotify / Netflix / Apple / YouTube → Dijital Platform (Eğlence değil)
  update public.classification_rules
     set name = 'Dijital · Spotify', set_category_id = v_dijital
   where user_id = v_user and match_merchant_ilike = '%SPOTIFY%';

  update public.classification_rules
     set name = 'Dijital · Netflix', set_category_id = v_dijital
   where user_id = v_user and match_merchant_ilike = '%NETFLIX%';

  update public.classification_rules
     set name = 'Dijital · Apple', set_category_id = v_dijital
   where user_id = v_user and match_merchant_ilike = '%APPLE.COM%';

  update public.classification_rules
     set name = 'Dijital · YouTube', set_category_id = v_dijital
   where user_id = v_user and match_merchant_ilike = '%YOUTUBE%';

  ------------------------------------------------------------------------
  -- 2) SİLİNECEK (çok geniş)
  ------------------------------------------------------------------------
  -- iyzico bir ödeme gateway'i — kendi başına kategoriye yönlendirmez;
  -- altındaki gerçek satıcı (Erikli, Amazon, vb.) için ayrı kural var.
  delete from public.classification_rules
   where user_id = v_user and name = 'Market · iyzico';

  ------------------------------------------------------------------------
  -- 3) YENİ KURALLAR (gerçek ekstre işaretlerinden)
  ------------------------------------------------------------------------
  insert into public.classification_rules
    (user_id, name, priority, match_merchant_ilike, set_category_id)
  values
    -- Su / içecek
    (v_user, 'Su · Erikli',                  10, '%ERIKLI%',                  v_su),

    -- Amazon (iyzico üzerinden) — kullanıcı çoğunlukla giyim/aksesuar alıyor
    (v_user, 'Giyim · Amazon',               10, '%AMAZON.COM%',              v_giyim),

    -- Dijital Platform abonelikleri
    (v_user, 'Dijital · Digiturk',           10, '%DIGITURK%',                v_dijital),
    (v_user, 'Dijital · Google',             15, '%GOOGLE %',                 v_dijital),
    (v_user, 'Dijital · Hepsiburada Premium', 12, '%HEPSIBURADA PREMIUM%',    v_dijital),

    -- Pastane / Fırın varyantları
    (v_user, 'Pastane · Tarihi Karaköy Börek', 9, '%TARİHİ KARAKÖY BÖREK%',  v_pastane),
    (v_user, 'Pastane · Tarihi Karaköy Fırın', 9, '%TARİHİ KARAKÖY FIRIN%',  v_pastane),

    -- Eğitim — kırtasiye
    (v_user, 'Eğitim · Kırtasiye',           10, '%KIRTASİYE%',               v_egitim),

    -- Ulaşım — turizm firmaları
    (v_user, 'Ulaşım · Turizm Firması',      20, '%TURIZM%',                  v_ulasim),
    (v_user, 'Ulaşım · Sivrioğlu',           10, '%SIVRIOĞLU%',               v_ulasim),

    -- Giyim — saat/aksesuar
    (v_user, 'Giyim · Saat ve Saat',         10, '%SAAT VE SAAT%',            v_giyim),

    -- Vergi
    (v_user, 'Vergi · Vergi Dairesi',        10, '%VERGI DAIRE%',             v_vergi),
    (v_user, 'Vergi · Uluçınar Vergi',       10, '%ULUÇINAR VERGİ%',          v_vergi),

    -- Yeme/İçme — sık geçen yerel mekanlar
    (v_user, 'Yeme · Vahit Yıldırım',        15, '%VAHIT YILDIRIM%',          v_yeme),
    (v_user, 'Restoran · Yıldız Köşk',       10, '%YILDIZ KÖŞK%',             v_restoran),

    -- Market — Doğal Yaşam Baharat
    (v_user, 'Market · Doğal Yaşam Baharat', 10, '%DOĞAL YAŞAM BAHARAT%',     v_market)
  on conflict do nothing;

  ------------------------------------------------------------------------
  -- 4) BENEFICIARY (kişi) atamaları
  --    Market alışverişi → Ev hanesi
  --    Yeme/İçme · Pastane · Restoran → Mehmet (kişisel)
  ------------------------------------------------------------------------
  if v_ev is not null then
    update public.classification_rules
       set set_beneficiary_id = v_ev
     where user_id = v_user
       and set_category_id = v_market;
  else
    raise notice '"Ev" beneficiary bulunamadı; market kuralları kişi ataması yapılmadı.';
  end if;

  if v_mehmet is not null then
    update public.classification_rules
       set set_beneficiary_id = v_mehmet
     where user_id = v_user
       and set_category_id in (v_yeme, v_pastane, v_restoran);
  else
    raise notice '"Mehmet" beneficiary bulunamadı; yeme/pastane/restoran kuralları kişi ataması yapılmadı.';
  end if;

  raise notice 'Sınıflandırma kuralları güncellendi (user=%, mehmet=%, ev=%)', v_user, v_mehmet, v_ev;
end $$;
