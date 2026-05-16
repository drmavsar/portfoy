-- =====================================================================
-- Migration 0002: Dynamic dimensions
-- =====================================================================
-- These tables hold user-extensible vocabularies referenced from the
-- fact tables. Every row is owned by an auth.users id so each
-- household can grow its own taxonomy.
-- =====================================================================

-- ---------- households / portfolios (alt-portföyler) -----------------
-- "Ana Portföy", "Ahmet Burak'ın Portföyü", "Salih'in Portföyü" gibi.
create table if not exists public.portfolios (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  slug            text not null,
  description     text,
  base_currency   text not null default 'TRY',
  is_default      boolean not null default false,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, slug)
);

drop trigger if exists portfolios_set_updated_at on public.portfolios;
create trigger portfolios_set_updated_at
  before update on public.portfolios
  for each row execute function public.tg_set_updated_at();

-- ---------- beneficiaries (Faydalanıcı / Maliyet Merkezi) ------------
-- "Ev", "Ahmet Burak", "Salih", "Anne/Baba" gibi.
create table if not exists public.beneficiaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  slug         text not null,
  color        text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, slug)
);

drop trigger if exists beneficiaries_set_updated_at on public.beneficiaries;
create trigger beneficiaries_set_updated_at
  before update on public.beneficiaries
  for each row execute function public.tg_set_updated_at();

-- ---------- categories (kategori + alt kategori) ---------------------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  parent_id     uuid references public.categories(id) on delete cascade,
  name          text not null,
  slug          text not null,
  kind          text not null default 'expense' check (kind in ('expense','income','transfer')),
  icon          text,
  color         text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists categories_parent_idx on public.categories(parent_id);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.tg_set_updated_at();

-- ---------- custody locations (Banka, Midas, Garanti Kripto, Kasa) ---
create table if not exists public.custody_locations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  slug         text not null,
  kind         account_type not null default 'brokerage',
  notes        text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, slug)
);

drop trigger if exists custody_locations_set_updated_at on public.custody_locations;
create trigger custody_locations_set_updated_at
  before update on public.custody_locations
  for each row execute function public.tg_set_updated_at();

-- ---------- tags (free-form) -----------------------------------------
create table if not exists public.tags (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  slug         text not null,
  color        text,
  created_at   timestamptz not null default now(),
  unique (user_id, slug)
);
