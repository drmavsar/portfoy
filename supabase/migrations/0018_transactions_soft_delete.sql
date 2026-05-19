-- ========================================================================
-- 0018 — transactions soft delete (deleted_at)
--
-- Yanlışlıkla silmenin maliyetini sıfırlamak için: deleteTransaction artık
-- hard delete yerine deleted_at = now() set eder. 30 sn'lik undo penceresi
-- + /ayarlar'da arşivlenmiş işlemleri görme imkanı.
--
-- hash_dedupe partial index olduğundan soft-deleted rows ekstre re-import'ta
-- duplicate engellemeyi sürdürür (bu istenen davranış — kullanıcı eksik
-- silinmiş bir kaydı yeniden ekleyemez).
-- ========================================================================

alter table public.transactions
  add column if not exists deleted_at timestamptz;

create index if not exists transactions_active_user_date_idx
  on public.transactions(user_id, occurred_on desc)
  where deleted_at is null;

-- archived snapshot index (audit / restore için)
create index if not exists transactions_deleted_idx
  on public.transactions(user_id, deleted_at desc)
  where deleted_at is not null;
