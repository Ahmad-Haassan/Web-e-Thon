# Secure Examination Management System: Full Plan

## 1. Positioning
- **Main user:** Examiner/coordinator at a mid-size Pakistani university (100–500 students per exam).
- **Secondary user:** Candidate on a weak connection or low-end device.
- **USP:** "The exam system examiners can defend and students can trust, even when the internet fails."
- **Innovation challenges:** 5.3 Failure-resilient (primary), 5.2 Fair randomization, 5.4 Disputes with an evidence timeline. Integrity flags are labelled "indicators, not proof".

## 2. Tech Stack (all free, local-first)
| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | Fast to build, responsive |
| Backend | Node.js + Express + TypeScript | Simple, clear separation |
| DB | PostgreSQL (SQLite for dev) via Prisma | Relational integrity, migrations |
| Auth | Supabase Auth (see Section 11) + server-side RBAC middleware | Managed auth, hashing and sessions; roles enforced on our backend |
| Validation | Zod (shared by frontend and backend) | Validation on both sides |
| PDF | pdfkit | Free, server-side |
| QR | qrcode | Verification link |
| Offline | IndexedDB queue + service worker | Failure resilience |
| Deploy | Render/Railway/Fly free tier + Neon/Supabase DB | No billing required |
| Supabase Auth | Login/signup/sessions/JWT (@supabase/supabase-js) | **Frontend** signs in; **Backend** verifies the JWT |
| Supabase Postgres | Hosted DB, accessed via Prisma | **Backend only** (connection string never in client) |
| Supabase Storage (optional) | Question images, PDFs | Backend uploads with service-role key |
| Supabase Realtime (optional) | Live monitor/announcements | Frontend subscribes; skip if short on time |

## 3. Architecture
```
client/ (pages, components, hooks, api, offline queue)
server/
  routes/ controllers/ services/ middleware/ (auth, rbac, validate)
  prisma/schema.prisma, seed.ts
  jobs/ (expiry finalizer)
shared/ (zod schemas, types)
```
Rules:
- Controllers stay thin and services hold the logic.
- Every route passes through `auth` then `requireRole` then an ownership check.
- Timing uses server time only.

## 4. Data Model
- **User**(id, name, email, supabaseUserId, role[ADMIN|EXAMINER|CANDIDATE], active, prefs JSON)
- **Category**(id, name)
- **Question**(id, ownerId, categoryId, type[SINGLE|MULTI|WRITTEN], difficulty[1-3], text, marks, negativeMarking, explanation)
- **Option**(id, questionId, text, isCorrect)
- **Exam**(id, ownerId, title, instructions, startAt, endAt, durationMin, totalMarks, status, shuffleQuestions, shuffleOptions, blueprint JSON, resultsPublished, graceSec)
- **ExamQuestion**(examId, questionId, marks, order)
- **Enrollment**(examId, candidateId, status)
- **Attempt**(id, examId, candidateId, isSandbox, startedAt, deadlineAt, submittedAt, status[IN_PROGRESS|SUBMITTED|EXPIRED|GRADED], score, paperSnapshot JSON, balanceScore, verifyCode)
- **Answer**(attemptId, questionId, selected JSON/text, marked, savedAt, clientSeq, awarded, feedback)
- **Event**(id, attemptId, type[TAB_BLUR, FULLSCREEN_EXIT, PASTE, DISCONNECT, RECONNECT, SAVE, ...], meta, at)
- **Announcement**(examId, message, at)
- **Dispute**(id, attemptId, questionId?, type[GRADING|AMBIGUOUS|TECHNICAL], reason, status, resolution, resolverId)
- **AuditLog**(actorId, action, entity, before, after, at)
- **Scratchpad**(attemptId, content)

Key decision: `paperSnapshot` freezes the questions, option order, marks and correct keys at attempt start, so edits never affect active attempts.

