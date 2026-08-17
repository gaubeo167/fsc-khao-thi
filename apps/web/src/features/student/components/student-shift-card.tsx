"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Hourglass,
  Play,
  Shield,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_SCORING,
  effectiveShiftStatus,
  type ShiftStatus,
} from "@/features/exam-shifts/data/types";
import { formatScore } from "@/features/exam-shifts/lib/scoring";
import type { MyShift } from "@/features/student/hooks/use-my-shifts";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ShiftStatus, string> = {
  draft: "Bản nháp",
  scheduled: "Sắp diễn ra",
  "in-progress": "Đang diễn ra",
  completed: "Đã kết thúc",
  cancelled: "Đã huỷ",
};

const STATUS_TONE: Record<ShiftStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  "in-progress": "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-violet-100 text-violet-700 border-violet-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function diffHumans(ms: number): string {
  if (ms <= 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin} phút`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}m` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} ngày${h % 24 > 0 ? ` ${h % 24}h` : ""}`;
}

export function StudentShiftCard({ item }: { item: MyShift }) {
  const subjects = useSubjectsStore((s) => s.subjects);
  // Bài làm lấy từ `useMyShifts` — cùng nguồn với thứ tự sắp xếp.
  const myAttempt = item.attempt;
  const subject = subjects.find((s) => s.id === item.shift.subjectId);
  const now = Date.now();
  const startMs = new Date(item.shift.startAt).getTime();
  const endMs = new Date(item.shift.endAt).getTime();
  // Recompute effective state with `now` so the badge / hint stay fresh
  // even when the parent isn't re-rendering on its own.
  const status = effectiveShiftStatus(item.shift, now);

  // Em này đã thi chưa — lấy từ `useMyShifts`, KHÔNG tính lại ở đây. Thứ tự
  // sắp xếp và màu viền phải đọc cùng một con số, nếu không sẽ có ngày thẻ
  // ghi "Chưa thi" mà lại nằm dưới đáy danh sách.
  const attendance = item.attendance;

  // Convert stored score to scoring config to display "X/maxScore".
  const scoring = item.shift.scoring ?? DEFAULT_SCORING;

  let timeHint: { icon: typeof Clock; label: string; tone: string } | null = null;
  if (status === "scheduled") {
    timeHint = {
      icon: Hourglass,
      label: `Bắt đầu sau ${diffHumans(startMs - now)}`,
      tone: "text-blue-700",
    };
  } else if (status === "in-progress") {
    timeHint = {
      icon: Clock,
      label: `Còn ${diffHumans(endMs - now)}`,
      tone: "text-emerald-700",
    };
  } else if (status === "completed") {
    timeHint = {
      icon: CheckCircle2,
      label: `Đã thi ${diffHumans(now - endMs)} trước`,
      tone: "text-violet-700",
    };
  }

  // Nộp rồi thì không mời vào thi lại — nút cũ vẫn sáng "Vào thi ngay" cho
  // cả em đã nộp, bấm vào chỉ để nhận thông báo đã nộp.
  const canEnter = status === "in-progress" && attendance !== "submitted";
  const activeAntiCheat = Object.values(item.shift.antiCheat).filter(Boolean).length;
  const totalAntiCheat = Object.keys(item.shift.antiCheat).length;

  return (
    <article
      className={cn(
        "rounded-xl border bg-card transition-shadow hover:shadow-sm",
        // Viền nói ngay "còn phải làm hay xong rồi", trước cả khi đọc chữ.
        // Màu chỉ là lớp nhắc lại — huy hiệu "✓ Đã thi / ○ Chưa thi" ở góc
        // phải vẫn là thứ mang nghĩa, nên không phụ thuộc vào phân biệt màu.
        attendance === "doing"
          ? "border-amber-400 ring-2 ring-amber-200/70"
          : attendance === "submitted"
            ? "border-violet-300 bg-violet-50/30"
            : attendance === "absent"
              ? "border-rose-200 bg-rose-50/20"
              : status === "in-progress"
                ? "border-emerald-300 ring-2 ring-emerald-200/60"
                : status === "cancelled"
                  ? "border-dashed"
                  : undefined,
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
          {item.shift.id}
        </span>
        {subject && (
          <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
            {subject.name}
          </span>
        )}
        {/* Attendance badge — the most useful signal for the student.
            Prioritised over the shift's lifecycle status so it can't be
            missed at a glance. */}
        <span
          className={cn(
            "ml-auto rounded-md border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]",
            attendance === "submitted"
              ? "border-violet-300 bg-violet-50 text-violet-800"
              : attendance === "doing"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : attendance === "absent"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-slate-200 bg-slate-100 text-slate-700",
          )}
        >
          {attendance === "submitted" && "✓ Đã thi"}
          {attendance === "doing" && "⏵ Đang thi dở"}
          {attendance === "absent" && "✗ Bỏ thi"}
          {attendance === "not-yet" && "○ Chưa thi"}
        </span>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
            STATUS_TONE[status],
          )}
        >
          {status === "in-progress" && (
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />
          )}
          {STATUS_LABEL[status]}
        </span>
      </header>

      <div className="space-y-2 px-4 py-3">
        <p className="text-[15px] font-semibold leading-snug">{item.shift.name}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-foreground/75">
          <div className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{formatDateTime(item.shift.startAt)}</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{formatDateTime(item.shift.endAt)}</span>
          </div>
          {item.roomName && (
            <div className="col-span-2 inline-flex items-center gap-1.5">
              <span className="text-base leading-none">🏫</span>
              <span>
                Phòng <span className="font-semibold">{item.roomName}</span>
              </span>
            </div>
          )}
          <div className="col-span-2 inline-flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              Anti-cheat:{" "}
              <span className="font-semibold">
                {activeAntiCheat}/{totalAntiCheat}
              </span>{" "}
              biện pháp
            </span>
          </div>
        </dl>
        {timeHint && (
          <p
            className={cn(
              "inline-flex items-center gap-1 text-[12px] font-semibold",
              timeHint.tone,
            )}
          >
            <timeHint.icon className="h-3 w-3" />
            {timeHint.label}
          </p>
        )}
        {/* Score chip — only for already-submitted attempts. The raw
            `attempt.score` was computed on the 0-100 scale by the auto-
            grader at submit time. The result page renders the full
            shift-scoring-aware breakdown. */}
        {attendance === "submitted" && myAttempt && (
          <p className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12.5px]">
            <span className="font-semibold text-emerald-800">
              Kết quả: {myAttempt.score ?? 0}/100
            </span>
            <span className="text-[10.5px] text-emerald-700">
              ({myAttempt.correctCount ?? 0}/{myAttempt.maxScore ?? 0} đúng tự
              động · thang {formatScore(scoring.maxScore)} đ)
            </span>
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t bg-[var(--color-surface-2)] px-3 py-2">
        {canEnter ? (
          <Button asChild size="sm" className="ml-auto gap-1.5">
            <Link href={`/exam/${item.shift.id}`}>
              <Play className="h-3.5 w-3.5" /> Vào thi ngay
            </Link>
          </Button>
        ) : attendance === "submitted" || status === "completed" ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="ml-auto gap-1.5"
          >
            <Link href={`/exam/${item.shift.id}/result`}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Xem kết quả
            </Link>
          </Button>
        ) : status === "scheduled" ? (
          <p className="ml-auto text-[11px] text-muted-foreground">
            Chưa đến giờ — vui lòng quay lại đúng giờ mở.
          </p>
        ) : status === "cancelled" ? (
          <p className="ml-auto text-[11px] font-semibold text-rose-700">
            Ca đã bị huỷ — bạn không cần dự thi.
          </p>
        ) : (
          <p className="ml-auto text-[11px] text-muted-foreground">—</p>
        )}
      </footer>
    </article>
  );
}
