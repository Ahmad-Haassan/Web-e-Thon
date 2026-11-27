import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local / .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  { email: "admin@exam.edu.pk", password: "Password123!", name: "Dr. Tariq Mehmood (Admin)", role: "ADMIN" as const, phone: "+92 300 0000001", className: null, section: null },
  { email: "examiner1@exam.edu.pk", password: "12345678", name: "Prof. Ayesha Siddiqui (Examiner 1)", role: "EXAMINER" as const, phone: "+92 300 0000002", className: null, section: null },
  { email: "examiner2@exam.edu.pk", password: "12345678", name: "Dr. Kamran Qureshi (Examiner 2)", role: "EXAMINER" as const, phone: "+92 300 0000003", className: null, section: null },
  { email: "student1@exam.edu.pk", password: "12345678", name: "Ali Raza", role: "CANDIDATE" as const, phone: "+92 300 1111101", className: "BSCS-4", section: "A" },
  { email: "student2@exam.edu.pk", password: "12345678", name: "Fatima Noor", role: "CANDIDATE" as const, phone: "+92 300 1111102", className: "BSCS-4", section: "A" },
  { email: "student3@exam.edu.pk", password: "12345678", name: "Bilal Ahmed", role: "CANDIDATE" as const, phone: "+92 300 1111103", className: "BSCS-4", section: "A" },
  { email: "student4@exam.edu.pk", password: "12345678", name: "Zainab Malik", role: "CANDIDATE" as const, phone: "+92 300 1111104", className: "BSCS-4", section: "A" },
  { email: "student5@exam.edu.pk", password: "12345678", name: "Usman Farooq", role: "CANDIDATE" as const, phone: "+92 300 1111105", className: "BSCS-4", section: "A" },
  { email: "student6@exam.edu.pk", password: "12345678", name: "Hira Tariq", role: "CANDIDATE" as const, phone: "+92 300 1111106", className: "BSCS-4", section: "B" },
  { email: "student7@exam.edu.pk", password: "12345678", name: "Hamza Sheikh", role: "CANDIDATE" as const, phone: "+92 300 1111107", className: "BSCS-4", section: "B" },
  { email: "student8@exam.edu.pk", password: "12345678", name: "Areeba Khan", role: "CANDIDATE" as const, phone: "+92 300 1111108", className: "BSCS-4", section: "B" },
  { email: "student9@exam.edu.pk", password: "12345678", name: "Saad Mahmood", role: "CANDIDATE" as const, phone: "+92 300 1111109", className: "BSCS-4", section: "B" },
  { email: "student10@exam.edu.pk", password: "12345678", name: "Maham Javed", role: "CANDIDATE" as const, phone: "+92 300 1111110", className: "BSCS-4", section: "B" },
];

async function upsertDemoUser(u: (typeof DEMO_USERS)[number]) {
  // Check existing auth user by listing or creating
  const { data: existingList } = await supabase.auth.admin.listUsers({ perPage: 200 });
  let authUser = existingList?.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { name: u.name },
      app_metadata: { role: u.role },
    });
    if (error) throw new Error(`Failed creating auth user ${u.email}: ${error.message}`);
    authUser = data.user;
  } else {
    await supabase.auth.admin.updateUserById(authUser.id, {
      password: u.password,
      user_metadata: { name: u.name },
      app_metadata: { role: u.role },
      email_confirm: true,
    });
  }

  let { data: appUser, error: userErr } = await supabase
    .from("users")
    .upsert(
      {
        supabase_user_id: authUser.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: true,
        phone: u.phone,
        class_name: u.className,
        section: u.section,
        email_verified: true,
      },
      { onConflict: "supabase_user_id" }
    )
    .select()
    .single();

  if (userErr) {
    // Fallback if migration 0003 columns are not yet applied
    const fallback = await supabase
      .from("users")
      .upsert(
        {
          supabase_user_id: authUser.id,
          email: u.email,
          name: u.name,
          role: u.role,
          active: true,
        },
        { onConflict: "supabase_user_id" }
      )
      .select()
      .single();
    appUser = fallback.data;
    userErr = fallback.error;
  }

  if (userErr || !appUser) throw new Error(`Failed upserting public.users for ${u.email}: ${userErr?.message}`);
  return appUser;
}

