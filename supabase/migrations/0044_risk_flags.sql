-- =====================================================================
-- Migration 0044: Risk flags (Komite · Gate sistemi)
-- =====================================================================
-- Investment Decision Platform MVP — PR-1 · Portföy Sağlığı v0.1.
--
-- "Risk bir skor değil, bir kapıdır (Gate)" prensibinin veri tabanı.
-- Bir sembole konan manuel risk bayrağı (VBTS / SPK / finansal bozulma /
-- aşırı volatilite / serbest) onu portföy sağlık motorunda KARANTİNAYA
-- alır: teknik kalitesi geçersiz sayılır, gate çarpanı düşürülür.
--
-- Çarpan eşlemesi KODDA (_lib/komite/gate.ts) — bu tablo yalnız ham
-- bayrağı tutar. Likidite bayrağı ('liq') otomatik türetilir, burada yok.
-- =====================================================================

create table if not exists public.risk_flags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,                 -- BIST ticker, '.IS' yok ('GESAN')
  kind        text not null check (kind in
                ('vbts','ban','spk','fin','vol','manual')),
  severity    smallint not null default 3 check (severity between 1 and 3),
  note        text,
  active      boolean not null default true,
  expires_at  date,                          -- ör. VBTS tahmini kalkış
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- bir sembol+kind için tek aktif kayıt
create unique index if not exists risk_flags_active_uq
  on public.risk_flags(user_id, symbol, kind) where active;

create index if not exists risk_flags_user_symbol_idx
  on public.risk_flags(user_id, symbol) where active;

-- RLS: standart owner policy (0007 helper) — kullanıcı yalnız kendi bayrakları
select public.fn_apply_owner_rls('public.risk_flags');
