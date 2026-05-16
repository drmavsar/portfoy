-- =====================================================================
-- Migration 0004: Classification rule engine
-- =====================================================================
-- Rules let the user teach the system that "A101 *" -> Market,
-- card ending 1023 -> Ahmet Burak, "Cep Şube Ödeme" -> transfer, etc.
-- Rules are user-scoped and ordered; first match wins.
-- =====================================================================

create table if not exists public.classification_rules (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  priority            int not null default 100,    -- lower = evaluated first
  is_enabled          boolean not null default true,
  --------------------------------------------------------------------
  -- matchers (all non-null are ANDed together; comma-free, simple)
  --------------------------------------------------------------------
  match_account_id    uuid references public.accounts(id) on delete cascade,
  match_card_last4    text,
  match_direction     txn_direction,
  match_min_amount    numeric(18,2),
  match_max_amount    numeric(18,2),
  match_merchant_ilike  text,   -- "%A101%"
  match_description_ilike text,
  match_regex         text,     -- POSIX regex against merchant_raw
  --------------------------------------------------------------------
  -- actions
  --------------------------------------------------------------------
  set_category_id     uuid references public.categories(id) on delete set null,
  set_beneficiary_id  uuid references public.beneficiaries(id) on delete set null,
  set_is_transfer     boolean,
  set_counter_account_id uuid references public.accounts(id) on delete set null,
  set_installment_total smallint,
  set_ignore          boolean not null default false,
  set_tag_ids         uuid[],
  confidence          numeric(5,2) not null default 95.0,
  --------------------------------------------------------------------
  hit_count           int not null default 0,
  last_hit_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists rules_user_priority_idx
  on public.classification_rules(user_id, priority);

drop trigger if exists rules_set_updated_at on public.classification_rules;
create trigger rules_set_updated_at
  before update on public.classification_rules
  for each row execute function public.tg_set_updated_at();

-- Late-bind the FK from drafts to rules now that the table exists.
alter table public.transaction_drafts
  add constraint transaction_drafts_matched_rule_fk
  foreign key (matched_rule_id)
  references public.classification_rules(id)
  on delete set null;

-- ---------- merchant canonical map ----------------------------------
-- Optional global "A101 GULBAHCE" -> "A101" cleanup table per user.
create table if not exists public.merchant_aliases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  pattern       text not null,    -- ilike pattern
  canonical     text not null,
  created_at    timestamptz not null default now(),
  unique (user_id, pattern)
);
