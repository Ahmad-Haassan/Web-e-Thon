import { NextRequest } from "next/server";
import Papa from "papaparse";
import { handleRouteError, HttpError, jsonOk, requireRole } from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";
import { bulkImportQuestionsSchema, createQuestionSchema } from "@/lib/shared/schemas";

export const runtime = "nodejs";

/**
 * Bulk import questions via CSV or JSON rows with row-level Zod validation & error report table (Feature 4.4).
 * CSV columns supported:
 *   category, type (SINGLE|MULTI|WRITTEN), difficulty (1|2|3), text, marks, negativeMarking,
 *   explanation, writtenRubric, optionA, optionB, optionC, optionD, correct (e.g. "B" or "A;C" or option text)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "EXAMINER"]);
    const body = await req.json();
    const parsed = bulkImportQuestionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Provide either csv string or rows array", parsed.error.flatten());
    }

    let rawRows: Record<string, unknown>[] = [];
    if (parsed.data.csv) {
      const csvParsed = Papa.parse<Record<string, unknown>>(parsed.data.csv, {
        header: true,
        skipEmptyLines: true,
      });
      rawRows = csvParsed.data;
    } else if (parsed.data.rows) {
      rawRows = parsed.data.rows;
    } else {
      throw new HttpError(400, "Provide csv or rows");
    }

    const supabase = getServiceSupabase();
    const { data: existingCats } = await supabase.from("categories").select("id, name");
    const catByName = new Map(
      (existingCats ?? []).map((c) => [c.name.toLowerCase(), c.id])
    );

    let created = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 1;
      const r = rawRows[i];
      try {
        // Resolve/auto-create category if category name supplied
        let categoryId: string | null =
          typeof r.categoryId === "string" && r.categoryId ? r.categoryId : null;
        if (!categoryId && typeof r.category === "string" && r.category.trim()) {
          const key = r.category.trim().toLowerCase();
          if (catByName.has(key)) {
            categoryId = catByName.get(key)!;
          } else {
            const { data: newCat } = await supabase
              .from("categories")
              .insert({ name: r.category.trim() })
              .select("id")
              .single();
            if (newCat) {
              catByName.set(key, newCat.id);
              categoryId = newCat.id;
            }
          }
        }

        // Support either structured options array (JSON) or optionA..optionD + correct (CSV)
        let options: { text: string; isCorrect: boolean }[] = [];
        if (Array.isArray(r.options)) {
          options = r.options as { text: string; isCorrect: boolean }[];
        } else {
          const letters = ["A", "B", "C", "D", "E", "F"];
          const correctTokens = String(r.correct ?? "")
            .split(/[;|,]/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);

          for (const letter of letters) {
            const val = r[`option${letter}`] ?? r[`option_${letter.toLowerCase()}`];
            if (typeof val === "string" && val.trim()) {
              const isCorrect =
                correctTokens.includes(letter) ||
                correctTokens.includes(val.trim().toUpperCase());
              options.push({ text: val.trim(), isCorrect });
            }
          }
        }

        const candidate = {
          categoryId,
          type: String(r.type ?? "SINGLE").toUpperCase(),
          difficulty: Number(r.difficulty ?? 1),
          text: String(r.text ?? "").trim(),
          marks: Number(r.marks ?? 1),
          negativeMarking: Number(r.negativeMarking ?? r.negative_marking ?? 0),
          explanation: r.explanation ? String(r.explanation) : null,
          writtenRubric: r.writtenRubric ? String(r.writtenRubric) : null,
          options,
        };

        const validated = createQuestionSchema.safeParse(candidate);
        if (!validated.success) {
          errors.push({
            row: rowNum,
            message: validated.error.issues.map((x) => x.message).join("; "),
          });
          continue;
        }

        const d = validated.data;
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
          .select("id")
          .single();

        if (qErr || !qRow) {
          errors.push({ row: rowNum, message: qErr?.message ?? "DB insert failed" });
          continue;
        }

        const correctIds: string[] = [];
        for (let idx = 0; idx < d.options.length; idx++) {
          const { data: oRow } = await supabase
            .from("options")
            .insert({ question_id: qRow.id, text: d.options[idx].text, order_index: idx })
            .select("id")
            .single();
          if (oRow && d.options[idx].isCorrect) correctIds.push(oRow.id);
        }

        await supabase.from("question_keys").insert({
          question_id: qRow.id,
          correct_option_ids: correctIds,
          written_rubric: d.writtenRubric ?? null,
        });

        created++;
      } catch (e) {
        errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : "Unknown row error",
        });
      }
    }

    return jsonOk({ created, failed: errors.length, errors });
  } catch (err) {
    return handleRouteError(err);
  }
}
