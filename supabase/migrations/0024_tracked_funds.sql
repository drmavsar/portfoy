-- =====================================================================
-- Migration 0024: TEFAS — tracked_funds
-- =====================================================================
-- Kullanıcı bazlı fon takip listesi. Bir fonun "takipte" olması o fonun
-- dashboard'da görünür olması demektir; portföyde alım/satım yapılması
-- DEĞİLDİR (o Sprint-6'da assets/trades ile).
--
-- Bootstrap (mevcut user × aktif fon → tracked_funds) PR-2'de seed
-- migration'ı içinde yapılır. Bu PR sadece tablo şemasını oluşturur.
-- =====================================================================

create table if not exists public.tracked_funds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  fund_code   text not null references public.funds(code) on delete cascade,
  is_active   boolean not null default true,
  notes       text,
  added_at    timestamptz not null default now(),
  unique (user_id, fund_code)
);

create index if not exists tracked_funds_user_active_idx
  on public.tracked_funds(user_id, is_active);
create index if not exists tracked_funds_fund_idx
  on public.tracked_funds(fund_code);

select public.fn_apply_owner_rls('public.tracked_funds');
