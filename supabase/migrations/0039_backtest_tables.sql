-- =====================================================================
-- Migration 0039: backtest tabloları
-- =====================================================================
-- Sprint-5.6 PR-B: Backtest engine sonuçları.
--
-- 3 tablo:
--  1. backtest_runs        — bir run metadata + özet (params + summary jsonb)
--  2. backtest_rebalances  — her rebalance noktasındaki Top N seçimi
--  3. backtest_nav_series  — günlük portfolio + benchmark NAV
--
-- Faz-1: 8 run (Top10 × 3ay × 2 strateji × 4 başlangıç)
-- Faz-2: 96 run (3×4×2×4 matris)
-- =====================================================================

create table if not exists public.backtest_runs (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  params              jsonb not null,             -- BacktestParams
  summary             jsonb not null,             -- BacktestSummary
  final_nav           numeric,
  total_rebalances    int,
  universe_size_avg   int,
  duration_ms         int,
  ok                  boolean not null default false,
  error               text
);

create index if not exists backtest_runs_params_idx on public.backtest_runs using gin (params);
create index if not exists backtest_runs_created_idx on public.backtest_runs (created_at desc);
create index if not exists backtest_runs_ok_idx on public.backtest_runs (ok, created_at desc);

alter table public.backtest_runs enable row level security;
drop policy if exists backtest_runs_read on public.backtest_runs;
create policy backtest_runs_read on public.backtest_runs for select to authenticated using (true);

-- ---------- backtest_rebalances --------------------------------------
create table if not exists public.backtest_rebalances (
  run_id              uuid not null references public.backtest_runs(id) on delete cascade,
  rebalance_date      date not null,
  universe_size       int,
  top_n_codes         text[],
  top_n_scores        int[],
  top_n_weights       numeric[],
  portfolio_nav       numeric,
  turnover            numeric,                    -- 0-1
  overlap_with_prev   numeric,                    -- 0-1, ilk rebalance için null
  primary key (run_id, rebalance_date)
);

create index if not exists backtest_rebalances_date_idx on public.backtest_rebalances (rebalance_date desc);

alter table public.backtest_rebalances enable row level security;
drop policy if exists backtest_rebalances_read on public.backtest_rebalances;
create policy backtest_rebalances_read on public.backtest_rebalances for select to authenticated using (true);

-- ---------- backtest_nav_series --------------------------------------
create table if not exists public.backtest_nav_series (
  run_id                  uuid not null references public.backtest_runs(id) on delete cascade,
  as_of                   date not null,
  portfolio_nav           numeric not null,       -- 100 base
  -- Benchmark snapshots (yüklendikçe dolar; null kabul edilir):
  xu100_nav               numeric,                -- placeholder; benchmark backfill sonrası
  xau_nav                 numeric,                -- placeholder
  usd_nav                 numeric,
  eur_nav                 numeric,
  cpi_index               numeric,
  kat_fon_sepeti_nav      numeric,
  kat_kategori_median_nav numeric,
  primary key (run_id, as_of)
);

create index if not exists backtest_nav_series_date_idx on public.backtest_nav_series (run_id, as_of);

alter table public.backtest_nav_series enable row level security;
drop policy if exists backtest_nav_series_read on public.backtest_nav_series;
create policy backtest_nav_series_read on public.backtest_nav_series for select to authenticated using (true);
