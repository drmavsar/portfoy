-- =====================================================================
-- Seed script: runs once per new auth user via a trigger-friendly RPC.
-- This file is intentionally a function definition, not raw INSERTs,
-- because rows must be scoped to the calling user_id.
--
-- After signup, the client (or an "on_auth_user_created" trigger) calls
--   select public.bootstrap_user_defaults();
-- to populate sensible TR-localized defaults.
-- =====================================================================

create or replace function public.bootstrap_user_defaults()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  default_portfolio_id uuid;
begin
  if uid is null then
    raise exception 'bootstrap_user_defaults must be called by an authenticated user';
  end if;

  --------------------------------------------------------------------
  -- portfolios
  --------------------------------------------------------------------
  insert into public.portfolios (user_id, name, slug, is_default, base_currency)
  values (uid, 'Ana Portföy', 'ana', true, 'TRY')
  on conflict (user_id, slug) do nothing
  returning id into default_portfolio_id;

  --------------------------------------------------------------------
  -- beneficiaries (minimal default — user adds the rest via Ayarlar)
  --------------------------------------------------------------------
  insert into public.beneficiaries (user_id, name, slug, color, role) values
    (uid, 'Ben', 'ben', '#6ea8fe', 'self')
  on conflict (user_id, slug) do nothing;

  --------------------------------------------------------------------
  -- expense categories (top-level)
  --------------------------------------------------------------------
  insert into public.categories (user_id, name, slug, kind, icon) values
    (uid, 'Market',         'market',         'expense', 'shopping-cart'),
    (uid, 'Yeme/İçme',      'yeme-icme',      'expense', 'utensils'),
    (uid, 'Ulaşım',         'ulasim',         'expense', 'car'),
    (uid, 'Faturalar',      'faturalar',      'expense', 'file-text'),
    (uid, 'Eğitim',         'egitim',         'expense', 'book-open'),
    (uid, 'Sağlık',         'saglik',         'expense', 'heart-pulse'),
    (uid, 'Eğlence',        'eglence',        'expense', 'music'),
    (uid, 'Giyim',          'giyim',          'expense', 'shirt'),
    (uid, 'Ev',             'ev-cat',         'expense', 'home'),
    (uid, 'Sigorta',        'sigorta',        'expense', 'shield'),
    (uid, 'Vergi',          'vergi',          'expense', 'landmark'),
    (uid, 'Hediye/Yardım',  'hediye',         'expense', 'gift'),
    (uid, 'Diğer',          'diger-expense',  'expense', 'circle')
  on conflict (user_id, slug) do nothing;

  --------------------------------------------------------------------
  -- income categories
  --------------------------------------------------------------------
  insert into public.categories (user_id, name, slug, kind, icon) values
    (uid, 'Maaş',           'maas',           'income',  'briefcase'),
    (uid, 'Kira Geliri',    'kira-geliri',    'income',  'building'),
    (uid, 'Emekli Maaşı',   'emekli-maasi',   'income',  'badge'),
    (uid, 'İkramiye/Prim',  'ikramiye',       'income',  'sparkles'),
    (uid, 'Temettü',        'temettu',        'income',  'piggy-bank'),
    (uid, 'Faiz',           'faiz',           'income',  'percent'),
    (uid, 'Diğer Gelir',    'diger-income',   'income',  'plus')
  on conflict (user_id, slug) do nothing;

  --------------------------------------------------------------------
  -- transfer category (used for "Cep Şube Ödeme" etc.)
  --------------------------------------------------------------------
  insert into public.categories (user_id, name, slug, kind, icon) values
    (uid, 'Hesap Transferi', 'transfer', 'transfer', 'arrow-left-right'),
    (uid, 'Kredi Kartı Ödemesi', 'kk-odeme', 'transfer', 'credit-card'),
    (uid, 'Varlık Alımı',    'varlik-alimi', 'transfer', 'trending-up')
  on conflict (user_id, slug) do nothing;

  --------------------------------------------------------------------
  -- custody locations — TR banka set'i + broker/crypto/kasa
  -- (kullanıcı kendi ihtiyacına göre Ayarlar'dan ekler/siler)
  --------------------------------------------------------------------
  insert into public.custody_locations (user_id, name, slug, kind, color, short) values
    (uid, 'Garanti BBVA',    'garanti',        'checking',  '#0a8a4d', 'GAR'),
    (uid, 'İş Bankası',      'isbank',         'checking',  '#1d3a8a', 'İŞB'),
    (uid, 'Akbank',          'akbank',         'checking',  '#d22630', 'AKB'),
    (uid, 'Yapı Kredi',      'yapikredi',      'checking',  '#1a47b7', 'YKB'),
    (uid, 'Ziraat Bankası',  'ziraat',         'checking',  '#c41a1a', 'ZRT'),
    (uid, 'Midas',           'midas',          'brokerage', '#6ea8fe', 'MDS'),
    (uid, 'Garanti Kripto',  'garanti-kripto', 'crypto',    '#b388f2', 'GKR'),
    (uid, 'Fiziki Kasa',     'fiziki-kasa',    'safe',      '#d4a056', 'KSA')
  on conflict (user_id, slug) do nothing;

  --------------------------------------------------------------------
  -- baseline rules
  --------------------------------------------------------------------
  -- transfer detection (kart ödemeleri gider sayılmaz, sadece nakit akışı)
  insert into public.classification_rules
    (user_id, name, priority, match_description_ilike, set_is_transfer, confidence)
  values
    (uid, 'Cep Şube Ödeme = transfer', 10, '%cep şube%', true, 99.0),
    (uid, 'KK Ödemesi = transfer',     11, '%kredi kart% ödeme%', true, 95.0),
    (uid, 'Havale/EFT = transfer',     12, '%havale%', true, 80.0),
    (uid, 'Havale/EFT = transfer (EFT)', 13, '%eft%', true, 80.0)
  on conflict do nothing;

  -- Kişi/kategori bazlı kurallar: kullanıcı kendi kişileri eklerken
  -- Ayarlar → Kurallar üzerinden tanımlar (default'ta sadece transfer kuralları).
end;
$$;

-- =====================================================================
-- Helper RPC: register a Garanti BBVA card with the right card-last4
-- rule wiring (e.g. card 1023 → Ahmet Burak by default).
--
-- Call after creating the account:
--   select public.bootstrap_garanti_card('<account_uuid>', '1023', 'ahmet-burak');
-- =====================================================================
create or replace function public.bootstrap_garanti_card(
  p_account_id    uuid,
  p_card_last4    text,
  p_beneficiary_slug text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  benef_id uuid;
begin
  if uid is null then
    raise exception 'must be authenticated';
  end if;

  select id into benef_id
    from public.beneficiaries
   where user_id = uid and slug = p_beneficiary_slug;

  if benef_id is null then
    raise exception 'beneficiary slug % not found for user', p_beneficiary_slug;
  end if;

  insert into public.classification_rules
    (user_id, name, priority, match_account_id, match_card_last4,
     set_beneficiary_id, confidence)
  values
    (uid,
     format('Kart %s → %s', p_card_last4, p_beneficiary_slug),
     5,
     p_account_id,
     p_card_last4,
     benef_id,
     99.0)
  on conflict do nothing;
end;
$$;

revoke all on function public.bootstrap_garanti_card(uuid, text, text) from public;
grant execute on function public.bootstrap_garanti_card(uuid, text, text) to authenticated;

revoke all on function public.bootstrap_user_defaults() from public;
grant execute on function public.bootstrap_user_defaults() to authenticated;
