"use client";

/**
 * "Bài kiểm tra" của học sinh.
 *
 * Tách khỏi "Lịch thi của tôi" có chủ ý: bài kiểm tra 15 phút của giáo viên và
 * kỳ thi chính thức của trường là hai việc khác nhau, trộn chung một danh sách
 * thì học sinh không biết cái nào quan trọng hơn.
 *
 * Bên dưới vẫn là cùng một bản ghi ca thi, nên thẻ hiển thị, đường vào làm bài
 * và lịch sử bài làm đều dùng chung mã nguồn với lịch thi.
 */

import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";

import { isQuickTest } from "@/features/exam-shifts/data/types";
import { PageHeader } from "@/features/shell/components/page-header";
import { StudentShiftCard } from "@/features/student/components/student-shift-card";
import { useMyShifts } from "@/features/student/hooks/use-my-shifts";
import { cn } from "@/lib/utils";

type Filter = "dang-mo" | "da-lam" | "tat-ca";

export default function MyTestsPage() {
  const all = useMyShifts();
  const [filter, setFilter] = useState<Filter>("dang-mo");

  const tests = useMemo(() => all.filter((m) => isQuickTest(m.shift)), [all]);

  const shown = useMemo(() => {
    if (filter === "tat-ca") return tests;
    if (filter === "da-lam") {
      return tests.filter((m) => m.attendance === "submitted");
    }
    // "Đang mở" gồm cả bài sắp mở — đó là thứ học sinh cần thấy trước.
    return tests.filter(
      (m) =>
        m.attendance !== "submitted" &&
        (m.effectiveStatus === "in-progress" || m.effectiveStatus === "scheduled"),
    );
  }, [tests, filter]);

  const counts = {
    "dang-mo": tests.filter(
      (m) =>
        m.attendance !== "submitted" &&
        (m.effectiveStatus === "in-progress" || m.effectiveStatus === "scheduled"),
    ).length,
    "da-lam": tests.filter((m) => m.attendance === "submitted").length,
    "tat-ca": tests.length,
  } satisfies Record<Filter, number>;

  return (
    <>
      <PageHeader
        title="Bài kiểm tra"
        description="Bài kiểm tra do giáo viên bộ môn giao. Có đồng hồ đếm ngược — vào làm là bắt đầu tính giờ."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ["dang-mo", "Đang mở"],
            ["da-lam", "Đã làm"],
            ["tat-ca", "Tất cả"],
          ] as Array<[Filter, string]>
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-small font-semibold",
              filter === v
                ? "border-primary bg-primary/10 text-primary"
                : "bg-card text-foreground/70",
            )}
          >
            {label} ({counts[v]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-body font-semibold">
            {tests.length === 0
              ? "Chưa có bài kiểm tra nào"
              : "Không có bài nào ở mục này"}
          </p>
          <p className="text-meta mt-1 text-muted-foreground">
            {tests.length === 0
              ? "Khi giáo viên giao bài kiểm tra, nó sẽ hiện ở đây."
              : "Thử chọn mục khác ở trên."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => (
            <li key={m.shift.id}>
              <StudentShiftCard item={m} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
