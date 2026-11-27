import { NextRequest } from "next/server";
import { handleRouteError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import {
  verifyAnswerChain,
  verifyCheckpointSignature,
  verifyEventChain,
} from "@/lib/server/chain";
import { logAudit } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * Full platform cryptographic integrity audit (Admin System Tool):
 * Verifies SHA-256 hash chains across ALL real attempts (answers, events, lock_events)
 * and verifies HMAC signatures on all exam checkpoints.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole(req, ["ADMIN"]);
    const supabase = getServiceSupabase();

    const [{ data: attempts }, { data: exams }] = await Promise.all([
      supabase
        .from("attempts")
        .select("id, exam_id, verify_code, status")
        .eq("is_sandbox", false),
      supabase
        .from("exams")
        .select("id, title, checkpoint_hash, checkpoint_sig"),
    ]);

    let answersChecked = 0;
    let eventsChecked = 0;
    let lockEventsChecked = 0;
    const tamperedAttempts: {
      attemptId: string;
      verifyCode: string;
      chain: "answers" | "events" | "lock_events";
      brokenAt: number;
    }[] = [];

    for (const att of attempts ?? []) {
      const [{ data: answers }, { data: events }, { data: lockEvents }] = await Promise.all([
        supabase.from("answers").select("*").eq("attempt_id", att.id).order("client_seq", { ascending: true }),
        supabase.from("events").select("*").eq("attempt_id", att.id).order("seq", { ascending: true }),
        supabase.from("lock_events").select("*").eq("attempt_id", att.id).order("seq", { ascending: true }),
      ]);

      const aCheck = verifyAnswerChain(
        (answers ?? []).map((a) => ({
          attemptId: a.attempt_id,
          questionId: a.question_id,
          selected: a.selected,
          marked: a.marked,
          clientSeq: a.client_seq,
          receivedAt: a.received_at,
          accepted: a.accepted,
          prevHash: a.prev_hash,
          hash: a.hash,
          receiptSig: a.receipt_sig,
        }))
      );
      answersChecked += aCheck.records;
      if (!aCheck.valid) {
        tamperedAttempts.push({
          attemptId: att.id,
          verifyCode: att.verify_code,
          chain: "answers",
          brokenAt: aCheck.brokenAt,
        });
      }

      const eCheck = verifyEventChain(
        (events ?? []).map((e) => ({
          attemptId: e.attempt_id,
          seq: e.seq,
          type: e.type,
          meta: (e.meta ?? {}) as Record<string, unknown>,
          at: e.at,
          prevHash: e.prev_hash,
          hash: e.hash,
        }))
      );
      eventsChecked += eCheck.records;
      if (!eCheck.valid) {
        tamperedAttempts.push({
          attemptId: att.id,
          verifyCode: att.verify_code,
          chain: "events",
          brokenAt: eCheck.brokenAt,
        });
      }

      const lCheck = verifyEventChain(
        (lockEvents ?? []).map((l) => ({
          attemptId: l.attempt_id,
          seq: l.seq,
          type: l.type,
          actorId: l.actor_id,
          meta: (l.meta ?? {}) as Record<string, unknown>,
          at: l.at,
          prevHash: l.prev_hash,
          hash: l.hash,
        }))
      );
      lockEventsChecked += lCheck.records;
      if (!lCheck.valid) {
        tamperedAttempts.push({
          attemptId: att.id,
          verifyCode: att.verify_code,
          chain: "lock_events",
          brokenAt: lCheck.brokenAt,
        });
      }
    }

    const invalidCheckpoints: { examId: string; title: string }[] = [];
    for (const ex of exams ?? []) {
      if (ex.checkpoint_hash && ex.checkpoint_sig) {
        if (!verifyCheckpointSignature(ex.checkpoint_hash, ex.checkpoint_sig)) {
          invalidCheckpoints.push({ examId: ex.id, title: ex.title });
        }
      }
    }

    const allValid = tamperedAttempts.length === 0 && invalidCheckpoints.length === 0;
    const checkedAt = new Date().toISOString();

    await logAudit({
      actorId: admin.id,
      action: "PLATFORM_INTEGRITY_AUDIT",
      entity: "system",
      after: {
        allValid,
        attemptsChecked: (attempts ?? []).length,
        answersChecked,
        eventsChecked,
        lockEventsChecked,
        tamperedCount: tamperedAttempts.length,
      },
    });

    return jsonOk({
      allValid,
      checkedAt,
      attemptsChecked: (attempts ?? []).length,
      examsChecked: (exams ?? []).length,
      answersChecked,
      eventsChecked,
      lockEventsChecked,
      tamperedAttempts,
      invalidCheckpoints,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
