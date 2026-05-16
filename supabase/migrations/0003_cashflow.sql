-- =====================================================================
-- Migration 0003: Cashflow - accounts, statements, transactions, rules
-- =====================================================================

-- ---------- accounts -------------------------------------------------
create table if not exists public.accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  portfolio_id      uuid references public.portfolios(id) on delete set null,
  custody_id        uuid references public.custody_locations(id) on delete set null,
  name              text not null,
  account_type      account_type not null,
  currency          text not null default 'TRY',
  iban              text,
  last4             text,
  opening_balance   numeric(18,2) not null default 0,
  credit_limit      numeric(18,2),
  statement_day     smallint check (statement_day between 1 and 31),
  due_day           smallint check (due_day between 1 and 31),
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists accounts_user_idx on public.accounts(user_id);
create index if not exists accounts_portfolio_idx on public.accounts(portfolio_id);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.tg_set_updated_at();

-- ---------- statement imports (raw uploads) --------------------------
-- Tracks each CSV/Excel upload for auditability and re-runs.
create table if not exists public.statement_imports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid references public.accounts(id) on delete set null,
  source_name     text,                    -- original filename
  source_kind     text not null default 'csv' check (source_kind in ('csv','xlsx','manual','api')),
  row_count       int not null default 0,
  period_start    date,
  period_end      date,
  status          text not null default 'pending'
                  check (status in ('pending','reviewed','committed','discarded')),
  raw_payload     jsonb,                   -- header + sample for debugging
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists statement_imports_user_idx on public.statement_imports(user_id);

create trigger statement_imports_set_updated_at
  before update on public.statement_imports
  for each row execute function public.tg_set_updated_at();

-- ---------- transactions --------------------------------------------
-- Single source of truth for every money movement.
-- Transfers between own accounts are modeled with `counter_account_id`
-- so the same logical movement is one row, not two (no double-counting).
create table if not exists public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  account_id          uuid not null references public.accounts(id) on delete cascade,
  counter_account_id  uuid references public.accounts(id) on delete set null,
  import_id           uuid references public.statement_imports(id) on delete set null,
  occurred_on         date not null,
  posted_on           date,
  direction           txn_direction not null,
  amount              numeric(18,2) not null check (amount > 0),
  currency            text not null default 'TRY',
  fx_rate_to_try      numeric(18,6),
  amount_try          numeric(18,2) generated always as (
                        case
                          when currency = 'TRY' then amount
                          else amount * coalesce(fx_rate_to_try, 0)
                        end
                      ) stored,
  description         text,
  merchant_raw        text,                -- "A101 GULBAHCE" etc.
  merchant_clean      text,                -- normalized merchant
  category_id         uuid references public.categories(id) on delete set null,
  beneficiary_id      uuid references public.beneficiaries(id) on delete set null,
  is_transfer         boolean not null default false,
  is_installment      boolean not null default false,
  installment_seq     smallint,            -- 1, 2, 3, ...
  installment_total   smallint,            -- 6 (for "1/6")
  parent_purchase_id  uuid references public.transactions(id) on delete set null,
  status              txn_status not null default 'committed',
  hash_dedupe         text,                -- sha256 to dedupe re-imports
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists transactions_dedupe_key
  on public.transactions(user_id, hash_dedupe)
  where hash_dedupe is not null;

create index if not exists transactions_user_date_idx
  on public.transactions(user_id, occurred_on desc);
create index if not exists transactions_account_idx
  on public.transactions(account_id, occurred_on desc);
create index if not exists transactions_category_idx
  on public.transactions(category_id);
create index if not exists transactions_beneficiary_idx
  on public.transactions(beneficiary_id);
create index if not exists transactions_merchant_trgm
  on public.transactions using gin (merchant_clean public.gin_trgm_ops);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.tg_set_updated_at();

-- ---------- transaction_tags (M:N) ----------------------------------
create table if not exists public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id         uuid not null references public.tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

-- ---------- staged draft rows (review screen) -----------------------
-- Rule engine writes its proposed classification here. The user
-- approves on the "Onay" screen, which materializes rows into
-- `transactions`. This is the "Gözetimli Otomasyon" surface.
create table if not exists public.transaction_drafts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  import_id           uuid not null references public.statement_imports(id) on delete cascade,
  account_id          uuid not null references public.accounts(id) on delete cascade,
  raw                 jsonb not null,             -- as parsed from file
  occurred_on         date not null,
  amount              numeric(18,2) not null,
  direction           txn_direction not null,
  currency            text not null default 'TRY',
  merchant_raw        text,
  merchant_clean      text,
  suggested_category_id    uuid references public.categories(id) on delete set null,
  suggested_beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  suggested_is_transfer    boolean not null default false,
  suggested_counter_account_id uuid references public.accounts(id) on delete set null,
  suggested_installment_total  smallint,
  matched_rule_id     uuid,                       -- FK added in 0004
  confidence          numeric(5,2),               -- 0..100
  decision            text not null default 'pending'
                      check (decision in ('pending','accept','edit','ignore')),
  hash_dedupe         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists drafts_user_import_idx
  on public.transaction_drafts(user_id, import_id);
create index if not exists drafts_decision_idx
  on public.transaction_drafts(decision);

create trigger drafts_set_updated_at
  before update on public.transaction_drafts
  for each row execute function public.tg_set_updated_at();

-- ---------- recurring schedules (Maaş, Kira, abonelikler) -----------
create table if not exists public.recurring_schedules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid references public.accounts(id) on delete set null,
  name            text not null,
  cadence         text not null check (cadence in ('weekly','monthly','quarterly','yearly','irregular')),
  day_of_month    smallint check (day_of_month between 1 and 31),
  direction       txn_direction not null,
  amount          numeric(18,2),
  currency        text not null default 'TRY',
  category_id     uuid references public.categories(id) on delete set null,
  beneficiary_id  uuid references public.beneficiaries(id) on delete set null,
  starts_on       date,
  ends_on         date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger recurring_set_updated_at
  before update on public.recurring_schedules
  for each row execute function public.tg_set_updated_at();

-- ---------- budgets (enflasyonist bütçe tavanları) ------------------
create table if not exists public.budgets (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  category_id        uuid references public.categories(id) on delete cascade,
  beneficiary_id     uuid references public.beneficiaries(id) on delete cascade,
  period_year        smallint not null,
  period_month       smallint check (period_month between 1 and 12),  -- null = annual
  cap_amount_try     numeric(18,2) not null,
  inflation_factor   numeric(6,4),   -- applied if generated from previous period
  source             text default 'manual',  -- 'manual' | 'inflated_from_prior'
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists budgets_unique_period
  on public.budgets(user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'),
                    coalesce(beneficiary_id, '00000000-0000-0000-0000-000000000000'),
                    period_year, coalesce(period_month, 0));

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.tg_set_updated_at();
