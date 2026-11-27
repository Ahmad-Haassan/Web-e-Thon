# API Contract (`api.md`) — Person A (Backend) <-> Person B (Frontend)

All authenticated routes accept either:
- Supabase SSR session cookies (`@supabase/ssr`), OR
- `Authorization: Bearer <supabase_access_token>`

All error responses return `{ "error": string, "details"?: unknown }`.

---

## 1. System & Auth
| Method | Endpoint | Roles | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/time` | Public | — | `{ now: number, iso: string }` |
| `GET` | `/api/me` | Auth | — | `{ user: AppUser }` |
| `PATCH` | `/api/me/prefs` | Auth | `WorkspacePrefs` (partial) | `{ prefs: WorkspacePrefs }` |

## 2. Admin User Management
| Method | Endpoint | Roles | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/admin/users` | `ADMIN` | `?role=&search=` | `{ users: AppUser[] }` |
| `POST` | `/api/admin/users` | `ADMIN` | `{ name, email, password?, role, invite? }` | `{ user: AppUser }` |
| `PATCH` | `/api/admin/users/[id]` | `ADMIN` | `{ name?, role?, active? }` | `{ user: AppUser }` |
| `DELETE` | `/api/admin/users/[id]` | `ADMIN` | — (soft-deactivates `active=false`) | `{ ok: true }` |

## 3. Categories & Question Bank
| Method | Endpoint | Roles | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/categories` | Auth | — | `{ categories }` |
| `POST` | `/api/categories` | `ADMIN`, `EXAMINER` | `{ name }` | `{ category }` |
| `GET` | `/api/questions` | `ADMIN`, `EXAMINER` | `?categoryId=&difficulty=&type=&search=` | `{ questions }` (with options + keys) |
| `POST` | `/api/questions` | `ADMIN`, `EXAMINER` | `createQuestionSchema` | `{ question }` |
| `GET` | `/api/questions/[id]` | `ADMIN`, `EXAMINER` | — | `{ question }` |
| `PATCH` | `/api/questions/[id]` | `ADMIN`, `EXAMINER` | `updateQuestionSchema` | `{ question }` |
| `DELETE` | `/api/questions/[id]` | `ADMIN`, `EXAMINER` | — | `{ ok: true }` |
| `POST` | `/api/import/questions` | `ADMIN`, `EXAMINER` | `{ csv? \| rows? }` | `{ created, failed, errors: [{ row, message }] }` |
| `POST` | `/api/import/candidates` | `ADMIN`, `EXAMINER` | `{ csv? \| rows?, examId? }` | `{ created, enrolled, failed, errors: [{ row, message }] }` |

## 4. Exams & Enrollments
| Method | Endpoint | Roles | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/exams` | Auth | — | Examiner/Admin: owned/all exams with computed `lifecycle`. Candidate: enrolled exams categorized into `available`, `upcoming`, `completed` + `attempt` summary. |
| `POST` | `/api/exams` | `ADMIN`, `EXAMINER` | `createExamSchema` | `{ exam }` (auto-generates `seedCommitment`) |
| `GET` | `/api/exams/[id]` | Auth (owner/admin/enrolled) | — | `{ exam, questions (stripped for candidate), enrollmentCount, fairnessReport? }` |
| `PATCH` | `/api/exams/[id]` | `ADMIN`, `EXAMINER` (owner) | `updateExamSchema` | `{ exam }` (supports publishing, resultsPublished toggle, seedReveal after completion) |
| `DELETE` | `/api/exams/[id]` | `ADMIN`, `EXAMINER` (owner) | — | `{ ok: true }` |
| `GET` | `/api/exams/[id]/enroll` | `ADMIN`, `EXAMINER` (owner) | — | `{ enrollments }` |
| `POST` | `/api/exams/[id]/enroll` | `ADMIN`, `EXAMINER` (owner) | `{ emails: string[] }` | `{ enrolled, notFound: string[] }` |
| `GET` | `/api/exams/[id]/fairness` | `ADMIN`, `EXAMINER` (owner) | — | `{ attemptsCount, min, max, mean, spread, seedCommitment, seedRevealed }` |

