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
