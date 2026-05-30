-- =====================================================================
-- Migration 0025: TEFAS — funds seed (155 katılım fonu)
-- =====================================================================
-- Kullanıcının verdiği fon listesi 16 kategoriye dağıtılır.
--
-- Duplicate çözümü:
-- - HFI/KLH/KTS/RKH "Katılım Hisse Senedi Fonları" ve "Katılım Serbest
--   Hisse Senedi Yoğun Fonlar" kategorilerinin her ikisinde de listelenmişti.
--   HSYF kategorisi (KATILIM_HSYF_SERBEST) seçildi — stopaj %0 avantajı
--   bu sınıflandırmadan gelir; SPK'da fon birden çok şemsiye altında olamaz.
--
-- Özel fonlar (Sprint-1 sonunda quality raporu bunları işaretler):
-- - KMN: Kıymetli Madenler Karma (~%50 gümüş, ~%35 altın) — metadata
-- - YCY: Fon Sepeti Fonu — investment_universe FON_SEPETI
-- - KIS, TPZ: döviz bazlı kira sertifikası — is_fx_denominated=true
--
-- Fon isimleri Sprint-2'de TEFAS ingest sırasında resmi adıyla
-- güncellenecek; şimdilik name=code yedek değer olarak yazılıyor.
-- =====================================================================

-- 1) Katılım Hisse Senedi Fonları (26 fon; HSYF 4'ü çıkarılmış)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KATILIM_HISSE'),
       'TRY', true, false, false, false, 'BIST_HISSE_TR', 'HIGH'
from unnest(array[
  'DKH','ELZ','GKV','HKH','IVF','KH1','KHC','KHJ','KPC','KPU',
  'KST','KTI','MKA','MPS','MTK','NKM','NKT','OHK','PHK','PUK',
  'RBH','RPI','TIL','TLZ','YHK','ZPE'
]) as code
on conflict (code) do nothing;

-- 2) Katılım Para Piyasası Fonları (18)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KATILIM_PARA_PIYASASI'),
       'TRY', true, false, false, false, 'KATILIM_PARA_PIYASASI', 'HIGH'
from unnest(array[
  'AIS','EPA','FTL','GOP','GPN','HPH','KLU','KPI','KSK','MPE',
  'NSP','PKR','PPG','PPK','PRR','RRP','TLK','TLV'
]) as code
on conflict (code) do nothing;

-- 3) Katılım Altın Fonları (13)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KATILIM_ALTIN'),
       'TRY', true, false, false, false, 'ALTIN', 'HIGH'
from unnest(array[
  'FAK','GOL','HAM','IAY','KMF','KZL','KZU','NJF','OGD','PKF',
  'RBA','RJG','TCA'
]) as code
on conflict (code) do nothing;

-- 4) Katılım Kıymetli Madenler Fonları (1 + KMN)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KATILIM_KIYMETLI_MADEN'),
       'TRY', true, false, false, false, 'KIYMETLI_MADEN_KARMA', 'HIGH'
from unnest(array['KUT', 'KMN']) as code
on conflict (code) do nothing;

-- 5) Katılım Kira Sertifikaları (18) — KIS, TPZ döviz bazlı, ayrıca aşağıda update
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KATILIM_KIRA_SERT'),
       'TRY', true, false, false, false, 'KIRA_SERTIFIKASI_TRY', 'HIGH'
from unnest(array[
  'DPK','EKF','GLS','IAT','IV8','KIS','KRA','KTN','KTV','MPF',
  'MPK','RBT','RBV','RKS','TPZ','VFK','YFV','ZPG'
]) as code
on conflict (code) do nothing;

-- 6) Katılım Teknoloji Fonları (3)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KATILIM_TEKNOLOJI'),
       'TRY', true, false, false, false, 'TEKNOLOJI_HISSE', 'HIGH'
from unnest(array['BTK','CPU','KTJ']) as code
on conflict (code) do nothing;

-- 7) Sektörel Katılım Fonları (4)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'SEKTOREL_KATILIM'),
       'TRY', true, false, false, false, 'SEKTOREL_BIST', 'HIGH'
from unnest(array['EPI','KNJ','KSR','TVE']) as code
on conflict (code) do nothing;

-- 8) Katılım Serbest Para Piyasası Fonları (7)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KATILIM_SERBEST_PARA'),
       'TRY', true, false, true, false, 'KATILIM_PARA_PIYASASI', 'LOW'
