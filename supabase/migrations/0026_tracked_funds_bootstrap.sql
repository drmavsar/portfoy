-- =====================================================================
-- Migration 0026: TEFAS — tracked_funds bootstrap
-- =====================================================================
-- Kullanıcının verdiği fonların tamamını mevcut kullanıcılar için
-- tracked_funds'a otomatik ekler. Yeni kayıt olan kullanıcılar için
-- AFTER INSERT trigger aynı bootstrap'ı uygular.
--
-- Karar (Sprint-1 onayı): 200+ fon başlangıçta takipte gelir. Kullanıcı
-- Ayarlar UI'dan istediğini kaldırabilir.
-- =====================================================================

-- 1) Mevcut kullanıcılar × aktif fonlar
insert into public.tracked_funds (user_id, fund_code)
select u.id, f.code
from auth.users u
cross join public.funds f
where f.is_active = true
on conflict (user_id, fund_code) do nothing;

-- 2) Yeni kullanıcı için aynı bootstrap (AFTER INSERT trigger)
create or replace function public.tg_bootstrap_tracked_funds()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.tracked_funds (user_id, fund_code)
  select new.id, f.code
  from public.funds f
  where f.is_active = true
  on conflict (user_id, fund_code) do nothing;
  return new;
end;
$$;

drop trigger if exists bootstrap_tracked_funds_trg on auth.users;
create trigger bootstrap_tracked_funds_trg
  after insert on auth.users
  for each row execute function public.tg_bootstrap_tracked_funds();
