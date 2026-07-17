-- Mehmet's Assets — All-in-one Supabase setup (idempotent)

-- FILE: supabase/migrations/0001_extensions_and_enums.sql
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

-- FILE: supabase/migrations/0002_dimensions.sql
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

-- FILE: supabase/migrations/0003_cashflow.sql
-- =====================================================================
-- Migration 0003: Cashflow - accounts, statements, transactions, rules
-- =====================================================================

-- ---------- accounts -------------------------------------------------
create table if not exists public.accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  portfolio_id      uuid references public.portfolios(id) on delete set null,
  custody_id        uuid references public.custody_locations(id) on delete set null,
  name              text not null,
  account_type      account_type not null,
  currency          text not null default 'TRY',
  iban              text,
  last4             text,
  opening_balance   numeric(18,2) not null default 0,
  credit_limit      numeric(18,2),
  statement_day     smallint check (statement_day between 1 and 31),
  due_day           smallint check (due_day between 1 and 31),
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists accounts_user_idx on public.accounts(user_id);
create index if not exists accounts_portfolio_idx on public.accounts(portfolio_id);

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.tg_set_updated_at();

-- ---------- statement imports (raw uploads) --------------------------
-- Tracks each CSV/Excel upload for auditability and re-runs.
create table if not exists public.statement_imports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid references public.accounts(id) on delete set null,
  source_name     text,                    -- original filename
  source_kind     text not null default 'csv' check (source_kind in ('csv','xlsx','manual','api')),
  row_count       int not null default 0,
  period_start    date,
  period_end      date,
  status          text not null default 'pending'
                  check (status in ('pending','reviewed','committed','discarded')),
  raw_payload     jsonb,                   -- header + sample for debugging
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists statement_imports_user_idx on public.statement_imports(user_id);

drop trigger if exists statement_imports_set_updated_at on public.statement_imports;
create trigger statement_imports_set_updated_at
  before update on public.statement_imports
  for each row execute function public.tg_set_updated_at();

-- ---------- transactions --------------------------------------------
-- Single source of truth for every money movement.
-- Transfers between own accounts are modeled with `counter_account_id`
-- so the same logical movement is one row, not two (no double-counting).
create table if not exists public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  account_id          uuid not null references public.accounts(id) on delete cascade,
  counter_account_id  uuid references public.accounts(id) on delete set null,
  import_id           uuid references public.statement_imports(id) on delete set null,
  occurred_on         date not null,
  posted_on           date,
  direction           txn_direction not null,
  amount              numeric(18,2) not null check (amount > 0),
  currency            text not null default 'TRY',
  fx_rate_to_try      numeric(18,6),
  amount_try          numeric(18,2) generated always as (
                        case
                          when currency = 'TRY' then amount
                          else amount * coalesce(fx_rate_to_try, 0)
                        end
                      ) stored,
  description         text,
  merchant_raw        text,                -- "A101 GULBAHCE" etc.
  merchant_clean      text,                -- normalized merchant
  category_id         uuid references public.categories(id) on delete set null,
  beneficiary_id      uuid references public.beneficiaries(id) on delete set null,
  is_transfer         boolean not null default false,
  is_installment      boolean not null default false,
  installment_seq     smallint,            -- 1, 2, 3, ...
  installment_total   smallint,            -- 6 (for "1/6")
  parent_purchase_id  uuid references public.transactions(id) on delete set null,
  status              txn_status not null default 'committed',
  hash_dedupe         text,                -- sha256 to dedupe re-imports
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists transactions_dedupe_key
  on public.transactions(user_id, hash_dedupe)
  where hash_dedupe is not null;

create index if not exists transactions_user_date_idx
  on public.transactions(user_id, occurred_on desc);
create index if not exists transactions_account_idx
  on public.transactions(account_id, occurred_on desc);
create index if not exists transactions_category_idx
  on public.transactions(category_id);
create index if not exists transactions_beneficiary_idx
  on public.transactions(beneficiary_id);
create index if not exists transactions_merchant_trgm
  on public.transactions using gin (merchant_clean public.gin_trgm_ops);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.tg_set_updated_at();

-- ---------- transaction_tags (M:N) ----------------------------------
create table if not exists public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id         uuid not null references public.tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

-- ---------- staged draft rows (review screen) -----------------------
-- Rule engine writes its proposed classification here. The user
-- approves on the "Onay" screen, which materializes rows into
-- `transactions`. This is the "Gözetimli Otomasyon" surface.
create table if not exists public.transaction_drafts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  import_id           uuid not null references public.statement_imports(id) on delete cascade,
  account_id          uuid not null references public.accounts(id) on delete cascade,
  raw                 jsonb not null,             -- as parsed from file
  occurred_on         date not null,
  amount              numeric(18,2) not null,
  direction           txn_direction not null,
  currency            text not null default 'TRY',
  merchant_raw        text,
  merchant_clean      text,
  suggested_category_id    uuid references public.categories(id) on delete set null,
  suggested_beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  suggested_is_transfer    boolean not null default false,
  suggested_counter_account_id uuid references public.accounts(id) on delete set null,
  suggested_installment_total  smallint,
  matched_rule_id     uuid,                       -- FK added in 0004
  confidence          numeric(5,2),               -- 0..100
  decision            text not null default 'pending'
                      check (decision in ('pending','accept','edit','ignore')),
  hash_dedupe         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists drafts_user_import_idx
  on public.transaction_drafts(user_id, import_id);
