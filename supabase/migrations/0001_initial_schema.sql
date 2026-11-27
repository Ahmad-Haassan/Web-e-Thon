-- =============================================================================
-- Secure Examination Management System - Initial Schema (PostgreSQL / Supabase)
-- Covers every entity in plan.md Sections 4, 5, 6, 7, 10, 11, 14, 15.
-- =============================================================================

create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type user_role as enum ('ADMIN', 'EXAMINER', 'CANDIDATE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_type as enum ('SINGLE', 'MULTI', 'WRITTEN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exam_status as enum ('DRAFT', 'PUBLISHED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type enrollment_status as enum ('ENROLLED', 'REVOKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attempt_status as enum ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'GRADED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_type as enum ('GRADING', 'AMBIGUOUS', 'TECHNICAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('OPEN', 'REJECTED', 'REGRADED', 'AMBIGUOUS_ACCEPTED', 'TECHNICAL_REMEDY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lock_event_type as enum ('LOCK', 'VIOLATION', 'UNLOCK', 'RESUME');
exception when duplicate_object then null; end $$;

-- 1. Users (linked to Supabase Auth users)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid unique not null,
  name text not null,
  email text unique not null,
  role user_role not null default 'CANDIDATE',
  active boolean not null default true,
  prefs jsonb not null default '{
    "fontSize": "md",
    "theme": "light",
    "highContrast": false,
    "palettePosition": "right",
    "splitLayout": false
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

-- 3. Questions (publicly safe metadata; answer keys live in question_keys!)
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  type question_type not null,
  difficulty smallint not null check (difficulty between 1 and 3),
  text text not null,
  marks numeric(6,2) not null default 1 check (marks > 0),
  negative_marking numeric(6,2) not null default 0 check (negative_marking >= 0),
  explanation text,
  historical_difficulty_index numeric(5,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_questions_owner on public.questions(owner_id);
create index if not exists idx_questions_category_diff on public.questions(category_id, difficulty);

-- 4. Options (NO is_correct column here so client reads can never leak keys)
create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  text text not null,
  order_index int not null default 0
);

create index if not exists idx_options_question on public.options(question_id, order_index);

-- 5. Question Keys (ZERO client RLS policies - server service-role only!)
create table if not exists public.question_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_option_ids uuid[] not null default '{}',
  written_rubric text,
  updated_at timestamptz not null default now()
);

-- 6. Exams
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  title text not null,
  instructions text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_min int not null check (duration_min > 0),
  total_marks numeric(8,2) not null default 0,
  status exam_status not null default 'DRAFT',
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  blueprint jsonb, -- [{ categoryId?, difficulty: 1|2|3, count: number }]
  results_published boolean not null default false,
  grace_sec int not null default 15 check (grace_sec >= 0),
  partial_credit_config jsonb not null default '{"enabled": true, "wrongPenalty": true}'::jsonb,
  per_question_timer_sec int,
  no_backtrack boolean not null default false,
  -- Seed commitment (Section 10.5): hash(seed) published before exam, seed revealed after
  seed_secret text,       -- server-only until revealed
  seed_commitment text,   -- sha256(seed_secret), public
  seed_reveal text,       -- set after exam ends for public audit
  checkpoint_hash text,
  checkpoint_sig text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exams_valid_window check (end_at > start_at)
);

create index if not exists idx_exams_owner on public.exams(owner_id);
create index if not exists idx_exams_window on public.exams(status, start_at, end_at);

-- 7. Exam Questions (manual pool / fixed attachment)
create table if not exists public.exam_questions (
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  marks numeric(6,2) not null check (marks > 0),
  order_index int not null default 0,
  primary key (exam_id, question_id)
);

-- 8. Enrollments
create table if not exists public.enrollments (
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid not null references public.users(id) on delete cascade,
  status enrollment_status not null default 'ENROLLED',
  enrolled_at timestamptz not null default now(),
  primary key (exam_id, candidate_id)
);

create index if not exists idx_enrollments_candidate on public.enrollments(candidate_id);

-- 9. Attempts
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid not null references public.users(id) on delete cascade,
  is_sandbox boolean not null default false,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  status attempt_status not null default 'IN_PROGRESS',
  score numeric(8,2),
  max_score numeric(8,2) not null default 0,
  -- Frozen paper snapshot at attempt start (includes keys server-side; stripped before API response!)
  paper_snapshot jsonb not null,
  balance_score numeric(8,4),
  verify_code text unique not null,
  active_session_token text,
  last_seen_at timestamptz not null default now(),
  integrity_ack_at timestamptz,
  created_at timestamptz not null default now()
);

