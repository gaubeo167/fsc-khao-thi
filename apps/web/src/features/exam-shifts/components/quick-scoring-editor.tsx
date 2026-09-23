"use client";

/**
 * Thang điểm cho BÀI KIỂM TRA — bốn cách chia điểm y như ca kíp thi.
 *
 * Khác trình tạo ca thi đúng một chỗ: nguồn câu hỏi. Ca thi chia điểm trên đề
 * sinh ra từ gói đề (mỗi mã đề một tập câu khác nhau, nên có ô chọn mã đề);
 * bài kiểm tra chia trên ĐÚNG danh sách câu giáo viên vừa chọn.
 *
 * Bốn cách giữ nguyên tên và cách tính của ca thi để một bài kiểm tra chấm ra
 * điểm y hệt một ca thi cùng nội dung:
 *
 *   · Chia đều      — mỗi câu maxScore / N
 *   · Theo phần     — Phần I/II/III theo dạng câu (chuẩn Bộ)
 *   · Theo độ khó   — trọng số dễ / trung bình / khó
 *   · Thủ công      — gõ điểm từng câu, tổng phải bằng thang điểm
 */

import { Scale } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ScoringPolicyEditor } from "@/features/exams/components/scoring-policy-editor";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { DEFAULT_DS_GRADUATED } from "@/features/exams/data/types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { cn } from "@/lib/utils";

import {
  MOET_DEFAULT_SCORE_PARTS,
  type ScoringConfig,
  type ScoringMode,
} from "../data/types";
import {
  countByDifficulty,
  difficultyScorePreview,
  formatScore,
  sumManualPerQuestion,
} from "../lib/scoring";

import { ScorePartsEditor } from "./score-parts-editor";

const MODES: Array<{ v: ScoringMode; label: string; hint: string }> = [
  { v: "even", label: "Chia đều", hint: "Mọi câu cùng điểm" },
  { v: "by-part", label: "Theo phần", hint: "Phần I / II / III theo dạng câu" },
  { v: "by-difficulty", label: "Theo độ khó", hint: "Câu khó nhiều điểm hơn" },
  { v: "manual", label: "Thủ công", hint: "Gõ điểm từng câu" },
];