create index if not exists drafts_decision_idx
  on public.transaction_drafts(decision);

drop trigger if exists drafts_set_updated_at on public.transaction_drafts;
create trigger drafts_set_updated_at
  before update on public.transaction_drafts
  for each row execute function public.tg_set_updated_at();

-- ---------- recurring schedules (Maaş, Kira, abonelikler) -----------
create table if not exists public.recurring_schedules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid references public.accounts(id) on delete set null,
  name            text not null,
  cadence         text not null check (cadence in ('weekly','monthly','quarterly','yearly','irregular')),
  day_of_month    smallint check (day_of_month between 1 and 31),
  direction       txn_direction not null,
  amount          numeric(18,2),
  currency        text not null default 'TRY',
  category_id     uuid references public.categories(id) on delete set null,
  beneficiary_id  uuid references public.beneficiaries(id) on delete set null,
  starts_on       date,
  ends_on         date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists recurring_set_updated_at on public.recurring_schedules;
create trigger recurring_set_updated_at
  before update on public.recurring_schedules
  for each row execute function public.tg_set_updated_at();

-- ---------- budgets (enflasyonist bütçe tavanları) ------------------
create table if not exists public.budgets (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  category_id        uuid references public.categories(id) on delete cascade,
  beneficiary_id     uuid references public.beneficiaries(id) on delete cascade,
  period_year        smallint not null,
  period_month       smallint check (period_month between 1 and 12),  -- null = annual
  cap_amount_try     numeric(18,2) not null,
  inflation_factor   numeric(6,4),   -- applied if generated from previous period
  source             text default 'manual',  -- 'manual' | 'inflated_from_prior'
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists budgets_unique_period
  on public.budgets(user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'),
                    coalesce(beneficiary_id, '00000000-0000-0000-0000-000000000000'),
                    period_year, coalesce(period_month, 0));

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.tg_set_updated_at();

-- FILE: supabase/migrations/0004_classification_rules.sql
-- =====================================================================
-- Migration 0004: Classification rule engine
-- =====================================================================
-- Rules let the user teach the system that "A101 *" -> Market,
-- card ending 1023 -> Ahmet Burak, "Cep Şube Ödeme" -> transfer, etc.
-- Rules are user-scoped and ordered; first match wins.
-- =====================================================================

create table if not exists public.classification_rules (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  priority            int not null default 100,    -- lower = evaluated first
  is_enabled          boolean not null default true,
  --------------------------------------------------------------------
  -- matchers (all non-null are ANDed together; comma-free, simple)
  --------------------------------------------------------------------
  match_account_id    uuid references public.accounts(id) on delete cascade,
  match_card_last4    text,
  match_direction     txn_direction,
  match_min_amount    numeric(18,2),
  match_max_amount    numeric(18,2),
  match_merchant_ilike  text,   -- "%A101%"
  match_description_ilike text,
  match_regex         text,     -- POSIX regex against merchant_raw
  --------------------------------------------------------------------
  -- actions
  --------------------------------------------------------------------
  set_category_id     uuid references public.categories(id) on delete set null,
  set_beneficiary_id  uuid references public.beneficiaries(id) on delete set null,
  set_is_transfer     boolean,
  set_counter_account_id uuid references public.accounts(id) on delete set null,
  set_installment_total smallint,
  set_ignore          boolean not null default false,
  set_tag_ids         uuid[],
  confidence          numeric(5,2) not null default 95.0,
  --------------------------------------------------------------------
  hit_count           int not null default 0,
  last_hit_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists rules_user_priority_idx
  on public.classification_rules(user_id, priority);

drop trigger if exists rules_set_updated_at on public.classification_rules;
create trigger rules_set_updated_at
  before update on public.classification_rules
  for each row execute function public.tg_set_updated_at();

-- Late-bind the FK from drafts to rules now that the table exists.
alter table public.transaction_drafts
  drop constraint if exists transaction_drafts_matched_rule_fk;
alter table public.transaction_drafts
  add constraint transaction_drafts_matched_rule_fk
  foreign key (matched_rule_id)
  references public.classification_rules(id)
  on delete set null;

-- ---------- merchant canonical map ----------------------------------
-- Optional global "A101 GULBAHCE" -> "A101" cleanup table per user.
create table if not exists public.merchant_aliases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  pattern       text not null,    -- ilike pattern
  canonical     text not null,
  created_at    timestamptz not null default now(),
  unique (user_id, pattern)
);

-- FILE: supabase/migrations/0005_wealth.sql
-- =====================================================================
-- Migration 0005: Wealth - assets, trades, holdings, price history
-- =====================================================================

-- ---------- assets (instrument master) -------------------------------
-- One row per tradable instrument. Symbol is the canonical identifier;
-- BIST tickers stored as "ASELS", "THYAO"; FX as "USDTRY", "EURTRY";
-- metals "XAU", crypto "BTC", "ETH".
create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  symbol        text not null,
  name          text not null,
  asset_class   asset_class not null,
  currency      text not null default 'TRY',
  exchange      text,            -- 'BIST', 'NASDAQ', ''
  sector        text,            -- BIST sector code
  isin          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (symbol, asset_class)
);

