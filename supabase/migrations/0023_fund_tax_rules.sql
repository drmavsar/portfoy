-- =====================================================================
-- Migration 0023: TEFAS — fund_tax_rules + tax_rules_audit
-- =====================================================================
-- Stopaj oranları HARD-CODE EDİLMEZ — bu tabloda zaman aralıklı,
-- öncelik-tabanlı, lot iktisap tarihine duyarlı kurallar tutulur.
--
-- Çözüm sırası (resolveTaxRule):
--   1. scope='FUND' ve fund_code eşleşir
--   2. scope='CATEGORY' ve category_id eşleşir
--   3. scope='TAX_KIND' default (funds.category.default_tax_kind ile)
-- Her seviyede effective_from/effective_to ve applies_to_acquired_*
-- aralıkları filtrelenir; çakışma olursa priority DESC karar verir.
--
-- tax_rules_audit: her INSERT/UPDATE/DELETE bir audit satırı oluşturur
-- (trigger). Mevzuat değişikliği geçmişi UI'da görünür olmalı.
-- =====================================================================

do $$ begin
  create type fund_tax_rule_scope as enum ('FUND', 'CATEGORY', 'TAX_KIND');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tax_audit_operation as enum ('INSERT', 'UPDATE', 'DELETE', 'DEACTIVATE');
exception when duplicate_object then null; end $$;

create table if not exists public.fund_tax_rules (
  id                          uuid primary key default gen_random_uuid(),
  scope                       fund_tax_rule_scope not null,
  fund_code                   text references public.funds(code) on delete cascade,
  category_id                 int references public.fund_categories(id) on delete cascade,
  tax_kind                    fund_tax_kind not null,
  withholding_rate            numeric(6,4),                -- 0.0000 / 0.1750 / NULL (BELIRSIZ)
  effective_from              date not null,
  effective_to                date,                        -- NULL = açık aralık
  applies_to_acquired_from    date,                        -- Lot iktisap tarihi alt sınırı
  applies_to_acquired_to      date,                        -- Lot iktisap tarihi üst sınırı
  min_holding_days            int,                         -- Minimum tutma süresi şartı
  priority                    int not null default 100,    -- Çakışma çözümü
  description                 text not null,
  source_url                  text,                        -- GİB tebliği linki
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now(),
  -- Scope tutarlılığı
  constraint fund_tax_rules_scope_chk check (
    (scope = 'FUND'     and fund_code is not null  and category_id is null)
    or (scope = 'CATEGORY' and fund_code is null   and category_id is not null)
    or (scope = 'TAX_KIND' and fund_code is null   and category_id is null)
  ),
  -- Oran zorunluluğu: sadece kesin oranı bilinen kind'lar için (HSYF/GENEL)
  constraint fund_tax_rules_rate_chk check (
    tax_kind in ('BELIRSIZ', 'DOVIZ_BAZLI', 'SERBEST_FON')
    or withholding_rate is not null
  )
);

create index if not exists fund_tax_rules_scope_idx
  on public.fund_tax_rules(scope, fund_code, category_id);
create index if not exists fund_tax_rules_effective_idx
  on public.fund_tax_rules(effective_from, effective_to)
  where is_active = true;
create index if not exists fund_tax_rules_kind_idx
  on public.fund_tax_rules(tax_kind) where is_active = true;

-- Reference data: herkes okur, sadece service_role yazar
alter table public.fund_tax_rules enable row level security;
drop policy if exists fund_tax_rules_read on public.fund_tax_rules;
create policy fund_tax_rules_read on public.fund_tax_rules
  for select to authenticated using (true);

-- ---------- tax_rules_audit -----------------------------------------

create table if not exists public.tax_rules_audit (
  id            uuid primary key default gen_random_uuid(),
  rule_id       uuid,                -- referans rule (DELETE sonrası FK kalmasın diye soft ref)
  operation     tax_audit_operation not null,
  old_values    jsonb,
  new_values    jsonb,
  changed_at    timestamptz not null default now(),
  changed_by    text not null default 'system',
  change_reason text
);

create index if not exists tax_rules_audit_rule_idx
  on public.tax_rules_audit(rule_id, changed_at desc);

alter table public.tax_rules_audit enable row level security;
drop policy if exists tax_rules_audit_read on public.tax_rules_audit;
create policy tax_rules_audit_read on public.tax_rules_audit
  for select to authenticated using (true);

-- ---------- trigger: fund_tax_rules → tax_rules_audit ---------------

create or replace function public.tg_fund_tax_rules_audit()
returns trigger
language plpgsql
as $$
declare
  op tax_audit_operation;
begin
  if (tg_op = 'INSERT') then
    op := 'INSERT';
    insert into public.tax_rules_audit (rule_id, operation, new_values)
      values (new.id, op, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    -- is_active true→false özel olarak DEACTIVATE
    if (old.is_active = true and new.is_active = false) then
      op := 'DEACTIVATE';
    else
      op := 'UPDATE';
    end if;
    insert into public.tax_rules_audit (rule_id, operation, old_values, new_values)
      values (new.id, op, to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.tax_rules_audit (rule_id, operation, old_values)
      values (old.id, 'DELETE', to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists fund_tax_rules_audit_trg on public.fund_tax_rules;
create trigger fund_tax_rules_audit_trg
  after insert or update or delete on public.fund_tax_rules
  for each row execute function public.tg_fund_tax_rules_audit();

-- ---------- 5 default TAX_KIND seed kuralı --------------------------
-- HSYF=%0, GENEL=%17.5; DOVIZ_BAZLI / SERBEST_FON / BELIRSIZ için
-- withholding_rate NULL bırakılır (fon bazlı override edilebilir).
-- effective_from='2026-01-01', açık aralık (effective_to=NULL).

insert into public.fund_tax_rules
  (scope, tax_kind, withholding_rate, effective_from, priority, description)
values
  ('TAX_KIND', 'HSYF_0_STOPAJ', 0.0000, '2026-01-01', 100,
   'Hisse Senedi Yoğun Fon — %0 stopaj (GVK Geç. Md. 67 kapsamında)'),
  ('TAX_KIND', 'GENEL_17_5',    0.1750, '2026-01-01', 100,
   'Genel katılım fonu — %17.5 stopaj'),
  ('TAX_KIND', 'DOVIZ_BAZLI',   null,    '2026-01-01', 100,
   'Döviz bazlı fonlar — fon prospectus''una göre değişir, manuel doğrulama gerekir'),
  ('TAX_KIND', 'SERBEST_FON',   null,    '2026-01-01', 100,
   'Serbest fonlar — fon türüne ve yatırımcı statüsüne göre değişir'),
  ('TAX_KIND', 'BELIRSIZ',      null,    '2026-01-01', 100,
   'Sınıflandırılamayan — manuel inceleme gerekir')
on conflict do nothing;
