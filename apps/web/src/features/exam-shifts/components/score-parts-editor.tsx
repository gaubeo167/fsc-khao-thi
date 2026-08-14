"use client";

/**
 * Bước cài "điểm theo phần" — cấu trúc đề mà giáo viên quen dùng:
 *
 *   Phần I  — Trắc nghiệm nhiều lựa chọn   4,0 điểm
 *   Phần II — Đúng/Sai nhiều ý             4,0 điểm
 *   Phần III— Trả lời ngắn                 2,0 điểm
 *
 * Giáo viên đặt TỔNG điểm cho từng phần, hệ thống chia đều cho số câu thực tế.
 * Đổi số câu trong đề thì không phải tính lại điểm bằng tay — đó là toàn bộ lý
 * do chế độ này tồn tại.
 *
 * Ô cảnh báo ở cuối không phải trang trí. Ba tình huống dưới đây làm đề chấm ra
 * thang khác thang giáo viên nghĩ, và cả ba đều IM LẶNG nếu không nói ra:
 *
 *   1. Tổng điểm các phần ≠ điểm tối đa
 *   2. Một phần không bốc được câu nào → điểm phần đó rơi mất
 *   3. Câu có dạng không thuộc phần nào → câu đó 0 điểm
 *
 * Riêng chuyện chia không hết (4,0đ cho 3 câu) thì KHÔNG phải lỗi: dữ liệu giữ
 * số chính xác nên tổng vẫn đúng, chỉ con số hiển thị bị làm tròn. Vẫn báo cho
 * giáo viên biết để họ tự chọn có đổi hay không.
 */

import { useMemo } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QUESTION_TYPES } from "@/features/question-bank/data/question-types";
import type { QuestionType } from "@/features/question-bank/data/question-types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import type { ScorePart } from "../data/types";
import { formatScore, partIdForScoreType } from "../lib/scoring";

interface Props {
  parts: ScorePart[];
  maxScore: number;
  /** Câu hỏi của đề đang chọn — dùng để đếm số câu thực tế mỗi phần. */
  pool: Question[];
  onChange: (parts: ScorePart[]) => void;
}

