/**
 * POST /api/admin/import/students
 *
 * Multipart form-data with `file` = .xlsx (the bulk-student template).
 * The server just parses the file into plain JSON rows — actual user /
 * class creation happens client-side via the existing zustand stores so
 * the same offline-friendly mock-backend rules apply. The client also
 * runs the campus + grade validation since it has the campus state in
 * memory.
 *
 * Returns:
 *   {
 *     rows: Array<{
 *       rowNumber: number;   // 1-based, counting from header row +1
 *       email?, name?, password?, gradeCode?, className?, ...
 *     }>,
 *     warnings: string[]     // file-level warnings (sheet missing, etc.)
 *   }
 *
 * Per-row validation (missing required fields, duplicate emails,
 * unknown grade) is layered on top in the dialog so the UI can show
 * inline errors next to each row.
 */
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const COLUMN_MAP: Record<string, string> = {
  // Recognise both the exact template header AND the raw key (in case
  // the admin renamed the headers but kept the key column).
  email: "email",
  "email *": "email",
  name: "name",
  "họ tên": "name",
  "họ tên *": "name",
  hoten: "name",
  password: "password",
  "mật khẩu": "password",
  "mật khẩu *": "password",
  matkhau: "password",
  gradecode: "gradeCode",
  "khối": "gradeCode",
  "khối *": "gradeCode",
  khoi: "gradeCode",
  "mã khối": "gradeCode",
  classname: "className",
  "lớp": "className",
  "lớp *": "className",
  lop: "className",
  studentcode: "studentCode",
  "mã hs": "studentCode",
  mahs: "studentCode",
  phone: "phone",
  "sđt hs": "phone",
  sdt: "phone",
  "số điện thoại": "phone",
  parentphone: "parentPhone",
  "sđt phụ huynh": "parentPhone",
  "sdt phu huynh": "parentPhone",
  dob: "dob",
  "ngày sinh": "dob",
  ngaysinh: "dob",
  gender: "gender",
  "giới tính": "gender",
  gioitinh: "gender",
};

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  let buf: Buffer;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "no_file", message: "Không có file" },
        { status: 400 },
      );
    }
    buf = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    return NextResponse.json(
      {
        error: "form_failed",
        message: err instanceof Error ? err.message : "Không đọc được form",
      },
      { status: 400 },
    );
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch (err) {
    return NextResponse.json(
      {
        error: "parse_failed",
        message:
          err instanceof Error
            ? err.message
            : "File không đúng định dạng Excel (.xlsx)",
      },
      { status: 400 },
    );
  }

  // Find the "Học sinh" sheet (case-insensitive); fall back to the
  // first sheet that isn't named "Hướng dẫn" or "Tham chiếu" so admins
  // who renamed the sheet still get a result.
  const candidates = wb.SheetNames.filter(
    (n) => !/hướng dẫn|huong dan|tham chiếu|tham chieu/i.test(n),
  );
  const sheetName =
    wb.SheetNames.find((n) => /học sinh|hoc sinh|students?/i.test(n)) ??
    candidates[0];

  if (!sheetName) {
    return NextResponse.json(
      {
        error: "no_sheet",
        message:
          "Không tìm thấy sheet học sinh trong file. Tải lại file mẫu chuẩn.",
      },
      { status: 400 },
    );
  }

  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return NextResponse.json(
      { error: "no_sheet", message: "Sheet rỗng." },
      { status: 400 },
    );
  }

  // Convert to array of arrays so we keep tight control over header
  // matching + row indexing. defval keeps blanks as "".
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (aoa.length < 2) {
    return NextResponse.json(
      {
        error: "empty",
        message: "File chưa có học sinh nào (sheet chỉ có dòng tiêu đề).",
      },
      { status: 400 },
    );
  }

  const headerRow = aoa[0] as string[];
  // Map each column index → canonical key (email / name / …) so the
  // file can have the columns in any order.
  const keyByCol = headerRow.map((h) => {
    const key = COLUMN_MAP[normaliseHeader(String(h ?? ""))];
    return key ?? null;
  });

  const warnings: string[] = [];
  const REQUIRED_KEYS = ["email", "name", "password", "gradeCode", "className"];
  for (const k of REQUIRED_KEYS) {
    if (!keyByCol.includes(k)) {
      warnings.push(
        `Thiếu cột bắt buộc "${k}" trong file. Tải lại template chuẩn.`,
      );
    }
  }

  const rows: Array<{ rowNumber: number; [k: string]: string | number }> = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] as string[];
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
    const fields: Record<string, string> = {};
    for (let c = 0; c < row.length; c++) {
      const key = keyByCol[c];
      if (!key) continue;
      fields[key] = String(row[c] ?? "").trim();
    }
    rows.push({ rowNumber: r + 1, ...fields });
  }

  return NextResponse.json({ rows, warnings, sheetUsed: sheetName });
}
