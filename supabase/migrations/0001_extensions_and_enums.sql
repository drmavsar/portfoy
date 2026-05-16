-- =====================================================================
-- Migration 0001: Extensions, enums and shared utilities
-- =====================================================================
-- All enums are intentionally kept narrow; dynamic dimensions
-- (categories, beneficiaries, custody locations, tags) are first-class
-- tables with user-scoped rows so the system stays user-extensible
-- per the PRD ("Tanımlamalar dinamik olsun").
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ---------- Core enums (closed sets) ---------------------------------

do $$ begin
  create type account_type as enum (
    'checking',      -- vadesiz mevduat
    'savings',       -- vadeli mevduat
    'credit_card',   -- kredi kartı
    'brokerage',     -- yatırım hesabı (Midas vb.)
    'crypto',        -- kripto cüzdan/borsa
    'cash',          -- nakit
    'safe',          -- fiziki kasa
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_class as enum (
    'equity_tr',   -- BIST hissesi
    'equity_us',
    'fx',          -- döviz (USD, EUR, ...)
    'metal',       -- altın, gümüş
    'crypto',
    'fund',        -- yatırım fonu
    'bond',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type trade_side as enum ('buy', 'sell');
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_direction as enum ('inflow', 'outflow', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_status as enum ('draft', 'committed', 'ignored');
exception when duplicate_object then null; end $$;

do $$ begin
  create type catalyst_polarity as enum ('positive', 'neutral', 'negative');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scan_tier as enum ('tier1', 'tier2', 'tier3', 'watch');
exception when duplicate_object then null; end $$;

-- ---------- updated_at trigger helper ---------------------------------

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