## 5. Core Features
1. **Auth/RBAC:** register/login/logout, admin user CRUD and role change, backend guards, rate-limited login.
2. **Exam lifecycle:** DRAFT → PUBLISHED → ONGOING → COMPLETED. Status is computed from time and publish state. Examiners get a review page before publishing.
3. **Question bank:** CRUD, filters by category and difficulty, attach to exam, marks per question.
4. **Candidates:** enroll by email or bulk. The candidate dashboard shows Available, Upcoming, Completed and access status. Entry is blocked outside the window or if not enrolled.
5. **Exam interface:**
   - Timer driven by `deadlineAt` from the server and re-synced with a server offset.
   - Question palette (answered, unanswered, marked).
   - Debounced autosave and resume on refresh.
   - Submit is idempotent (unique attempt per candidate and exam, status check in a transaction).
   - A cron/lazy finalizer expires attempts and accepts only answers with `savedAt <= deadline + grace`.
6. **Monitoring:** live attempts table (polling or SSE) with progress, last-seen and event counts, plus an incident timeline and announcements pushed to candidates.
7. **Grading:**
   - Single: all or nothing.
   - Multi: partial credit formula (+correct/n, −wrong/n, floored at 0), configurable.
   - Written: manual grading UI, validated against 0..marks.
   - Totals are recomputed in a transaction, and grading state is GRADED only when no written answer is pending.
8. **Results/analytics:** publish toggle; candidates see only their own published results. Examiners see score distribution, average, pass rate and a per-candidate table.

## 6. Secondary Features
| # | Feature | Implementation |
|---|---|---|
| 4.1 | Network-aware UI | `navigator.onLine` plus heartbeat ping. Badge: Saved / Saving / Offline, queued count, banner for unstable connection |
| 4.2 | PDF reports | Exam summary PDF (examiner) and candidate result PDF, with access checks |
| 4.3 | Sandbox | `isSandbox` attempts excluded from all stats, grading queues and results |
| 4.4 | Bulk import | CSV/JSON for candidates and questions, row-level validation, error report table |
| 4.5 | Question analytics | % correct, skip rate, most common wrong option, difficulty index |
| 4.6 | Verifiable reports | Unique verifyCode and QR to public `/verify/:code`, showing only the exam title, a masked name, the score band and the issue date |
| 4.7 | Workspace prefs | Font size, theme, high contrast, palette position, split layout, saved in User.prefs |
| 4.8 | Scratchpad | Side panel, text plus simple drawing canvas, autosaved to the server and local |

## 7. Innovation Design
### 5.3 Failure-resilient (primary)
- Answers are written to IndexedDB first, then synced with a `clientSeq` and client timestamp.
- The server validates against its own deadline and never extends it.
- Disconnect and reconnect events are logged with durations.
- Reconnect resumes from the server state, not the device clock.
- Optional examiner action: log a technical incident, which feeds a dispute but never adds time automatically.
- Demo: kill Wi-Fi, keep answering, reconnect, answers sync and the timer is unchanged.

### 5.2 Fair randomization
- The examiner sets a blueprint per category and difficulty (e.g. 4E/4M/2H).
- The generator picks questions by quota, so every paper has the same difficulty mix.
- A balance score is computed from each paper's total difficulty weight and the historical question difficulty index.
- Papers are re-drawn until their balance falls within a tolerance of the mean.
- The examiner sees a fairness report (min, max and spread of paper difficulty).

### 5.4 Disputes
- A candidate raises a dispute on a published result (question, type, reason).
- The examiner sees an evidence timeline (saves, disconnects, flags, their answer and the key).
- Outcomes: reject, regrade, accept the question as ambiguous (all candidates re-scored fairly), or technical remedy.
- Every change goes into the AuditLog, and the candidate sees the status and reason.

### Integrity indicators
- Tab blur, fullscreen exit and paste are logged.
- They are displayed as "indicators, not proof" and collect no camera or screen data, which protects privacy.