create index if not exists assets_class_idx on public.assets(asset_class);
create index if not exists assets_symbol_trgm on public.assets using gin (symbol public.gin_trgm_ops);

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.tg_set_updated_at();

-- ---------- trades (executed orders) --------------------------------
create table if not exists public.trades (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  portfolio_id        uuid not null references public.portfolios(id) on delete cascade,
  custody_id          uuid references public.custody_locations(id) on delete set null,
  account_id          uuid references public.accounts(id) on delete set null,
  asset_id            uuid not null references public.assets(id) on delete restrict,
  side                trade_side not null,
  executed_at         timestamptz not null,
  quantity            numeric(24,8) not null check (quantity > 0),
  price               numeric(24,8) not null check (price >= 0),
  currency            text not null default 'TRY',
  fx_rate_to_try      numeric(18,6),
  fees                numeric(18,4) not null default 0,
  taxes               numeric(18,4) not null default 0,
  notes               text,
  external_ref        text,                -- broker order id
  linked_txn_id       uuid references public.transactions(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists trades_user_asset_idx
  on public.trades(user_id, asset_id, executed_at);
create index if not exists trades_portfolio_idx
  on public.trades(portfolio_id, executed_at);

drop trigger if exists trades_set_updated_at on public.trades;
create trigger trades_set_updated_at
  before update on public.trades
  for each row execute function public.tg_set_updated_at();

-- ---------- realized lots (FIFO/WAC ledger) -------------------------
-- Populated by a service-side job whenever a sell happens; records
-- which buy lots were closed and the realized P/L. Used by reports.
create table if not exists public.realized_lots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  portfolio_id        uuid not null references public.portfolios(id) on delete cascade,
  asset_id            uuid not null references public.assets(id) on delete restrict,
  sell_trade_id       uuid not null references public.trades(id) on delete cascade,
  buy_trade_id        uuid references public.trades(id) on delete set null,
  closed_at           timestamptz not null,
  quantity            numeric(24,8) not null,
  cost_basis_try      numeric(18,4) not null,
  proceeds_try        numeric(18,4) not null,
  realized_pnl_try    numeric(18,4) generated always as (proceeds_try - cost_basis_try) stored,
  created_at          timestamptz not null default now()
);

create index if not exists realized_lots_user_idx
  on public.realized_lots(user_id, closed_at desc);

-- ---------- price snapshots -----------------------------------------
-- Daily close prices used to mark portfolio to market and to render
-- the "reel getiri" overlays. ETL writes here.
create table if not exists public.price_snapshots (
  asset_id      uuid not null references public.assets(id) on delete cascade,
  as_of         date not null,
  open          numeric(24,8),
  high          numeric(24,8),
  low           numeric(24,8),
  close         numeric(24,8) not null,
  volume        numeric(24,2),
  source        text default 'borsapy',
  created_at    timestamptz not null default now(),
  primary key (asset_id, as_of)
);

create index if not exists price_snapshots_asof_idx
  on public.price_snapshots(as_of desc);

-- ---------- benchmark series (CPI, USDTRY, EURTRY, XAUTRY, XU100) ---
create table if not exists public.benchmark_series (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,    -- 'CPI_TR', 'USDTRY', 'EURTRY', 'XAUTRY', 'XU100'
  name          text not null,
  unit          text,                    -- '%', 'TRY', 'idx'
  source        text                     -- 'TCMB', 'borsapy', ...
);

create table if not exists public.benchmark_points (
  series_id     uuid not null references public.benchmark_series(id) on delete cascade,
  as_of         date not null,
  value         numeric(24,8) not null,
  primary key (series_id, as_of)
);

-- ---------- daily holding snapshots (materialized for reports) ------
-- Optional; populated nightly. Lets the dashboard render fast without
-- recomputing WAC from millions of trades each request.
create table if not exists public.holding_snapshots (
  user_id           uuid not null references auth.users(id) on delete cascade,
  portfolio_id      uuid not null references public.portfolios(id) on delete cascade,
  asset_id          uuid not null references public.assets(id) on delete cascade,
  as_of             date not null,
  quantity          numeric(24,8) not null,
  wac_try           numeric(24,8) not null,
  market_price_try  numeric(24,8),
  market_value_try  numeric(18,4),
  unrealized_pnl_try numeric(18,4),
  primary key (user_id, portfolio_id, asset_id, as_of)
);

-- FILE: supabase/migrations/0006_screener.sql
-- =====================================================================
-- Migration 0006: Algorithmic screener (technical + fundamental + catalysts)
-- =====================================================================
-- These tables are populated by the Python ETL (borsapy + KAP) on
-- daily/quarterly cadences. The Next.js app is read-only against them.
-- =====================================================================

-- ---------- technical scans (daily) ---------------------------------
create table if not exists public.technical_scans (
  asset_id            uuid not null references public.assets(id) on delete cascade,
  as_of               date not null,
  close               numeric(24,8) not null,
  sma_50              numeric(24,8),
  sma_150             numeric(24,8),
  sma_200             numeric(24,8),
  rs_rating           numeric(6,2),     -- Mansfield RS, 0..100
  rs_sector           numeric(6,2),     -- sector vs XU100
  roc_63              numeric(8,4),     -- 3M momentum
  roc_252             numeric(8,4),     -- 12M momentum
  avg_volume_try_30d  numeric(24,2),
  vol_surge_ratio     numeric(8,4),     -- today vs 30d avg
  pct_from_52w_high   numeric(8,4),     -- negative means below high
  breakout_flag       boolean default false,
  passes_stage1       boolean default false,
  composite_score     numeric(6,2),     -- 0..100
  computed_at         timestamptz not null default now(),
  primary key (asset_id, as_of)
);

create index if not exists tech_scans_score_idx
  on public.technical_scans(as_of desc, composite_score desc);

-- ---------- fundamental data (quarterly) ----------------------------
create table if not exists public.fundamental_data (
  asset_id            uuid not null references public.assets(id) on delete cascade,
  period              text not null,       -- '2025Q3'
  reported_at         date,
  revenue             numeric(24,2),
  ebitda              numeric(24,2),
  net_income          numeric(24,2),
  free_cashflow       numeric(24,2),
  total_debt          numeric(24,2),
  cash                numeric(24,2),
  equity              numeric(24,2),
  net_debt_ebitda     numeric(8,4),
  roe                 numeric(8,4),
  pe                  numeric(8,4),
  pb                  numeric(8,4),
  revenue_growth_yoy  numeric(8,4),
  earnings_growth_yoy numeric(8,4),
  passes_stage2       boolean default false,
  fundamental_score   numeric(6,2),
  computed_at         timestamptz not null default now(),
  primary key (asset_id, period)
);

-- ---------- composite ranking (joins stage1 + stage2 + catalysts) ---
create table if not exists public.screener_ranks (
  asset_id            uuid not null references public.assets(id) on delete cascade,
  as_of               date not null,
  technical_score     numeric(6,2),
  fundamental_score   numeric(6,2),
  catalyst_score      numeric(6,2),
  composite_score     numeric(6,2) not null,
  tier                scan_tier not null,
  badges              text[] not null default '{}',  -- ['breakout','vol_surge','usd_confirm']
  notes               text,
  computed_at         timestamptz not null default now(),
  primary key (asset_id, as_of)
);

create index if not exists screener_ranks_top_idx
  on public.screener_ranks(as_of desc, composite_score desc);

-- ---------- catalyst events (KAP + LLM summaries) -------------------
create table if not exists public.catalyst_events (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid not null references public.assets(id) on delete cascade,
  occurred_at     timestamptz not null,
  source          text not null default 'KAP',   -- 'KAP' | 'twitter' | 'manual'
  external_id     text,
  title           text not null,
  raw_text        text,
  summary         text,                          -- LLM TR summary
  polarity        catalyst_polarity not null default 'neutral',
  llm_model       text,
  llm_at          timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists catalysts_asset_time_idx
  on public.catalyst_events(asset_id, occurred_at desc);
create unique index if not exists catalysts_unique_external
  on public.catalyst_events(source, external_id)
  where external_id is not null;

-- ---------- user watchlists & screener prefs ------------------------
create table if not exists public.watchlists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.watchlist_items (
  watchlist_id  uuid not null references public.watchlists(id) on delete cascade,
  asset_id      uuid not null references public.assets(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (watchlist_id, asset_id)
);

-- ---------- screener job runs (audit) -------------------------------
create table if not exists public.scan_runs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('stage1','stage2','catalyst','composite')),
  started_at    timestamptz not null,
  finished_at   timestamptz,
  status        text not null check (status in ('running','ok','failed')),
  rows_written  int,
  error         text
);

-- FILE: supabase/migrations/0007_rls_policies.sql
-- =====================================================================
-- Migration 0007: Row-Level Security
-- =====================================================================
-- Every user-scoped table gets RLS = on with a single policy:
-- "auth.uid() = user_id". Reference data (assets, price_snapshots,
-- technical_scans, fundamental_data, screener_ranks, catalyst_events,
-- benchmark_*) is readable by every authenticated user but writable
-- only by service_role (the Python ETL).
-- =====================================================================

-- ---------- helper: enable RLS + standard owner policy --------------

create or replace function public.fn_apply_owner_rls(tbl regclass)
returns void
language plpgsql
as $$
declare
  tname text := tbl::text;
begin
  execute format('alter table %s enable row level security;', tname);
  execute format(
    'drop policy if exists %I on %s;',
    tname || '_owner_select', tname);
  execute format(
    'create policy %I on %s for select to authenticated using (user_id = auth.uid());',
    tname || '_owner_select', tname);
  execute format(
    'drop policy if exists %I on %s;',
    tname || '_owner_modify', tname);
  execute format(
    'create policy %I on %s for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());',
    tname || '_owner_modify', tname);
end;
$$;

-- ---------- apply to all user-scoped tables -------------------------

select public.fn_apply_owner_rls('public.portfolios');
select public.fn_apply_owner_rls('public.beneficiaries');
select public.fn_apply_owner_rls('public.categories');
select public.fn_apply_owner_rls('public.custody_locations');
select public.fn_apply_owner_rls('public.tags');
select public.fn_apply_owner_rls('public.accounts');
select public.fn_apply_owner_rls('public.statement_imports');
select public.fn_apply_owner_rls('public.transactions');
select public.fn_apply_owner_rls('public.transaction_drafts');
select public.fn_apply_owner_rls('public.recurring_schedules');
select public.fn_apply_owner_rls('public.budgets');
select public.fn_apply_owner_rls('public.classification_rules');
select public.fn_apply_owner_rls('public.merchant_aliases');
select public.fn_apply_owner_rls('public.trades');
select public.fn_apply_owner_rls('public.realized_lots');
select public.fn_apply_owner_rls('public.holding_snapshots');
select public.fn_apply_owner_rls('public.watchlists');

-- transaction_tags has no user_id column; secure via the parent txn.
alter table public.transaction_tags enable row level security;
drop policy if exists transaction_tags_owner on public.transaction_tags;
create policy transaction_tags_owner on public.transaction_tags
  for all to authenticated
  using (exists (
    select 1 from public.transactions t
    where t.id = transaction_tags.transaction_id
      and t.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.transactions t
    where t.id = transaction_tags.transaction_id
      and t.user_id = auth.uid()
  ));

-- watchlist_items secured via parent watchlist
alter table public.watchlist_items enable row level security;
drop policy if exists watchlist_items_owner on public.watchlist_items;
create policy watchlist_items_owner on public.watchlist_items
  for all to authenticated
  using (exists (
    select 1 from public.watchlists w
    where w.id = watchlist_items.watchlist_id
      and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.watchlists w
    where w.id = watchlist_items.watchlist_id
      and w.user_id = auth.uid()
  ));

-- ---------- reference / market data tables --------------------------
-- Readable by any authenticated user; service_role retains write access.

alter table public.assets enable row level security;
drop policy if exists assets_read on public.assets;
create policy assets_read on public.assets
  for select to authenticated using (true);

alter table public.price_snapshots enable row level security;
drop policy if exists price_snapshots_read on public.price_snapshots;
create policy price_snapshots_read on public.price_snapshots
  for select to authenticated using (true);

alter table public.benchmark_series enable row level security;
drop policy if exists benchmark_series_read on public.benchmark_series;
create policy benchmark_series_read on public.benchmark_series
  for select to authenticated using (true);

alter table public.benchmark_points enable row level security;
drop policy if exists benchmark_points_read on public.benchmark_points;
create policy benchmark_points_read on public.benchmark_points
  for select to authenticated using (true);

alter table public.technical_scans enable row level security;
drop policy if exists technical_scans_read on public.technical_scans;
create policy technical_scans_read on public.technical_scans
  for select to authenticated using (true);

alter table public.fundamental_data enable row level security;
drop policy if exists fundamental_data_read on public.fundamental_data;
create policy fundamental_data_read on public.fundamental_data
  for select to authenticated using (true);

alter table public.screener_ranks enable row level security;
drop policy if exists screener_ranks_read on public.screener_ranks;
create policy screener_ranks_read on public.screener_ranks
  for select to authenticated using (true);

alter table public.catalyst_events enable row level security;
drop policy if exists catalyst_events_read on public.catalyst_events;
create policy catalyst_events_read on public.catalyst_events
  for select to authenticated using (true);

alter table public.scan_runs enable row level security;
drop policy if exists scan_runs_read on public.scan_runs;
create policy scan_runs_read on public.scan_runs
  for select to authenticated using (true);

-- FILE: supabase/migrations/0008_views_and_helpers.sql
-- =====================================================================
-- Migration 0008: Reporting views and computed helpers
-- =====================================================================
-- All views are owner-scoped via the underlying RLS on base tables.
-- =====================================================================

-- ---------- v_account_balances --------------------------------------
create or replace view public.v_account_balances as
select
  a.id              as account_id,
  a.user_id,
  a.name,
  a.account_type,
  a.currency,
  a.opening_balance
    + coalesce(sum(case when t.direction = 'inflow'  then t.amount
                        when t.direction = 'outflow' then -t.amount
                        else 0 end), 0)
    + coalesce(sum(case when t.is_transfer and t.counter_account_id = a.id then t.amount
                        else 0 end), 0)
    as balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id
  and t.status = 'committed'
group by a.id;

-- ---------- v_monthly_cashflow --------------------------------------
create or replace view public.v_monthly_cashflow as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as period,
  t.direction,
  t.category_id,
  t.beneficiary_id,
  sum(t.amount_try) as total_try,
  count(*)          as txn_count
from public.transactions t
where t.status = 'committed' and t.is_transfer = false
group by t.user_id, period, t.direction, t.category_id, t.beneficiary_id;

-- ---------- v_beneficiary_spend -------------------------------------
create or replace view public.v_beneficiary_spend as
select
  t.user_id,
  b.id   as beneficiary_id,
  b.name as beneficiary_name,
  date_trunc('month', t.occurred_on)::date as period,
  sum(t.amount_try) as total_try
from public.transactions t
join public.beneficiaries b on b.id = t.beneficiary_id
where t.status = 'committed'
  and t.direction = 'outflow'
  and t.is_transfer = false
group by t.user_id, b.id, b.name, period;

-- ---------- v_holdings_wac (real-time WAC from trade log) -----------
create or replace view public.v_holdings_wac as
with lots as (
  select
    tr.user_id,
    tr.portfolio_id,
    tr.asset_id,
    tr.side,
    tr.quantity,
    tr.price,
    tr.currency,
    coalesce(tr.fx_rate_to_try, 1) as fx,
    (tr.price * coalesce(case when tr.currency='TRY' then 1 else tr.fx_rate_to_try end, 1)) as unit_try
  from public.trades tr
),
agg as (
  select
    user_id, portfolio_id, asset_id,
    sum(case when side='buy'  then quantity else -quantity end) as quantity,
    -- cost basis from buys only (WAC denominator excludes sells; sells consume basis)
    sum(case when side='buy'  then quantity * unit_try else 0 end) as gross_cost_try,
    sum(case when side='buy'  then quantity else 0 end) as bought_qty,
    sum(case when side='sell' then quantity else 0 end) as sold_qty
  from lots
  group by user_id, portfolio_id, asset_id
)
select
  a.user_id,
  a.portfolio_id,
  a.asset_id,
  a.quantity,
  case
    when a.bought_qty > 0
    then a.gross_cost_try / a.bought_qty
    else 0
  end as wac_try,
  case
    when a.bought_qty > 0
    then (a.gross_cost_try / a.bought_qty) * a.quantity
    else 0
  end as cost_basis_try
from agg a
where a.quantity > 0;

-- ---------- v_portfolio_marked_to_market ----------------------------
create or replace view public.v_portfolio_marked_to_market as
select
  h.user_id,
  h.portfolio_id,
  h.asset_id,
  ast.symbol,
  ast.name,
  ast.asset_class,
  h.quantity,
  h.wac_try,
  h.cost_basis_try,
  ps.close                         as last_price,
  ps.as_of                         as priced_at,
  (h.quantity * coalesce(ps.close, h.wac_try)) as market_value_try,
  (h.quantity * coalesce(ps.close, h.wac_try) - h.cost_basis_try) as unrealized_pnl_try,
  case
    when h.cost_basis_try > 0
    then (h.quantity * coalesce(ps.close, h.wac_try) - h.cost_basis_try) / h.cost_basis_try
    else null
  end as unrealized_pnl_pct
from public.v_holdings_wac h
join public.assets ast on ast.id = h.asset_id
left join lateral (
  select close, as_of
  from public.price_snapshots
  where asset_id = h.asset_id
  order by as_of desc
  limit 1
) ps on true;

-- ---------- v_screener_today ----------------------------------------
create or replace view public.v_screener_today as
select
  sr.as_of,
  sr.tier,
  sr.composite_score,
  sr.technical_score,
  sr.fundamental_score,
  sr.catalyst_score,
  sr.badges,
  a.symbol,
  a.name,
  a.sector,
  ts.close,
  ts.rs_rating,
  ts.vol_surge_ratio,
  ts.pct_from_52w_high,
  ts.breakout_flag
from public.screener_ranks sr
join public.assets a on a.id = sr.asset_id
left join public.technical_scans ts
  on ts.asset_id = sr.asset_id and ts.as_of = sr.as_of
where sr.as_of = (select max(as_of) from public.screener_ranks);

-- FILE: supabase/migrations/0009_beneficiaries_role.sql
-- =====================================================================
-- Migration 0009: beneficiaries.role kolonu
-- =====================================================================
-- UI'daki "Ben / Oğul / Ebeveyn / Eş" ayrımı için. Default 'other'.

alter table public.beneficiaries
  add column if not exists role text
  check (role in ('self', 'household', 'son', 'daughter', 'parent', 'spouse', 'other'))
  default 'other';

create index if not exists beneficiaries_role_idx on public.beneficiaries(user_id, role);

-- FILE: supabase/migrations/0010_accounts_ui_fields.sql
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

-- FILE: supabase/migrations/0011_trades_beneficiary.sql
-- =====================================================================
-- Migration 0011: trades tablosuna beneficiary_id (sahiplik)
-- =====================================================================
-- Sample TRADES'te "ben" alanı (Ben / Ahmet Burak / Salih) vardı; DB
-- tarafında trades.beneficiary_id şu ana kadar yoktu. Portföy bazlı
-- ayrım yerine her trade'i bir kişiye atayabilelim.
-- =====================================================================

alter table public.trades
  add column if not exists beneficiary_id uuid references public.beneficiaries(id) on delete set null;

create index if not exists trades_beneficiary_idx on public.trades(beneficiary_id);

-- v_holdings_wac'a beneficiary kırılımı eklemiyoruz şimdilik; sayfa
-- aggregate'i client-side filtreleyecek.

-- FILE: supabase/migrations/0012_wealth_snapshots.sql
-- =====================================================================
-- Migration 0012: wealth_snapshots — yıl/dönem sonu toplam servet kayıtları
-- =====================================================================

create table if not exists public.wealth_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  period      text not null,   -- '2022', '2023-12', '2026-05-17' gibi
  total_try   numeric(18,2) not null,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, period)
);

