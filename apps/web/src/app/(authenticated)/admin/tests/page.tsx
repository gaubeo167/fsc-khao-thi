"use client";

/**
 * "Bài kiểm tra" của giáo viên — danh sách và lối tạo nhanh.
 *
 * Tách khỏi màn "Ca kíp thi" vì hai việc khác hẳn nhau về quy mô: ca thi là
 * việc của cả trường (khung đề, duyệt, phòng, giám thị), bài kiểm tra là việc
 * của một giáo viên với một lớp. Trộn chung một danh sách thì màn ca thi của
 * trường bị lấp bởi hàng chục bài 15 phút.
 *
 * Bên dưới vẫn là cùng một bản ghi, nên giám sát, chấm bài và báo cáo dùng
 * chung màn hình với ca thi.
 */

import { Activity, BarChart3, ClipboardList, EyeOff, Plus, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusGate } from "@/features/campus/hooks/use-campus-gate";
import { useCampusStore } from "@/features/campus/state/campus-store";
import {
  effectiveShiftStatus,
  isQuickTest,
  type ExamShift,
  type ShiftStatus,
} from "@/features/exam-shifts/data/types";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

/**
 * Nhãn trạng thái. Cố ý KHÁC chữ của màn Ca kíp thi ("Đang thi", "Đã lên
 * lịch"): với một bài kiểm tra 15 phút thì "Đang làm" và "Sắp mở" đúng hơn.
 * Trạng thái bên dưới vẫn là một.
 */
const STATUS_LABEL: Record<ShiftStatus, string> = {
  draft: "Nháp",
  scheduled: "Sắp mở",
  "in-progress": "Đang làm",
  completed: "Đã đóng",
  cancelled: "Đã huỷ",
};

const QuickTestDialog = dynamic(
  () =>
    import("@/features/exam-shifts/dialogs/quick-test-dialog").then(
      (m) => m.QuickTestDialog,
    ),
  { ssr: false, loading: () => null },
);

export default function AdminTestsPage() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const shifts = useShiftsStore((s) => s.shifts);
  const archive = useShiftsStore((s) => s.archive);
  const restore = useShiftsStore((s) => s.restore);
  const subjects = useSubjectsStore((s) => s.subjects);
  const classes = useGradesStore((s) => s.classes);
  const { canMutate } = useCampusGate();

  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const campusId = session?.role === "superadmin" ? activeCampusId : session?.campusId ?? null;

  const rows = useMemo(() => {
    return shifts
      .filter((s) => isQuickTest(s))
      .filter((s) => (campusId ? s.campusId === campusId : true))
      .filter((s) => (showArchived ? true : !s.archivedAt))
      .sort((a, b) => b.startAt.localeCompare(a.startAt));
  }, [shifts, campusId, showArchived]);

  const nameOfClasses = (s: ExamShift) =>
    s.classIds
      .map((cid) => classes.find((c) => c.id === cid)?.name ?? cid)
      .join(", ");

  return (
    <>
      <PageHeader
        title="Bài kiểm tra"
        description="Giáo viên tự ra đề từ kho câu hỏi của mình, đặt giờ và giao cho lớp. Học sinh làm bài có đồng hồ như ca thi."
        actions={
          <Button size="sm" disabled={!canMutate} onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Tạo bài kiểm tra
          </Button>
        }
      />

      <label className="mb-3 inline-flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        <span className="text-meta text-muted-foreground">Hiển thị bài đã ẩn</span>
      </label>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-body font-semibold">Chưa có bài kiểm tra nào</p>
          <p className="text-meta mt-1 text-muted-foreground">
            Bấm <b>Tạo bài kiểm tra</b> để ra đề từ kho câu hỏi của bạn.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => {
            const status = effectiveShiftStatus(s);
            const studentCount = s.rooms.reduce((n, r) => n + r.studentIds.length, 0);
            const proctored = s.rooms.some((r) => r.proctorIds.length > 0);
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-xl border bg-card p-4",
                  s.archivedAt && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-semibold">
                      {s.name}
                      {s.archivedAt && (
                        <span className="text-meta ml-2 font-normal text-muted-foreground">
                          (đã ẩn)
                        </span>
                      )}
                    </p>
                    <p className="text-meta mt-0.5 text-muted-foreground">
                      {subjects.find((x) => x.id === s.subjectId)?.name ?? "—"} ·{" "}
                      {nameOfClasses(s) || "—"} · {studentCount} học sinh ·{" "}
                      {s.questionIds?.length ?? 0} câu · {s.durationMinutes ?? "—"} phút
                    </p>
                    <p className="text-meta mt-0.5 text-muted-foreground">
                      {new Date(s.startAt).toLocaleString("vi-VN")} →{" "}
                      {new Date(s.endAt).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <span className="text-meta rounded-md border px-2 py-1 font-semibold">
                    {STATUS_LABEL[status]}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {proctored && (
                    <Link href={`/admin/shifts/${s.id}/monitor`}>
                      <Button size="sm" variant="outline">
                        <Activity className="mr-1.5 h-4 w-4" />
                        Giám sát
                      </Button>
                    </Link>
                  )}
                  <Link href={`/reports/${s.id}`}>
                    <Button size="sm" variant="outline">
                      <BarChart3 className="mr-1.5 h-4 w-4" />
                      Kết quả
                    </Button>
                  </Link>
                  {s.archivedAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!session) return;
                        restore(s.id, session.userId);
                        toast.success("Đã hiện lại bài kiểm tra.");
                      }}
                    >
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      Hiện lại
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!session) return;
                        archive(s.id, session.userId, "Ẩn từ màn Bài kiểm tra");
                        toast.success("Đã ẩn. Học sinh không còn thấy bài này.");
                      }}
                    >
                      <EyeOff className="mr-1.5 h-4 w-4" />
                      Ẩn
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating && <QuickTestDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}
