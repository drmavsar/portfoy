-- =====================================================================
-- Migration 0033: user_personas + Mehmet Default seed
-- =====================================================================
-- Sprint-4 PR-1: Mehmet Score ağırlıklarını parametrik tutmak için
-- persona tablosu. Tek satır sistem default'u (user_id IS NULL); ileride
-- kullanıcı kendi override'ını ekleyebilir.
--
-- Ağırlıkların toplamı 1.0 olmalı (CHECK constraint).
-- =====================================================================

create table if not exists public.user_personas (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete cascade,
  name                     text not null,
  is_default               boolean not null default false,

  -- Mehmet Score ağırlıkları — toplam = 1.0 (CHECK)
  inflation_weight         numeric(5,4) not null,
  tax_weight               numeric(5,4) not null,
  risk_weight              numeric(5,4) not null,
  long_term_weight         numeric(5,4) not null,
  diversification_weight   numeric(5,4) not null,

  -- Profil filtreleri
  investment_horizon_years int,
  max_volatility_pct       numeric(5,4),
  min_tax_confidence       text check (
    min_tax_confidence is null
    or min_tax_confidence in ('NONE','LOW','MEDIUM','HIGH')
  ),

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint persona_weights_sum check (
    abs((inflation_weight + tax_weight + risk_weight +
         long_term_weight + diversification_weight) - 1.0) < 0.0001
  )
);

-- Bir kullanıcı için en fazla 1 default; sistem default için user_id IS NULL
-- partial unique index (ileride çoklu user için):
create unique index if not exists user_personas_default_per_user_idx
  on public.user_personas(coalesce(user_id::text, ''), is_default)
  where is_default = true;

create index if not exists user_personas_user_idx
  on public.user_personas(user_id);

drop trigger if exists user_personas_set_updated_at on public.user_personas;
create trigger user_personas_set_updated_at
  before update on public.user_personas
  for each row execute function public.tg_set_updated_at();

-- RLS:
--  - SELECT: tüm authenticated kullanıcılar sistem default'u (user_id IS NULL)
--    ve kendi persona'larını görebilir.
--  - INSERT/UPDATE/DELETE: yalnız kendi user_id'sine ait satırlar
--    (sistem default'u service_role tarafından seed edilir, kullanıcı dokunamaz).
alter table public.user_personas enable row level security;

drop policy if exists user_personas_read on public.user_personas;
create policy user_personas_read on public.user_personas
  for select to authenticated
  using (user_id is null or user_id = auth.uid());

drop policy if exists user_personas_write_own on public.user_personas;
create policy user_personas_write_own on public.user_personas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- Mehmet Default seed -------------------------------------
insert into public.user_personas
  (user_id, name, is_default,
   inflation_weight, tax_weight, risk_weight, long_term_weight, diversification_weight,
   investment_horizon_years, max_volatility_pct, min_tax_confidence,
   notes)
values
  (NULL, 'Mehmet Default', true,
   0.2500, 0.2000, 0.2000, 0.2000, 0.1500,
   7, 0.3000, 'MEDIUM',
   '47 yaş, 5-10 yıl vade, katılım uyumlu, enflasyona karşı koruma odaklı, aşırı risk yok')
on conflict do nothing;

-- ---------- fund_returns_cache — net vs_category uzantısı -----------
-- Sprint-3 PR-2'de vs_category sadece brüt için yazıldı. Sprint-4 net
-- skorlarda net karşılaştırma gerekir. Aynı pencere mantığı net üzerinden.
-- =====================================================================

alter table public.fund_returns_cache
  add column if not exists vs_category_net_1y   numeric(10,6),
  add column if not exists vs_category_net_3y   numeric(10,6);

create or replace view public.v_fund_returns_latest as
select distinct on (fund_code) *
from public.fund_returns_cache
order by fund_code, as_of desc;