create index if not exists wealth_snapshots_user_period_idx
  on public.wealth_snapshots(user_id, period);

alter table public.wealth_snapshots enable row level security;
drop policy if exists ws_own_read on public.wealth_snapshots;
create policy ws_own_read on public.wealth_snapshots
  for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ws_own_write on public.wealth_snapshots;
create policy ws_own_write on public.wealth_snapshots
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- FILE: supabase/migrations/0013_assets_external_url.sql
-- =====================================================================
-- Migration 0013: assets.external_url — sembol başına dış kaynak linki
-- =====================================================================
-- Investing.com gibi dış sitelerde sembol slug'ları standart değil
-- (TUPRS → tupras, KLKIM → kalekim-kimyevi-madd vs.). Asset master'a
-- url alanı ekliyoruz; UI'da sembole tıklayınca yeni sekmede açar.

alter table public.assets
  add column if not exists external_url text;

-- Kullanıcının verdiği 14 sembol için investing.com TR linkleri
update public.assets set external_url = 'https://tr.investing.com/equities/tupras'                                  where symbol = 'TUPRS' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/aselsan'                                 where symbol = 'ASELS' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/kalekim-kimyevi-madd'                    where symbol = 'KLKIM' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/gubre-fabrik.'                           where symbol = 'GUBRF' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/koza-altin'                              where symbol = 'TRALT' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/europower-enerji-ve-otomasyon'           where symbol = 'EUPWR' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/tekfen-holding'                          where symbol = 'TKFEN' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/mia-teknoloji-as'                        where symbol = 'MIATK' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/yeo-teknoloji-enerji-ve-endustri-as'     where symbol = 'YEOTK' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/turkcell'                                where symbol = 'TCELL' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/kardemir-(d)'                            where symbol = 'KRDMD' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/astor-enerji-as'                         where symbol = 'ASTOR' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/turk-hava-yollari'                       where symbol = 'THYAO' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/enerjisa-enerji'                         where symbol = 'ENJSA' and asset_class = 'equity_tr';

