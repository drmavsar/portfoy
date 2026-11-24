-- =====================================================================
-- Migration 0055: equity_anchors — günlük kayıt öncesi bilinen hisse değeri
-- =====================================================================
-- Servet köprüsü (Raporlar), günlük servet kaydı (daily_snapshots)
-- başlamadan önceki dönemi sınıflara ayıramıyordu. Bir kişinin o dönemin
-- başındaki hisse değeri aracı kurum ekstresinden biliniyorsa (ör. Garanti
-- Yatırım 31.12.2025 "Portföy değeri"), o kişinin hisse getirisi
--   ilk günlük kayıttaki equity_by_person − dayanak + net satış
-- olarak "Hisse ve fon"a ayrılır; kalan (döviz, altın, nakit, ekstresi
-- olmayan hisseler) ayrıştırılamayan kalır.
--
-- Değer, kişinin O TARİHTEKİ TÜM hisse + fon pozisyonlarının piyasa
-- değeridir (equity_by_person ile aynı kapsam). Kullanıcı verisi → owner RLS.
-- =====================================================================

create table if not exists public.equity_anchors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  as_of date not null,
  value_try numeric(18, 2) not null check (value_try >= 0),
  source text,
  created_at timestamptz not null default now(),
  unique (user_id, beneficiary_id, as_of)
);

select public.fn_apply_owner_rls('public.equity_anchors');
revoke all on public.equity_anchors from anon;