export function ScorePartsEditor({ parts, maxScore, pool, onChange }: Props) {
  /** Số câu thực tế rơi vào mỗi phần, cộng số câu không thuộc phần nào. */
  const counts = useMemo(() => {
    const byPart: Record<string, number> = {};
    let orphan = 0;
    for (const q of pool) {
      const pid = partIdForScoreType(parts, q.type);
      if (pid) byPart[pid] = (byPart[pid] ?? 0) + 1;
      else orphan += 1;
    }
    return { byPart, orphan };
  }, [parts, pool]);

  const sumPoints = parts.reduce((a, p) => a + (p.points || 0), 0);
  const totalOk = Math.abs(sumPoints - maxScore) < 0.001;
  // Chỉ kêu khi phần rỗng thực sự LÀM MẤT điểm. Phần rỗng 0 điểm là chỗ giáo
  // viên chừa sẵn cho dạng câu chưa dùng tới — cảnh báo "0 điểm sẽ mất" chỉ là
  // tiếng ồn, và tiếng ồn làm người ta bỏ qua luôn cảnh báo thật.
  const emptyParts = parts.filter(
    (p) => (counts.byPart[p.id] ?? 0) === 0 && p.points > 0,
  );
  const unevenParts = parts.filter((p) => {
    const n = counts.byPart[p.id] ?? 0;
    return n > 0 && Math.abs((p.points / n) * 100 - Math.round((p.points / n) * 100)) > 1e-9;
  });

  function patch(id: string, next: Partial<ScorePart>) {
    onChange(parts.map((p) => (p.id === id ? { ...p, ...next } : p)));
  }

  function toggleType(id: string, t: QuestionType) {
    const part = parts.find((p) => p.id === id);
    if (!part) return;
    const has = part.questionTypes.includes(t);
    // Một dạng chỉ thuộc đúng một phần. Tick vào phần này thì gỡ khỏi phần kia,
    // nếu không phần đứng trước sẽ âm thầm nuốt hết câu của phần đứng sau.
    onChange(
      parts.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            questionTypes: has
              ? p.questionTypes.filter((x) => x !== t)
              : [...p.questionTypes, t],
          };
        }
        if (!has && p.questionTypes.includes(t)) {
          return { ...p, questionTypes: p.questionTypes.filter((x) => x !== t) };
        }
        return p;
      }),
    );
  }

  function addPart() {
    const n = parts.length + 1;
    onChange([
      ...parts,
      {
        id: `part-${n}-${Math.random().toString(36).slice(2, 7)}`,
        label: `Phần ${romanOf(n)}`,
        questionTypes: [],
        points: 0,
      },
    ]);
  }

  return (
    <div className="space-y-2.5">
      <p className="text-hint">
        Đặt TỔNG điểm cho từng phần — hệ thống chia đều cho số câu thực tế của
        phần đó. Phần xác định bằng dạng câu hỏi, mỗi dạng chỉ thuộc một phần.
      </p>

      <ul className="space-y-2">
        {parts.map((part, idx) => {
          const n = counts.byPart[part.id] ?? 0;
          return (
            <li key={part.id} className="rounded-lg border bg-card p-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-dense font-bold text-foreground/70">
                  {idx + 1}
                </span>
                <Input
                  value={part.label}
                  onChange={(e) => patch(part.id, { label: e.target.value })}
                  placeholder="Tên phần"
                  className="h-7 flex-1 text-meta"
                />
                <Input
                  type="number"
                  min={0}
                  step={0.25}
                  value={part.points}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) patch(part.id, { points: v });
                  }}
                  className="h-7 w-20 text-right text-meta"
                />
                <span className="text-dense text-muted-foreground">đ</span>
                <button
                  type="button"
                  onClick={() => onChange(parts.filter((p) => p.id !== part.id))}
                  title="Xoá phần này"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.85} />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {QUESTION_TYPES.map((t) => {
                  const on = part.questionTypes.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleType(part.id, t.id)}
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-dense font-semibold transition",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-accent/30",
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>

              <p className="mt-1.5 text-hint">
                {n === 0 ? (
                  <span className="font-semibold text-amber-700">
                    Chưa có câu nào thuộc phần này
                  </span>
                ) : (
                  <>
                    {n} câu ·{" "}
                    <b className="text-foreground">
                      {formatScore(part.points / n)} đ/câu
                    </b>
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={addPart}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1 text-meta font-semibold hover:bg-accent/30 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Thêm phần
      </button>

      <div
        className={cn(
          "rounded-md border px-3 py-2 text-meta",
          totalOk
            ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
            : "border-rose-200 bg-rose-50/60 text-rose-800",
        )}
      >
        Tổng điểm các phần: <b>{formatScore(sumPoints)}</b> / thang{" "}
        <b>{formatScore(maxScore)}</b>
        {totalOk ? " ✓" : " — chưa khớp, đề sẽ chấm sai thang"}
      </div>

      {(emptyParts.length > 0 || counts.orphan > 0 || unevenParts.length > 0) && (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-hint text-amber-900">
          {emptyParts.map((p) => (
            <li key={p.id} className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>
                <b>{p.label || "(chưa đặt tên)"}</b> không bốc được câu nào —{" "}
                {formatScore(p.points)} điểm của phần này sẽ mất khỏi đề.
              </span>
            </li>
          ))}
          {counts.orphan > 0 && (
            <li className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>
                <b>{counts.orphan} câu</b> có dạng không thuộc phần nào và sẽ được
                0 điểm. Thêm dạng đó vào một phần, hoặc tạo phần mới cho chúng.
              </span>
            </li>
          )}
          {unevenParts.map((p) => (
            <li key={p.id} className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span>
                <b>{p.label || "(chưa đặt tên)"}</b>: {formatScore(p.points)} điểm
                chia {counts.byPart[p.id]} câu không hết. Tổng của phần vẫn đúng,
                nhưng điểm hiển thị từng câu là số đã làm tròn.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function romanOf(n: number): string {
  const r = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return r[n - 1] ?? String(n);
}