-- FILE: supabase/migrations/0014_daily_snapshots.sql
-- =====================================================================
-- Migration 0014: daily_snapshots — günlük servet snapshot'ları
-- =====================================================================
-- Her gün için kullanıcının toplam serveti + varlık sınıfı kırılımı +
-- kişi-bazlı hisse MV. Stacked area ve kişi-bazlı tarihsel grafikler
-- için. Page-load tetikli capture: o gün için satır yoksa eklenir.

create table if not exists public.daily_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  snapshot_date   date not null,
  -- Toplam servet
  total_wealth    numeric(18,2) not null default 0,
  -- Varlık sınıfı bazlı (TRY)
  cash_try        numeric(18,2) not null default 0,
  fx_try          numeric(18,2) not null default 0,
  metal_try       numeric(18,2) not null default 0,
  equity_mv       numeric(18,2) not null default 0,
  crypto_try      numeric(18,2) not null default 0,
  -- Kişi-bazlı hisse MV (beneficiary_id → tutar JSON)
  -- ör. {"<uuid-mehmet>": 2405330, "<uuid-ab>": 294009, ...}
  equity_by_person jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists daily_snapshots_user_date_idx
  on public.daily_snapshots(user_id, snapshot_date desc);

alter table public.daily_snapshots enable row level security;

