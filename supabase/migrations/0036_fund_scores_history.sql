-- =====================================================================
-- Migration 0036: fund_scores_history (append-only score snapshots)
-- =====================================================================
-- Sprint-5.5 PR-2: Skor tarihçesi — kullanıcı 7g/30g/90g karşılaştırması
-- yapabilsin diye her cron refresh'inde mevcut skoru ek satır olarak
-- saklarız. fund_scores_cache aynı (fund_code, as_of, persona_id) PK'sı
-- nedeniyle UPSERT ile eski snapshot'ları üzerine yazıyor; bu tablo
-- append-only.
--
-- Yazma: refreshAllFundScores bittikten sonra cache satırlarının
-- snapshot'ı INSERT edilir (computed_at = cache.computed_at).
--
-- Lookup: getScoreAtNDaysAgo(code, persona_id, days) → en yakın <= now()-Nd
-- satırını döner.
--
-- Boyut: 154 fon × 365 gün × 1 persona × ~120 bayt = ~6.5 MB/yıl.
-- Retention: şimdilik yok; 1 yıldan sonra ayrı cleanup cron önerilir.
-- =====================================================================

create table if not exists public.fund_scores_history (
  fund_code                    text not null references public.funds(code) on delete cascade,
  persona_id                   uuid not null references public.user_personas(id) on delete cascade,
  computed_at                  timestamptz not null,
  as_of                        date not null,

  -- Bileşen skorları (cache'in aynası)
  inflation_protection_score   int check (inflation_protection_score between 0 and 100),
  tax_advantage_score          int check (tax_advantage_score between 0 and 100),
  normalized_risk_score        int check (normalized_risk_score between 0 and 100),
  long_term_performance_score  int check (long_term_performance_score between 0 and 100),
  diversification_score        int check (diversification_score between 0 and 100),
  bist_dependency_score        int check (bist_dependency_score between 0 and 100),
  gold_dependency_score        int check (gold_dependency_score between 0 and 100),

  -- Ham metrikler (opsiyonel ama backtest/audit için faydalı)
  volatility_1y                numeric(10,6),
  max_drawdown_3y              numeric(10,6),
  sharpe_like_1y               numeric(10,6),

  -- Kompozit
  mehmet_score                 int check (mehmet_score between 0 and 100),
  components_used              int,
  warnings                     text[] not null default '{}'::text[],

  primary key (fund_code, persona_id, computed_at)
);

-- Lookup: "X gün önceki en son snapshot" için (fund_code, persona_id) +
-- DESC computed_at index. WHERE computed_at <= now()-N range queries.
create index if not exists fund_scores_history_lookup_idx
  on public.fund_scores_history (fund_code, persona_id, computed_at desc);

-- Tüm fonlar için belirli bir noktada (örn. backtest 2024-01-02) lookup.
create index if not exists fund_scores_history_time_idx
  on public.fund_scores_history (persona_id, computed_at desc);

alter table public.fund_scores_history enable row level security;
drop policy if exists fund_scores_history_read on public.fund_scores_history;
create policy fund_scores_history_read on public.fund_scores_history
  for select to authenticated using (true);
