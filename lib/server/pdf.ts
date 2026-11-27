import PDFDocument from "pdfkit";
import QRCode from "qrcode";

function pdfToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

export async function generateCandidateResultPdf(params: {
  examTitle: string;
  candidateName: string;
  candidateEmail: string;
  score: number | null;
  maxScore: number;
  scoreBand: string;
  submittedAt: string | null;
  verifyCode: string;
  verifyUrl: string;
  chainValid: boolean;
  receiptCount: number;
  breakdown: { questionText: string; awarded: number | null; maxMarks: number; feedback?: string | null }[];
}): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(params.verifyUrl, { width: 120, margin: 1 });

  return pdfToBuffer((doc) => {
    doc.fontSize(18).font("Helvetica-Bold").text("Official Examination Result Report");
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica").fillColor("#444444").text(params.examTitle);
    doc.moveDown(0.8);

    // QR top-right
    doc.image(qrBuffer, doc.page.width - 160, 48, { width: 105 });

    doc.fillColor("#000000").fontSize(11);
    doc.text(`Candidate: ${params.candidateName} (${params.candidateEmail})`);
    doc.text(`Score: ${params.score ?? "Pending"} / ${params.maxScore}  (${params.scoreBand})`);
    doc.text(`Submitted: ${params.submittedAt ? new Date(params.submittedAt).toUTCString() : "N/A"}`);
    doc.text(`Verification Code: ${params.verifyCode}`);
    doc.text(
      `Cryptographic Ledger: ${params.chainValid ? "VERIFIED INTACT" : "TAMPER ALERT"} (${params.receiptCount} signed receipts)`
    );

    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(13).text("Question Breakdown");
    doc.moveDown(0.4);

    doc.font("Helvetica").fontSize(10);
    params.breakdown.forEach((b, idx) => {
      const snippet = b.questionText.length > 110 ? b.questionText.slice(0, 107) + "..." : b.questionText;
      doc.text(`${idx + 1}. ${snippet}`);
      doc
        .fillColor("#333333")
        .text(`   Marks: ${b.awarded ?? "Pending"} / ${b.maxMarks}${b.feedback ? `  |  Feedback: ${b.feedback}` : ""}`);
      doc.fillColor("#000000").moveDown(0.3);
    });

    doc.moveDown(1);
    doc
      .fontSize(8.5)
      .fillColor("#666666")
      .text(`Verify authenticity online at: ${params.verifyUrl}`);
  });
}

export async function generateExamSummaryPdf(params: {
  examTitle: string;
  examinerName: string;
  totalEnrolled: number;
  totalSubmitted: number;
  averageScore: number;
  passRatePct: number;
  fairness: { min: number; max: number; mean: number; spread: number };
  seedCommitment: string | null;
  checkpointHash: string | null;
  verifyUrl: string;
  candidates: { name: string; status: string; score: number | null; maxScore: number; flagsCount: number }[];
}): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(params.verifyUrl, { width: 115, margin: 1 });

  return pdfToBuffer((doc) => {
    doc.fontSize(18).font("Helvetica-Bold").text("Examiner Audit & Summary Report");
    doc.moveDown(0.3);
    doc.fontSize(12).font("Helvetica").fillColor("#444444").text(params.examTitle);
    doc.moveDown(0.7);

    doc.image(qrBuffer, doc.page.width - 155, 48, { width: 100 });

    doc.fillColor("#000000").fontSize(10.5);
    doc.text(`Examiner: ${params.examinerName}`);
    doc.text(`Enrolled: ${params.totalEnrolled}   |   Submitted (non-sandbox): ${params.totalSubmitted}`);
    doc.text(`Average Score: ${params.averageScore.toFixed(2)}   |   Pass Rate (>=50%): ${params.passRatePct.toFixed(1)}%`);
    doc.text(
      `Paper Fairness Balance: min ${params.fairness.min.toFixed(2)}, max ${params.fairness.max.toFixed(2)}, spread ${params.fairness.spread.toFixed(3)}`
    );
    if (params.seedCommitment) {
      doc.fontSize(8.5).text(`Seed Commitment (SHA-256): ${params.seedCommitment}`);
    }
    if (params.checkpointHash) {
      doc.fontSize(8.5).text(`Exam Checkpoint Hash: ${params.checkpointHash}`);
    }

    doc.moveDown(1);
    doc.fontSize(12).font("Helvetica-Bold").text("Candidate Results");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(9.5);

    for (const c of params.candidates) {
      doc.text(
        `- ${c.name} | Status: ${c.status} | Score: ${c.score ?? "Pending"}/${c.maxScore} | Integrity Indicators: ${c.flagsCount}`
      );
    }

    doc.moveDown(1);
    doc
      .fontSize(8.5)
      .fillColor("#666666")
      .text(
        `Integrity counts are indicators for review, not proof. Public audit: ${params.verifyUrl}`
      );
  });
}