drop policy if exists ds_own_read on public.daily_snapshots;
create policy ds_own_read on public.daily_snapshots
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists ds_own_write on public.daily_snapshots;
create policy ds_own_write on public.daily_snapshots
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- FILE: supabase/seed/0001_default_dimensions.sql
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

-- FILE: supabase/seed/0002_reference_data.sql
-- =====================================================================
-- Reference data shared across all users (run as service_role).
-- =====================================================================

-- ---------- benchmark series ----------------------------------------
insert into public.benchmark_series (code, name, unit, source) values
  ('CPI_TR',  'TÜFE (Yıllık %)',     '%',   'TCMB'),
  ('USDTRY',  'USD/TRY',             'TRY', 'TCMB'),
  ('EURTRY',  'EUR/TRY',             'TRY', 'TCMB'),
  ('XAUTRY',  'Gram Altın',          'TRY', 'borsapy'),
  ('XU100',   'BIST 100',            'idx', 'borsapy')
on conflict (code) do nothing;

-- ---------- FX & metal assets ---------------------------------------
insert into public.assets (symbol, name, asset_class, currency) values
  ('USDTRY', 'ABD Doları',  'fx',    'TRY'),
  ('EURTRY', 'Euro',        'fx',    'TRY'),
  ('XAU',    'Gram Altın',  'metal', 'TRY')
