import { NextRequest } from "next/server";
import { handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { createQuestionSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const supabase = getServiceSupabase();

    const categoryId = req.nextUrl.searchParams.get("categoryId");
    const difficulty = req.nextUrl.searchParams.get("difficulty");
    const type = req.nextUrl.searchParams.get("type");
    const search = req.nextUrl.searchParams.get("search");

    let query = supabase
      .from("questions")
      .select("*, options(*), question_keys(*), categories(id, name)")
      .order("created_at", { ascending: false });

    if (user.role === "EXAMINER") {
      query = query.eq("owner_id", user.id);
    }
    if (categoryId) query = query.eq("category_id", categoryId);
    if (difficulty) query = query.eq("difficulty", Number(difficulty));
    if (type && ["SINGLE", "MULTI", "WRITTEN"].includes(type)) query = query.eq("type", type);
    if (search) query = query.ilike("text", `%${search}%`);

    const { data, error } = await query;
    if (error) throw new HttpError(500, error.message);

    // Format cleanly with options sorted and isCorrect joined for examiner/admin only
    const questions = (data ?? []).map((q) => {
      const keyRow = Array.isArray(q.question_keys) ? q.question_keys[0] : q.question_keys;
      const correctIds: string[] = keyRow?.correct_option_ids ?? [];
      const sortedOpts = [...(q.options ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((o) => ({
          id: o.id,
          text: o.text,
          orderIndex: o.order_index,
          isCorrect: correctIds.includes(o.id),
        }));

      return {
        id: q.id,
        ownerId: q.owner_id,
        categoryId: q.category_id,
        category: q.categories ?? null,
        type: q.type,
        difficulty: q.difficulty,
        text: q.text,
        marks: Number(q.marks),
        negativeMarking: Number(q.negative_marking),
        explanation: q.explanation,
        writtenRubric: keyRow?.written_rubric ?? null,
        historicalDifficultyIndex: q.historical_difficulty_index,
        options: sortedOpts,
        createdAt: q.created_at,
      };
    });

    return jsonOk({ questions });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const body = await req.json();
    const parsed = createQuestionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid question payload", parsed.error.flatten());
    }

    const d = parsed.data;
    const supabase = getServiceSupabase();

    const { data: qRow, error: qErr } = await supabase
      .from("questions")
      .insert({
        owner_id: user.id,
        category_id: d.categoryId ?? null,
        type: d.type,
        difficulty: d.difficulty,
        text: d.text,
        marks: d.marks,
        negative_marking: d.negativeMarking,
        explanation: d.explanation ?? null,
      })
      .select("*")
      .single();

    if (qErr || !qRow) throw new HttpError(500, qErr?.message ?? "Failed to create question");

    const insertedOptions: { id: string; text: string; isCorrect: boolean; orderIndex: number }[] = [];
    const correctOptionIds: string[] = [];

    if (d.type !== "WRITTEN" && d.options.length > 0) {
      for (let idx = 0; idx < d.options.length; idx++) {
        const opt = d.options[idx];
        const { data: optRow, error: oErr } = await supabase
          .from("options")
          .insert({ question_id: qRow.id, text: opt.text, order_index: idx })
          .select("*")
          .single();
        if (oErr || !optRow) throw new HttpError(500, oErr?.message ?? "Failed to save option");
        if (opt.isCorrect) correctOptionIds.push(optRow.id);
        insertedOptions.push({
          id: optRow.id,
          text: optRow.text,
          isCorrect: opt.isCorrect,
          orderIndex: idx,
        });
      }
    }

    const { error: kErr } = await supabase.from("question_keys").insert({
      question_id: qRow.id,
      correct_option_ids: correctOptionIds,
      written_rubric: d.writtenRubric ?? null,
    });
    if (kErr) throw new HttpError(500, kErr.message);

    return jsonOk(
      {
        question: {
          ...qRow,
          marks: Number(qRow.marks),
          negativeMarking: Number(qRow.negative_marking),
          writtenRubric: d.writtenRubric ?? null,
          options: insertedOptions,
        },
      },
      201
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
