-- =====================================================================
-- Migration 0022: TEFAS — funds master
-- =====================================================================
-- Katılım fonu master verisi. 200+ fonun sabit özellikleri burada.
-- Skor kolonları (currency_risk_score, tax_advantage_score, vs.) ve
-- dinamik skor cache'i bilinçli olarak Sprint-4'e ertelendi.
--
-- Fonun underlying yatırım evreni (investment_universe) kategori ile
-- aynı şey değildir: kategori SPK sınıflandırması, universe ise fonun
-- gerçekte ne aldığı (BIST hisse, kira sertifikası, altın, vb.).
--
-- tax_confidence: stopaj kuralının ne kadar güvenle bilindiği. UI'da
-- 'HIGH' dışı her şey için "tahmini" rozeti gösterilecek.
-- =====================================================================

do $$ begin
  create type fund_investment_universe as enum (
    'BIST_HISSE_TR',
    'BIST_KATILIM_30',
    'KIRA_SERTIFIKASI_TRY',
    'KIRA_SERTIFIKASI_FX',
    'ALTIN',
    'GUMUS',
    'KIYMETLI_MADEN_KARMA',
    'TEKNOLOJI_HISSE',
    'SEKTOREL_BIST',
    'KATILIM_PARA_PIYASASI',
    'COKLU_VARLIK',
    'ULUSLARARASI_HISSE',
    'DOVIZ_SERBEST_USD',
    'DOVIZ_SERBEST_EUR',
    'ARBITRAJ',
    'FON_SEPETI',
    'DIGER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type fund_tax_confidence as enum ('HIGH', 'MEDIUM', 'LOW', 'NONE');
exception when duplicate_object then null; end $$;

create table if not exists public.funds (
  code                 text primary key,           -- "DKH", "YHK", ...
  name                 text not null,              -- TEFAS resmi adı
  category_id          int not null references public.fund_categories(id) on delete restrict,
  currency             text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  is_participation     boolean not null default true,
  is_equity_intensive  boolean not null default false,  -- HSYF (stopaj %0 için)
  is_free_fund         boolean not null default false,  -- Serbest fon
  is_fx_denominated    boolean not null default false,  -- Kur riski (KIS, TPZ + USD/EUR)
  is_tefas_traded      boolean not null default true,
  risk_level           int check (risk_level between 1 and 7),  -- TEFAS resmi skala
  management_firm      text,
  fund_type            text,                       -- "Hisse Senedi Şemsiye Fonu" vb.
  investment_universe  fund_investment_universe not null default 'DIGER',
  tax_confidence       fund_tax_confidence not null default 'NONE',
  metadata             jsonb not null default '{}'::jsonb,
  is_active            boolean not null default true,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists funds_category_idx
  on public.funds(category_id);
create index if not exists funds_universe_idx
  on public.funds(investment_universe);
create index if not exists funds_currency_idx
  on public.funds(currency);
create index if not exists funds_hsyf_idx
  on public.funds(is_equity_intensive) where is_equity_intensive = true;
create index if not exists funds_active_idx
  on public.funds(is_active) where is_active = true;

drop trigger if exists funds_set_updated_at on public.funds;
create trigger funds_set_updated_at
  before update on public.funds
  for each row execute function public.tg_set_updated_at();

-- Reference data: herkes okur, sadece service_role yazar
alter table public.funds enable row level security;
drop policy if exists funds_read on public.funds;
create policy funds_read on public.funds
  for select to authenticated using (true);
