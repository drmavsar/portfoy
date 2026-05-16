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