async function seed() {
  console.log("Seeding Secure Examination Management System...");

  const usersByEmail: Record<string, { id: string; email: string; role: string }> = {};
  for (const u of DEMO_USERS) {
    const appUser = await upsertDemoUser(u);
    usersByEmail[u.email] = appUser;
    console.log(`  User ready: ${u.email} (${u.role})`);
  }

  const examiner = usersByEmail["examiner1@exam.edu.pk"];

  // Categories
  const categoryNames = ["Algorithms & DS", "Database Systems", "Computer Networks"];
  const categories: Record<string, string> = {};
  for (const name of categoryNames) {
    const { data, error } = await supabase
      .from("categories")
      .upsert({ name }, { onConflict: "name" })
      .select()
      .single();
    if (error) throw error;
    categories[name] = data.id;
  }

  // Sample Question Bank (15 questions across difficulties 1-3 and SINGLE / MULTI / WRITTEN)
  const sampleQuestions = [
    {
      cat: "Algorithms & DS", type: "SINGLE", difficulty: 1, marks: 2,
      text: "What is the worst-case time complexity of binary search on a sorted array of size n?",
      options: [
        { text: "O(1)", correct: false },
        { text: "O(log n)", correct: true },
        { text: "O(n)", correct: false },
        { text: "O(n log n)", correct: false },
      ],
      explanation: "Binary search halves the search interval at each comparison.",
    },
    {
      cat: "Algorithms & DS", type: "SINGLE", difficulty: 1, marks: 2,
      text: "Which data structure operates in FIFO (First-In, First-Out) order?",
      options: [
        { text: "Stack", correct: false },
        { text: "Queue", correct: true },
        { text: "Binary Heap", correct: false },
        { text: "Trie", correct: false },
      ],
      explanation: "Queues dequeue elements in the exact order they were enqueued.",
    },
    {
      cat: "Algorithms & DS", type: "MULTI", difficulty: 2, marks: 3,
      text: "Select ALL sorting algorithms whose worst-case time complexity is O(n log n).",
      options: [
        { text: "Merge Sort", correct: true },
        { text: "Heap Sort", correct: true },
        { text: "Quick Sort (naive pivot)", correct: false },
        { text: "Insertion Sort", correct: false },
      ],
      explanation: "Merge Sort and Heap Sort guarantee O(n log n) in the worst case.",
    },
    {
      cat: "Algorithms & DS", type: "SINGLE", difficulty: 3, marks: 4,
      text: "In Dijkstra's algorithm with a binary min-heap on a graph with V vertices and E edges, what is the time complexity?",
      options: [
        { text: "O(V^2)", correct: false },
        { text: "O((V + E) log V)", correct: true },
        { text: "O(V E)", correct: false },
        { text: "O(E log E + V^2)", correct: false },
      ],
      explanation: "Each vertex extraction and edge relaxation takes O(log V) with a binary heap.",
    },
    {
      cat: "Database Systems", type: "SINGLE", difficulty: 1, marks: 2,
      text: "Which SQL constraint ensures that every value in a column is unique and not NULL?",
      options: [
        { text: "FOREIGN KEY", correct: false },
        { text: "PRIMARY KEY", correct: true },
        { text: "CHECK", correct: false },
        { text: "DEFAULT", correct: false },
      ],
      explanation: "PRIMARY KEY combines UNIQUE and NOT NULL.",
    },
    {
      cat: "Database Systems", type: "SINGLE", difficulty: 1, marks: 2,
      text: "What does the 'A' in ACID database transactions stand for?",
      options: [
        { text: "Availability", correct: false },
        { text: "Atomicity", correct: true },
        { text: "Asynchronous", correct: false },
        { text: "Auditability", correct: false },
      ],
      explanation: "Atomicity guarantees all operations in a transaction succeed or none take effect.",
    },
    {
      cat: "Database Systems", type: "MULTI", difficulty: 2, marks: 3,
      text: "Which of the following anomalies can occur under READ COMMITTED isolation?",
      options: [
        { text: "Dirty reads", correct: false },
        { text: "Non-repeatable reads", correct: true },
        { text: "Phantom reads", correct: true },
        { text: "Lost commits after crash", correct: false },
      ],
      explanation: "READ COMMITTED prevents dirty reads, but non-repeatable and phantom reads can occur.",
    },
    {
      cat: "Database Systems", type: "SINGLE", difficulty: 3, marks: 4,
      text: "Why does a B+ tree outperform a hash index for range queries (e.g., WHERE created_at BETWEEN t1 AND t2)?",
      options: [
        { text: "Hash indexes cannot store timestamps", correct: false },
        { text: "B+ tree leaf nodes are linked in sorted key order", correct: true },
        { text: "B+ trees always fit in CPU L1 cache", correct: false },
        { text: "Hash indexes do not support equality lookups", correct: false },
      ],
      explanation: "Sorted leaf pointers allow sequential scanning across a key range.",
    },
    {
      cat: "Computer Networks", type: "SINGLE", difficulty: 1, marks: 2,
      text: "Which transport-layer protocol provides reliable, ordered byte-stream delivery?",
      options: [
        { text: "UDP", correct: false },
        { text: "TCP", correct: true },
        { text: "ICMP", correct: false },
        { text: "ARP", correct: false },
      ],
      explanation: "TCP uses sequence numbers, ACKs, and retransmissions for reliability.",
    },
    {
      cat: "Computer Networks", type: "SINGLE", difficulty: 2, marks: 3,
      text: "An HTTP response with status code 409 typically indicates:",
      options: [
        { text: "Unauthorized", correct: false },
        { text: "Resource conflict (e.g. duplicate submission)", correct: true },
        { text: "Gateway timeout", correct: false },
        { text: "Moved permanently", correct: false },
      ],
      explanation: "409 Conflict indicates a request conflicts with the current state of the server.",
    },
    {
      cat: "Computer Networks", type: "MULTI", difficulty: 2, marks: 3,
      text: "Select ALL headers commonly used to harden web application security.",
      options: [
        { text: "Strict-Transport-Security", correct: true },
        { text: "X-Content-Type-Options", correct: true },
        { text: "X-Powered-By", correct: false },
        { text: "Content-Security-Policy", correct: true },
      ],
      explanation: "HSTS, X-Content-Type-Options, and CSP harden apps; X-Powered-By leaks stack info.",
    },
    {
      cat: "Computer Networks", type: "SINGLE", difficulty: 3, marks: 4,
      text: "Why must an exam timer rely on server timestamps rather than the candidate's device clock?",
      options: [
        { text: "JavaScript Date.now() is only accurate to minutes", correct: false },
        { text: "Candidates can modify local system clocks to gain extra time", correct: true },
        { text: "HTTP requests cannot carry timestamps", correct: false },
        { text: "IndexedDB deletes timestamps offline", correct: false },
      ],
      explanation: "Client clocks are untrusted; deadline enforcement must always be server-side.",
    },
    {
      cat: "Algorithms & DS", type: "WRITTEN", difficulty: 2, marks: 5,
      text: "Briefly explain why a hash chain (where each record hashes the previous record's hash) makes silent database tampering detectable.",
      options: [],
      rubric: "Award full marks if candidate explains that modifying any historical record changes its hash, breaking prev_hash links of all subsequent records and invalidating the published checkpoint/receipt signatures.",
      explanation: "Hash chaining creates a cryptographic dependency across records.",
    },
  ];

  // Avoid duplicating questions on re-run
  const { data: existingQs } = await supabase.from("questions").select("id, text, marks, difficulty");
  const existingByText = new Map((existingQs ?? []).map((q) => [q.text, q]));
  const questionIds: { id: string; marks: number }[] = [];

  for (const sq of sampleQuestions) {
    const found = existingByText.get(sq.text);
    if (found) {
      questionIds.push({ id: found.id, marks: Number(found.marks) });
      continue;
    }

    const { data: qRow, error: qErr } = await supabase
      .from("questions")
      .insert({
        owner_id: examiner.id,
        category_id: categories[sq.cat],
        type: sq.type,
        difficulty: sq.difficulty,
        text: sq.text,
        marks: sq.marks,
        negative_marking: 0,
        explanation: sq.explanation,
      })
      .select()
      .single();
    if (qErr) throw qErr;

    const correctOptionIds: string[] = [];
    for (let idx = 0; idx < sq.options.length; idx++) {
      const opt = sq.options[idx];
      const { data: optRow, error: oErr } = await supabase
        .from("options")
        .insert({ question_id: qRow.id, text: opt.text, order_index: idx })
        .select()
        .single();
      if (oErr) throw oErr;
      if (opt.correct) correctOptionIds.push(optRow.id);
    }

    const { error: kErr } = await supabase.from("question_keys").insert({
      question_id: qRow.id,
      correct_option_ids: correctOptionIds,
      written_rubric: "rubric" in sq ? sq.rubric : null,
    });
    if (kErr) throw kErr;

    questionIds.push({ id: qRow.id, marks: sq.marks });
  }

  // Create Demo Ongoing Exam (open for 24h so demo works anytime!)
  const examTitle = "CS-301 Midterm: Systems, Algorithms & Security";
  const { data: existingExam } = await supabase
    .from("exams")
    .select("id")
    .eq("title", examTitle)
    .maybeSingle();

  let examId = existingExam?.id;
  if (!examId) {
    const seedSecret = randomBytes(16).toString("hex");
    const seedCommitment = createHash("sha256").update(seedSecret).digest("hex");
    const now = new Date();
    const startAt = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const endAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data: exam, error: exErr } = await supabase
      .from("exams")
      .insert({
        owner_id: examiner.id,
        title: examTitle,
        category: "Computer Science",
        class_name: "BSCS-4",
        section: "A",
        rules: [
          "Only one attempt is permitted per candidate.",
          "The server-synchronized countdown timer auto-submits when time ends.",
          "Use Flag / Review to revisit uncertain questions or Clear Response to reset a choice.",
          "If Wi-Fi drops, keep answering—responses queue locally in IndexedDB and sync automatically.",
        ],
        instructions:
          "Answer all questions. Your answers are saved locally first and cryptographically receipted on sync. Integrity indicators are logged transparently (indicators, not proof).",
        start_at: startAt,
        end_at: endAt,
        duration_min: 30,
        total_marks: 24,
        status: "PUBLISHED",
        shuffle_questions: true,
        shuffle_options: true,
        blueprint: [
          { difficulty: 1, count: 4 },
          { difficulty: 2, count: 3 },
          { difficulty: 3, count: 2 },
        ],
        grace_sec: 15,
        seed_secret: seedSecret,
        seed_commitment: seedCommitment,
      })
      .select()
      .single();
    if (exErr) throw exErr;
    examId = exam.id;

    // Attach all questions to the exam pool
    for (let i = 0; i < questionIds.length; i++) {
      await supabase.from("exam_questions").upsert({
        exam_id: examId,
        question_id: questionIds[i].id,
        marks: questionIds[i].marks,
        order_index: i,
      });
    }

    // Enroll all 5 demo candidates
    for (const u of DEMO_USERS.filter((x) => x.role === "CANDIDATE")) {
      await supabase.from("enrollments").upsert({
        exam_id: examId,
        candidate_id: usersByEmail[u.email].id,
        status: "ENROLLED",
      });
    }
    console.log(`  Created ongoing demo exam: ${examTitle} (${examId})`);
  } else {
    console.log(`  Demo exam already exists: ${examId}`);
  }

  console.log("\nDemo credentials:");
  console.log("  Admin:      admin@exam.edu.pk (password: Password123!)");
  console.log("  Examiners:  examiner1@exam.edu.pk, examiner2@exam.edu.pk (password: 12345678)");
  console.log("  Students:   student1@exam.edu.pk .. student10@exam.edu.pk (password: 12345678)");
  console.log("  Auto-approved Student Gmails: ahmadd557125@gmail.com, noman4arshad@gmail.com");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
