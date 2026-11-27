-- =============================================================================
-- EMS Feature Integration Migration (Profile, Classes/Sections, Test Rules)
-- Additive migration on top of 0001_initial_schema.sql & 0002_rls_and_functions.sql
-- =============================================================================

-- 1. Extend public.users with phone, class_name, section, and verification status
alter table public.users
  add column if not exists phone text,
  add column if not exists class_name text,
  add column if not exists section text,
  add column if not exists email_verified boolean not null default false;

create index if not exists idx_users_class_section
  on public.users(class_name, section)
  where (role = 'CANDIDATE');

-- 2. Extend public.exams with category, class_name, section, and structured rules
alter table public.exams
  add column if not exists category text,
  add column if not exists class_name text,
  add column if not exists section text,
  add column if not exists rules jsonb not null default '[]'::jsonb;

create index if not exists idx_exams_class_section
  on public.exams(class_name, section);
