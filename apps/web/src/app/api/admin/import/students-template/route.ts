/**
 * GET /api/admin/import/students-template
 *
 * Returns an Excel (.xlsx) template the admin can fill in to bulk-create
 * student accounts. The template has 3 sheets:
 *
 *   1) Hướng dẫn — column reference (required vs optional, format hints,
 *      examples) + the campus / grade context the file is being imported
 *      INTO so the admin doesn't pick a wrong grade by mistake.
 *
 *   2) Học sinh — the row buffer. Header in bold red for REQUIRED fields,
 *      bold gray for OPTIONAL. 3 sample rows so the admin sees the
 *      expected shape. Empty validation comment cells aren't supported
 *      by docx-style writing here, but the Hướng dẫn sheet covers it.
 *
 *   3) Tham chiếu — list of valid grade codes for THIS campus so the
 *      admin can copy/paste accurate values into the gradeCode column.
 *
 * Query params:
 *   ?campusId=<id>  — optional. Drives which grade codes show up on the
 *                     reference sheet. If omitted, the template shows
 *                     all K1–K12 codes with no campus filter.
 *   ?campusName=<name>  — display label for the Hướng dẫn header.
 *   ?grades=K1,K2,K3    — comma-separated grade codes available in
 *                          the campus (passed from client since the
 *                          server has no auth context to look them up).
 */
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

const REQUIRED_FIELDS = [
  { key: "email", label: "Email *", note: "Bắt buộc · duy nhất toàn hệ thống" },
  { key: "name", label: "Họ tên *", note: "Bắt buộc" },
  { key: "password", label: "Mật khẩu *", note: "Bắt buộc · ≥ 6 ký tự" },
  {
    key: "gradeCode",
    label: "Khối *",
    note: "Bắt buộc · vd: K1, K2, … K12 (phải nằm trong campus)",
  },
  {
    key: "className",
    label: "Lớp *",
    note: "Bắt buộc · vd: 1A, 5C — nếu lớp chưa có sẽ tự tạo",
  },
];

const OPTIONAL_FIELDS = [
  { key: "studentCode", label: "Mã HS", note: "Mã nội bộ trường (nếu có)" },
  { key: "phone", label: "SĐT HS", note: "VD: 0901234567" },
  { key: "parentPhone", label: "SĐT phụ huynh", note: "VD: 0987654321" },
  { key: "dob", label: "Ngày sinh", note: "YYYY-MM-DD (vd: 2015-03-12)" },
  { key: "gender", label: "Giới tính", note: '"male" / "female" / "other"' },
];

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const SAMPLE_ROWS = [
  {
    email: "hs001@fpt.edu.vn",
    name: "Nguyễn Văn An",
    password: "fpt@2026",
    gradeCode: "K1",
    className: "1A",
    studentCode: "HS001",
    phone: "0901234567",
    parentPhone: "0987654321",
    dob: "2019-05-12",
    gender: "male",
  },
  {
    email: "hs002@fpt.edu.vn",
    name: "Trần Thị Bình",
    password: "fpt@2026",
    gradeCode: "K1",
    className: "1A",
    studentCode: "HS002",
    phone: "",
    parentPhone: "0911234567",
    dob: "2019-08-03",
    gender: "female",
  },
  {
    email: "hs003@fpt.edu.vn",
    name: "Lê Hoàng Cường",
    password: "fpt@2026",
    gradeCode: "K2",
    className: "2B",
    studentCode: "",
    phone: "",
    parentPhone: "",
    dob: "",
    gender: "",
  },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const campusName = url.searchParams.get("campusName") ?? "—";
  const gradesParam = url.searchParams.get("grades") ?? "";
  const availableGrades = gradesParam
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Hướng dẫn ─────────────────────────────────────────
  const guideRows: (string | number)[][] = [
    ["FSC EXAM PLATFORM · TẠO TÀI KHOẢN HỌC SINH HÀNG LOẠT"],
    [""],
    [`Campus đích: ${campusName}`],
    [
      availableGrades.length > 0
        ? `Khối hợp lệ trong campus: ${availableGrades.join(", ")}`
        : "Khối hợp lệ: chưa xác định (chọn campus trước khi tải file)",
    ],
    [""],
    ["QUY TẮC"],
    ["1. Mở sheet \"Học sinh\" để nhập dữ liệu."],
    ["2. Mỗi dòng là 1 học sinh. Không xoá hàng tiêu đề."],
    ["3. Cột có dấu * là BẮT BUỘC — thiếu thì dòng đó bị bỏ qua khi import."],
    ["4. Nếu \"Lớp\" chưa tồn tại trong khối được chọn → hệ thống tự tạo lớp."],
    ["5. Nếu \"Khối\" không nằm trong campus → dòng đó báo lỗi, KHÔNG tạo HS."],
    [
      "6. Email phải duy nhất toàn hệ thống. Trùng → dòng đó bị bỏ qua + báo lỗi.",
    ],
    [""],
    ["BẢNG CÁC CỘT"],
    ["Cột", "Bắt buộc", "Ghi chú"],
    ...ALL_FIELDS.map((f) => [
      f.label.replace(" *", ""),
      f.label.includes("*") ? "Có" : "Không",
      f.note,
    ]),
    [""],
    ["MẸO"],
    ["• Có thể bỏ trống các cột không bắt buộc."],
    [
      "• Ngày sinh phải đúng định dạng YYYY-MM-DD (vd: 2015-03-12). Excel có thể tự chuyển ngày — nếu cần, format cột là Text trước khi nhập.",
    ],
    [
      "• Mật khẩu sẽ được hash khi lưu. HS đăng nhập lần đầu nên đổi mật khẩu mới.",
    ],
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, guideSheet, "Hướng dẫn");

  // ── Sheet 2: Học sinh ──────────────────────────────────────────
  const header = ALL_FIELDS.map((f) => f.label);
  const sampleAoa = SAMPLE_ROWS.map((row) =>
    ALL_FIELDS.map((f) => row[f.key as keyof typeof row] ?? ""),
  );
  const studentRows = [header, ...sampleAoa];
  const studentSheet = XLSX.utils.aoa_to_sheet(studentRows);
  studentSheet["!cols"] = ALL_FIELDS.map((f) => ({
    wch: f.label.length + 6,
  }));
  XLSX.utils.book_append_sheet(wb, studentSheet, "Học sinh");

  // ── Sheet 3: Tham chiếu ────────────────────────────────────────
  const refRows: (string | number)[][] = [
    ["DANH SÁCH KHỐI HỢP LỆ — sao chép giá trị này vào cột Khối *"],
    [""],
    ["Mã khối"],
    ...(availableGrades.length > 0
      ? availableGrades.map((g) => [g])
      : Array.from({ length: 12 }, (_, i) => [`K${i + 1}`])),
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet["!cols"] = [{ wch: 30 }];
  XLSX.utils.book_append_sheet(wb, refSheet, "Tham chiếu");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="FSC-mau-import-hoc-sinh.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
