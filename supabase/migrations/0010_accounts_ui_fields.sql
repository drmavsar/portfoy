-- =====================================================================
-- Migration 0010: Hesaplar UI alanları
-- =====================================================================
-- accounts: kişi sahipliği + display balance kolonları
-- custody_locations: UI rozet bilgileri (renk, kısaltma)
-- =====================================================================

-- accounts.beneficiary_id: hesap kimin? (sample owner alanı)
alter table public.accounts
  add column if not exists beneficiary_id uuid references public.beneficiaries(id) on delete set null;

create index if not exists accounts_beneficiary_idx on public.accounts(beneficiary_id);

-- balance_try: TRY karşılığı görüntü değeri (FX/altın hesaplar için raw'dan ayrı)
-- balance_native: hesap kendi para biriminde miktar (USD, EUR, XAU, BTC, ETH...)
alter table public.accounts
  add column if not exists balance_try numeric(18,2);

alter table public.accounts
  add column if not exists balance_native numeric(18,8);

-- custody_locations: UI için renk ve 3-harf rozet kısaltma
alter table public.custody_locations
  add column if not exists color text default '#6ea8fe';

alter table public.custody_locations
  add column if not exists short text;

-- Backfill: mevcut kullanıcılara TR banka seti + eski kayıtlara renk/short
-- (idempotent: on conflict / where short is null)

insert into public.custody_locations (user_id, name, slug, kind, color, short)
select u.id, t.name, t.slug, t.kind::account_type, t.color, t.short
from auth.users u
cross join (values
  ('Garanti BBVA',   'garanti',    'checking', '#0a8a4d', 'GAR'),
  ('İş Bankası',     'isbank',     'checking', '#1d3a8a', 'İŞB'),
  ('Akbank',         'akbank',     'checking', '#d22630', 'AKB'),
  ('Yapı Kredi',     'yapikredi',  'checking', '#1a47b7', 'YKB'),
  ('Ziraat Bankası', 'ziraat',     'checking', '#c41a1a', 'ZRT')
) as t(name, slug, kind, color, short)
on conflict (user_id, slug) do nothing;

update public.custody_locations set color='#6ea8fe', short='MDS' where slug='midas'          and short is null;
update public.custody_locations set color='#b388f2', short='GKR' where slug='garanti-kripto' and short is null;
update public.custody_locations set color='#d4a056', short='KSA' where slug='fiziki-kasa'    and short is null;
update public.custody_locations set color='#7d8699', short='BNK' where slug='banka'          and short is null;
