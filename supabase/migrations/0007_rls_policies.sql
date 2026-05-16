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
