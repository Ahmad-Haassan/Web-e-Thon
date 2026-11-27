import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { updateQuestionSchema, uuidSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid question ID");

    const supabase = getServiceSupabase();
    const { data: q, error } = await supabase
      .from("questions")
      .select("*, options(*), question_keys(*)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!q) throw new HttpError(404, "Question not found");
    if (user.role === "EXAMINER" && q.owner_id !== user.id) {
      throw new HttpError(403, "Forbidden: you do not own this question");
    }

    const keyRow = Array.isArray(q.question_keys) ? q.question_keys[0] : q.question_keys;
    const correctIds: string[] = keyRow?.correct_option_ids ?? [];
    const options = [...(q.options ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map((o) => ({
        id: o.id,
        text: o.text,
        orderIndex: o.order_index,
        isCorrect: correctIds.includes(o.id),
      }));

    return jsonOk({
      question: {
        ...q,
        marks: Number(q.marks),
        negativeMarking: Number(q.negative_marking),
        writtenRubric: keyRow?.written_rubric ?? null,
        options,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid question ID");

    const body = await req.json();
    const parsed = updateQuestionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid question update", parsed.error.flatten());
    }

    const supabase = getServiceSupabase();
    const { data: existing } = await supabase
      .from("questions")
      .select("id, owner_id, type")
      .eq("id", id)
      .maybeSingle();

    if (!existing) throw new HttpError(404, "Question not found");
    if (user.role === "EXAMINER" && existing.owner_id !== user.id) {
      throw new HttpError(403, "Forbidden: you do not own this question");
    }

    const d = parsed.data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (d.categoryId !== undefined) patch.category_id = d.categoryId;
    if (d.type !== undefined) patch.type = d.type;
    if (d.difficulty !== undefined) patch.difficulty = d.difficulty;
    if (d.text !== undefined) patch.text = d.text;
    if (d.marks !== undefined) patch.marks = d.marks;
    if (d.negativeMarking !== undefined) patch.negative_marking = d.negativeMarking;
    if (d.explanation !== undefined) patch.explanation = d.explanation;

    const { data: updated, error } = await supabase
      .from("questions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);

    // Replace options & keys if options provided (active attempts are safe because paper_snapshot is frozen!)
    if (d.options) {
      await supabase.from("options").delete().eq("question_id", id);
      const correctOptionIds: string[] = [];
      for (let idx = 0; idx < d.options.length; idx++) {
        const opt = d.options[idx];
        const { data: oRow } = await supabase
          .from("options")
          .insert({ question_id: id, text: opt.text, order_index: idx })
          .select("id")
          .single();
        if (oRow && opt.isCorrect) correctOptionIds.push(oRow.id);
      }
      await supabase
        .from("question_keys")
        .upsert(
          {
            question_id: id,
            correct_option_ids: correctOptionIds,
            ...(d.writtenRubric !== undefined ? { written_rubric: d.writtenRubric } : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "question_id" }
        );
    } else if (d.writtenRubric !== undefined) {
      await supabase
        .from("question_keys")
        .upsert(
          {
            question_id: id,
            written_rubric: d.writtenRubric,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "question_id" }
        );
    }

    return jsonOk({ question: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "Invalid question ID");

    const supabase = getServiceSupabase();
    const { data: existing } = await supabase
      .from("questions")
      .select("id, owner_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) throw new HttpError(404, "Question not found");
    if (user.role === "EXAMINER" && existing.owner_id !== user.id) {
      throw new HttpError(403, "Forbidden: you do not own this question");
    }

    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) {
      throw new HttpError(
        409,
        "Cannot delete question because it is referenced by an exam or attempt"
      );
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