## 8. Security Checklist
- Supabase Auth (JWT verified server-side), helmet, CORS allowlist, rate limiting.
- The answer key is never sent to the client during an attempt. The snapshot is stripped before it is returned.
- Ownership checks on exam, attempt and result routes.
- Zod validation on every body and param; parameterized queries via Prisma.
- Public routes expose only the verify endpoint, with minimal data.
- Idempotent submit and a unique constraint on (examId, candidateId, non-sandbox).

## 9. UI/UX Direction
- Distinct design system with a calm academic palette, a clear type scale and no generic template look.
- Role-specific dashboards, a stepper for exam creation, and a dense but readable monitoring table.
- Accessibility: keyboard navigation, ARIA labels, focus states, contrast, a skip link.
- Responsive down to mobile, with a distraction-free exam workspace.

## 10. 10-Hour Schedule (1–3 people)
| Hours | Task |
|---|---|
| 0–1 | Repo, stack setup, schema, seed data, auth and RBAC |
| 1–2.5 | Exam CRUD and lifecycle, question bank, enrollment |
| 2.5–4.5 | Attempt engine (snapshot, autosave, timer, submit, expiry), exam UI |
| 4.5–5.5 | Grading, results, publishing |
| 5.5–6.5 | Monitoring, announcements, network-aware UI and offline queue |
| 6.5–7.5 | Fair randomization, disputes, audit log |
| 7.5–8.5 | PDF and QR verify, import, analytics, sandbox, prefs, scratchpad |
| 8.5–9.5 | Deploy, bug fixing, edge cases (refresh, double submit, expiry) |
| 9.5–10 | README, demo data, rehearsal |

If working in a team of three:
- **A:** backend, attempt engine, grading.
- **B:** exam UI, offline, scratchpad, prefs.
- **C:** examiner and admin UI, PDF, import, deploy, README.

Commit often with meaningful messages; there are no commits after the deadline.

## 11. Priorities if time runs short
1. **Must:** auth, exam lifecycle, attempt engine, grading, results.
2. **Then:** 5.3 resilience, the eight secondary features (simple versions).
3. **Then:** 5.2 and 5.4 depth, polish.
Working simple versions beat placeholders.

## 12. Test Plan
- Candidate cannot open an exam before start or after end.
- A candidate cannot read another candidate's attempt or results.
- A candidate cannot call examiner routes (403).
- Refresh mid-exam keeps answers and timer.
- Double submit creates one result.
- Late answers after the deadline are rejected.
- Multi-select partial scoring is correct.
- Sandbox attempts are absent from stats.
- Import with bad rows produces clear errors.
- A QR verify page leaks no private data.

## 13. README Contents
- Setup and run commands, env vars, and seed command.
- Test credentials: admin, examiner, candidate.
- Features mapped to the requirements.
- Innovation write-up: problem, who it affects, solution, trade-offs.
- Deployed URL.

## 14. Demo Script (15 min)
1. 1 min: the problem and the user (examiner).
2. 2 min: examiner creates an exam with a blueprint, imports questions, enrolls candidates.
3. 3 min: candidate takes the exam, with scratchpad, preferences and mark-for-review.
4. 2 min: cut the network, show offline save, reconnect, and the unchanged timer.
5. 2 min: monitoring view, incidents and an announcement.
6. 2 min: grading, publishing, analytics.
7. 2 min: dispute, evidence timeline and resolution.
8. 1 min: QR-verified PDF and the fairness report.

## 10. Integrity Strategy (Differentiator)
**Pitch:** "Don't trust us. Verify us. We don't pretend to stop cheating; we make it pointless, visible and accountable."

### 10.1 Layer 1: Make AI less useful
- Per-student variants (numbers, scenarios, option order) from the blueprint pool.
- Large question pool; each student gets a random subset.
- Optional per-question timers and no-backtrack mode.
- Scenario, local-context, diagram and "justify your answer" questions.

