"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Hourglass,
  ShieldAlert,
  Trophy,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useShiftsStore } from "@/features/exam-shifts/state/shifts-store";
import { useAttemptsStore } from "@/features/shift-exam/state/attempts-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { cn } from "@/lib/utils";

type HistoryFilter = "all" | "graded" | "pending";

export default function StudentHistoryPage() {
  const session = useAuthStore((s) => s.session);
  const allAttempts = useAttemptsStore((s) => s.attempts);
  const allShifts = useShiftsStore((s) => s.shifts);
  const subjects = useSubjectsStore((s) => s.subjects);

  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");

  // Submitted attempts belonging to this student, newest first.
  const history = useMemo(() => {
    if (!session) return [];
    return allAttempts
      .filter(
        (a) => a.studentId === session.userId && a.submittedAt != null,
      )
      .map((a) => {
        const shift = allShifts.find((s) => s.id === a.shiftId);
        return { attempt: a, shift };
      })
      .filter((row) => row.shift != null)
      .sort(
        (a, b) =>
          new Date(b.attempt.submittedAt!).getTime() -
          new Date(a.attempt.submittedAt!).getTime(),
      );
  }, [allAttempts, allShifts, session]);

  const filtered = useMemo(() => {
    return history.filter((row) => {
      if (filter !== "all") {
        const hasPending =
          (row.attempt.maxScore ?? 0) <
          row.attempt.questionIds.length;
        if (filter === "graded" && hasPending) return false;
        if (filter === "pending" && !hasPending) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${row.shift!.name} ${row.shift!.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [history, filter, search]);

  // Aggregate KPIs for the hero strip.
  const kpis = useMemo(() => {
    if (history.length === 0)
      return { count: 0, avg: null, best: null, pendingCount: 0 };
    const scores = history
      .map((r) => r.attempt.score)
      .filter((s): s is number => s != null);
    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, s) => a + s, 0) / scores.length)
        : null;
    const best = scores.length > 0 ? Math.max(...scores) : null;
    const pendingCount = history.filter(
      (r) =>
        (r.attempt.maxScore ?? 0) < r.attempt.questionIds.length,
    ).length;
    return { count: history.length, avg, best, pendingCount };
  }, [history]);

  if (!session) return null;
  if (session.role !== "student") {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Trang này chỉ dành cho tài khoản học sinh.
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Lịch sử bài thi"
        description="Tất cả các ca thi bạn đã hoàn thành, kèm điểm và chi tiết kết quả."
      />

      {/* KPI strip */}
      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ĐÃ HOÀN THÀNH"
          value={kpis.count}
          tone="blue"
        />
        <KpiTile
          icon={<Trophy className="h-4 w-4" />}
          label="ĐIỂM TRUNG BÌNH"
          value={kpis.avg != null ? `${kpis.avg}` : "—"}
          tone="emerald"
          hint={kpis.avg != null ? "/ 100" : ""}
        />
        <KpiTile
          icon={<Trophy className="h-4 w-4" />}
          label="ĐIỂM CAO NHẤT"
          value={kpis.best != null ? `${kpis.best}` : "—"}
          tone="violet"
          hint={kpis.best != null ? "/ 100" : ""}
        />
        <KpiTile
          icon={<Hourglass className="h-4 w-4" />}
          label="CHỜ CHẤM"
          value={kpis.pendingCount}
          tone="amber"
          hint="ca còn câu tự luận"
        />
      </section>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            { value: "all", label: "Tất cả" },
            { value: "graded", label: "Đã chấm xong" },
            { value: "pending", label: "Còn câu chờ chấm" },
          ] as Array<{ value: HistoryFilter; label: string }>
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] font-medium transition",
              filter === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground/80 hover:bg-accent/30",
            )}
          >
            {opt.label}
          </button>
        ))}

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên ca / ID…"
            className="h-9 w-64 pl-8"
          />
        </div>

        <Link
          href="/my-exams"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-[12px] font-semibold hover:bg-accent/30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Lịch thi
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-[14px] font-semibold">
            {history.length === 0
              ? "Bạn chưa có bài thi nào đã nộp"
              : "Không có bài thi khớp bộ lọc"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {history.length === 0
              ? "Khi bạn hoàn thành và nộp bài, bài thi sẽ xuất hiện ở đây."
              : "Thử đổi bộ lọc hoặc từ khoá tìm kiếm."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((row) => {
            const a = row.attempt;
            const sh = row.shift!;
            const subject = subjects.find((s) => s.id === sh.subjectId);
            const score = a.score ?? 0;
            const totalQ = a.questionIds.length;
            const maxScore = a.maxScore ?? 0;
            const pending = totalQ - maxScore;
            const submittedAt = new Date(a.submittedAt!);
            const grade =
              score >= 80
                ? { label: "Giỏi", tone: "emerald" }
                : score >= 65
                  ? { label: "Khá", tone: "blue" }
                  : score >= 50
                    ? { label: "TB", tone: "amber" }
                    : { label: "Chưa đạt", tone: "rose" };
            return (
              <li key={a.id}>
                <Link
                  href={`/exam/${sh.id}/result`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 transition hover:border-foreground/30 hover:bg-accent/10"
                >
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[18px] font-bold",
                      grade.tone === "emerald"
                        ? "bg-emerald-50 text-emerald-700"
                        : grade.tone === "blue"
                          ? "bg-blue-50 text-blue-700"
                          : grade.tone === "amber"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700",
                    )}
                  >
                    {score}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
                        {sh.id}
                      </span>
                      {subject && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                          {subject.name}
                        </span>
                      )}
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          grade.tone === "emerald"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : grade.tone === "blue"
                              ? "border-blue-300 bg-blue-50 text-blue-800"
                              : grade.tone === "amber"
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-rose-300 bg-rose-50 text-rose-800",
                        )}
                      >
                        {grade.label}
                      </span>
                      {pending > 0 && (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                          🕒 chờ chấm {pending} câu
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[13.5px] font-semibold">
                      {sh.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Đúng {a.correctCount ?? 0}/{maxScore || totalQ} câu được
                        chấm tự động
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Nộp lúc{" "}
                        {submittedAt.toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                        })}
                      </span>
                      {a.violations.tabSwitches +
                        a.violations.fullscreenExits +
                        a.violations.pasteAttempts >
                        0 && (
                        <span className="inline-flex items-center gap-1 text-rose-700">
                          <ShieldAlert className="h-3 w-3" />
                          {a.violations.tabSwitches +
                            a.violations.fullscreenExits +
                            a.violations.pasteAttempts}{" "}
                          vi phạm
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone: "blue" | "emerald" | "violet" | "amber";
}) {
  const tones = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    violet: "text-violet-700",
    amber: "text-amber-700",
  } as const;
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div
        className={cn(
          "flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.06em]",
          tones[tone],
        )}
      >
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div className={cn("mt-1 text-[26px] font-bold leading-none", tones[tone])}>
        {value}
        {hint && (
          <span className="ml-1 text-[12px] font-semibold text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
