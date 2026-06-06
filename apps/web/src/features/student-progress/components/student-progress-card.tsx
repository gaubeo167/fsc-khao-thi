"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import type { StudentProgress } from "../lib/compute-progress";

interface Props {
  progress: StudentProgress;
  /** Display name for the AI prompt + header. */
  studentName?: string;
  /** Selects AI persona. Default "teacher". */
  audience?: "teacher" | "student";
}

interface AiResult {
  verdict: string;
  observations: string[];
  suggestions: string[];
  provider?: string;
}

export function StudentProgressCard({
  progress,
  studentName,
  audience = "teacher",
}: Props) {
  const [ai, setAi] = useState<AiResult | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [aiError, setAiError] = useState<string | null>(null);

  // Re-request the AI verdict whenever the underlying data changes.
  // Cheap-shot debounce: dependent on the JSON-stringified KPIs.
  const kpisKey = useMemo(
    () => JSON.stringify(progress.kpis) + ":" + audience,
    [progress.kpis, audience],
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!hasEnoughDataForAi(progress)) {
        setAi(null);
        return;
      }
      setAiState("loading");
      setAiError(null);
      try {
        const summary = {
          kpis: progress.kpis,
          examTrend: progress.examTrend,
          homeworkTrend: progress.homeworkTrend,
          recentScores: {
            examTimeline: progress.examTimeline.slice(-10),
            homeworkTimeline: progress.homeworkTimeline.slice(-10),
          },
        };
        const res = await fetch("/api/ai/assess-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary, studentName, audience }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setAiState("error");
          setAiError(data?.message ?? "AI không phản hồi");
          return;
        }
        setAi(data);
        setAiState("idle");
      } catch (err) {
        if (cancelled) return;
        setAiState("error");
        setAiError(err instanceof Error ? err.message : "Lỗi mạng");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpisKey]);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={Trophy}
          tone="blue"
          label="Điểm thi TB"
          value={
            progress.kpis.avgExamScore != null
              ? `${progress.kpis.avgExamScore}/10`
              : "—"
          }
          hint={
            progress.kpis.examPassRate != null
              ? `Đạt ${Math.round(progress.kpis.examPassRate * 100)}%`
              : "Chưa có dữ liệu"
          }
        />
        <KpiTile
          icon={ClipboardList}
          tone="violet"
          label="BTVN trung bình"
          value={
            progress.kpis.avgHomeworkPercent != null
              ? `${progress.kpis.avgHomeworkPercent}%`
              : "—"
          }
          hint={
            progress.kpis.homeworkPassRate != null
              ? `Đạt ${Math.round(progress.kpis.homeworkPassRate * 100)}%`
              : "Chưa có dữ liệu"
          }
        />
        <KpiTile
          icon={Activity}
          tone="emerald"
          label="Số ca thi đã nộp"
          value={`${progress.kpis.totalShiftsSubmitted}/${progress.kpis.totalShifts}`}
          hint={
            progress.kpis.totalShifts > 0
              ? `${Math.round((progress.kpis.totalShiftsSubmitted / progress.kpis.totalShifts) * 100)}% hoàn thành`
              : "Chưa được giao ca thi"
          }
        />
        <KpiTile
          icon={CheckCircle2}
          tone="amber"
          label="BTVN đã nộp"
          value={`${progress.kpis.totalHomeworkSubmitted}/${progress.kpis.totalHomework}`}
          hint={
            progress.kpis.totalHomework > 0
              ? `${Math.round((progress.kpis.totalHomeworkSubmitted / progress.kpis.totalHomework) * 100)}% hoàn thành`
              : "Chưa được giao BTVN"
          }
        />
      </section>

      {/* Trend cards */}
      <section className="grid gap-3 lg:grid-cols-2">
        <TrendCard
          title="Xu hướng điểm thi"
          trend={progress.examTrend}
          unit="điểm"
        />
        <TrendCard
          title="Xu hướng BTVN"
          trend={progress.homeworkTrend}
          unit="%"
        />
      </section>

      {/* AI verdict */}
      <section
        className={cn(
          "rounded-2xl border-2 p-4",
          audience === "student"
            ? "border-violet-200 bg-violet-50/50"
            : "border-amber-200 bg-amber-50/40",
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <Sparkles
            className={
              audience === "student"
                ? "h-4 w-4 text-violet-600"
                : "h-4 w-4 text-amber-600"
            }
            strokeWidth={2}
          />
          <h3 className="text-section-title">
            {audience === "student"
              ? "AI nhận xét cho em"
              : "AI đánh giá tiến độ"}
          </h3>
        </div>
        {aiState === "loading" && (
          <div className="flex items-center gap-2 text-[13px] text-foreground/65">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI đang phân tích…
          </div>
        )}
        {aiState === "error" && aiError && (
          <div className="flex items-start gap-2 text-[13px] text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{aiError}</span>
          </div>
        )}
        {aiState === "idle" && !ai && !hasEnoughDataForAi(progress) && (
          <p className="text-[13px] italic text-foreground/65">
            Cần ≥ 1 ca thi hoặc 1 BTVN đã nộp để AI bắt đầu phân tích.
          </p>
        )}
        {aiState === "idle" && ai && (
          <div className="space-y-3">
            <p className="text-[15px] font-semibold leading-relaxed text-foreground">
              {ai.verdict}
            </p>
            {ai.observations.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/55">
                  Quan sát
                </p>
                <ul className="mt-1 space-y-1 text-[13px] leading-relaxed text-foreground/85">
                  {ai.observations.map((o, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden>•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ai.suggestions.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/55">
                  {audience === "student" ? "Hành động tuần này" : "Gợi ý can thiệp"}
                </p>
                <ul className="mt-1 space-y-1 text-[13px] leading-relaxed text-foreground/85">
                  {ai.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden>→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ai.provider && (
              <p className="text-meta italic">
                AI provider: {ai.provider}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Recent activity */}
      {progress.recentActivity.length > 0 && (
        <section className="rounded-2xl border bg-card">
          <header className="border-b px-4 py-2.5">
            <h3 className="text-section-title">Hoạt động gần đây</h3>
          </header>
          <ul className="divide-y">
            {progress.recentActivity.map((a, i) => (
              <li
                key={i}
                className="grid items-center gap-3 px-4 py-2 sm:grid-cols-[80px_minmax(0,1fr)_80px]"
              >
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-center text-[10.5px] font-semibold",
                    a.kind === "exam"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-violet-200 bg-violet-50 text-violet-700",
                  )}
                >
                  {a.kind === "exam" ? "Ca thi" : "BTVN"}
                </span>
                <span className="min-w-0 truncate text-[13px]">{a.label}</span>
                <span className="text-right text-[13.5px] font-bold tabular-nums">
                  {a.kind === "exam" ? `${a.score}/10` : `${a.score}%`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function hasEnoughDataForAi(p: StudentProgress): boolean {
  return (
    p.kpis.totalShiftsSubmitted > 0 || p.kpis.totalHomeworkSubmitted > 0
  );
}

function KpiTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  tone: "blue" | "violet" | "emerald" | "amber";
  label: string;
  value: string;
  hint?: string;
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "violet"
        ? "bg-violet-50 text-violet-700"
        : tone === "emerald"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700";
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          toneClass,
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[20px] font-bold tabular-nums leading-none">
          {value}
        </p>
        <p className="text-meta mt-1 truncate">{label}</p>
        {hint && <p className="text-meta mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
}

function TrendCard({
  title,
  trend,
  unit,
}: {
  title: string;
  trend: import("../lib/compute-progress").TrendResult;
  unit: string;
}) {
  const palette =
    trend.verdict === "improving"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
      : trend.verdict === "declining"
        ? "border-rose-200 bg-rose-50/60 text-rose-800"
        : trend.verdict === "stable"
          ? "border-blue-200 bg-blue-50/60 text-blue-800"
          : "border-zinc-200 bg-zinc-50/60 text-zinc-700";
  const Icon =
    trend.verdict === "improving"
      ? TrendingUp
      : trend.verdict === "declining"
        ? TrendingDown
        : Activity;
  const label =
    trend.verdict === "improving"
      ? "Đang tiến bộ"
      : trend.verdict === "declining"
        ? "Đang sụt giảm"
        : trend.verdict === "stable"
          ? "Ổn định"
          : "Chưa đủ dữ liệu";
  return (
    <div className={cn("rounded-lg border p-4", palette)}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
        {title}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <Icon className="h-5 w-5" strokeWidth={2} />
        <span className="text-[18px] font-bold leading-none">{label}</span>
      </div>
      <p className="mt-1 text-[12.5px]">
        {trend.delta != null
          ? `Δ ${trend.label} so với chu kỳ trước (gần đây ${trend.recentAvg}${unit} vs ${trend.priorAvg}${unit})`
          : trend.label}
      </p>
    </div>
  );
}