### 10.2 Layer 2: Soft lock (deterrence)
- Fullscreen enforcement with re-prompt on exit; Keyboard Lock API where supported (Chromium).
- Paste and copy-of-question blocking (friction only), one active session per attempt.
- Escalation: warning -> logged flag -> examiner alert -> examiner pause/unlock. Never auto-fail.
- Honest limit: a web app cannot truly lock a device. Full lockdown needs a kiosk browser (Safe Exam Browser).

### 10.3 Emergency unlock
- Examiner/admin issues a one-time, server-generated code: valid ~2 min, bound to one attempt, stored hashed.
- No shared master code. Every use logs `EMERGENCY_UNLOCK` with the actor ID.
- The timer keeps running by default. Extra time is an explicit, logged examiner action.
- Crash/power loss: server-issued resume code; the exam resumes from server state.

### 10.4 Indicators, not proof
- Tab blur / fullscreen exit counts and durations, paste events, large instant text inserts.
- Answer speed vs difficulty, written-answer similarity between candidates.
- Examiner review queue shows only flagged attempts with an evidence timeline.
- No screen recording or webcam. Privacy-first; student acknowledges the integrity policy before starting.

### 10.5 Verifiable record
- Hash-chain Event and Answer records (each hash includes the previous). Publish a signed per-exam checkpoint hash.
- Signed receipts (server HMAC over answer hash, clientSeq, server time) issued on each sync and at submit.
- Seed commitment: publish hash(seed) before the exam, reveal after, so papers can be regenerated and audited.
- `/verify` page shows chain integrity; editing a DB row turns it red (demo moment).

### 10.6 Data model additions
- **LockEvent**(id, attemptId, type[LOCK, VIOLATION, UNLOCK, RESUME], actorId?, at, prevHash, hash)
- **UnlockCode**(id, attemptId, issuedBy, codeHash, expiresAt, usedAt)
- **Receipt**(id, attemptId, answerHash, clientSeq, serverTime, sig)
- Add `prevHash`, `hash` to Event and Answer; add `seedCommitment`, `seedReveal` to Exam.

### 10.7 Endpoints
- POST /attempts/:id/lock-events
- POST /attempts/:id/unlock-code (examiner/admin)
- POST /attempts/:id/unlock
- GET /attempts/:id/receipts
- GET /verify/exam/:id (chain + seed audit)

### 10.8 Analytics
- Use Microsoft Clarity / GA4 only on non-exam pages (landing, dashboards). Mask or disable on exam pages; never send answers, names or emails.
- Resilience metrics come from first-party Event data.

### 10.9 Cut to make room
Scratchpad drawing canvas, workspace prefs and other low-value extras.

## 11. Supabase Authentication
Supabase Auth replaces custom bcrypt/JWT. Roles: ADMIN, EXAMINER (teacher), CANDIDATE (student).

### 11.1 Flow
- Frontend uses `@supabase/supabase-js` for sign-in (email + password; optional magic link).
- Supabase issues a JWT. The client sends it as `Authorization: Bearer` to our Express API.
- Backend `auth` middleware verifies the JWT (Supabase JWT secret / JWKS) and loads the app `User` row by `supabaseUserId`.
- `requireRole` and ownership checks stay server-side, exactly as in Section 3.

### 11.2 Role storage
- Role lives in our `User.role` table and is mirrored in `app_metadata.role` (set only with the service-role key, never by the client).
- Never trust `user_metadata`; users can edit it.
- Self-signup creates CANDIDATE only. Admin creates EXAMINER/ADMIN accounts via the Supabase Admin API (`inviteUserByEmail`).
- Bulk candidate import creates accounts through the Admin API and sends invites.

### 11.3 Data model change
- `User`: remove `passwordHash`; add `supabaseUserId` (unique, uuid).
- A DB trigger or first-login sync creates the `User` row.
- Database: Supabase Postgres, accessed by Prisma. Enable Row Level Security as a second layer even though the API enforces access.

