import { NextRequest } from "next/server";
import {
  assertExamOwnership,
  handleRouteError,
  HttpError,
  jsonOk,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { lazyFinalizeExpiredAttempts } from "@/lib/server/grading";
import { uuidSchema } from "@/lib/shared/schemas";
import type { IntegrityIndicators, ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

/**
 * Examiner Live Monitoring & Flagged Review Queue (Section 5.6 + Section 10.4).
 * Excludes sandbox attempts. Labels all counts as "indicators, not proof".
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id: examId } = await context.params;
    if (!uuidSchema.safeParse(examId).success) throw new HttpError(400, "Invalid exam ID");

    const supabase = getServiceSupabase();
    const { data: exam } = await supabase
      .from("exams")
      .select("id, owner_id, title")
      .eq("id", examId)
      .maybeSingle();

    if (!exam) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, exam);

    await lazyFinalizeExpiredAttempts(supabase, examId);

    const { data: attempts } = await supabase
      .from("attempts")
      .select("id, candidate_id, status, started_at, deadline_at, submitted_at, last_seen_at, paper_snapshot, score, max_score, users(id, name, email)")
      .eq("exam_id", examId)
      .eq("is_sandbox", false)
      .order("started_at", { ascending: false });

    const attemptIds = (attempts ?? []).map((a) => a.id);

    const [{ data: answers }, { data: events }, { data: lockEvents }, { data: announcements }] =
      await Promise.all([
        attemptIds.length
          ? supabase
              .from("answers")
              .select("attempt_id, question_id, accepted")
              .in("attempt_id", attemptIds)
              .eq("accepted", true)
          : Promise.resolve({ data: [] }),
        attemptIds.length
          ? supabase
              .from("events")
              .select("attempt_id, type, meta, at")
              .in("attempt_id", attemptIds)
              .order("at", { ascending: true })
          : Promise.resolve({ data: [] }),
        attemptIds.length
          ? supabase
              .from("lock_events")
              .select("attempt_id, type, at, meta")
              .in("attempt_id", attemptIds)
              .order("at", { ascending: true })
          : Promise.resolve({ data: [] }),
        supabase
          .from("announcements")
          .select("*")
          .eq("exam_id", examId)
          .order("at", { ascending: false }),
      ]);

    const answeredByAttempt = new Map<string, Set<string>>();
    for (const ans of answers ?? []) {
      if (!answeredByAttempt.has(ans.attempt_id)) answeredByAttempt.set(ans.attempt_id, new Set());
      answeredByAttempt.get(ans.attempt_id)!.add(ans.question_id);
    }

    const eventsByAttempt = new Map<string, { type: string; meta: Record<string, unknown>; at: string }[]>();
    for (const ev of events ?? []) {
      const list = eventsByAttempt.get(ev.attempt_id) ?? [];
      list.push({ type: ev.type, meta: (ev.meta ?? {}) as Record<string, unknown>, at: ev.at });
      eventsByAttempt.set(ev.attempt_id, list);
    }

    const locksByAttempt = new Map<string, { type: string; at: string; meta: Record<string, unknown> }[]>();
    for (const le of lockEvents ?? []) {
      const list = locksByAttempt.get(le.attempt_id) ?? [];
      list.push({ type: le.type, at: le.at, meta: (le.meta ?? {}) as Record<string, unknown> });
      locksByAttempt.set(le.attempt_id, list);
    }

    const rows = (attempts ?? []).map((att) => {
      const snap = att.paper_snapshot as ServerPaperSnapshot;
      const totalQuestions = snap.questions?.length ?? 0;
      const answeredCount = answeredByAttempt.get(att.id)?.size ?? 0;
      const evList = eventsByAttempt.get(att.id) ?? [];
      const leList = locksByAttempt.get(att.id) ?? [];

      let tabBlurs = 0;
      let fullscreenExits = 0;
      let pasteEvents = 0;
      let copyAttempts = 0;
      let disconnects = 0;
      let totalOfflineSec = 0;

      for (const e of evList) {
        if (e.type === "TAB_BLUR") tabBlurs++;
        if (e.type === "FULLSCREEN_EXIT") fullscreenExits++;
        if (e.type === "PASTE") pasteEvents++;
        if (e.type === "COPY_ATTEMPT") copyAttempts++;
        if (e.type === "DISCONNECT") disconnects++;
        if (e.type === "RECONNECT" && typeof e.meta?.offlineSec === "number") {
          totalOfflineSec += e.meta.offlineSec;
        }
      }

      const lockViolations = leList.filter((l) => l.type === "VIOLATION").length;
      const emergencyUnlocks = leList.filter((l) => l.type === "UNLOCK").length;

      const indicators: IntegrityIndicators = {
        disclaimer: "Indicators are signals for examiner review, not proof of misconduct.",
        tabBlurs,
        fullscreenExits,
        pasteEvents,
        copyAttempts,
        disconnects,
        totalOfflineSec,
        lockViolations,
        emergencyUnlocks,
      };

      const flagScore = tabBlurs + fullscreenExits + pasteEvents * 2 + lockViolations * 2;

      return {
        id: att.id,
        attemptId: att.id,
        candidate: att.users,
        status: att.status,
        startedAt: att.started_at,
        deadlineAt: att.deadline_at,
        submittedAt: att.submitted_at,
        lastSeenAt: att.last_seen_at,
        answeredCount,
        totalQuestions,
        score: att.score !== null ? Number(att.score) : null,
        maxScore: Number(att.max_score),
        indicators,
        flaggedForReview: flagScore >= 2,
        flagged: flagScore >= 2,
        recentEvents: evList.slice(-10),
      };
    });

    const flaggedQueue = rows.filter((r) => r.flaggedForReview);

    return jsonOk({
      examId,
      examTitle: exam.title,
      disclaimer: "All integrity flags are indicators for human review, never automated proof.",
      attempts: rows,
      flaggedQueue,
      announcements: announcements ?? [],
      serverNow: Date.now(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