on conflict (symbol, asset_class) do nothing;

-- ---------- BIST common tickers (seed sample) -----------------------
-- The full list is maintained by the borsapy ETL; this seed keeps
-- the dev environment usable without waiting for the first scan.
insert into public.assets (symbol, name, asset_class, currency, exchange, sector) values
  ('ASELS',  'Aselsan',                 'equity_tr', 'TRY', 'BIST', 'XUSIN'),
  ('THYAO',  'Türk Hava Yolları',       'equity_tr', 'TRY', 'BIST', 'XULAS'),
  ('AKBNK',  'Akbank',                  'equity_tr', 'TRY', 'BIST', 'XBANK'),
  ('GARAN',  'Garanti Bankası',         'equity_tr', 'TRY', 'BIST', 'XBANK'),
  ('ISCTR',  'İş Bankası (C)',          'equity_tr', 'TRY', 'BIST', 'XBANK'),
  ('YKBNK',  'Yapı Kredi',              'equity_tr', 'TRY', 'BIST', 'XBANK'),
  ('TUPRS',  'Tüpraş',                  'equity_tr', 'TRY', 'BIST', 'XKMYA'),
  ('EREGL',  'Ereğli Demir Çelik',      'equity_tr', 'TRY', 'BIST', 'XMANA'),
  ('KCHOL',  'Koç Holding',             'equity_tr', 'TRY', 'BIST', 'XHOLD'),
  ('SAHOL',  'Sabancı Holding',         'equity_tr', 'TRY', 'BIST', 'XHOLD'),
  ('BIMAS',  'BİM Mağazalar',           'equity_tr', 'TRY', 'BIST', 'XGIDA'),
  ('SISE',   'Şişe Cam',                'equity_tr', 'TRY', 'BIST', 'XKMYA'),
  ('PETKM',  'Petkim',                  'equity_tr', 'TRY', 'BIST', 'XKMYA'),
  ('FROTO',  'Ford Otosan',             'equity_tr', 'TRY', 'BIST', 'XUSIN'),
  ('TOASO',  'Tofaş',                   'equity_tr', 'TRY', 'BIST', 'XUSIN'),
  ('ARCLK',  'Arçelik',                 'equity_tr', 'TRY', 'BIST', 'XUSIN'),
  ('BINHO',  '1000 Yatırımlar Holding', 'equity_tr', 'TRY', 'BIST', 'XHOLD'),
  ('ORZAX',  'Orzaks İlaç ve Kimya',    'equity_tr', 'TRY', 'BIST', 'XKMYA'),
  ('SOKE',   'Söke Değirmencilik',      'equity_tr', 'TRY', 'BIST', 'XGIDA'),
  ('ISDMR',  'İskenderun Demir ve Çelik','equity_tr', 'TRY', 'BIST', 'XMANA')
on conflict (symbol, asset_class) do nothing;

-- ---------- common crypto -------------------------------------------
insert into public.assets (symbol, name, asset_class, currency) values
  ('BTC',   'Bitcoin',  'crypto', 'TRY'),
  ('ETH',   'Ethereum', 'crypto', 'TRY'),
  ('SOL',   'Solana',   'crypto', 'TRY')
on conflict (symbol, asset_class) do nothing;