## 5. Attempt Engine, Offline Sync & Integrity
| Method | Endpoint | Roles | Body / Query | Response |
|---|---|---|---|---|
| `POST` | `/api/exams/[id]/attempts` | Auth | `{ isSandbox?, integrityAck? }` | `{ attempt, questions (NO keys!), savedAnswers, receipts, serverNow, sessionToken }` (idempotent: resumes existing IN_PROGRESS attempt!) |
| `GET` | `/api/attempts/[id]` | Owner / Examiner / Admin | — | `{ attempt, questions (stripped while IN_PROGRESS), savedAnswers, receipts, serverNow }` |
| `POST` | `/api/attempts/[id]/answers` | Candidate (owner) | `{ answers: [{ questionId, selected, marked, clientSeq, savedAt }], sessionToken? }` | `{ receipts: SignedReceipt[], serverNow }` (idempotent by `clientSeq`; rejects after `deadline + grace`; hash-chained!) |
| `GET` | `/api/attempts/[id]/receipts` | Candidate (owner) / Examiner / Admin | — | `{ receipts, chain: ChainVerificationResult }` |
| `POST` | `/api/attempts/[id]/submit` | Candidate (owner) | — | `{ attempt, score, maxScore, pendingManualCount, checkpointHash }` (idempotent!) |
| `POST` | `/api/attempts/[id]/events` | Candidate (owner) / Examiner | `{ type, meta?, at? }` | `{ event }` (hash-chained) |
| `POST` | `/api/attempts/[id]/lock-events` | Candidate (owner) | `{ type, meta? }` | `{ lockEvent, escalation: "OK" \| "WARN" \| "FLAGGED" \| "ALERT_EXAMINER" }` |
| `POST` | `/api/attempts/[id]/unlock-code` | `ADMIN`, `EXAMINER` (owner) | `{ reason, expiresInSec?, grantExtraSec? }` | `{ code, expiresAt, grantExtraSec }` (one-time plaintext returned once, stored hashed) |
| `POST` | `/api/attempts/[id]/unlock` | Candidate (owner) | `{ code }` | `{ ok: true, deadlineAt, lockEvent }` |
| `GET` / `PUT` | `/api/attempts/[id]/scratchpad` | Candidate (owner) | `{ textContent, drawingJson }` | `{ scratchpad }` |

## 6. Monitoring, Announcements, Grading & Analytics
| Method | Endpoint | Roles | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/exams/[id]/monitor` | `ADMIN`, `EXAMINER` (owner) | — | `{ attempts: [{ ...progress, lastSeenAt, indicators, status }], flaggedQueue, announcements }` |
| `GET` / `POST` | `/api/exams/[id]/announcements` | Enrolled (GET) / Examiner (POST) | `{ message }` | `{ announcements }` / `{ announcement }` |
| `POST` | `/api/attempts/[id]/grade` | `ADMIN`, `EXAMINER` (owner) | `{ questionId, awarded, feedback? }` | `{ attempt, grade, pendingManualCount }` |
| `GET` | `/api/exams/[id]/analytics` | `ADMIN`, `EXAMINER` (owner) | — | `{ summary: { avg, passRate, distribution, totalSubmitted }, candidates, questionAnalytics (with ambiguityFlags!) }` |
| `GET` | `/api/attempts/[id]/result` | Candidate (if published) / Examiner / Admin | — | `{ attempt, grades, questionsWithExplanations, receipts, verifyCode }` |

## 7. Disputes & Evidence Timeline
| Method | Endpoint | Roles | Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/disputes` | Auth | `?examId=&status=` | Candidate: own disputes. Examiner/Admin: exam disputes. |
| `POST` | `/api/disputes` | `CANDIDATE` | `{ attemptId, questionId?, type, reason }` | `{ dispute }` |
| `GET` | `/api/disputes/[id]` | Owner / Examiner / Admin | — | `{ dispute, evidenceTimeline, answer, key (examiner only), receipts }` |
| `PATCH` | `/api/disputes/[id]` | `ADMIN`, `EXAMINER` (owner) | `{ status, resolution, newAwarded? }` | `{ dispute, rescoredAttemptsCount }` (`AMBIGUOUS_ACCEPTED` fairly re-scores ALL candidates!) |

## 8. PDF Reports, Cron & Public Verification
| Method | Endpoint | Roles | Query | Response |
|---|---|---|---|---|
| `GET` | `/api/reports/exam/[id]/pdf` | `ADMIN`, `EXAMINER` (owner) | — | `application/pdf` (Exam summary + fairness + QR) |
| `GET` | `/api/reports/attempt/[id]/pdf` | Candidate (if published) / Examiner / Admin | — | `application/pdf` (Candidate result + QR verify link) |
| `GET` | `/api/verify/[code]` | **Public** | — | Minimal verifiable report: `{ examTitle, maskedName, scoreBand, issuedAt, chainValid, recordCount, verifyCode }` (NO private data!) |
| `GET` | `/api/verify/attempt/[id]` | **Public** | — | `{ attemptId, answersChain, eventsChain, lockEventsChain, valid }` (tamper demo turns RED if any DB row edited!) |
| `GET` | `/api/verify/exam/[id]` | **Public** | — | `{ examTitle, seedCommitment, seedReveal, checkpointHash, checkpointValid, attemptsChecked, allChainsValid }` |
| `POST` | `/api/cron/finalize` | Secret header `x-cron-secret` or Admin | — | `{ finalizedCount }` |
