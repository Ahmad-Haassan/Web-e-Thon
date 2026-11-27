import { NextRequest } from "next/server";
import {
  computeExamLifecycle,
  handleRouteError,
  HttpError,
  jsonOk,
  requireRole,
} from "@/lib/server/auth";
import { getServiceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const daysParam = Number(req.nextUrl.searchParams.get("days") ?? 7);
    const days = daysParam === 30 ? 30 : 7;

    const supabase = getServiceSupabase();

    const [
      { data: users, error: uErr },
      { data: exams, error: eErr },
      { data: attempts, error: aErr },
      { count: questionsCount },
      { data: disputes },
      { data: auditLogs },
      { data: enrollments },
    ] = await Promise.all([
      supabase.from("users").select("id, name, email, role, active, created_at").order("created_at", { ascending: false }),
      supabase.from("exams").select("id, title, status, start_at, end_at, total_marks, results_published, checkpoint_hash, created_at").order("created_at", { ascending: false }),
      supabase.from("attempts").select("id, exam_id, candidate_id, status, score, max_score, started_at, submitted_at, last_seen_at, is_sandbox, users(name, email), exams(title)").eq("is_sandbox", false).order("started_at", { ascending: false }),
      supabase.from("questions").select("*", { count: "exact", head: true }),
      supabase.from("disputes").select("id, type, status, reason, created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("audit_logs").select("id, action, entity, entity_id, after, at, users(name, email)").order("at", { ascending: false }).limit(30),
      supabase.from("enrollments").select("exam_id, status").eq("status", "ENROLLED"),
    ]);

    if (uErr) throw new HttpError(500, uErr.message);
    if (eErr) throw new HttpError(500, eErr.message);
    if (aErr) throw new HttpError(500, aErr.message);

    const allUsers = users ?? [];
    const allExams = exams ?? [];
    const allAttempts = attempts ?? [];
    const allDisputes = disputes ?? [];
    const allLogs = auditLogs ?? [];

    const allStudents = allUsers.filter((u) => u.role === "CANDIDATE");
    const totalStudents = allStudents.length;
    const activeStudents = allStudents.filter((u) => u.active).length;
    const totalExaminers = allUsers.filter((u) => u.role === "EXAMINER").length;

    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const studentsJoinedLast30Days = allStudents.filter(
      (u) => new Date(u.created_at).getTime() >= thirtyDaysAgoMs
    ).length;

    const completedAttempts = allAttempts.filter(
      (a) => a.status !== "IN_PROGRESS" && a.score !== null && Number(a.max_score || 0) > 0
    );
    const avgMarksPct = completedAttempts.length
      ? Number(
          (
            completedAttempts.reduce(
              (sum, a) => sum + (Number(a.score ?? 0) / Number(a.max_score || 1)) * 100,
              0
            ) / completedAttempts.length
          ).toFixed(1)
        )
      : 0;

    const examsWithLifecycle = allExams.map((ex) => ({
      ...ex,
      total_marks: Number(ex.total_marks ?? 0),
      lifecycle: computeExamLifecycle(ex),
    }));

    const ongoingExams = examsWithLifecycle.filter((e) => e.lifecycle === "ONGOING").length;
    const publishedExams = examsWithLifecycle.filter((e) => e.status === "PUBLISHED").length;
    const gradedAttempts = allAttempts.filter((a) => a.status === "GRADED" || a.status === "SUBMITTED").length;
    const inProgressAttempts = allAttempts.filter((a) => a.status === "IN_PROGRESS").length;
    const openDisputes = allDisputes.filter((d) => d.status === "OPEN").length;

    // Build day-by-day Platform Analytics series (Last 7 or 30 Days)
    const now = new Date();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const series: {
      label: string;
      date: string;
      examAttempts: number;
      activeUsers: number;
      totalStudents: number;
      joinedStudents: number;
      avgMarksPct: number;
    }[] = [];

    for (let offset = days - 1; offset >= 0; offset--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - offset);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);

      const dMs = d.getTime();
      const nextMs = next.getTime();

      const dayAttempts = allAttempts.filter((a) => {
        const t = new Date(a.started_at).getTime();
        return t >= dMs && t < nextMs;
      });

      const dayCompleted = dayAttempts.filter(
        (a) => a.status !== "IN_PROGRESS" && a.score !== null && Number(a.max_score || 0) > 0
      );
      const dayAvgMarks = dayCompleted.length
        ? Number(
            (
              dayCompleted.reduce(
                (sum, a) => sum + (Number(a.score ?? 0) / Number(a.max_score || 1)) * 100,
                0
              ) / dayCompleted.length
            ).toFixed(1)
          )
        : avgMarksPct;

      const joinedStudents = allStudents.filter((u) => {
        const t = new Date(u.created_at).getTime();
        return t >= dMs && t < nextMs;
      }).length;

      const cumulativeStudents = allStudents.filter(
        (u) => new Date(u.created_at).getTime() < nextMs
      ).length;

      const activeUserIds = new Set<string>();
      for (const a of allAttempts) {
        const t = new Date(a.last_seen_at || a.started_at).getTime();
        if (t >= dMs && t < nextMs) activeUserIds.add(a.candidate_id);
      }
      for (const u of allUsers) {
        const t = new Date(u.created_at).getTime();
        if (t >= dMs && t < nextMs) activeUserIds.add(u.id);
      }

      const label =
        days === 7
          ? dayNames[d.getDay()]
          : `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;

      series.push({
        label,
        date: d.toISOString().slice(0, 10),
        examAttempts: dayAttempts.length,
        activeUsers: activeUserIds.size,
        totalStudents: cumulativeStudents,
        joinedStudents,
        avgMarksPct: dayAvgMarks,
      });
    }

    // Build Recent Activities feed from real audit logs + recent submissions + exams + users
    const activities: {
      id: string;
      kind: "exam" | "submit" | "user" | "publish" | "dispute" | "security";
      title: string;
      subtitle: string;
      at: string;
    }[] = [];

    for (const log of allLogs.slice(0, 12)) {
      const actor = (Array.isArray(log.users) ? log.users[0] : log.users) as { name?: string; email?: string } | null;
      const after = (log.after ?? {}) as Record<string, unknown>;
      let kind: "exam" | "submit" | "user" | "publish" | "dispute" | "security" = "security";
      let title = log.action.replace(/_/g, " ");
      let subtitle = actor?.name || actor?.email || log.entity;

      if (log.action === "EXAM_CREATED") {
        kind = "exam";
        title = "New exam created";
        subtitle = String(after.title ?? subtitle);
      } else if (log.action === "ATTEMPT_SUBMITTED") {
        kind = "submit";
        title = "Exam submitted";
        subtitle = `${actor?.name ?? "Candidate"} · ${String(after.status ?? "SUBMITTED")}`;
      } else if (log.action === "USER_CREATED" || log.action === "USER_INVITED") {
        kind = "user";
        title = "New user registered";
        subtitle = String(after.email ?? subtitle);
      } else if (log.action === "EXAM_UPDATED" && after.results_published) {
        kind = "publish";
        title = "Results published";
        subtitle = `Exam ${log.entity_id?.slice(0, 8) ?? ""}`;
      } else if (log.action.startsWith("DISPUTE_")) {
        kind = "dispute";
        title = log.action === "DISPUTE_CREATED" ? "Dispute raised" : "Dispute resolved";
        subtitle = `${actor?.name ?? "User"} · ${String(after.status ?? after.type ?? "")}`;
      }

      activities.push({ id: `log-${log.id}`, kind, title, subtitle, at: log.at });
    }

    // Backfill with recent exams/submissions/users if audit log is still sparse
    if (activities.length < 6) {
      for (const a of allAttempts.slice(0, 4)) {
        const u = (Array.isArray(a.users) ? a.users[0] : a.users) as { name?: string } | null;
        const ex = (Array.isArray(a.exams) ? a.exams[0] : a.exams) as { title?: string } | null;
        activities.push({
          id: `att-${a.id}`,
          kind: "submit",
          title: a.status === "IN_PROGRESS" ? "Exam started" : "Exam submitted",
          subtitle: `${u?.name ?? "Candidate"} · ${ex?.title ?? "Exam"}`,
          at: a.submitted_at ?? a.started_at,
        });
      }
      for (const ex of allExams.slice(0, 3)) {
        activities.push({
          id: `ex-${ex.id}`,
          kind: "exam",
          title: "Exam configured",
          subtitle: ex.title,
          at: ex.created_at,
        });
      }
      for (const u of allUsers.slice(0, 3)) {
        activities.push({
          id: `usr-${u.id}`,
          kind: "user",
          title: "Account active",
          subtitle: `${u.name} (${u.email})`,
          at: u.created_at,
        });
      }
    }

    activities.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

    // Per-exam breakdown for Exam Management & Analytics tabs
    const enrolledByExam = new Map<string, number>();
    for (const enr of enrollments ?? []) {
      enrolledByExam.set(enr.exam_id, (enrolledByExam.get(enr.exam_id) ?? 0) + 1);
    }

    const examBreakdown = examsWithLifecycle.map((ex) => {
      const exAttempts = allAttempts.filter((a) => a.exam_id === ex.id);
      const submitted = exAttempts.filter((a) => a.status !== "IN_PROGRESS");
      const avgPct = submitted.length
        ? submitted.reduce(
            (sum, a) =>
              sum + (Number(a.max_score || 1) > 0 ? (Number(a.score ?? 0) / Number(a.max_score)) * 100 : 0),
            0
          ) / submitted.length
        : 0;
      const passRate = submitted.length
        ? (submitted.filter(
            (a) => Number(a.max_score || 1) > 0 && (Number(a.score ?? 0) / Number(a.max_score)) * 100 >= 50
          ).length /
            submitted.length) *
          100
        : 0;

      return {
        id: ex.id,
        title: ex.title,
        status: ex.status,
        lifecycle: ex.lifecycle,
        startAt: ex.start_at,
        endAt: ex.end_at,
        totalMarks: ex.total_marks,
        resultsPublished: ex.results_published,
        checkpointHash: ex.checkpoint_hash,
        enrolledCount: enrolledByExam.get(ex.id) ?? 0,
        attemptsCount: exAttempts.length,
        submittedCount: submitted.length,
        avgPct: Number(avgPct.toFixed(1)),
        passRate: Number(passRate.toFixed(1)),
      };
    });

    return jsonOk({
      stats: {
        totalStudents,
        activeStudents,
        studentsJoinedLast30Days,
        avgMarksPct,
        totalExaminers,
        totalUsers: allUsers.length,
        totalExams: allExams.length,
        publishedExams,
        ongoingExams,
        totalAttempts: allAttempts.length,
        gradedAttempts,
        inProgressAttempts,
        totalQuestions: questionsCount ?? 0,
        openDisputes,
        platformHealthPct: 99.9,
      },
      recentActivities: activities.slice(0, 10),
      analyticsSeries: series,
      examBreakdown,
      notifications: {
        unreadCount: openDisputes + inProgressAttempts,
        openDisputes,
        inProgressAttempts,
        recentDisputes: allDisputes.filter((d) => d.status === "OPEN").slice(0, 5),
      },
      serverNow: Date.now(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