### 11.4 Security
- The service-role key lives only in server env vars, never in the client.
- Rate-limit login (Supabase built-in + our API), enable email confirmation, set a password policy.
- Short JWT expiry with refresh handled by supabase-js. Deactivated users (`active=false`) are rejected by middleware even with a valid JWT.
- Admin/examiner accounts: enable MFA (TOTP).
- Auth events (login, role change, invite) go into AuditLog.

### 11.5 Offline interaction
- The exam must survive a dropped connection. Cache the session token locally and queue answers in IndexedDB.
- On reconnect, refresh the token first, then sync with `clientSeq`.
- An expired token must not discard queued answers; the server still validates against its own deadline.

### 11.6 Setup tasks
1. Create Supabase project; note URL, anon key, service-role key, JWT secret.
2. Add `.env` for client (URL, anon key) and server (service-role key, JWT secret, DATABASE_URL).
3. Build auth middleware, login/logout pages, and an admin invite page.
4. Update the seed script to create the demo admin, examiner and candidates via the Admin API.


## 12. Build Priority (2 people) - NOTHING is removed from the plan; this only sets the ORDER
**Story:** an exam that survives disconnects and proves nothing was lost or changed.

**Build:** (1) Supabase login + role guard, (2) examiner creates MCQ exam + enrolls, (3) candidate exam page: server timer, autosave, IndexedDB queue synced by clientSeq, (4) signed receipts + hash chain + /verify page, (5) auto-grade + result.
**If time remains:** fullscreen/tab-blur indicators, simple dispute form.
**Build last (still in scope, tier 3):** sandbox, bulk import, PDF/QR, scratchpad, prefs, analytics, seeded randomization, emergency codes, written grading, invite flow, MFA, RLS.
**Auth shortcuts:** email confirmation off; seed 1 admin + 1 examiner; students self-register as CANDIDATE; role in our User table.
**Split:** A = backend (auth middleware, Prisma, exam/attempt APIs, hash chain, receipts). B = frontend (login, examiner pages, exam page + offline queue, verify page).
**Demo:** go offline, answer, reconnect, receipts appear, timer unchanged; /verify green; edit a row -> red.

## 13. Team Workflow (2 people, 2 branches)
Repo layout: `client/` (Person B), `server/` (Person A), `shared/` (agree together). Never edit the other person's folder without asking.

**How to use with an AI assistant:** clone the repo, open it, and say: *"I am Person B. Read plan.md and follow only the Person B workflow (Section 13)."* (or Person A).

### Git rules
- `main` is always working. Branches: `person-a/backend` and `person-b/frontend`; make sub-branches like `person-a/backend-auth` if you want.
- Commit + push every 30-45 min. `git pull origin main` before starting new work.
- Merge to `main` via pull request every hour (hours 1, 2, 3, 4, 5). Freeze features at hour 5.
- Never commit `.env`. Share keys privately.

### Contract (agree in the first 20 min, keep in `api.md`)
- `GET /api/time` -> `{now}`
- `GET /api/me` -> user + role
- `POST /api/exams` / `GET /api/exams` / `POST /api/exams/:id/enroll`
- `POST /api/exams/:id/attempts` -> `{attemptId, deadlineAt, questions (no answer key)}`
- `POST /api/attempts/:id/answers` `{questionId, selected, clientSeq}` -> `{receipt, hash}`
- `POST /api/attempts/:id/submit` -> `{score?}`
- `GET /api/verify/:attemptId` -> `{records, valid, brokenAt}`
Person B codes against mocked responses until A's endpoints are merged.

