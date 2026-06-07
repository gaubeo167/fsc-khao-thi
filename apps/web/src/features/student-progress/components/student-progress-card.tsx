"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [aiErrorKind, setAiErrorKind] = useState<
    "overload" | "auth" | "other" | null
  >(null);
  // Bump on retry click to re-trigger the effect.
  const [retryNonce, setRetryNonce] = useState(0);
  const inflightRef = useRef<AbortController | null>(null);

  // Re-request the AI verdict whenever the underlying data changes.
  // Cheap-shot debounce: dependent on the JSON-stringified KPIs.
  const kpisKey = useMemo(
    () => JSON.stringify(progress.kpis) + ":" + audience,
    [progress.kpis, audience],
  );

  // Number of automatic background retries already attempted for the
  // CURRENT overload error. Reset when KPI changes or user clicks Thử
  // lại manually. We schedule the next retry from inside fetchAi.
  const autoRetryRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [nextAutoRetryAt, setNextAutoRetryAt] = useState<number | null>(
    null,
  );

  function clearAutoRetry() {
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    setNextAutoRetryAt(null);
  }

  const fetchAi = useCallback(async () => {
    if (!hasEnoughDataForAi(progress)) {
      setAi(null);
      setAiState("idle");
      return;
    }
    // Cancel any in-flight request + pending auto-retry to avoid stale
    // overwrites.
    inflightRef.current?.abort();
    clearAutoRetry();
    const ac = new AbortController();
    inflightRef.current = ac;
    setAiState("loading");
    setAiError(null);
    setAiErrorKind(null);
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
        signal: ac.signal,
      });
      const data = await res.json();
      if (ac.signal.aborted) return;
      if (!res.ok) {
        setAiState("error");
        const msg = String(data?.message ?? "AI không phản hồi");
        setAiError(msg);
        // Classify so the UI can show a friendlier message + retry CTA.
        if (
          res.status === 429 ||
          res.status === 503 ||
          res.status === 529 ||
          /overload|high demand|try again later/i.test(msg)
        ) {
          setAiErrorKind("overload");
          // Schedule a background retry — backoff 30s, 60s, 120s. After
          // that the user keeps the manual button.
          const schedule = [30, 60, 120];
          const idx = autoRetryRef.current;
          if (idx < schedule.length) {
            const wait = schedule[idx]! * 1000;
            const at = Date.now() + wait;
            setNextAutoRetryAt(at);
            autoRetryTimerRef.current = setTimeout(() => {
              autoRetryRef.current++;
              setRetryNonce((n) => n + 1);
            }, wait);
          }
        } else if (res.status === 401 || res.status === 403) {
          setAiErrorKind("auth");
        } else {
          setAiErrorKind("other");
        }
        return;
      }
      setAi(data);
      setAiState("idle");
      autoRetryRef.current = 0;
    } catch (err) {
      if (ac.signal.aborted) return;
      setAiState("error");
      setAiError(err instanceof Error ? err.message : "Lỗi mạng");
      setAiErrorKind("other");
    }
  }, [progress, audience, studentName]);

  useEffect(() => {
    void fetchAi();
    return () => {
      inflightRef.current?.abort();
      if (autoRetryTimerRef.current) {
        clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpisKey, retryNonce]);

  // Reset auto-retry attempt counter whenever the KPI inputs change —
  // a new student / fresh data deserves the full backoff schedule again.
  useEffect(() => {
    autoRetryRef.current = 0;
  }, [kpisKey]);

  const retry = useCallback(() => {
    autoRetryRef.current = 0; // manual click — restart backoff schedule
    setRetryNonce((n) => n + 1);
  }, []);

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
        {aiState === "error" && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-[13px] text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                {aiErrorKind === "overload" ? (
                  <>
                    <p className="font-semibold">
                      Mô hình AI đang quá tải tạm thời
                    </p>
                    <p className="mt-0.5 text-[12px] text-rose-600/85">
                      Đây là tình trạng nhất thời từ phía nhà cung cấp (Gemini /
                      Anthropic). KPI và xu hướng bên trên vẫn được tính từ dữ
                      liệu thật của hệ thống.
                    </p>
                    {nextAutoRetryAt && (
                      <RetryCountdown targetAt={nextAutoRetryAt} />
                    )}
                  </>
                ) : aiErrorKind === "auth" ? (
                  <>
                    <p className="font-semibold">
                      Cấu hình AI API key chưa đúng
                    </p>
                    <p className="mt-0.5 text-[12px] text-rose-600/85">
                      Liên hệ admin để kiểm tra biến môi trường
                      <code className="mx-1 rounded bg-rose-100 px-1">
                        ANTHROPIC_API_KEY
                      </code>
                      /
                      <code className="mx-1 rounded bg-rose-100 px-1">
                        GEMINI_API_KEY
                      </code>
                      trên Vercel.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Không gọi được AI</p>
                    <p className="mt-0.5 text-[12px] text-rose-600/85">
                      {aiError}
                    </p>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-rose-700 transition-colors hover:bg-rose-50"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2} />
              Thử lại
            </button>
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

/** Tiny live counter showing "Tự thử lại sau Xs" — ticks every second
 *  until the parent re-triggers fetchAi via retryNonce. */
function RetryCountdown({ targetAt }: { targetAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((targetAt - now) / 1000));
  if (remaining <= 0) return null;
  return (
    <p className="mt-1 text-[11.5px] text-rose-600/75">
      ⏳ Tự thử lại sau {remaining}s
    </p>
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