from unnest(array['DNP','GKH','KLI','NSA','PKP','PKT','ZP8']) as code
on conflict (code) do nothing;

-- 9) Dolar ile Alınabilen Katılım Serbest Fonlar (17)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'DOLAR_SERBEST'),
       'USD', true, false, true, true, 'DOVIZ_SERBEST_USD', 'MEDIUM'
from unnest(array[
  'BKY','CKS','DKL','HML','KDL','KDT','KLS','KPD','KTT','NKA',
  'NME','NVK','NZU','PBK','TRU','YSL','ZP6'
]) as code
on conflict (code) do nothing;

-- 10) Euro ile Alınabilen Katılım Serbest Fonlar (5)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'EURO_SERBEST'),
       'EUR', true, false, true, true, 'DOVIZ_SERBEST_EUR', 'MEDIUM'
from unnest(array['BDA','KAV','KDO','KKC','ZP9']) as code
on conflict (code) do nothing;

-- 11) Katılım Serbest Hisse Senedi Yoğun Fonlar — HSYF, stopaj %0 (4)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KATILIM_HSYF_SERBEST'),
       'TRY', true, true, true, false, 'BIST_HISSE_TR', 'HIGH'
from unnest(array['HFI','KLH','KTS','RKH']) as code
on conflict (code) do nothing;

-- 12) Kısa Vadeli Katılım Serbest Fonlar (6)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'KISA_VADELI_SERBEST'),
       'TRY', true, false, true, false, 'KATILIM_PARA_PIYASASI', 'LOW'
from unnest(array['AC1','KKL','KSV','KVR','PVK','RKV']) as code
on conflict (code) do nothing;

-- 13) Katılım İstatistiksel Arbitraj Serbest Fon (1)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select 'KVK', 'KVK',
       (select id from public.fund_categories where code = 'ARBITRAJ_SERBEST'),
       'TRY', true, false, true, false, 'ARBITRAJ', 'LOW'
on conflict (code) do nothing;

-- 14) Katılım Gümüş Serbest Fon (1)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select 'GUK', 'GUK',
       (select id from public.fund_categories where code = 'GUMUS_SERBEST'),
       'TRY', true, false, true, false, 'GUMUS', 'LOW'
on conflict (code) do nothing;

-- 15) Çoklu Varlık Katılım Fonları (25 + YCY)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'COKLU_VARLIK_KATILIM'),
       'TRY', true, false, false, false, 'COKLU_VARLIK', 'HIGH'
from unnest(array[
  'FBC','BCO','CKF','CVK','CVL','FCK','FFH','GKF','GPF','KCL',
  'KCV','KDE','KIK','KME','KTM','KU3','KUA','KUD','NJY','PDD',
  'PP1','RCV','VRK','ZBI','ZCK','YCY'
]) as code
on conflict (code) do nothing;

-- 16) Diğer Serbest Katılım Fonlar (4)
insert into public.funds
  (code, name, category_id, currency, is_participation, is_equity_intensive,
   is_free_fund, is_fx_denominated, investment_universe, tax_confidence)
select code, code,
       (select id from public.fund_categories where code = 'DIGER_SERBEST'),
       'TRY', true, false, true, false, 'DIGER', 'LOW'
from unnest(array['BVK','DNK','PKD','RBR']) as code
on conflict (code) do nothing;

-- ---------- Özel override'lar -------------------------------------------

-- KIS, TPZ döviz bazlı kira sertifikası
update public.funds
   set is_fx_denominated = true,
       investment_universe = 'KIRA_SERTIFIKASI_FX',
       tax_confidence = 'MEDIUM'
 where code in ('KIS', 'TPZ');

-- KMN metadata (yaklaşık %50 gümüş, %35 altın)
update public.funds
   set metadata = '{"silver_pct": 50, "gold_pct": 35, "other_pct": 15}'::jsonb,
       notes = 'Kıymetli Madenler Katılım — karma fon (manuel metadata)'
 where code = 'KMN';

-- YCY fon sepeti
update public.funds
   set investment_universe = 'FON_SEPETI',
       metadata = '{"fund_type": "fon_sepeti"}'::jsonb,
       notes = 'Katılım Fon Sepeti Fonu (manuel metadata)'
 where code = 'YCY';
