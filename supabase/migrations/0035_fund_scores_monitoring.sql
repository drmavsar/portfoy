-- =====================================================================
-- Migration 0035: fund_scores ingest log + health view
-- =====================================================================
-- Sprint-4 PR-4: skor refresh cron'unun her çalışmasının özet sonucu.
-- fund_returns_ingest_log paralelinde.
--
-- v_fund_scores_health: her aktif fon × persona için son skor durumu
-- + stale gün sayısı + bileşen tamlığı.
-- =====================================================================

create table if not exists public.fund_scores_ingest_log (
  id                  uuid primary key default gen_random_uuid(),
  ran_at              timestamptz not null default now(),
  duration_ms         int not null,
  processed_funds     int not null,
  processed_personas  int not null,
  upserted            int not null,
  skipped_count       int not null,
  skipped_codes       text[] not null default '{}'::text[],
  error               text,
  triggered_by        text not null default 'cron'
);

create index if not exists fund_scores_ingest_log_ran_at_idx
  on public.fund_scores_ingest_log(ran_at desc);

alter table public.fund_scores_ingest_log enable row level security;
drop policy if exists fund_scores_ingest_log_read on public.fund_scores_ingest_log;
create policy fund_scores_ingest_log_read on public.fund_scores_ingest_log
  for select to authenticated using (true);

-- ---------- v_fund_scores_health ------------------------------------
-- Her aktif fon × persona kombinasyonu için son skor satırı + meta.
-- =====================================================================

create or replace view public.v_fund_scores_health as
with active_funds as (
  select code, investment_universe
  from public.funds
  where is_active = true
),
all_combos as (
  select f.code as fund_code, p.id as persona_id, p.name as persona_name,
         f.investment_universe
  from active_funds f
  cross join public.user_personas p
)
select
  c.fund_code,
  c.persona_id,
  c.persona_name,
  c.investment_universe,
  s.as_of                       as last_as_of,
  s.computed_at                 as last_computed_at,
  s.mehmet_score,
  s.components_used,
  s.warnings,
  case
    when s.as_of is null then null
    else (current_date - s.as_of)
  end                            as days_stale,
  (s.mehmet_score is not null)   as has_mehmet,
  (s.volatility_1y is not null)  as has_volatility,
  (s.max_drawdown_3y is not null) as has_max_drawdown
from all_combos c
left join lateral (
  select *
  from public.fund_scores_cache
  where fund_code = c.fund_code
    and persona_id = c.persona_id
  order by as_of desc
  limit 1
) s on true;
