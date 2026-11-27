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
import type { ServerPaperSnapshot } from "@/lib/shared/types";

export const runtime = "nodejs";

/**
 * Exam Results & Question Analytics (Section 5.8 + Feature 4.5 + Ambiguity Auto-Detection + EMS Student Marks Breakdown).
 * Strictly excludes sandbox attempts (Feature 4.3).
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
      .select("id, owner_id, title, results_published, class_name, section")
      .eq("id", examId)
      .maybeSingle();

    if (!exam) throw new HttpError(404, "Exam not found");
    assertExamOwnership(user, exam);

    await lazyFinalizeExpiredAttempts(supabase, examId);

    const { data: attempts } = await supabase
      .from("attempts")
      .select(
        "id, candidate_id, status, score, max_score, started_at, submitted_at, balance_score, paper_snapshot, verify_code, users(id, name, email, class_name, section)"
      )
      .eq("exam_id", examId)
      .eq("is_sandbox", false);

    const realAttempts = attempts ?? [];
    const attemptIds = realAttempts.map((a) => a.id);

    const [{ data: grades }, { data: answers }] = await Promise.all([
      attemptIds.length
        ? supabase.from("attempt_grades").select("*").in("attempt_id", attemptIds)
        : Promise.resolve({ data: [] }),
      attemptIds.length
        ? supabase
            .from("answers")
            .select("attempt_id, question_id, selected, client_seq")
            .in("attempt_id", attemptIds)
            .eq("accepted", true)
            .order("client_seq", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    // Summary stats & score distribution buckets (0-20, 20-40, 40-60, 60-80, 80-100%)
    const distribution = [
      { bucket: "0-20%", count: 0 },
      { bucket: "20-40%", count: 0 },
      { bucket: "40-60%", count: 0 },
      { bucket: "60-80%", count: 0 },
      { bucket: "80-100%", count: 0 },
    ];

    const completed = realAttempts.filter((a) => a.status !== "IN_PROGRESS");
    let sumPct = 0;
    let sumScore = 0;
    let passCount = 0;

    for (const a of completed) {
      const score = Number(a.score ?? 0);
      const max = Number(a.max_score || 1);
      const pct = Math.min(100, Math.max(0, (score / max) * 100));
      sumPct += pct;
      sumScore += score;
      if (pct >= 50) passCount++;
      const idx = Math.min(4, Math.floor(pct / 20));
      distribution[idx].count++;
    }

    // Latest accepted answer per (attempt, question)
    const latestAns = new Map<string, unknown>();
    for (const ans of answers ?? []) {
      latestAns.set(`${ans.attempt_id}:${ans.question_id}`, ans.selected);
    }

    const gradeMap = new Map<
      string,
      { awarded: number | null; max_marks: number; is_pending_manual: boolean }
    >();
    for (const g of grades ?? []) {
      gradeMap.set(`${g.attempt_id}:${g.question_id}`, {
        awarded: g.awarded !== null ? Number(g.awarded) : null,
        max_marks: Number(g.max_marks),
        is_pending_manual: Boolean(g.is_pending_manual),
      });
    }

    // Question-level analytics: % correct, skip rate, most common wrong option, difficulty index, ambiguity flag
    const qStats = new Map<
      string,
      {
        questionId: string;
        text: string;
        type: string;
        difficulty: number;
        shownCount: number;
        correctCount: number;
        skipCount: number;
        wrongOptionCounts: Map<string, { text: string; count: number }>;
      }
    >();

    for (const a of completed) {
      const snap = a.paper_snapshot as ServerPaperSnapshot;
      for (const q of snap.questions ?? []) {
        if (!qStats.has(q.id)) {
          qStats.set(q.id, {
            questionId: q.id,
            text: q.text,
            type: q.type,
            difficulty: q.difficulty,
            shownCount: 0,
            correctCount: 0,
            skipCount: 0,
            wrongOptionCounts: new Map(),
          });
        }
        const st = qStats.get(q.id)!;
        st.shownCount++;

        const sel = latestAns.get(`${a.id}:${q.id}`);
        const isSkipped =
          sel === undefined ||
          sel === null ||
          (Array.isArray(sel) && sel.length === 0) ||
          (typeof sel === "string" && sel.trim() === "");

        if (isSkipped) {
          st.skipCount++;
          continue;
        }

        const g = gradeMap.get(`${a.id}:${q.id}`);
        const isFullCorrect =
          g && g.awarded !== null && g.awarded >= g.max_marks - 0.01;
        if (isFullCorrect) {
          st.correctCount++;
        } else if (q.type !== "WRITTEN") {
          const chosenIds = Array.isArray(sel) ? sel.map(String) : [String(sel)];
          const optTextById = new Map(q.options.map((o) => [o.id, o.text]));
          for (const oid of chosenIds) {
            if (!q.correctOptionIds.includes(oid)) {
              const prev = st.wrongOptionCounts.get(oid) ?? {
                text: optTextById.get(oid) ?? oid,
                count: 0,
              };
              prev.count++;
              st.wrongOptionCounts.set(oid, prev);
            }
          }
        }
      }
    }

    const questionAnalytics = Array.from(qStats.values()).map((st) => {
      const pctCorrect = st.shownCount ? (st.correctCount / st.shownCount) * 100 : 0;
      const skipRate = st.shownCount ? (st.skipCount / st.shownCount) * 100 : 0;
      const difficultyIndex = Number((1 - pctCorrect / 100).toFixed(4));

      let mostCommonWrong: { optionId: string; text: string; count: number } | null = null;
      for (const [oid, info] of st.wrongOptionCounts.entries()) {
        if (!mostCommonWrong || info.count > mostCommonWrong.count) {
          mostCommonWrong = { optionId: oid, text: info.text, count: info.count };
        }
      }

      const possiblyAmbiguous =
        st.shownCount >= 3 &&
        (pctCorrect < 25 || (mostCommonWrong !== null && mostCommonWrong.count > st.correctCount));

      return {
        questionId: st.questionId,
        text: st.text,
        type: st.type,
        nominalDifficulty: st.difficulty,
        shownCount: st.shownCount,
        pctCorrect: Number(pctCorrect.toFixed(1)),
        skipRate: Number(skipRate.toFixed(1)),
        difficultyIndex,
        mostCommonWrong,
        mostCommonWrongOption: mostCommonWrong
          ? `${mostCommonWrong.text} (${mostCommonWrong.count}x)`
          : null,
        possiblyAmbiguous,
        ambiguityFlag: possiblyAmbiguous,
      };
    });

    const candidates = realAttempts.map((a) => {
      const snap = a.paper_snapshot as ServerPaperSnapshot;
      const qs = snap?.questions ?? [];
      let correctCount = 0;
      let wrongCount = 0;
      let unansweredCount = 0;
      let pendingManual = 0;

      for (const q of qs) {
        const sel = latestAns.get(`${a.id}:${q.id}`);
        const isSkipped =
          sel === undefined ||
          sel === null ||
          (Array.isArray(sel) && sel.length === 0) ||
          (typeof sel === "string" && sel.trim() === "");

        const g = gradeMap.get(`${a.id}:${q.id}`);
        if (g?.is_pending_manual) pendingManual++;

        if (isSkipped) {
          unansweredCount++;
        } else if (g && g.awarded !== null) {
          if (g.awarded >= g.max_marks - 0.01) {
            correctCount++;
          } else {
            wrongCount++;
          }
        }
      }

      const timeTakenMin =
        a.started_at && a.submitted_at
          ? Math.max(
              1,
              Math.round(
                (new Date(a.submitted_at).getTime() - new Date(a.started_at).getTime()) / 60_000
              )
            )
          : null;

      const candidateUser = Array.isArray(a.users) ? a.users[0] : a.users;

      return {
        attemptId: a.id,
        candidate: candidateUser,
        status: a.status,
        score: a.score !== null ? Number(a.score) : null,
        maxScore: Number(a.max_score),
        balanceScore: a.balance_score ? Number(a.balance_score) : null,
        submittedAt: a.submitted_at,
        timeTakenMin,
        totalQuestions: qs.length,
        correctCount,
        wrongCount,
        unansweredCount,
        pendingManualCount: pendingManual,
        verifyCode: a.verify_code,
      };
    });

    const averageScore = completed.length ? Number((sumScore / completed.length).toFixed(2)) : null;
    const passRatePct = completed.length ? Number(((passCount / completed.length) * 100).toFixed(1)) : null;

    return jsonOk({
      examId,
      examTitle: exam.title,
      className: exam.class_name ?? null,
      section: exam.section ?? null,
      resultsPublished: exam.results_published,
      summary: {
        totalAttempts: realAttempts.length,
        totalSubmitted: completed.length,
        avg: averageScore,
        averageScore: averageScore ?? 0,
        averagePct: completed.length ? Number((sumPct / completed.length).toFixed(1)) : 0,
        passRate: passRatePct,
        passRatePct: passRatePct ?? 0,
        distribution,
      },
      candidates,
      questionAnalytics,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
