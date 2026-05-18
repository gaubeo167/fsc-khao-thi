"use client";

import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";

interface Row {
  label: string;
  status: "ok" | "warn" | "down";
  hint: string;
}

const DOT: Record<Row["status"], string> = {
  ok: "bg-[var(--color-success)]",
  warn: "bg-[var(--color-warning)]",
  down: "bg-destructive",
};

const LABEL: Record<Row["status"], string> = {
  ok: "Bình thường",
  warn: "Theo dõi",
  down: "Cần xử lý",
};

/**
 * "Status" card grounded in real store data — surfaces operational backlogs
 * (pending approvals, rejected packages, live shifts, …) instead of fake
 * infrastructure metrics.
 */
export function SystemStatusCard() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const questions = useQuestionsStore((s) => s.questions);
  const packages = usePackagesStore((s) => s.packages);
  const shifts = useShiftsStore((s) => s.shifts);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const rows = useMemo<Row[]>(() => {
    const scopedQuestions = questions.filter(
      (q) =>
        q.kho === "campus" && (campusId ? q.campusId === campusId : true),
    );
    const scopedPackages = packages.filter((p) =>
      campusId ? p.campusId === campusId : true,
    );
    const scopedShifts = shifts.filter((s) =>
      campusId ? s.campusId === campusId : true,
    );

    const pendingQ = scopedQuestions.filter((q) => q.status === "pending").length;
    const rejectedQ = scopedQuestions.filter((q) => q.status === "rejected").length;
    const pendingP = scopedPackages.filter((p) => p.status === "pending").length;
    const rejectedP = scopedPackages.filter((p) => p.status === "rejected").length;
    const liveS = scopedShifts.filter((s) => s.status === "in-progress").length;
    const upcomingS = scopedShifts.filter(
      (s) =>
        s.status === "scheduled" &&
        new Date(s.startAt).getTime() <= Date.now() + 24 * 60 * 60 * 1000,
    ).length;

    return [
      {
        label: "Câu hỏi chờ duyệt",
        status: pendingQ === 0 ? "ok" : pendingQ > 20 ? "warn" : "ok",
        hint:
          pendingQ === 0
            ? "Không còn câu nào trong queue"
            : `${pendingQ.toLocaleString("vi-VN")} câu cần xét duyệt`,
      },
      {
        label: "Gói đề chờ duyệt",
        status: pendingP === 0 ? "ok" : "warn",
        hint:
          pendingP === 0
            ? "Không có gói đề chờ"
            : `${pendingP.toLocaleString("vi-VN")} gói cần Admin duyệt`,
      },
      {
        label: "Câu hỏi bị từ chối",
        status: rejectedQ === 0 ? "ok" : "warn",
        hint:
          rejectedQ === 0
            ? "Không có"
            : `${rejectedQ.toLocaleString("vi-VN")} câu — giáo viên cần sửa & gửi lại`,
      },
      {
        label: "Gói đề bị từ chối",
        status: rejectedP === 0 ? "ok" : "warn",
        hint:
          rejectedP === 0
            ? "Không có"
            : `${rejectedP.toLocaleString("vi-VN")} gói — chỉnh lại ma trận`,
      },
      {
        label: "Ca thi đang/sắp diễn ra",
        status: liveS > 0 ? "ok" : upcomingS > 0 ? "ok" : "warn",
        hint:
          liveS > 0
            ? `${liveS.toLocaleString("vi-VN")} ca đang thi · ${upcomingS.toLocaleString("vi-VN")} ca trong 24h tới`
            : upcomingS > 0
              ? `${upcomingS.toLocaleString("vi-VN")} ca sắp diễn ra trong 24h`
              : "Chưa có ca thi sắp tới",
      },
    ];
  }, [questions, packages, shifts, campusId]);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h3 className="text-section-title">Tình trạng vận hành</h3>
          <p className="text-meta mt-0.5">Tổng hợp từ dữ liệu thực tế</p>
        </div>

        <ul className="flex-1 space-y-2.5">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between gap-3 rounded-md border border-transparent px-1.5 py-1.5 hover:border-border hover:bg-muted/40"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[row.status]}`}
                />
                <div className="min-w-0">
                  <p className="text-card-title truncate">{row.label}</p>
                  <p className="text-meta truncate">{row.hint}</p>
                </div>
              </div>
              <span className="text-meta shrink-0">{LABEL[row.status]}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
