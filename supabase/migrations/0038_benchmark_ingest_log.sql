-- =====================================================================
-- Migration 0038: benchmark_ingest_log
-- =====================================================================
-- Sprint-5.6 PR-A: EVDS'den benchmark series backfill için audit log.
-- Hangi seri ne zaman çekildi, kaç satır geldi, başarılı mı? diagnostic.
-- =====================================================================

create table if not exists public.benchmark_ingest_log (
  id               bigserial primary key,
  ran_at           timestamptz not null default now(),
  series_code      text not null,             -- canonical: XU100, XAUTRY, USDTRY, EURTRY
  evds_series_code text,                      -- EVDS portal kodu (TP.MK.F.BIST100 vb.)
  duration_ms      int,
  fetched_periods  int not null default 0,
  upserted         int not null default 0,
  succeeded        boolean not null,
  error            text,
  body_snippet     text,                      -- ilk 300 char (diagnostic)
  triggered_by     text                       -- 'cron' | 'manual' | 'validate'
);

create index if not exists benchmark_ingest_log_series_idx
  on public.benchmark_ingest_log (series_code, ran_at desc);

create index if not exists benchmark_ingest_log_failures_idx
  on public.benchmark_ingest_log (ran_at desc) where succeeded = false;

alter table public.benchmark_ingest_log enable row level security;
drop policy if exists benchmark_ingest_log_read on public.benchmark_ingest_log;
create policy benchmark_ingest_log_read on public.benchmark_ingest_log
  for select to authenticated using (true);