### Person A: Backend (branch `person-a/backend`, folder `server/`)
1. Supabase project, schema (Prisma or SQL), `.env`, seed 1 admin + 1 examiner + demo candidates.
2. Auth middleware (verify Supabase JWT, load role) and `requireRole`.
3. Exam CRUD, MCQ questions, enrollment APIs.
4. Start attempt: freeze paper snapshot, set `deadlineAt`, strip answer key.
5. Answer sync: idempotent by `clientSeq`, reject past `deadlineAt + grace`, hash chain + signed receipt (`server/src/chain.ts`).
6. Submit, auto-grade, results (candidate sees own only), verify endpoint.
7. Event logging endpoint (tab blur, fullscreen exit, disconnect/reconnect).
8. Hour 5-6: bug fixes, seed data, deploy/run instructions.

### Person B: Frontend (branch `person-b/frontend`, folder `client/`)
1. Vite + React + TS + Tailwind (+ shadcn, TanStack Query, `idb-keyval`), Supabase client, `.env`.
2. Login/register pages, role-based routing (admin / examiner / candidate).
3. Examiner pages: create exam + MCQs, enroll candidates, live attempts view.
4. Candidate dashboard (available / upcoming / completed).
5. Exam page: server-offset timer, question palette, autosave to IndexedDB first then sync by `clientSeq`, badge Saved / Saving / Offline + queued count, resume on refresh, token refresh before sync.
6. Soft lock: fullscreen prompt, tab-blur/paste logging, "indicators, not proof" notice.
7. Result page, receipts list, `/verify` page (green/red chain status).
8. Hour 5-6: polish, demo script, slides, offline demo rehearsal x2.

### Shared milestones
- Hour 0-0.5: together: repo, contract, schema, keys.
- Hour 4: first end-to-end test (login -> exam -> offline answers -> sync -> submit -> verify).
- Hour 5: feature freeze. Last 45 min: rehearse; record a fallback demo video.


## 14. FINAL STACK (overrides Sections 2, 3, 11, 13 where they conflict)
**Next.js (App Router) + TypeScript + Supabase (Auth, Postgres, optional Realtime). No Express, no Prisma.**

| Layer | Choice |
|---|---|
| Frontend | Next.js + TS, Tailwind + shadcn/ui, TanStack Query, `idb-keyval`, Serwist (service worker, if time) |
| Backend | Next.js Route Handlers (`app/api/**/route.ts`) for trusted logic, using the service-role key (server env only) |
| Data/Auth | Supabase Auth + Postgres, `@supabase/ssr`, generated types (`supabase gen types typescript`) |
| Access control | Row Level Security (required) + role checks in route handlers |
| Validation | Zod |
| Hash chain / receipts | Node `crypto` inside route handlers (`lib/server/chain.ts`) |
| Deploy | Vercel + Supabase (or local for the demo) |

### Layout (single app)
```
app/(pages)/...        Person B
components/ hooks/ lib/offline/   Person B
app/api/**/route.ts    Person A
lib/server/ (auth, chain, grading) Person A
supabase/migrations/ (SQL + RLS) seed.sql  Person A
lib/shared/ (zod schemas, types)   agree together
```

### Rules
- Browser uses `supabase-js` (anon key) only for login and simple RLS-protected reads.
- Anything touching deadlines, answers, receipts, grading, answer keys goes through `app/api` only.
- Correct answers live in a separate table `question_keys` with no client-readable policy.
- Service-role key and DB URL: server env only (`.env.local`, never committed, never `NEXT_PUBLIC_`).

### Person A (branch person-a/backend)
1. Supabase project, email confirmation off, schema + RLS migrations, `question_keys` table, seed (admin, examiner, candidates).
2. `lib/server/auth.ts`: get user + role from session; `requireRole`.
3. Route handlers: exams, questions, enroll, start attempt (snapshot, deadline, no keys), answers sync (idempotent clientSeq, deadline+grace, hash chain, receipt), submit + grade, results, events, verify.
4. Optional: Postgres RPC for atomic answer insert + chain.

### Person B (branch person-b/frontend)
1. Next.js scaffold, Tailwind, shadcn, Supabase client/SSR helpers, `.env.local`.
2. Login/register, middleware for role-based routing.
3. Examiner pages, candidate dashboard.
4. Exam page (client component): server-offset timer, palette, IndexedDB-first autosave, sync by clientSeq, offline badge, resume, token refresh.
5. Soft lock + indicators, result page, receipts, `/verify` page.
6. Polish, demo script, offline rehearsal.