export function QuickScoringEditor({
  scoring,
  pool,
  onChange,
}: {
  scoring: ScoringConfig;
  /** Câu hỏi đã chọn, đúng thứ tự trong đề. */
  pool: Question[];
  onChange: (next: ScoringConfig) => void;
}) {
  const patch = (next: Partial<ScoringConfig>) => onChange({ ...scoring, ...next });
  const diffCounts = countByDifficulty(pool);
  const hasMcqMulti = pool.some((q) => q.type === "mcq-multi");
  const hasMultiTf = pool.some((q) => q.type === "multi-tf");

  function setMode(mode: ScoringMode) {
    const draft: ScoringConfig = { ...scoring, mode };
    if (mode === "by-difficulty" && !draft.difficultyWeights) {
      draft.difficultyWeights = { easy: 1, medium: 1.5, hard: 2 };
    }
    if (mode === "manual" && !draft.perQuestion) {
      // Khởi tạo bằng chia đều để giáo viên chỉ chỉnh chênh lệch. Phần lẻ do
      // làm tròn dồn vào câu đầu, nếu không vừa chọn "Thủ công" là màn hình
      // đã báo lệch tổng (10 / 3 câu = 3,33 × 3 = 9,99).
      const each = pool.length > 0 ? draft.maxScore / pool.length : 0;
      const init: Record<string, number> = {};
      for (const q of pool) init[q.id] = Math.round(each * 100) / 100;
      const first = pool[0];
      if (first) {
        const sum = pool.reduce((a, q) => a + (init[q.id] ?? 0), 0);
        init[first.id] =
          Math.round(((init[first.id] ?? 0) + draft.maxScore - sum) * 100) / 100;
      }
      draft.perQuestion = init;
    }
    if (mode === "by-part" && !draft.parts) {
      // Ba phần chuẩn Bộ, co giãn theo thang đang chọn — dùng chung hằng số
      // với ca thi để hai màn không lệch cấu trúc phần.
      const scale = draft.maxScore / 10;
      draft.parts = MOET_DEFAULT_SCORE_PARTS.map((part) => ({
        ...part,
        questionTypes: [...part.questionTypes],
        points: part.points * scale,
      }));
    }
    onChange(draft);
  }

  const manualSum = sumManualPerQuestion(scoring, pool.map((q) => q.id));
  const manualOk = Math.abs(manualSum - scoring.maxScore) < 0.001;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-small font-medium text-foreground/80">
            Thang điểm *
          </span>
          <Input
            type="number"
            min={1}
            step="0.5"
            className="mt-1 w-32"
            value={scoring.maxScore}
            onChange={(e) => patch({ maxScore: Number(e.target.value) })}
          />
        </label>
        <div className="flex flex-wrap gap-1.5 pb-1">
          {[10, 100].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => patch({ maxScore: v })}
              className={cn(
                "text-meta rounded-md border px-2.5 py-1 font-semibold",
                scoring.maxScore === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-card text-foreground/70",
              )}
            >
              Thang {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-small mb-1.5 inline-flex items-center gap-1.5 font-semibold text-foreground/85">
          <Scale className="h-4 w-4" strokeWidth={2} />
          Cách chia điểm
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((m) => {
            const on = scoring.mode === m.v;
            return (
              <li key={m.v}>
                {/* Nút thật chứ không phải <label> bọc radio ẩn: radio ẩn nhận
                    focus thì trình duyệt tự cuộn nó vào giữa màn, làm cả hộp
                    thoại nhảy vọt lên mỗi lần đổi cách chia điểm. */}
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setMode(m.v)}
                  className={cn(
                    "block w-full rounded-lg border-2 bg-card p-2.5 text-left transition",
                    on ? "border-primary bg-primary/5" : "border-border hover:bg-accent/20",
                  )}
                >
                  <p className="text-small font-semibold">{m.label}</p>
                  <p className="text-hint mt-0.5 text-muted-foreground">{m.hint}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {scoring.mode === "even" && (
        <p className="text-meta rounded-lg border bg-surface-2/40 px-3 py-2 text-muted-foreground">
          {pool.length} câu ×{" "}
          <b className="text-foreground">
            {formatScore(scoring.maxScore / Math.max(1, pool.length))}
          </b>{" "}
          = <b className="text-foreground">{formatScore(scoring.maxScore)} điểm</b>
        </p>
      )}

      {scoring.mode === "by-part" && (
        <ScorePartsEditor
          parts={scoring.parts ?? []}
          maxScore={scoring.maxScore}
          pool={pool}
          onChange={(parts) => patch({ parts })}
        />
      )}

      {scoring.mode === "by-difficulty" && (
        <div className="space-y-2">
          <p className="text-hint text-muted-foreground">
            Đặt tỉ lệ trọng số tương đối — hệ thống tự chia thang điểm theo tỉ
            lệ này × số câu mỗi mức.
          </p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {(
              [
                { k: "easy", label: "Dễ", count: diffCounts.easy },
                { k: "medium", label: "Trung bình", count: diffCounts.medium },
                { k: "hard", label: "Khó", count: diffCounts.hard },
              ] as const
            ).map((row) => {
              const w = scoring.difficultyWeights ?? { easy: 1, medium: 1.5, hard: 2 };
              const preview = difficultyScorePreview(scoring, pool);
              return (
                <li key={row.k} className="rounded-lg border bg-card p-2.5">
                  <p className="text-small font-semibold">
                    {row.label}
                    <span className="text-meta ml-1.5 font-normal text-muted-foreground">
                      {row.count} câu
                    </span>
                  </p>
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    className="mt-1"
                    value={w[row.k]}
                    onChange={(e) =>
                      patch({
                        difficultyWeights: { ...w, [row.k]: Number(e.target.value) },
                      })
                    }
                  />
                  <p className="text-hint mt-1 text-muted-foreground">
                    ≈ {formatScore(preview[row.k])} đ/câu
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {scoring.mode === "manual" && (
        <div className="space-y-1.5">
          <p
            className={cn(
              "text-meta rounded-md border px-2.5 py-1.5 font-semibold",
              manualOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-300 bg-amber-50 text-amber-900",
            )}
          >
            Tổng {formatScore(manualSum)} / {formatScore(scoring.maxScore)} điểm
            {manualOk ? " — khớp thang điểm." : " — chưa khớp thang điểm."}
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {pool.map((q, i) => (
              <li
                key={q.id}
                className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
              >
                <span className="text-meta w-6 shrink-0 font-semibold text-muted-foreground">
                  {i + 1}.
                </span>
                <RenderedContent
                  content={q.content}
                  hideUnderlineMarks
                  className="text-small line-clamp-1 min-w-0 flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.25"
                  className="w-24 shrink-0"
                  value={scoring.perQuestion?.[q.id] ?? 0}
                  onChange={(e) =>
                    patch({
                      perQuestion: {
                        ...(scoring.perQuestion ?? {}),
                        [q.id]: Number(e.target.value),
                      },
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cách chấm câu nhiều đáp án / Đúng–Sai nhiều ý. Chỉ hiện khi đề THỰC
          SỰ có dạng đó — cài cho dạng không tồn tại chỉ làm rối. */}
      {(hasMcqMulti || hasMultiTf) && (
        <ScoringPolicyEditor
          value={{
            mcqMulti: scoring.mcqMulti ?? "full",
            ds: scoring.ds ?? "full",
            dsGraduatedTable: scoring.dsGraduatedTable ?? DEFAULT_DS_GRADUATED,
          }}
          showMcqMulti={hasMcqMulti}
          showMultiTf={hasMultiTf}
          onChange={(v) =>
            patch({
              mcqMulti: v.mcqMulti,
              ds: v.ds,
              dsGraduatedTable: v.dsGraduatedTable,
            })
          }
        />
      )}
    </div>
  );
}
