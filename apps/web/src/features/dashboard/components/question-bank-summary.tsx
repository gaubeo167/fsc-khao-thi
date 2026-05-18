"use client";

import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";

/**
 * Live snapshot of the question bank derived straight from
 * `useQuestionsStore` — count by status, scoped to the user's campus.
 */
export function QuestionBankSummary() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const questions = useQuestionsStore((s) => s.questions);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId ?? null
      : session?.campusId ?? null;

  const stats = useMemo(() => {
    // Only count campus-bank questions in the summary — the personal kho is
    // private to each owner and shouldn't pollute the school overview.
    const scoped = questions.filter((q) => {
      if (q.kho !== "campus") return false;
      if (campusId) return q.campusId === campusId;
      return true;
    });
    let approved = 0;
    let pending = 0;
    let draft = 0;
    let rejected = 0;
    for (const q of scoped) {
      if (q.status === "approved") approved += 1;
      else if (q.status === "pending") pending += 1;
      else if (q.status === "draft") draft += 1;
      else if (q.status === "rejected") rejected += 1;
    }
    return {
      approved,
      pending,
      draft,
      rejected,
      total: scoped.length,
    };
  }, [questions, campusId]);

  const segments = [
    { color: "var(--color-tone-green)", value: stats.approved },
    { color: "var(--color-tone-orange)", value: stats.pending },
    { color: "var(--color-tone-blue)", value: stats.draft },
  ];

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h3 className="text-section-title">Ngân hàng câu hỏi</h3>
          <p className="text-meta mt-0.5">Theo trạng thái duyệt</p>
        </div>

        <div className="flex flex-1 items-center gap-5">
          <Donut total={stats.total} segments={segments} />
          <ul className="flex-1 space-y-2.5 text-[13px]">
            <Row
              dot="bg-[var(--color-tone-green)]"
              label="Đã duyệt"
              value={stats.approved.toLocaleString("vi-VN")}
              percent={pct(stats.approved, stats.total)}
            />
            <Row
              dot="bg-[var(--color-tone-orange)]"
              label="Chờ duyệt"
              value={stats.pending.toLocaleString("vi-VN")}
              percent={pct(stats.pending, stats.total)}
            />
            <Row
              dot="bg-[var(--color-tone-blue)]"
              label="Bản nháp"
              value={stats.draft.toLocaleString("vi-VN")}
              percent={pct(stats.draft, stats.total)}
            />
            {stats.rejected > 0 && (
              <Row
                dot="bg-destructive"
                label="Từ chối"
                value={stats.rejected.toLocaleString("vi-VN")}
                percent={pct(stats.rejected, stats.total)}
              />
            )}
          </ul>
        </div>

        <div className="flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-meta">Tổng câu hỏi (kho campus)</span>
          <span className="text-[18px] font-semibold tabular-nums text-foreground">
            {stats.total.toLocaleString("vi-VN")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

function Row({
  dot,
  label,
  value,
  percent,
}: {
  dot: string;
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-foreground/80">{label}</span>
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold tabular-nums text-foreground">
          {value}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {percent}%
        </span>
      </span>
    </li>
  );
}

function Donut({
  total,
  segments,
}: {
  total: number;
  segments: { color: string; value: number }[];
}) {
  // Bigger viewBox + thicker stroke for visual balance on the dashboard row.
  const radius = 56;
  const strokeWidth = 18;
  const size = 144;
  const center = size / 2;
  const c = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-full w-full -rotate-90"
        aria-hidden
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={strokeWidth}
        />
        {total > 0 &&
          segments.map((s, i) => {
            const portion = s.value / total;
            if (portion <= 0) return null;
            const len = c * portion;
            const dash = `${len} ${c - len}`;
            const node = (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return node;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="font-mono text-[24px] font-extrabold leading-none tabular-nums text-foreground">
          {formatCompact(total)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">câu hỏi</p>
      </div>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}