## 15. Complete Tech Stack (Next.js + Supabase + TypeScript) - covers EVERY feature in this plan
Nothing in Sections 1-13 is dropped. Where Section 14 differs (Express/Prisma/bcrypt), the Next.js + Supabase equivalent below applies.

### 15.1 Frontend (Person B)
| Need | Package |
|---|---|
| Framework/UI | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react |
| Forms + validation | react-hook-form + Zod (`@hookform/resolvers`) |
| Server state | TanStack Query |
| Local UI state | Zustand |
| Auth client | `@supabase/supabase-js`, `@supabase/ssr` |
| Offline queue (5.3, 4.1) | `idb-keyval` or Dexie (IndexedDB), Serwist (service worker/PWA) |
| Network-aware UI (4.1) | `navigator.onLine` + heartbeat hook, sonner (toasts) |
| Live monitor/announcements (Sec 5.6) | Supabase Realtime (fallback: SWR/polling) |
| Charts/analytics (5.8, 4.5) | Recharts |
| QR display (4.6) | qrcode.react |
| Bulk import UI (4.4) | papaparse (CSV parse + row error table) |
| Workspace prefs (4.7) | next-themes (theme/high contrast), CSS variables for font size, saved to User.prefs |
| Scratchpad (4.8) | textarea + perfect-freehand or react-konva canvas, autosave to IndexedDB + server |
| Soft lock / indicators (Sec 10) | Fullscreen API, Keyboard Lock API, `visibilitychange` (native) |
| Tables | TanStack Table |
| Dates | date-fns |
| Analytics (non-exam pages only) | Microsoft Clarity, GA4 (`@next/third-parties`) |

### 15.2 Backend (Person A)
| Need | Tool |
|---|---|
| Auth + RBAC | Supabase Auth, role in `users` table, route-handler `requireRole`, RLS |
| Database | Supabase Postgres, SQL migrations (`supabase/migrations`), `supabase gen types typescript` |
| API | Next.js Route Handlers (`runtime = "nodejs"`) using service-role key |
| Validation | Zod (shared schemas in `lib/shared`) |
| Exam expiry finalizer (Sec 5.5) | `pg_cron` in Supabase (or lazy finalize on read) |
| Atomic submit/grading | Postgres functions (RPC) / transactions |
| Hash chain, receipts, verifyCode, unlock codes (Sec 10) | Node `crypto` (SHA-256, HMAC) |
| Fair randomization (5.2) | `seedrandom` (deterministic, seed commitment), blueprint quota generator |
| PDF reports (4.2) | `pdfkit` (Node runtime) or `@react-pdf/renderer` |
| QR in PDF/verify (4.6) | `qrcode` |
| Bulk import (4.4) | `papaparse` / `csv-parse` + Zod per-row validation, Admin API for creating users |
| Rate limiting | `@upstash/ratelimit` (free) or Supabase auth limits |
| Security headers/CORS | `next.config.js` headers (helmet equivalent), strict CSP |
| Storage (optional) | Supabase Storage |
| Audit log (Sec 4, 11) | `audit_log` table written from route handlers |
| Sandbox attempts (4.3) | `is_sandbox` flag excluded in all queries/views |

### 15.3 Tooling (both)
TypeScript strict, ESLint + Prettier, Vitest (unit: chain, grading, randomization), Playwright (offline demo e2e), Husky optional, Vercel (deploy) + Supabase cloud, GitHub (branches per Section 13).

### 15.4 Notes
- `pdfkit` and `crypto` need the Node runtime, not Edge.
- Keep the answer key in a table the client cannot read (RLS).
- Service-role key only in server env (`.env.local`, no `NEXT_PUBLIC_`).
