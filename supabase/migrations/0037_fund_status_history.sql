-- =====================================================================
-- Migration 0037: fund_status_history
-- =====================================================================
-- Sprint-5.6 PR-A: Survivorship bias kontrolü için fonların aktiflik
-- geçmişi. Backtest motorunun "X tarihinde hangi fonlar aktifdi?"
-- sorusuna cevap vermesini sağlar.
--
-- KRA örneği: 2026-02-28'e kadar aktif, sonra delisted.
-- =====================================================================

create table if not exists public.fund_status_history (
  fund_code      text not null references public.funds(code) on delete cascade,
  effective_from date not null,
  effective_to   date null,
  status         text not null check (status in ('active','delisted','suspended','new_listing')),
  reason         text,
  created_at     timestamptz not null default now(),
  primary key (fund_code, effective_from)
);

create index if not exists fund_status_history_status_idx
  on public.fund_status_history (status, effective_from);

create index if not exists fund_status_history_active_at_idx
  on public.fund_status_history (fund_code, effective_to);

alter table public.fund_status_history enable row level security;
drop policy if exists fund_status_history_read on public.fund_status_history;
create policy fund_status_history_read on public.fund_status_history
  for select to authenticated using (true);

-- Seed: tüm aktif fonlar 2010-01-01'den itibaren baseline 'active'
insert into public.fund_status_history (fund_code, effective_from, status, reason)
select code, '2010-01-01'::date, 'active', 'baseline seed'
from public.funds
where is_active = true
on conflict do nothing;

-- KRA: 2026-02-28'e kadar aktif, sonra delisted
update public.fund_status_history
   set effective_to = '2026-02-28'::date
 where fund_code = 'KRA' and effective_from = '2010-01-01';

insert into public.fund_status_history (fund_code, effective_from, status, reason)
values ('KRA', '2026-03-01'::date, 'delisted',
        'TEFAS empty_result returned Feb-May 2026 (PR-B backfill discovered)')
on conflict do nothing;
