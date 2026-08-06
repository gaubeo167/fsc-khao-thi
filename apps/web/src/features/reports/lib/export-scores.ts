/**
 * Client-side Excel export for a single shift's score table (bảng điểm).
 *
 * Reuses the already-computed `ShiftReport` — the SAME numbers the report
 * page renders — so the spreadsheet can never drift from the on-screen
 * table. Uses `xlsx-js-style` (a style-capable SheetJS build) so the file
 * ships with real formatting: navy title bar, green info band, a blue
 * filterable header, cell borders, zebra rows and grade-band colour coding.
 * The library is dynamic-imported on click so its weight stays out of the
 * report page's initial bundle.
 *
 * Produces a 3-sheet workbook:
 *   1. "Bảng điểm"    — one row per eligible student (submitted first,
 *                       sorted by score desc; absentees at the bottom).
 *   2. "Tổng quan"    — KPIs + xếp-loại distribution.
 *   3. "Theo câu hỏi" — per-question correctness (hardest first).
 */
import type { WorkSheet } from "xlsx";

import type { SeedUser } from "@/features/auth/data/seed-users";
import type { ExamShift } from "@/features/exam-shifts/data/types";
import { DEFAULT_SCORING } from "@/features/exam-shifts/data/types";
import { formatScore } from "@/features/exam-shifts/lib/scoring";

import type { GradeBand, ShiftReport } from "./compute-stats";

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

// ───────────────────────────── palette (ARGB-less RGB hex) ──────────────
const NAVY = "1F3864"; // title bar
const GREEN_BAND = "E2EFDA"; // info band fill
const GREEN_TEXT = "375623"; // info band text
const HEADER_BLUE = "2F5597"; // column-header fill
const WHITE = "FFFFFF";
const ZEBRA = "EEF3FB"; // alternate data row
const GRID = "BFBFBF"; // cell border
const ABSENT_FILL = "F2F2F2";
const ABSENT_TEXT = "808080";
const DATA_TEXT = "222222";

const BAND_STYLE: Record<GradeBand, { fill: string; text: string }> = {
  Giỏi: { fill: "C6EFCE", text: "006100" },
  Khá: { fill: "BDD7EE", text: "1F4E79" },
  "Trung bình": { fill: "FFEB9C", text: "9C6500" },
  "Chưa đạt": { fill: "FFC7CE", text: "9C0006" },
};

// ───────────────────────────── style helpers ───────────────────────────
interface XlsxStyle {
  fill?: { patternType: "solid"; fgColor: { rgb: string } };
  font?: { bold?: boolean; italic?: boolean; color?: { rgb: string }; sz?: number };
  alignment?: {
    horizontal?: "left" | "center" | "right";
    vertical?: "top" | "center" | "bottom";
    wrapText?: boolean;
  };
  border?: Record<
    "top" | "bottom" | "left" | "right",
    { style: string; color: { rgb: string } }
  >;
}
interface StyledCell {
  v?: unknown;
  t?: string;
  z?: string;
  s?: XlsxStyle;
}

