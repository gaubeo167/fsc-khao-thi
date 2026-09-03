"use client";

import { AlertTriangle, CalendarRange, Clock, Download, Eye, RotateCcw, Users } from "lucide-react";
import { useMemo, useState } from "react";

import type { ExamShift } from "@/features/exam-shifts/data/types";
import { effectiveShiftStatus } from "@/features/exam-shifts/data/types";
import {
  formatHours,
  locCaTheoNgay,
  nhanNgayThi,
  tinhGioCoiThi,
  type ProctorTotal,
} from "@/features/reports/lib/proctor-hours";
import { cn } from "@/lib/utils";

/**
 * Bảng GIỜ COI THI theo giáo viên.
 *
 * Cuối kỳ nhà trường phải trả lời "thầy cô nào coi bao nhiêu ca, bao nhiêu
 * giờ" để tính công và chia ca kỳ sau cho đều. Dữ liệu vốn nằm sẵn trong ca
 * thi, chỉ chưa chỗ nào cộng lại — tổ văn phòng đang mở từng ca đếm tay.
 *
 * `shifts` nhận vào là danh sách ĐÃ CẮT theo cơ sở / môn / khối của người
 * xem (`reportableShifts` của trang báo cáo). Không tự cắt lại ở đây: một
 * luật phân quyền, không đẻ luật thứ hai.
 */
