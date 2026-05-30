-- =====================================================================
-- Migration 0021: TEFAS — fund_categories
-- =====================================================================
-- Katılım fonu kategorileri (TEFAS sınıflandırması). Sprint-1 kapsamı.
-- Fonlar bu tabloya bağlanır (funds.category_id). 16 kategori seed
-- bu migration içinde yapılır — kategori listesi statik, mevzuat
-- değişikliğine bağlı değildir.
-- =====================================================================

do $$ begin
  create type fund_tax_kind as enum (
    'HSYF_0_STOPAJ',   -- Hisse Senedi Yoğun Fon, %0 stopaj
    'GENEL_17_5',      -- Genel %17.5 stopaj
    'DOVIZ_BAZLI',     -- Döviz bazlı fonlar, BELİRSİZ
    'SERBEST_FON',     -- Serbest fon, BELİRSİZ
    'BELIRSIZ'         -- Sınıflandırılamayan
  );
exception when duplicate_object then null; end $$;

create table if not exists public.fund_categories (
  id                  serial primary key,
  code                text not null unique,
  name_tr             text not null,
  color               text,                 -- hex renk, UI için
  default_tax_kind    fund_tax_kind not null default 'BELIRSIZ',
  default_risk_band   text,                 -- 'düşük' / 'orta' / 'yüksek'
  sort_order          int not null default 100,
  notes               text,
  created_at          timestamptz not null default now()
);

-- Reference data: herkes okur, sadece service_role yazar
alter table public.fund_categories enable row level security;
drop policy if exists fund_categories_read on public.fund_categories;
create policy fund_categories_read on public.fund_categories
  for select to authenticated using (true);

-- 16 kategori seed (Sprint-1 kapsamı). Kategori isimleri kullanıcının
-- verdiği listeden birebir; renkler ozet sayfasındaki varlık sınıfı
-- paletine yaklaştırıldı.
insert into public.fund_categories (code, name_tr, color, default_tax_kind, default_risk_band, sort_order) values
  ('KATILIM_HISSE',           'Katılım Hisse Senedi Fonları',          '#e26a8f', 'GENEL_17_5',   'yüksek', 10),
  ('KATILIM_PARA_PIYASASI',   'Katılım Para Piyasası Fonları',         '#4cc9b0', 'GENEL_17_5',   'düşük',  20),
  ('KATILIM_ALTIN',           'Katılım Altın Fonları',                 '#d4a056', 'GENEL_17_5',   'orta',   30),
  ('KATILIM_KIYMETLI_MADEN',  'Katılım Kıymetli Madenler Fonları',     '#d4843a', 'GENEL_17_5',   'orta',   40),
  ('KATILIM_KIRA_SERT',       'Katılım Kira Sertifikaları',            '#6ea8fe', 'GENEL_17_5',   'düşük',  50),
  ('KATILIM_TEKNOLOJI',       'Katılım Teknoloji Fonları',             '#b388f2', 'GENEL_17_5',   'yüksek', 60),
  ('SEKTOREL_KATILIM',        'Sektörel Katılım Fonları',              '#e0b341', 'GENEL_17_5',   'yüksek', 70),
  ('KATILIM_SERBEST_PARA',    'Katılım Serbest Para Piyasası Fonları', '#7d8699', 'SERBEST_FON',  'orta',   80),
  ('DOLAR_SERBEST',           'Dolar ile Alınabilen Katılım Serbest Fonlar', '#6ea8fe', 'DOVIZ_BAZLI',  'orta',   90),
  ('EURO_SERBEST',            'Euro ile Alınabilen Katılım Serbest Fonlar',  '#5b8def', 'DOVIZ_BAZLI',  'orta',  100),
  ('KATILIM_HSYF_SERBEST',    'Katılım Serbest Hisse Senedi Yoğun Fonlar',   '#c44569', 'HSYF_0_STOPAJ','yüksek',110),
  ('KISA_VADELI_SERBEST',     'Kısa Vadeli Katılım Serbest Fonlar',    '#4cc9b0', 'SERBEST_FON',  'düşük', 120),
  ('ARBITRAJ_SERBEST',        'Katılım İstatistiksel Arbitraj Serbest Fon', '#9b59b6', 'SERBEST_FON',  'orta',  130),
  ('GUMUS_SERBEST',           'Katılım Gümüş Serbest Fon',             '#b8b8b8', 'SERBEST_FON',  'orta',  140),
  ('COKLU_VARLIK_KATILIM',    'Çoklu Varlık Katılım Fonları',          '#f39c12', 'GENEL_17_5',   'orta',  150),
  ('DIGER_SERBEST',           'Diğer Serbest Katılım Fonlar',          '#7d8699', 'SERBEST_FON',  'orta',  160)
on conflict (code) do nothing;
