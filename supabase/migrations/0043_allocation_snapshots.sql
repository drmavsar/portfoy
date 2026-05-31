-- =====================================================================
-- Migration 0043: allocation_snapshots
-- =====================================================================
-- Sprint-6 PR-G: kullanıcı "Snapshot Kaydet" dediğinde computeAllocation
-- çıktısının tam görüntüsünü saklar. Audit/history; aynı gün ikinci
-- kayıt UPSERT ile mevcut snapshot'ı günceller (kullanıcı gün içinde
-- trade ekleyebilir).
--
-- UNIQUE(user_id, persona_id, portfolio_id, snapshot_date) → gün-bazlı
-- tek snapshot garantisi.
-- =====================================================================

create table if not exists public.allocation_snapshots (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  persona_id               uuid not null references public.user_personas(id) on delete cascade,
  portfolio_id             uuid not null references public.portfolios(id) on delete cascade,

  -- Idempotency anahtarı: aynı gün tek snapshot
  snapshot_date            date not null,
  as_of                    timestamptz not null default now(),

  -- Parametre snapshot (Sprint-7'de değişebilecek defaults için kalıcı)
  top_n                    int not null,
  rebalance_days           int not null,
  strategy                 text not null,
  rebalance_band_pct       numeric(5,4) not null,

  total_market_value_try   numeric(18,4) not null default 0,

  -- Tam çıktı snapshot (jsonb)
  target_funds             jsonb not null default '[]'::jsonb,
  current_positions        jsonb not null default '[]'::jsonb,
  diffs                    jsonb not null default '[]'::jsonb,
  sell_dry_runs            jsonb not null default '[]'::jsonb,
  summary                  jsonb not null default '{}'::jsonb,
  data_quality_flags       jsonb not null default '[]'::jsonb,

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint allocation_snapshots_unique_per_day
    unique (user_id, persona_id, portfolio_id, snapshot_date)
);

create index if not exists allocation_snapshots_user_persona_date_idx
  on public.allocation_snapshots(user_id, persona_id, snapshot_date desc);

create index if not exists allocation_snapshots_portfolio_idx
  on public.allocation_snapshots(portfolio_id, snapshot_date desc);

-- updated_at trigger (mevcut helper)
drop trigger if exists allocation_snapshots_set_updated_at on public.allocation_snapshots;
create trigger allocation_snapshots_set_updated_at
  before update on public.allocation_snapshots
  for each row execute function public.tg_set_updated_at();

-- RLS: owner-only
select public.fn_apply_owner_rls('public.allocation_snapshots');

comment on table public.allocation_snapshots is
  'Allocation computeAllocation() çıktısının manuel snapshot''ı. Aynı (user, persona, portfolio, date) için tek satır — UPSERT ile güncellenir. Sprint-7''de cron eklenecek.';
comment on column public.allocation_snapshots.snapshot_date is
  'Idempotency anahtarı: kullanıcı bir gün için tek snapshot tutar.';
comment on column public.allocation_snapshots.as_of is
  'Snapshot''un alındığı tam timestamp (UPSERT update''lerinde yenilenir).';
comment on column public.allocation_snapshots.target_funds is
  'AllocationTargetFund[] — komite gerekçeleri dahil tam snapshot.';
comment on column public.allocation_snapshots.notes is
  'Kullanıcı notu (örn. ''rebalance kararı'' / ''piyasa stres testi''). Editlemek Sprint-7 backlog.';
