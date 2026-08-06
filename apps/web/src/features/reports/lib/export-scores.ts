/**
 * Client-side Excel export for a single shift's score table (bảng điểm).
 *
 * Reuses the already-computed `ShiftReport` — the SAME numbers the report
 * page renders — so the spreadsheet can never drift from the on-screen
 * table. `xlsx` (SheetJS) is dynamic-imported on click so its weight stays
 * out of the report page's initial bundle.
 *
 * Produces a 3-sheet workbook:
 *   1. "Bảng điểm"    — one row per eligible student (submitted first,
 *                       sorted by score desc; absentees at the bottom).
 *   2. "Tổng quan"    — KPIs + xếp-loại distribution.
 *   3. "Theo câu hỏi" — per-question correctness (hardest first).
 */
import type { SeedUser } from "@/features/auth/data/seed-users";
import type { ExamShift } from "@/features/exam-shifts/data/types";
import { DEFAULT_SCORING } from "@/features/exam-shifts/data/types";
import { formatScore } from "@/features/exam-shifts/lib/scoring";

import type { ShiftReport } from "./compute-stats";

export interface ExportShiftScoresArgs {
  report: ShiftReport;
  shift: ExamShift;
  /** All users — to join `attempt.studentId` → name / mã HS / lớp. */
  users: SeedUser[];
  /** Eligible students (submitted + absent) for a complete roster. */
  eligibleStudents: SeedUser[];
  subjectName: string;
  gradeCode: string | null;
}

function vnDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Compact local timestamp for the filename, e.g. 20260806_1530. */
function stampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(
    d.getHours(),
  )}${p(d.getMinutes())}`;
}

/** Strip HTML / markdown / image data-URIs so a question renders as one
 *  short line of plain text in a cell (never a giant base64 blob). */
function plainText(raw: string): string {
  return (raw ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " [hình] ") // ![alt](data:… | url)
    .replace(/<[^>]+>/g, " ") // html tags
    .replace(/\[u:([^\]\n]+)\]/g, "$1") // underline markers → text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Excel forbids \ / ? * [ ] : in sheet names; clamp to 31 chars. */
function safeSheetName(s: string): string {
  return s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1";
}

function safeFileName(s: string): string {
  return (
    s
      .replace(/[\\/?*[\]:<>"|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 90) || "bang_diem"
  );
}

const difficultyLabel = (d: string): string =>
  d === "easy" ? "Dễ" : d === "medium" ? "TB" : "Khó";

export async function exportShiftScoresXlsx(
  args: ExportShiftScoresArgs,
): Promise<void> {
  const { report, shift, users, eligibleStudents, subjectName, gradeCode } =
    args;
  const XLSX = await import("xlsx");

  const scoring = shift.scoring ?? DEFAULT_SCORING;
  const maxScore = scoring.maxScore;
  const userById = new Map(users.map((u) => [u.id, u]));

  // Submitted rows — sorted like the UI (score % desc).
  const submitted = [...report.perStudent].sort(
    (a, b) => b.percent - a.percent,
  );
  const submittedIds = new Set(submitted.map((r) => r.attempt.studentId));
  // Absent = eligible students who never submitted an attempt.
  const absent = eligibleStudents.filter((u) => !submittedIds.has(u.id));

  // ─────────────────────────── Sheet 1: Bảng điểm ────────────────────────
  const HEAD = [
    "STT",
    "Họ tên",
    "Mã HS",
    "Lớp",
    "Điểm TN",
    "Điểm tự luận",
    `Tổng điểm (/${formatScore(maxScore)})`,
    "%",
    "Xếp loại",
    "Số câu đúng",
    "Tổng câu TN",
    "Câu chờ chấm",
    "Vi phạm",
    "Thời gian (phút)",
    "Nộp lúc",
    "Trạng thái",
  ];

  const aoa: (string | number)[][] = [];
  aoa.push([`BẢNG ĐIỂM — ${shift.name}`]);
  aoa.push([
    `Môn: ${subjectName}` +
      (gradeCode ? ` · Khối: ${gradeCode}` : "") +
      ` · Mã ca: ${shift.id}` +
      ` · ${vnDateTime(shift.startAt)} → ${vnDateTime(shift.endAt)}` +
      ` · Thang điểm: ${formatScore(maxScore)}`,
  ]);
  aoa.push([
    `Đã nộp: ${report.totals.submitted}/${report.totals.eligible}` +
      ` · Điểm TB: ${formatScore(report.totals.avgRaw)}` +
      ` · Tỉ lệ đạt: ${report.totals.passRate}%` +
      (report.totals.pendingEssayCount > 0
        ? ` · ⚠ ${report.totals.pendingEssayCount} câu tự luận chưa chấm (điểm tạm tính)`
        : ""),
  ]);
  aoa.push([]); // spacer row
  aoa.push(HEAD);

  let stt = 0;
  for (const r of submitted) {
    const u = userById.get(r.attempt.studentId);
    stt++;
    aoa.push([
      stt,
      u?.name ?? r.attempt.studentId,
      u?.studentCode ?? u?.username ?? "",
      u?.className ?? "",
      r.autoEarned,
      r.essayEarned,
      r.raw,
      r.percent,
      r.band,
      r.correctCount,
      r.autoMax,
      r.pendingEssay,
      r.violations,
      r.durationMin ?? "",
      vnDateTime(r.attempt.submittedAt),
      r.pendingEssay > 0
        ? `Đã nộp · còn ${r.pendingEssay} câu chờ chấm`
        : "Đã nộp",
    ]);
  }
  for (const u of absent) {
    stt++;
    aoa.push([
      stt,
      u.name,
      u.studentCode ?? u.username ?? "",
      u.className ?? "",
      "", // Điểm TN
      "", // Điểm tự luận
      "", // Tổng điểm
      "", // %
      "", // Xếp loại
      "", // Số câu đúng
      "", // Tổng câu TN
      "", // Câu chờ chấm
      "", // Vi phạm
      "", // Thời gian
      "", // Nộp lúc
      "Vắng",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 5 }, // STT
    { wch: 26 }, // Họ tên
    { wch: 14 }, // Mã HS
    { wch: 10 }, // Lớp
    { wch: 9 }, // Điểm TN
    { wch: 12 }, // Điểm tự luận
    { wch: 14 }, // Tổng điểm
    { wch: 7 }, // %
    { wch: 11 }, // Xếp loại
    { wch: 11 }, // Số câu đúng
    { wch: 11 }, // Tổng câu TN
    { wch: 12 }, // Câu chờ chấm
    { wch: 8 }, // Vi phạm
    { wch: 15 }, // Thời gian
    { wch: 18 }, // Nộp lúc
    { wch: 28 }, // Trạng thái
  ];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: HEAD.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: HEAD.length - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: HEAD.length - 1 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName("Bảng điểm"));

  // ─────────────────────────── Sheet 2: Tổng quan ────────────────────────
  const t = report.totals;
  const overview: (string | number)[][] = [
    ["TỔNG QUAN CA THI"],
    ["Ca thi", shift.name],
    ["Môn", subjectName],
    ["Khối", gradeCode ?? "—"],
    ["Thời gian", `${vnDateTime(shift.startAt)} → ${vnDateTime(shift.endAt)}`],
    ["Thang điểm", formatScore(maxScore)],
    [],
    ["Sĩ số (eligible)", t.eligible],
    ["Đã nộp", t.submitted],
    ["Vắng", t.absent],
    ["Điểm trung bình", t.avgRaw],
    ["Điểm cao nhất", t.bestRaw],
    ["Điểm thấp nhất", t.worstRaw],
    ["Tỉ lệ đạt (≥ 50%)", `${t.passRate}%`],
    ["Thời gian TB (phút)", t.avgDurationMin ?? "—"],
    ["Tổng vi phạm", t.totalViolations],
    ["Câu tự luận chờ chấm", t.pendingEssayCount],
    [],
    ["PHÂN BỐ XẾP LOẠI", "Số HS", "%"],
    ...report.distribution.map(
      (d): (string | number)[] => [d.band, d.count, `${d.percent}%`],
    ),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(overview);
  ws2["!cols"] = [{ wch: 24 }, { wch: 32 }, { wch: 8 }];
  ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  XLSX.utils.book_append_sheet(wb, ws2, "Tổng quan");

  // ─────────────────────────── Sheet 3: Theo câu hỏi ─────────────────────
  const qHead = [
    "STT",
    "Nội dung",
    "Độ khó",
    "Loại",
    "Điểm/câu",
    "Được giao",
    "Đúng",
    "Sai",
    "Bỏ trống",
    "% đúng",
  ];
  const qRows: (string | number)[][] = report.perQuestion
    .filter((row) => row.totalAssigned > 0)
    .sort((a, b) => (a.correctPercent ?? 50) - (b.correctPercent ?? 50))
    .map((row, i) => [
      i + 1,
      plainText(row.question.content),
      difficultyLabel(row.difficulty),
      row.isManual ? "Tự luận" : "Trắc nghiệm",
      Math.round(row.weight * 100) / 100,
      row.totalAssigned,
      row.correct,
      row.wrong,
      row.blank,
      row.correctPercent != null ? `${row.correctPercent}%` : "—",
    ]);
  const ws3 = XLSX.utils.aoa_to_sheet([qHead, ...qRows]);
  ws3["!cols"] = [
    { wch: 5 },
    { wch: 50 },
    { wch: 8 },
    { wch: 13 },
    { wch: 9 },
    { wch: 10 },
    { wch: 7 },
    { wch: 7 },
    { wch: 9 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, "Theo câu hỏi");

  const fname =
    safeFileName(`Bang_diem_${shift.name}_${stampNow()}`) + ".xlsx";
  XLSX.writeFile(wb, fname);
}
