-- =====================================================================
-- Migration 0009: beneficiaries.role kolonu
-- =====================================================================
-- UI'daki "Ben / Oğul / Ebeveyn / Eş" ayrımı için. Default 'other'.

alter table public.beneficiaries
  add column if not exists role text
  check (role in ('self', 'household', 'son', 'daughter', 'parent', 'spouse', 'other'))
  default 'other';

create index if not exists beneficiaries_role_idx on public.beneficiaries(user_id, role);