-- Only ONE non-sandbox attempt per candidate per exam
create unique index if not exists idx_attempts_unique_real
  on public.attempts(exam_id, candidate_id)
  where (is_sandbox = false);

create index if not exists idx_attempts_exam_status on public.attempts(exam_id, status);
create index if not exists idx_attempts_candidate on public.attempts(candidate_id);

-- 10. Answers (APPEND-ONLY hash-chained ledger per attempt)
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected jsonb not null, -- string[] of option IDs for SINGLE/MULTI, or string text for WRITTEN
  marked boolean not null default false,
  saved_at timestamptz not null,          -- client timestamp (informational)
  received_at timestamptz not null default now(), -- server truth timestamp
  client_seq int not null check (client_seq > 0),
  accepted boolean not null default true,
  reject_reason text,
  prev_hash text not null,
  hash text not null,
  receipt_sig text not null,
  unique (attempt_id, client_seq)
);

create index if not exists idx_answers_attempt_seq on public.answers(attempt_id, client_seq);
create index if not exists idx_answers_attempt_q on public.answers(attempt_id, question_id, client_seq desc);

-- 11. Attempt Question Grades (keeps answers table 100% immutable!)
create table if not exists public.attempt_grades (
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  awarded numeric(6,2),
  max_marks numeric(6,2) not null,
  feedback text,
  is_pending_manual boolean not null default false,
  graded_by uuid references public.users(id) on delete set null,
  graded_at timestamptz,
  primary key (attempt_id, question_id)
);

-- 12. Signed Receipts (student-held cryptographic proofs)
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  answer_id uuid references public.answers(id) on delete cascade,
  answer_hash text not null,
  client_seq int not null,
  server_time timestamptz not null,
  sig text not null,
  unique (attempt_id, client_seq)
);

-- 13. Events (hash-chained integrity & resilience timeline)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  type text not null, -- TAB_BLUR, FULLSCREEN_EXIT, PASTE, COPY_ATTEMPT, DISCONNECT, RECONNECT, SAVE, SUBMIT, TECHNICAL_INCIDENT
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  seq int not null,
  prev_hash text not null,
  hash text not null,
  unique (attempt_id, seq)
);

create index if not exists idx_events_attempt_seq on public.events(attempt_id, seq);

-- 14. Lock Events (hash-chained soft-lock & emergency unlock log)
create table if not exists public.lock_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  type lock_event_type not null,
  actor_id uuid references public.users(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  seq int not null,
  prev_hash text not null,
  hash text not null,
  unique (attempt_id, seq)
);

create index if not exists idx_lock_events_attempt_seq on public.lock_events(attempt_id, seq);

-- 15. Emergency Unlock Codes (one-time, short-lived, stored hashed)
create table if not exists public.unlock_codes (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  issued_by uuid not null references public.users(id) on delete restrict,
  code_hash text not null,
  reason text not null default '',
  grant_extra_sec int not null default 0 check (grant_extra_sec >= 0),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_unlock_codes_attempt on public.unlock_codes(attempt_id, expires_at);

-- 16. Announcements (live push from examiner to candidates)
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  message text not null,
  at timestamptz not null default now()
);

create index if not exists idx_announcements_exam on public.announcements(exam_id, at desc);

-- 17. Disputes
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  type dispute_type not null,
  reason text not null,
  status dispute_status not null default 'OPEN',
  resolution text,
  resolver_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_disputes_attempt on public.disputes(attempt_id);
create index if not exists idx_disputes_status on public.disputes(status);

-- 18. Audit Logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity on public.audit_logs(entity, entity_id, at desc);

-- 19. Scratchpads (text + drawing JSON, autosaved)
create table if not exists public.scratchpads (
  attempt_id uuid primary key references public.attempts(id) on delete cascade,
  text_content text not null default '',
  drawing_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
