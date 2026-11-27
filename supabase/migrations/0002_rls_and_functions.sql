-- =============================================================================
-- Row Level Security (RLS), Auth Sync Trigger, Expiry Finalizer & Realtime
-- =============================================================================

-- 1. Auto-sync Supabase Auth signups into public.users as CANDIDATE
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (supabase_user_id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'CANDIDATE'
  )
  on conflict (supabase_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Helper to fetch current app user id from auth.uid()
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where supabase_user_id = auth.uid() and active = true limit 1;
$$;

-- Helper to fetch current app user role
create or replace function public.current_app_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where supabase_user_id = auth.uid() and active = true limit 1;
$$;

-- 2. Enable RLS on EVERY table
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.questions enable row level security;
alter table public.options enable row level security;
alter table public.question_keys enable row level security; -- NO client policies!
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.enrollments enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;
alter table public.attempt_grades enable row level security;
alter table public.receipts enable row level security;
alter table public.events enable row level security;
alter table public.lock_events enable row level security;
alter table public.unlock_codes enable row level security; -- NO client policies!
alter table public.announcements enable row level security;
alter table public.disputes enable row level security;
alter table public.audit_logs enable row level security;
alter table public.scratchpads enable row level security;

-- 3. Policies
-- NOTE: All writes & privileged reads happen through Next.js API Route Handlers
-- using the service_role key (which bypasses RLS). Client policies below are
-- defense-in-depth and allow Supabase Realtime subscriptions safely.

-- users: read own profile only
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (supabase_user_id = auth.uid());

-- categories: authenticated read
drop policy if exists "categories_select_auth" on public.categories;
create policy "categories_select_auth" on public.categories
  for select using (auth.role() = 'authenticated');

-- announcements: enrolled candidates or exam owner/admin can read (enables Realtime!)
drop policy if exists "announcements_select_enrolled_or_owner" on public.announcements;
create policy "announcements_select_enrolled_or_owner" on public.announcements
  for select using (
    exists (
      select 1 from public.enrollments e
      where e.exam_id = announcements.exam_id
        and e.candidate_id = public.current_app_user_id()
        and e.status = 'ENROLLED'
    )
    or exists (
      select 1 from public.exams ex
      where ex.id = announcements.exam_id
        and ex.owner_id = public.current_app_user_id()
    )
    or public.current_app_user_role() = 'ADMIN'
  );

-- events: examiner/admin read for live monitoring (enables Realtime!)
drop policy if exists "events_select_owner_or_admin" on public.events;
create policy "events_select_owner_or_admin" on public.events
  for select using (
    exists (
      select 1 from public.attempts a
      join public.exams ex on ex.id = a.exam_id
      where a.id = events.attempt_id
        and (ex.owner_id = public.current_app_user_id() or public.current_app_user_role() = 'ADMIN')
    )
  );

-- receipts: candidate can read own receipts
drop policy if exists "receipts_select_own" on public.receipts;
create policy "receipts_select_own" on public.receipts
  for select using (
    exists (
      select 1 from public.attempts a
      where a.id = receipts.attempt_id
        and a.candidate_id = public.current_app_user_id()
    )
  );

-- question_keys, unlock_codes, audit_logs, attempts (contains paper_snapshot with keys!),
-- exams (contains seed_secret!): intentionally have NO client select/write policies.
-- All access goes through Next.js API Route Handlers which strip secret columns!

-- 4. Expiry Finalizer Function (can be called via pg_cron OR lazily by API)
create or replace function public.finalize_expired_attempts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count int;
begin
  update public.attempts a
  set
    status = 'EXPIRED',
    submitted_at = coalesce(a.submitted_at, a.deadline_at)
  from public.exams e
  where a.exam_id = e.id
    and a.status = 'IN_PROGRESS'
    and now() > (a.deadline_at + make_interval(secs => e.grace_sec));

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

-- Optional: Enable Realtime publication for announcements & events
do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;

-- Optional pg_cron schedule (uncomment in Supabase SQL editor if pg_cron extension is enabled):
-- select cron.schedule('finalize-expired-attempts', '* * * * *', $$select public.finalize_expired_attempts();$$);
