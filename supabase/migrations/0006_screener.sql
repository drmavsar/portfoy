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