const thin = { style: "thin", color: { rgb: GRID } };
const ALL_BORDERS = { top: thin, bottom: thin, left: thin, right: thin };

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
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " [hình] ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[u:([^\]\n]+)\]/g, "$1")
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
  // Style-capable SheetJS build. Cast to the plain `xlsx` types (identical
  // API) so utils stay strongly typed; cell `.s` styling is applied through
  // the local StyledCell shape below.
  const XLSX = (await import("xlsx-js-style")) as unknown as typeof import("xlsx");
  const { encode_cell } = XLSX.utils;

  const scoring = shift.scoring ?? DEFAULT_SCORING;
  const maxScore = scoring.maxScore;
  const userById = new Map(users.map((u) => [u.id, u]));

  const setStyle = (
    ws: WorkSheet,
    ref: string,
    s: XlsxStyle,
    z?: string,
  ) => {
    const cell = ws[ref] as StyledCell | undefined;
    if (!cell) return;
    cell.s = { ...(cell.s ?? {}), ...s };
    if (z) cell.z = z;
  };

  // Submitted rows — sorted like the UI (score % desc).
  const submitted = [...report.perStudent].sort(
    (a, b) => b.percent - a.percent,
  );
  const submittedIds = new Set(submitted.map((r) => r.attempt.studentId));
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
  const NCOL = HEAD.length;
  const COL_TOTAL = 6;
  const COL_BAND = 8;
  const LEFT_COLS = new Set([1, 2, 15]); // Họ tên, Mã HS, Trạng thái
  const NUMFMT: Record<number, string> = {
    4: "0.00",
    5: "0.00",
    6: "0.00",
    7: '0"%"',
  };
  // aoa row layout: 0 title · 1 meta1 · 2 meta2 · 3 header · 4+ data
  const HEADER_ROW = 3;

  const aoa: (string | number)[][] = [];
  aoa.push([`BẢNG ĐIỂM — ${shift.name.toUpperCase()}`]);
  aoa.push([
    `Môn: ${subjectName}` +
      (gradeCode ? ` • Khối: ${gradeCode}` : "") +
      ` • Mã ca: ${shift.id}` +
      ` • ${vnDateTime(shift.startAt)} → ${vnDateTime(shift.endAt)}` +
      ` • Thang điểm: ${formatScore(maxScore)}`,
  ]);
  aoa.push([
    `Đã nộp: ${report.totals.submitted}/${report.totals.eligible}` +
      ` • Điểm trung bình: ${formatScore(report.totals.avgRaw)}` +
      ` • Tỉ lệ đạt: ${report.totals.passRate}%` +
      (report.totals.pendingEssayCount > 0
        ? ` • ⚠ ${report.totals.pendingEssayCount} câu tự luận chưa chấm (điểm tạm tính)`
        : ""),
  ]);
  aoa.push(HEAD);

  for (const r of submitted) {
    const u = userById.get(r.attempt.studentId);
    aoa.push([
      aoa.length - HEADER_ROW, // STT
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
    aoa.push([
      aoa.length - HEADER_ROW,
      u.name,
      u.studentCode ?? u.username ?? "",
      u.className ?? "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Vắng",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const dataCount = submitted.length + absent.length;

  ws["!cols"] = [
    { wch: 5 },
    { wch: 26 },
    { wch: 14 },
    { wch: 8 },
    { wch: 9 },
    { wch: 12 },
    { wch: 14 },
    { wch: 7 },
    { wch: 12 },
    { wch: 11 },
    { wch: 11 },
    { wch: 12 },
    { wch: 8 },
    { wch: 15 },
    { wch: 18 },
    { wch: 30 },
  ];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: NCOL - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: NCOL - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: NCOL - 1 } },
  ];
  ws["!rows"] = [
    { hpt: 28 },
    { hpt: 18 },
    { hpt: 18 },
    { hpt: 30 },
    ...Array.from({ length: dataCount }, () => ({ hpt: 18 })),
  ];
  // AutoFilter over the header + data (dropdown arrows on the header row).
  ws["!autofilter"] = {
    ref: `${encode_cell({ r: HEADER_ROW, c: 0 })}:${encode_cell({
      r: HEADER_ROW + dataCount,
      c: NCOL - 1,
    })}`,
  };

  // Title.
  setStyle(ws, "A1", {
    fill: { patternType: "solid", fgColor: { rgb: NAVY } },
    font: { bold: true, color: { rgb: WHITE }, sz: 14 },
    alignment: { horizontal: "center", vertical: "center" },
  });
  // Info band (2 rows).
  setStyle(ws, "A2", {
    fill: { patternType: "solid", fgColor: { rgb: GREEN_BAND } },
    font: { color: { rgb: NAVY }, sz: 10 },
    alignment: { horizontal: "center", vertical: "center" },
  });
  setStyle(ws, "A3", {
    fill: { patternType: "solid", fgColor: { rgb: GREEN_BAND } },
    font: { bold: true, color: { rgb: GREEN_TEXT }, sz: 10 },
    alignment: { horizontal: "center", vertical: "center" },
  });
  // Column header.
  for (let c = 0; c < NCOL; c++) {
    setStyle(ws, encode_cell({ r: HEADER_ROW, c }), {
      fill: { patternType: "solid", fgColor: { rgb: HEADER_BLUE } },
      font: { bold: true, color: { rgb: WHITE }, sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: ALL_BORDERS,
    });
  }
  // Data cells.
  for (let d = 0; d < dataCount; d++) {
    const rowIdx = HEADER_ROW + 1 + d;
    const isAbsent = d >= submitted.length;
    const zebra = d % 2 === 1;
    for (let c = 0; c < NCOL; c++) {
      let fillRgb = isAbsent ? ABSENT_FILL : zebra ? ZEBRA : WHITE;
      let fontColor = isAbsent ? ABSENT_TEXT : DATA_TEXT;
      let bold = false;
      if (!isAbsent && c === COL_BAND) {
        const band = BAND_STYLE[submitted[d]!.band];
        fillRgb = band.fill;
        fontColor = band.text;
        bold = true;
      }
      if (c === COL_TOTAL && !isAbsent) bold = true;
      setStyle(
        ws,
        encode_cell({ r: rowIdx, c }),
        {
          fill: { patternType: "solid", fgColor: { rgb: fillRgb } },
          font: { sz: 10, bold, italic: isAbsent, color: { rgb: fontColor } },
          alignment: {
            horizontal: LEFT_COLS.has(c) ? "left" : "center",
            vertical: "center",
          },
          border: ALL_BORDERS,
        },
        isAbsent ? undefined : NUMFMT[c],
      );
    }
  }

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
  // Title bar.
  setStyle(ws2, "A1", {
    fill: { patternType: "solid", fgColor: { rgb: NAVY } },
    font: { bold: true, color: { rgb: WHITE }, sz: 13 },
    alignment: { horizontal: "center", vertical: "center" },
  });
  ws2["!rows"] = [{ hpt: 24 }];
  // Bold the label column + the distribution sub-header.
  for (let r = 1; r <= 16; r++) {
    setStyle(ws2, encode_cell({ r, c: 0 }), {
      font: { bold: true, sz: 10, color: { rgb: DATA_TEXT } },
    });
  }
  const distHeaderRow = 18;
  for (let c = 0; c < 3; c++) {
    setStyle(ws2, encode_cell({ r: distHeaderRow, c }), {
      fill: { patternType: "solid", fgColor: { rgb: HEADER_BLUE } },
      font: { bold: true, color: { rgb: WHITE }, sz: 10 },
      alignment: { horizontal: c === 0 ? "left" : "center" },
      border: ALL_BORDERS,
    });
  }
  report.distribution.forEach((d, i) => {
    const r = distHeaderRow + 1 + i;
    const band = BAND_STYLE[d.band];
    setStyle(ws2, encode_cell({ r, c: 0 }), {
      fill: { patternType: "solid", fgColor: { rgb: band.fill } },
      font: { bold: true, color: { rgb: band.text }, sz: 10 },
      border: ALL_BORDERS,
    });
    for (let c = 1; c < 3; c++) {
      setStyle(ws2, encode_cell({ r, c }), {
        alignment: { horizontal: "center" },
        border: ALL_BORDERS,
        font: { sz: 10, color: { rgb: DATA_TEXT } },
      });
    }
  });
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
  ws3["!rows"] = [{ hpt: 26 }];
  ws3["!autofilter"] = {
    ref: `${encode_cell({ r: 0, c: 0 })}:${encode_cell({
      r: qRows.length,
      c: qHead.length - 1,
    })}`,
  };
  for (let c = 0; c < qHead.length; c++) {
    setStyle(ws3, encode_cell({ r: 0, c }), {
      fill: { patternType: "solid", fgColor: { rgb: HEADER_BLUE } },
      font: { bold: true, color: { rgb: WHITE }, sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: ALL_BORDERS,
    });
  }
  for (let d = 0; d < qRows.length; d++) {
    const r = d + 1;
    const zebra = d % 2 === 1;
    for (let c = 0; c < qHead.length; c++) {
      setStyle(ws3, encode_cell({ r, c }), {
        fill: {
          patternType: "solid",
          fgColor: { rgb: zebra ? ZEBRA : WHITE },
        },
        font: { sz: 10, color: { rgb: DATA_TEXT } },
        alignment: {
          horizontal: c === 1 ? "left" : "center",
          vertical: "center",
          wrapText: c === 1,
        },
        border: ALL_BORDERS,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, ws3, "Theo câu hỏi");

  const fname =
    safeFileName(`Bang_diem_${shift.name}_${stampNow()}`) + ".xlsx";
  XLSX.writeFile(wb, fname);
}
