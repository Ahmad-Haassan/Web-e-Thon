# Secure Examination Management System (Web-e-Thon)

> *"Don't trust us. Verify us."* — An offline-resilient, cryptographically verifiable examination platform built with **Next.js (App Router) + TypeScript + Supabase**.

**Live Demo:** https://web-e-thon.vercel.app

## Team Workflow (Read `plan.md` Sections 13–15)
- **Person A (Backend — branch `person-a/backend`):** `app/api/**`, `lib/server/**`, `supabase/**`, `scripts/**`, `api.md`
- **Person B (Frontend — branch `person-b/frontend`):** `app/(pages)/**`, `components/**`, `hooks/**`, `lib/offline/**`
- **Shared:** `lib/shared/**` (`types.ts`, `schemas.ts`) and `api.md`

Tell your AI assistant:
> *"I am Person B. Read `plan.md` (Sections 13–15) and `api.md`, and follow only the Person B workflow."*

## Setup Instructions
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Create Supabase Project (Person A):**
   - Create a free project at https://supabase.com.
   - Under **Authentication -> Providers -> Email**, turn **off** "Confirm email" for fast demo signups.
   - Open **SQL Editor** and run in order:
     1. `supabase/migrations/0001_initial_schema.sql`
     2. `supabase/migrations/0002_rls_and_functions.sql`
3. **Configure environment:**
   - Copy `.env.example` to `.env.local` and fill in your Supabase keys and random secrets.
   - Share **only** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with Person B privately.
   - Keep `SUPABASE_SERVICE_ROLE_KEY`, `RECEIPT_SECRET`, `CHECKPOINT_SECRET`, and `CRON_SECRET` strictly server-side.
4. **Seed demo data (Admin, Examiner, 5 Candidates, 13 Questions, 1 Ongoing Exam):**
   ```bash
   npm run seed
   ```
5. **Run dev server & tests:**
   ```bash
   npm run dev
   npm test
   npm run typecheck
   ```

## Seeded Demo Credentials (Password: `Password123!`)
| Role | Email |
|---|---|
| Admin | `admin@exam.edu.pk` |
| Examiner | `examiner@exam.edu.pk` |
| Candidates | `student1@exam.edu.pk` .. `student5@exam.edu.pk` |

## API Contract
See [`api.md`](./api.md) for all 33 endpoints, roles, request bodies, and response shapes.
