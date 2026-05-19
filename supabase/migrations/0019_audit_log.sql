-- ========================================================================
-- 0019 — Audit log (transactions, trades)
--
-- "Kim, ne zaman, hangi kaydı nasıl değiştirdi" sorusunu cevaplar.
-- /ayarlar Aktivite Geçmişi tab'ı son 100 değişikliği gösterir.
-- before/after JSONB ile tam diff (RLS user_id ile sahiplenir).
--
-- NOT: holdings bir VIEW'dur (v_holdings_wac, trades üzerinden türetilir).
-- View'lara trigger takılamaz; pozisyon değişikliklerini trades'in
-- audit'inden takip ediyoruz (source of truth zaten trades).
-- ========================================================================

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_user_time_idx
  on public.audit_log(user_id, created_at desc);

create index if not exists audit_log_record_idx
  on public.audit_log(table_name, record_id);

-- RLS: kullanıcı sadece kendi audit_log satırlarını okur. Yazma trigger ile.
alter table public.audit_log enable row level security;

drop policy if exists "audit_log_read_own" on public.audit_log;
create policy "audit_log_read_own" on public.audit_log
  for select using (auth.uid() = user_id);

-- INSERT yetkisi sadece trigger için — direct insert blocked (RLS bypass
-- security definer trigger function ile yapılır).

-- ========================================================================
-- Trigger function — bir kaydın user_id'sini otomatik yakalar
-- ========================================================================

create or replace function public.tg_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_record_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  -- user_id'yi NEW veya OLD'tan al (her iki tabloda da var)
  if tg_op = 'DELETE' then
    v_user_id := (old.user_id)::uuid;
    v_record_id := (old.id)::uuid;
    v_before := to_jsonb(old);
    v_after := null;
  elsif tg_op = 'INSERT' then
    v_user_id := (new.user_id)::uuid;
    v_record_id := (new.id)::uuid;
    v_before := null;
    v_after := to_jsonb(new);
  else  -- UPDATE
    v_user_id := (new.user_id)::uuid;
    v_record_id := (new.id)::uuid;
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    -- Eğer hiçbir alan değişmediyse audit atla (idempotent re-save vs.)
    if v_before = v_after then
      return new;
    end if;
  end if;

  insert into public.audit_log (user_id, table_name, record_id, action, before, after)
  values (v_user_id, tg_table_name, v_record_id, tg_op, v_before, v_after);

  return coalesce(new, old);
end;
$$;

-- ========================================================================
-- Trigger'ları takılması
-- ========================================================================

drop trigger if exists tg_audit_transactions on public.transactions;
create trigger tg_audit_transactions
  after insert or update or delete on public.transactions
  for each row execute function public.tg_audit_log();

drop trigger if exists tg_audit_trades on public.trades;
create trigger tg_audit_trades
  after insert or update or delete on public.trades
  for each row execute function public.tg_audit_log();

-- (holdings VIEW olduğu için trigger eklenemez — trades audit'i yeterli)
