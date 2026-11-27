import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  computeExamLifecycle,
  handleRouteError,
  HttpError,
  jsonOk,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { lazyFinalizeExpiredAttempts } from "@/lib/server/grading";
import { uuidSchema } from "@/lib/shared/schemas";
import type { ComputedExamLifecycle } from "@/lib/shared/types";

export const runtime = "nodejs";

function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

const LIFECYCLE_ORDER: Record<ComputedExamLifecycle, number> = {
  ONGOING: 0,
  PUBLISHED: 1,
  DRAFT: 2,
  COMPLETED: 3,
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);

    const daysParam = Number(req.nextUrl.searchParams.get("days") ?? 30);
    const days: 7 | 30 = daysParam === 7 ? 7 : 30;

    const examIdParam = req.nextUrl.searchParams.get("examId");
    if (examIdParam && !uuidSchema.safeParse(examIdParam).success) {
      throw new HttpError(400, "Invalid examId parameter");
    }

    const supabase = getServiceSupabase();
    await lazyFinalizeExpiredAttempts(supabase);

    let examQuery = supabase
      .from("exams")
      .select(
        "id, owner_id, title, instructions, start_at, end_at, duration_min, total_marks, status, shuffle_questions, shuffle_options, blueprint, results_published, grace_sec, partial_credit_config, per_question_timer_sec, no_backtrack, seed_commitment, seed_reveal, checkpoint_hash, created_at"
      )
      .order("created_at", { ascending: false });

    if (user.role === "EXAMINER") {
      examQuery = examQuery.eq("owner_id", user.id);
    }

    let questionCountQuery = supabase
      .from("questions")
      .select("*", { count: "exact", head: true });
    if (user.role === "EXAMINER") {
      questionCountQuery = questionCountQuery.eq("owner_id", user.id);
    }

    const [{ data: rawExams, error: examErr }, { count: questionsCount, error: qErr }] =
      await Promise.all([examQuery, questionCountQuery]);

    if (examErr) throw new HttpError(500, examErr.message);
    if (qErr) throw new HttpError(500, qErr.message);

    const allExams = rawExams ?? [];

    if (examIdParam && !allExams.some((e) => e.id === examIdParam)) {
      const { data: target } = await supabase
        .from("exams")
        .select("id, owner_id")
        .eq("id", examIdParam)
        .maybeSingle();
      if (!target) throw new HttpError(404, "Exam not found");
      assertExamOwnership(user, target);
    }

    const examIds = allExams.map((e) => e.id);
    const examIdSet = new Set(examIds);

    let enrollments: Array<{
      exam_id: string;
      candidate_id: string;
      enrolled_at: string;
      users: { id: string; name: string; email: string } | { id: string; name: string; email: string }[] | null;
    }> = [];
    let attempts: Array<{
      id: string;
      exam_id: string;
      candidate_id: string;
      status: string;
      score: number | string | null;
      max_score: number | string;
      started_at: string;
      submitted_at: string | null;
      deadline_at: string;
      last_seen_at: string;
      verify_code: string;
      users: { id: string; name: string; email: string } | { id: string; name: string; email: string }[] | null;
    }> = [];
    let announcements: Array<{
      id: string;
      exam_id: string;
      message: string;
      at: string;
    }> = [];
    const openDisputesList: Array<{
      id: string;
      type: string;
      status: string;
      reason: string;
      created_at: string;
      examId: string;
    }> = [];

    if (examIds.length > 0) {
      const [enrRes, attRes, annRes, dispRes] = await Promise.all([
        supabase
          .from("enrollments")
          .select("exam_id, candidate_id, enrolled_at, users(id, name, email)")
          .in("exam_id", examIds)
          .eq("status", "ENROLLED"),
        supabase
          .from("attempts")
          .select(
            "id, exam_id, candidate_id, status, score, max_score, started_at, submitted_at, deadline_at, last_seen_at, verify_code, users(id, name, email)"
          )
          .in("exam_id", examIds)
          .eq("is_sandbox", false)
          .order("started_at", { ascending: false }),
        supabase
          .from("announcements")
          .select("id, exam_id, message, at")
          .in("exam_id", examIds)
          .order("at", { ascending: false })
          .limit(30),
        supabase
          .from("disputes")
          .select("id, type, status, reason, created_at, attempts!inner(exam_id)")
          .eq("status", "OPEN")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      if (enrRes.error) throw new HttpError(500, enrRes.error.message);
      if (attRes.error) throw new HttpError(500, attRes.error.message);
      if (annRes.error) throw new HttpError(500, annRes.error.message);
      if (dispRes.error) throw new HttpError(500, dispRes.error.message);

      enrollments = (enrRes.data ?? []) as typeof enrollments;
      attempts = (attRes.data ?? []) as typeof attempts;
      announcements = (annRes.data ?? []) as typeof announcements;

      for (const d of dispRes.data ?? []) {
        const att = unwrapSingle(
          d.attempts as { exam_id: string } | { exam_id: string }[] | null
        );
        if (att && examIdSet.has(att.exam_id)) {
          openDisputesList.push({
            id: d.id,
            type: d.type,
            status: d.status,
            reason: d.reason,
            created_at: d.created_at,
            examId: att.exam_id,
          });
        }
      }
    }

    const attemptIds = attempts.map((a) => a.id);

    let pendingGrades: Array<{ attempt_id: string; question_id: string }> = [];
    let events: Array<{
      attempt_id: string;
      type: string;
      meta: Record<string, unknown> | null;
      at: string;
    }> = [];
    let lockEvents: Array<{
      attempt_id: string;
      type: string;
      at: string;
    }> = [];

    if (attemptIds.length > 0) {
      const [gradesRes, eventsRes, locksRes] = await Promise.all([
        supabase
          .from("attempt_grades")
          .select("attempt_id, question_id")
          .in("attempt_id", attemptIds)
          .eq("is_pending_manual", true),
        supabase
          .from("events")
          .select("attempt_id, type, meta, at")
          .in("attempt_id", attemptIds)
          .order("at", { ascending: false })
          .limit(2000),
        supabase
          .from("lock_events")
          .select("attempt_id, type, at")
          .in("attempt_id", attemptIds)
          .order("at", { ascending: false })
          .limit(2000),
      ]);

      if (gradesRes.error) throw new HttpError(500, gradesRes.error.message);
      if (eventsRes.error) throw new HttpError(500, eventsRes.error.message);
      if (locksRes.error) throw new HttpError(500, locksRes.error.message);

      pendingGrades = (gradesRes.data ?? []) as typeof pendingGrades;
      events = (eventsRes.data ?? []) as typeof events;
      lockEvents = (locksRes.data ?? []) as typeof lockEvents;
    }

    // Index pending manual grades and integrity flags per attempt
    const pendingByAttempt = new Map<string, number>();
    for (const g of pendingGrades) {
      pendingByAttempt.set(g.attempt_id, (pendingByAttempt.get(g.attempt_id) ?? 0) + 1);
    }

    const flagCountsByAttempt = new Map<
      string,
      { tabBlurs: number; fullscreenExits: number; pasteEvents: number; lockViolations: number }
    >();
    const ensureFlags = (attId: string) => {
      let entry = flagCountsByAttempt.get(attId);
      if (!entry) {
        entry = { tabBlurs: 0, fullscreenExits: 0, pasteEvents: 0, lockViolations: 0 };
        flagCountsByAttempt.set(attId, entry);
      }
      return entry;
    };

    for (const ev of events) {
      const entry = ensureFlags(ev.attempt_id);
      if (ev.type === "TAB_BLUR") entry.tabBlurs++;
      else if (ev.type === "FULLSCREEN_EXIT") entry.fullscreenExits++;
      else if (ev.type === "PASTE") entry.pasteEvents++;
    }
    for (const le of lockEvents) {
      if (le.type === "VIOLATION") {
        ensureFlags(le.attempt_id).lockViolations++;
      }
    }

    const flaggedAttemptIds = new Set<string>();
    for (const [attId, c] of flagCountsByAttempt.entries()) {
      const score = c.tabBlurs + c.fullscreenExits + c.pasteEvents * 2 + c.lockViolations * 2;
      if (score >= 2) flaggedAttemptIds.add(attId);
    }

    const enrolledByExam = new Map<string, number>();
    const uniqueCandidates = new Set<string>();
    const nowMs = Date.now();
    const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;
    let recentEnrollmentsCount = 0;

    for (const enr of enrollments) {
      enrolledByExam.set(enr.exam_id, (enrolledByExam.get(enr.exam_id) ?? 0) + 1);
      uniqueCandidates.add(enr.candidate_id);
      const enrAt = new Date(enr.enrolled_at).getTime();
      if (!Number.isNaN(enrAt) && enrAt >= thirtyDaysAgoMs) {
        recentEnrollmentsCount++;
      }
    }

    const attemptsByExam = new Map<string, typeof attempts>();
    for (const att of attempts) {
      const list = attemptsByExam.get(att.exam_id) ?? [];
      list.push(att);
      attemptsByExam.set(att.exam_id, list);
    }

    const examsSummary = allExams.map((ex) => {
      const lifecycle = computeExamLifecycle(
        {
          status: ex.status as "DRAFT" | "PUBLISHED",
          start_at: String(ex.start_at),
          end_at: String(ex.end_at),
        },
        nowMs
      );
      const exAttempts = attemptsByExam.get(ex.id) ?? [];
      const enrolledCount = enrolledByExam.get(ex.id) ?? 0;
      const inProgressCount = exAttempts.filter((a) => a.status === "IN_PROGRESS").length;
      const submittedAttempts = exAttempts.filter((a) => a.status !== "IN_PROGRESS");
      const submittedCount = submittedAttempts.length;
      const notStartedCount = Math.max(0, enrolledCount - inProgressCount - submittedCount);
      const flaggedCount = exAttempts.filter((a) => flaggedAttemptIds.has(a.id)).length;
      const pendingManualCount = exAttempts.reduce(
        (sum, a) => sum + (pendingByAttempt.get(a.id) ?? 0),
        0
      );

      let avgPct: number | null = null;
      let passRate: number | null = null;
      if (submittedAttempts.length > 0) {
        let sumPct = 0;
        let passed = 0;
        for (const a of submittedAttempts) {
          const max = Number(a.max_score || 0);
          const sc = Number(a.score ?? 0);
          const pct = max > 0 ? Math.min(100, Math.max(0, (sc / max) * 100)) : 0;
          sumPct += pct;
          if (pct >= 50) passed++;
        }
        avgPct = Number((sumPct / submittedAttempts.length).toFixed(1));
        passRate = Number(((passed / submittedAttempts.length) * 100).toFixed(1));
      }

      return {
        id: ex.id,
        title: ex.title,
        status: ex.status as "DRAFT" | "PUBLISHED",
        lifecycle,
        startAt: String(ex.start_at),
        endAt: String(ex.end_at),
        durationMin: Number(ex.duration_min ?? 60),
        totalMarks: Number(ex.total_marks ?? 0),
        resultsPublished: Boolean(ex.results_published),
        shuffleQuestions: Boolean(ex.shuffle_questions),
        shuffleOptions: Boolean(ex.shuffle_options),
        noBacktrack: Boolean(ex.no_backtrack),
        graceSec: Number(ex.grace_sec ?? 15),
        hasBlueprint: Array.isArray(ex.blueprint) && ex.blueprint.length > 0,
        seedCommitment: ex.seed_commitment ?? null,
        seedRevealed: Boolean(ex.seed_reveal),
        checkpointHash: ex.checkpoint_hash ?? null,
        enrolledCount,
        inProgressCount,
        submittedCount,
        notStartedCount,
        flaggedCount,
        pendingManualCount,
        avgPct,
        passRate,
        createdAt: String(ex.created_at),
      };
    });

    examsSummary.sort((a, b) => {
      const orderDiff = LIFECYCLE_ORDER[a.lifecycle] - LIFECYCLE_ORDER[b.lifecycle];
      if (orderDiff !== 0) return orderDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Global KPI stats
    const examsCreatedLast30Days = examsSummary.filter(
      (e) => new Date(e.createdAt).getTime() >= thirtyDaysAgoMs
    ).length;
    const ongoingExams = examsSummary.filter((e) => e.lifecycle === "ONGOING").length;
    const scheduledExams = examsSummary.filter((e) => e.lifecycle === "PUBLISHED").length;
    const draftExams = examsSummary.filter((e) => e.lifecycle === "DRAFT").length;
    const completedExams = examsSummary.filter((e) => e.lifecycle === "COMPLETED").length;

    const allCompletedAttempts = attempts.filter((a) => a.status !== "IN_PROGRESS");
    const totalInProgress = attempts.filter((a) => a.status === "IN_PROGRESS").length;
    const totalSubmitted = allCompletedAttempts.length;

    let avgPerformancePct: number | null = null;
    let passRatePct: number | null = null;
    if (allCompletedAttempts.length > 0) {
      let sumPct = 0;
      let passCount = 0;
      for (const a of allCompletedAttempts) {
        const max = Number(a.max_score || 0);
        const sc = Number(a.score ?? 0);
        const pct = max > 0 ? Math.min(100, Math.max(0, (sc / max) * 100)) : 0;
        sumPct += pct;
        if (pct >= 50) passCount++;
      }
      avgPerformancePct = Number((sumPct / allCompletedAttempts.length).toFixed(1));
      passRatePct = Number(((passCount / allCompletedAttempts.length) * 100).toFixed(1));
    }

    const pendingManualGrades = pendingGrades.length;
    const openDisputes = openDisputesList.length;
    const flaggedAttemptsCount = flaggedAttemptIds.size;
    const liveBadgeCount = flaggedAttemptsCount > 0 ? flaggedAttemptsCount : ongoingExams;

    // Live Monitoring Focus Exam
    const focusExam =
      (examIdParam ? examsSummary.find((e) => e.id === examIdParam) : undefined) ??
      examsSummary.find((e) => e.lifecycle === "ONGOING") ??
      examsSummary.find((e) => e.inProgressCount > 0 || e.submittedCount > 0) ??
      examsSummary[0] ??
      null;

    const attemptById = new Map(attempts.map((a) => [a.id, a]));
    const examTitleById = new Map(examsSummary.map((e) => [e.id, e.title]));

    let liveMonitoring: {
      examId: string;
      examTitle: string;
      lifecycle: ComputedExamLifecycle;
      enrolled: number;
      inProgress: number;
      submitted: number;
      notStarted: number;
      inProgressPct: number;
      feed: Array<{
        id: string;
        kind: "submit" | "connection" | "announcement" | "alert" | "start";
        message: string;
        at: string;
        examId: string;
        attemptId?: string;
      }>;
    } | null = null;

    if (focusExam) {
      const denom = focusExam.inProgressCount + focusExam.submittedCount + focusExam.notStartedCount;
      const inProgressPct =
        denom > 0 ? Math.round((focusExam.inProgressCount / denom) * 100) : 0;

      const focusAttempts = attemptsByExam.get(focusExam.id) ?? [];
      const focusAttemptIds = new Set(focusAttempts.map((a) => a.id));

      const feed: Array<{
        id: string;
        kind: "submit" | "connection" | "announcement" | "alert" | "start";
        message: string;
        at: string;
        examId: string;
        attemptId?: string;
      }> = [];

      for (const ann of announcements) {
        if (ann.exam_id === focusExam.id) {
          feed.push({
            id: `ann-${ann.id}`,
            kind: "announcement",
            message: `Announcement sent: ${ann.message}`,
            at: ann.at,
            examId: focusExam.id,
          });
        }
      }

      for (const att of focusAttempts.slice(0, 15)) {
        const cand = unwrapSingle(att.users);
        const cname = cand?.name || cand?.email || "Candidate";
        if (att.submitted_at) {
          feed.push({
            id: `sub-${att.id}`,
            kind: "submit",
            message: `${cname} submitted the exam`,
            at: att.submitted_at,
            examId: focusExam.id,
            attemptId: att.id,
          });
        }
        feed.push({
          id: `start-${att.id}`,
          kind: "start",
          message: `${cname} started the session`,
          at: att.started_at,
          examId: focusExam.id,
          attemptId: att.id,
        });
      }

      let evIdx = 0;
      for (const ev of events) {
        if (!focusAttemptIds.has(ev.attempt_id)) continue;
        const att = attemptById.get(ev.attempt_id);
        const cand = att ? unwrapSingle(att.users) : null;
        const cname = cand?.name || cand?.email || "Candidate";

        if (ev.type === "RECONNECT" || ev.type === "DISCONNECT") {
          feed.push({
            id: `conn-${ev.attempt_id}-${evIdx++}`,
            kind: "connection",
            message:
              ev.type === "RECONNECT"
                ? `Connection restored for ${cname}`
                : `Connection interrupted for ${cname}`,
            at: ev.at,
            examId: focusExam.id,
            attemptId: ev.attempt_id,
          });
        } else if (
          ev.type === "TAB_BLUR" ||
          ev.type === "FULLSCREEN_EXIT" ||
          ev.type === "PASTE" ||
          ev.type === "COPY_ATTEMPT"
        ) {
          feed.push({
            id: `ev-alert-${ev.attempt_id}-${evIdx++}`,
            kind: "alert",
            message: `Review indicator (${ev.type.replace(/_/g, " ")}) · ${cname}`,
            at: ev.at,
            examId: focusExam.id,
            attemptId: ev.attempt_id,
          });
        }
        if (evIdx >= 30) break;
      }

      let leIdx = 0;
      for (const le of lockEvents) {
        if (!focusAttemptIds.has(le.attempt_id)) continue;
        if (le.type !== "VIOLATION" && le.type !== "LOCK") continue;
        const att = attemptById.get(le.attempt_id);
        const cand = att ? unwrapSingle(att.users) : null;
        const cname = cand?.name || cand?.email || "Candidate";
        feed.push({
          id: `le-alert-${le.attempt_id}-${leIdx++}`,
          kind: "alert",
          message: `Session lock ${le.type.toLowerCase()} · ${cname}`,
          at: le.at,
          examId: focusExam.id,
          attemptId: le.attempt_id,
        });
        if (leIdx >= 15) break;
      }

      feed.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

      liveMonitoring = {
        examId: focusExam.id,
        examTitle: focusExam.title,
        lifecycle: focusExam.lifecycle,
        enrolled: focusExam.enrolledCount,
        inProgress: focusExam.inProgressCount,
        submitted: focusExam.submittedCount,
        notStarted: focusExam.notStartedCount,
        inProgressPct,
        feed: feed.slice(0, 6),
      };
    }

    // Insights Series (7 or 30 days)
    const now = new Date();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const insightsSeries: Array<{
      label: string;
      date: string;
      attempts: number;
      submitted: number;
      passRate: number;
      avgScorePct: number;
    }> = [];

    for (let offset = days - 1; offset >= 0; offset--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - offset);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const dMs = d.getTime();
      const nextMs = next.getTime();

      const dayAttempts = attempts.filter((a) => {
        const t = new Date(a.started_at).getTime();
        return t >= dMs && t < nextMs;
      });

      const daySubmitted = allCompletedAttempts.filter((a) => {
        const t = new Date(a.submitted_at ?? a.started_at).getTime();
        return t >= dMs && t < nextMs;
      });

      let dayPassRate = 0;
      let dayAvgScorePct = 0;
      if (daySubmitted.length > 0) {
        let sumPct = 0;
        let passed = 0;
        for (const a of daySubmitted) {
          const max = Number(a.max_score || 0);
          const sc = Number(a.score ?? 0);
          const pct = max > 0 ? Math.min(100, Math.max(0, (sc / max) * 100)) : 0;
          sumPct += pct;
          if (pct >= 50) passed++;
        }
        dayPassRate = Number(((passed / daySubmitted.length) * 100).toFixed(1));
        dayAvgScorePct = Number((sumPct / daySubmitted.length).toFixed(1));
      }

      const label =
        days === 7
          ? dayNames[d.getDay()]
          : `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;

      insightsSeries.push({
        label,
        date: d.toISOString().slice(0, 10),
        attempts: dayAttempts.length,
        submitted: daySubmitted.length,
        passRate: dayPassRate,
        avgScorePct: dayAvgScorePct,
      });
    }

    // Deduplicated searchable candidate directory (max 200)
    const candidateMap = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        examIds: Set<string>;
        latestExamId: string;
        latestExamTitle: string;
        latestAttemptId?: string;
        latestStatus?: string;
        latestScorePct?: number | null;
        latestAtMs: number;
      }
    >();

    for (const enr of enrollments) {
      const u = unwrapSingle(enr.users);
      if (!u) continue;
      const tMs = new Date(enr.enrolled_at).getTime() || 0;
      const existing = candidateMap.get(u.id);
      if (!existing) {
        candidateMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          examIds: new Set([enr.exam_id]),
          latestExamId: enr.exam_id,
          latestExamTitle: examTitleById.get(enr.exam_id) ?? "Exam",
          latestAtMs: tMs,
        });
      } else {
        existing.examIds.add(enr.exam_id);
        if (tMs > existing.latestAtMs && !existing.latestAttemptId) {
          existing.latestExamId = enr.exam_id;
          existing.latestExamTitle = examTitleById.get(enr.exam_id) ?? "Exam";
          existing.latestAtMs = tMs;
        }
      }
    }

    for (const att of attempts) {
      const u = unwrapSingle(att.users);
      if (!u) continue;
      const tMs = new Date(att.submitted_at ?? att.started_at).getTime() || 0;
      const max = Number(att.max_score || 0);
      const scorePct =
        att.score !== null && att.score !== undefined && max > 0
          ? Number(((Number(att.score) / max) * 100).toFixed(1))
          : null;

      const existing = candidateMap.get(u.id);
      if (!existing) {
        candidateMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          examIds: new Set([att.exam_id]),
          latestExamId: att.exam_id,
          latestExamTitle: examTitleById.get(att.exam_id) ?? "Exam",
          latestAttemptId: att.id,
          latestStatus: att.status,
          latestScorePct: scorePct,
          latestAtMs: tMs,
        });
      } else {
        existing.examIds.add(att.exam_id);
        if (!existing.latestAttemptId || tMs >= existing.latestAtMs) {
          existing.latestExamId = att.exam_id;
          existing.latestExamTitle = examTitleById.get(att.exam_id) ?? "Exam";
          existing.latestAttemptId = att.id;
          existing.latestStatus = att.status;
          existing.latestScorePct = scorePct;
          existing.latestAtMs = tMs;
        }
      }
    }

    const candidatesSummary = Array.from(candidateMap.values())
      .sort((a, b) => b.latestAtMs - a.latestAtMs)
      .slice(0, 200)
      .map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        examIds: Array.from(c.examIds),
        latestExamId: c.latestExamId,
        latestExamTitle: c.latestExamTitle,
        latestAttemptId: c.latestAttemptId,
        latestStatus: c.latestStatus,
        latestScorePct: c.latestScorePct ?? null,
      }));

    // Actionable notification items
    const notificationItems: Array<{
      id: string;
      kind: "dispute" | "flag" | "grading";
      title: string;
      subtitle: string;
      at: string;
      examId?: string;
      attemptId?: string;
      disputeId?: string;
    }> = [];

    for (const d of openDisputesList.slice(0, 5)) {
      notificationItems.push({
        id: `notif-disp-${d.id}`,
        kind: "dispute",
        title: `Open ${d.type} dispute`,
        subtitle: `${examTitleById.get(d.examId) ?? "Exam"} · ${d.reason}`,
        at: d.created_at,
        examId: d.examId,
        disputeId: d.id,
      });
    }

    for (const att of attempts) {
      if (!flaggedAttemptIds.has(att.id)) continue;
      const cand = unwrapSingle(att.users);
      notificationItems.push({
        id: `notif-flag-${att.id}`,
        kind: "flag",
        title: `Review indicators · ${cand?.name ?? "Candidate"}`,
        subtitle: examTitleById.get(att.exam_id) ?? "Exam",
        at: att.last_seen_at || att.started_at,
        examId: att.exam_id,
        attemptId: att.id,
      });
      if (notificationItems.length >= 8) break;
    }

    for (const ex of examsSummary) {
      if (ex.pendingManualCount > 0) {
        notificationItems.push({
          id: `notif-grade-${ex.id}`,
          kind: "grading",
          title: `${ex.pendingManualCount} written item(s) pending grading`,
          subtitle: ex.title,
          at: ex.endAt,
          examId: ex.id,
        });
      }
      if (notificationItems.length >= 10) break;
    }

    return jsonOk({
      stats: {
        totalExams: examsSummary.length,
        examsCreatedLast30Days,
        ongoingExams,
        scheduledExams,
        draftExams,
        completedExams,
        enrolledCandidates: uniqueCandidates.size,
        totalEnrollments: enrollments.length,
        recentEnrollmentsCount,
        totalSubmitted,
        totalInProgress,
        totalQuestions: questionsCount ?? 0,
        avgPerformancePct,
        passRatePct,
        pendingManualGrades,
        openDisputes,
        flaggedAttemptsCount,
        liveBadgeCount,
      },
      exams: examsSummary.map(({ createdAt: _createdAt, ...rest }) => {
        void _createdAt;
        return rest;
      }),
      liveMonitoring,
      insightsSeries,
      candidatesSummary,
      notifications: {
        unreadCount: openDisputes + pendingManualGrades + flaggedAttemptsCount,
        openDisputes,
        pendingManualGrades,
        flaggedAttemptsCount,
        items: notificationItems.slice(0, 10),
      },
      serverNow: nowMs,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