export function ProctoringReport({
  shifts,
  users,
}: {
  shifts: ExamShift[];
  users: { id: string; name: string }[];
}) {
  const [moRong, setMoRong] = useState<string | null>(null);
  /**
   * Khoảng NGÀY THI đang xem (`YYYY-MM-DD`, bao gồm cả hai đầu).
   *
   * Bảng công tính theo đợt — "tháng 5", "kỳ I" — chứ không tính gộp cả năm.
   * Không có bộ lọc này thì tổ văn phòng phải tự trừ ra bằng tay từ tổng cả
   * năm, và trừ tay thì sai.
   */
  const [tuNgay, setTuNgay] = useState("");
  const [denNgay, setDenNgay] = useState("");
  const coLoc = tuNgay !== "" || denNgay !== "";
  // Người dùng gõ ngược (từ 20/5 đến 01/5) thì mọi thứ biến mất mà không nói
  // vì sao. Nói ra, và không lọc bằng khoảng vô nghĩa.
  const khoangNguoc = tuNgay !== "" && denNgay !== "" && tuNgay > denNgay;

  // Ca ĐÃ HUỶ không tính — không ai tới coi cả. `reportableShifts` cố ý giữ
  // lại ca huỷ để tab "Ca thi" còn thống kê được, nên phải lọc ở đây.
  const caThat = useMemo(
    () => shifts.filter((s) => effectiveShiftStatus(s) !== "cancelled"),
    [shifts],
  );

  const caTrongKhoang = useMemo(
    () => (khoangNguoc ? caThat : locCaTheoNgay(caThat, tuNgay, denNgay)),
    [caThat, tuNgay, denNgay, khoangNguoc],
  );

  const rows = useMemo(() => {
    const ten = new Map(users.map((u) => [u.id, u.name]));
    return tinhGioCoiThi(caTrongKhoang, (id) => ten.get(id) ?? null);
  }, [caTrongKhoang, users]);

  const tongPhut = rows.reduce((s, r) => s + r.soPhut, 0);
  const tongCaLoi = rows.reduce((s, r) => s + r.caThieuGio, 0);

  function taiCsv() {
    const head = [
      "Giáo viên",
      "Ngày thi",
      "Số ca",
      "Tổng giờ",
      "Tổng phút",
      "Ca thiếu giờ",
    ];
    const body = rows.map((r) => [
      r.name,
      nhanNgayThi(r.ngayDau, r.ngayCuoi),
      String(r.soCa),
      formatHours(r.soPhut),
      String(r.soPhut),
      String(r.caThieuGio),
    ]);
    // BOM để Excel bản tiếng Việt mở ra không vỡ dấu.
    const csv =
      "﻿" +
      [head, ...body]
        .map((cols) => cols.map((c) => `"${c.replaceAll('"', '""')}"`).join(","))
        .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    // Tên file mang theo khoảng đang lọc — tải hai đợt về cùng một thư mục
    // mà trùng tên thì không ai biết file nào là đợt nào.
    a.download = `gio-coi-thi-${
      coLoc ? `${tuNgay || "dau"}_${denNgay || "cuoi"}` : new Date().toISOString().slice(0, 10)
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Thanh lọc phải hiện CẢ khi bảng rỗng. Lọc vào một khoảng không có ca nào
  // rồi thanh lọc biến mất là người dùng kẹt: không còn chỗ nào để gỡ lọc,
  // chỉ thấy "chưa có giờ coi thi nào" và tưởng dữ liệu mất.
  const thanhLoc = (
    <section className="mb-4 rounded-2xl border bg-card px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <span className="text-meta inline-flex items-center gap-1.5 pb-1.5 font-semibold text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          Ngày thi
        </span>
        <label className="flex flex-col gap-1">
          <span className="text-hint text-muted-foreground">Từ ngày</span>
          <input
            type="date"
            value={tuNgay}
            max={denNgay || undefined}
            onChange={(e) => setTuNgay(e.target.value)}
            className="text-meta h-8 rounded-md border bg-background px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-hint text-muted-foreground">Đến ngày</span>
          <input
            type="date"
            value={denNgay}
            min={tuNgay || undefined}
            onChange={(e) => setDenNgay(e.target.value)}
            className="text-meta h-8 rounded-md border bg-background px-2"
          />
        </label>
        {coLoc && (
          <button
            type="button"
            onClick={() => {
              setTuNgay("");
              setDenNgay("");
            }}
            className="text-meta inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 font-medium hover:bg-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Bỏ lọc
          </button>
        )}
        <span className="text-hint ml-auto text-muted-foreground">
          {coLoc
            ? `Đang tính ${caTrongKhoang.length}/${caThat.length} ca thi.`
            : `Đang tính cả ${caThat.length} ca thi.`}
        </span>
      </div>
      {khoangNguoc && (
        <p className="text-hint mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
          "Từ ngày" đang sau "đến ngày" — khoảng này rỗng nên bảng vẫn hiện đủ
          mọi ca. Đổi lại hai mốc cho đúng thứ tự.
        </p>
      )}
    </section>
  );

  if (rows.length === 0) {
    return (
      <>
        {thanhLoc}
        <section className="rounded-2xl border bg-card px-5 py-10 text-center">
          <Eye className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-body font-semibold">
            {coLoc
              ? "Không có giờ coi thi nào trong khoảng này"
              : "Chưa có giờ coi thi nào"}
          </p>
          <p className="text-meta mt-1 text-muted-foreground">
            {coLoc
              ? "Đổi khoảng ngày, hoặc bấm “Bỏ lọc” để xem lại toàn bộ."
              : "Bảng này cộng từ giám thị được phân vào phòng của các ca đã kết thúc. Ca chưa diễn ra hoặc đã huỷ không tính."}
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      {thanhLoc}
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <Tile
          icon={<Users className="h-4 w-4" />}
          nhan="Giáo viên đã coi thi"
          giaTri={String(rows.length)}
        />
        <Tile
          icon={<Clock className="h-4 w-4" />}
          nhan="Tổng giờ coi thi"
          giaTri={formatHours(tongPhut)}
        />
        <Tile
          icon={<Eye className="h-4 w-4" />}
          nhan="Lượt coi thi"
          giaTri={String(rows.reduce((s, r) => s + r.soCa, 0))}
        />
      </section>

      {tongCaLoi > 0 && (
        <p className="text-meta mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {tongCaLoi} lượt coi thi không tính được giờ vì ca thiếu mốc thời
            gian hoặc mốc lệch. Vẫn đếm là một lượt, nhưng cộng 0 phút — mở
            từng giáo viên để xem ca nào rồi sửa lại giờ của ca đó.
          </span>
        </p>
      )}

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={taiCsv}
          className="text-meta inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 font-medium hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          Tải CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-surface-2">
              <Th>Giáo viên</Th>
              <Th>Ngày thi</Th>
              <Th className="text-right">Số ca</Th>
              <Th className="text-right">Tổng giờ</Th>
              <Th className="w-0"> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RowGV
                key={r.userId}
                row={r}
                mo={moRong === r.userId}
                onToggle={() => setMoRong(moRong === r.userId ? null : r.userId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "text-meta px-4 py-2 text-left font-semibold text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Tile({
  icon,
  nhan,
  giaTri,
}: {
  icon: React.ReactNode;
  nhan: string;
  giaTri: string;
}) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3">
      <p className="text-meta flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {nhan}
      </p>
      <p className="text-kpi mt-1">{giaTri}</p>
    </div>
  );
}

function RowGV({
  row,
  mo,
  onToggle,
}: {
  row: ProctorTotal;
  mo: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b last:border-0">
        <td className="text-body px-4 py-2.5 font-medium">
          {row.name}
          {row.caThieuGio > 0 && (
            <span className="text-meta ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
              {row.caThieuGio} ca thiếu giờ
            </span>
          )}
        </td>
        {/* Ngày sớm nhất → muộn nhất trong khoảng đang xem. Có nó thì tổ
            văn phòng đối chiếu được với lịch thi ngay trên bảng tổng, không
            phải bung từng người ra xem. */}
        <td className="text-meta whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
          {nhanNgayThi(row.ngayDau, row.ngayCuoi)}
        </td>
        <td className="text-body px-4 py-2.5 text-right tabular-nums">
          {row.soCa}
        </td>
        <td className="text-body px-4 py-2.5 text-right font-semibold tabular-nums">
          {formatHours(row.soPhut)}
        </td>
        <td className="px-4 py-2.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="text-meta rounded-md border bg-card px-2 py-1 font-medium hover:bg-accent"
          >
            {mo ? "Thu lại" : "Xem ca"}
          </button>
        </td>
      </tr>
      {mo && (
        <tr className="border-b bg-surface-2 last:border-0">
          <td colSpan={5} className="px-4 py-3">
            <ul className="space-y-1.5">
              {row.shifts.map((s) => (
                <li
                  key={s.shiftId}
                  className="text-meta flex items-baseline gap-2"
                >
                  <span className="tabular-nums text-muted-foreground">
                    {s.startAt
                      ? new Date(s.startAt).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  <span className="flex-1 font-medium">{s.shiftName}</span>
                  {s.moTaLoi ? (
                    <span className="font-medium text-amber-800">
                      ⚠ {s.moTaLoi}
                    </span>
                  ) : (
                    <span className="tabular-nums font-semibold">
                      {formatHours(s.minutes)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
