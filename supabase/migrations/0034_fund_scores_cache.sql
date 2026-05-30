-- =====================================================================
-- Migration 0034: fund_scores_cache + ingest log + health view
-- =====================================================================
-- Sprint-4 PR-3: Risk + bileşen skorları + Mehmet Score cache.
--
-- PK = (fund_code, as_of, persona_id) — her persona aynı fon için farklı
-- Mehmet Score üretir.
--
-- Ham metrikler (volatility, max_drawdown, sharpe, korelasyon) + 0-100
-- normalize skorlar + kompozit mehmet_score.
--
-- BIST/altın korelasyonu Sprint-5'e ertelendi; bu PR'da
-- bist_source/gold_source default 'default_from_universe' olarak işaretlenir.
-- =====================================================================

create table if not exists public.fund_scores_cache (
  fund_code                    text not null references public.funds(code) on delete cascade,
  as_of                        date not null,
  persona_id                   uuid not null references public.user_personas(id) on delete cascade,

  -- Ham metrikler
  volatility_1y                numeric(10,6),
  max_drawdown_3y              numeric(10,6),
  downside_volatility_1y       numeric(10,6),
  sharpe_like_1y               numeric(10,6),
  bist_correlation_1y          numeric(6,4),
  gold_correlation_1y          numeric(6,4),
  bist_source                  text default 'default_from_universe',
  gold_source                  text default 'default_from_universe',

  -- 0-100 normalize bileşen skorları
  inflation_protection_score   int check (inflation_protection_score between 0 and 100),
  tax_advantage_score          int check (tax_advantage_score between 0 and 100),
  normalized_risk_score        int check (normalized_risk_score between 0 and 100),
  long_term_performance_score  int check (long_term_performance_score between 0 and 100),
  diversification_score        int check (diversification_score between 0 and 100),
  bist_dependency_score        int check (bist_dependency_score between 0 and 100),
  gold_dependency_score        int check (gold_dependency_score between 0 and 100),

  -- Kompozit
  mehmet_score                 int check (mehmet_score between 0 and 100),
  components_used              int,

  -- Meta
  computed_at                  timestamptz not null default now(),
  warnings                     text[] not null default '{}'::text[],

  primary key (fund_code, as_of, persona_id)
);

create index if not exists fund_scores_cache_persona_asof_idx
  on public.fund_scores_cache(persona_id, as_of desc);
create index if not exists fund_scores_cache_mehmet_idx
  on public.fund_scores_cache(persona_id, mehmet_score desc nulls last);
create index if not exists fund_scores_cache_fund_recent_idx
  on public.fund_scores_cache(fund_code, persona_id, as_of desc);

alter table public.fund_scores_cache enable row level security;
drop policy if exists fund_scores_cache_read on public.fund_scores_cache;
create policy fund_scores_cache_read on public.fund_scores_cache
  for select to authenticated using (true);

-- ---------- v_fund_scores_latest ------------------------------------
create or replace view public.v_fund_scores_latest as
select distinct on (fund_code, persona_id) *
from public.fund_scores_cache
order by fund_code, persona_id, as_of desc;
