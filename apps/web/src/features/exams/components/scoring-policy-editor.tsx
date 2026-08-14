"use client";

/**
 * Cách chấm hai dạng câu mà "đúng/sai" không đủ để mô tả:
 *
 *   mcq-multi — trắc nghiệm nhiều đáp án đúng
 *   multi-tf  — Đúng/Sai nhiều ý (Phần II của đề định kỳ)
 *
 * Trước đây chỉ đề YCCĐ cài được, còn đề tạo từ khung đề bị chấm toàn phần
 * cứng: sai một ý trong bốn là mất trắng câu đó. Giáo viên ra đề kiểm tra ngắn
 * không cần dựng cả bộ YCCĐ chi tiết, nhưng vẫn cần đúng cách chấm này — nên
 * bảng lũy tiến tách ra ở đây để hai luồng dùng chung một giao diện, một mặc
 * định, một cách hiểu.
 *
 * Về con số mặc định: bảng THPT của Bộ là 0,1 / 0,25 / 0,5 / 1,0. Bảng FSC
 * dùng 0,25 / 0,5 / 0,75 / 1,0. Hai bảng khác nhau ở ý thứ ba, và đó chính là
 * lý do bảng này phải sửa được chứ không chôn cứng trong mã.
 */

import { cn } from "@/lib/utils";
import { DEFAULT_DS_GRADUATED } from "../data/types";

/** Bảng lũy tiến của FSC — khác THPT ở mức 2 ý và 3 ý. */
export const FSC_DS_GRADUATED: Record<number, number> = {
  1: 0.25,
  2: 0.5,
  3: 0.75,
  4: 1,
};

export interface ScoringPolicyValue {
  mcqMulti: "full" | "partial";
  ds: "graduated" | "weighted" | "full";
  dsGraduatedTable: Record<number, number>;
}

interface Props {
  value: ScoringPolicyValue;
  onChange: (next: ScoringPolicyValue) => void;
  /** Ẩn hẳn phần không liên quan tới đề đang soạn. Bỏ trống = hiện cả hai. */
  showMcqMulti?: boolean;
  showMultiTf?: boolean;
}

export function ScoringPolicyEditor({
  value,
  onChange,
  showMcqMulti = true,
  showMultiTf = true,
}: Props) {
  if (!showMcqMulti && !showMultiTf) return null;

  return (
    <div className="space-y-2">
      {showMcqMulti && (
        <ModeRow
          title="Chấm câu nhiều đáp án đúng"
          options={[
            { v: "full", label: "Toàn phần (đúng hết mới có điểm)" },
            { v: "partial", label: "Từng phần (mỗi đáp án đúng)" },
          ]}
          value={value.mcqMulti}
          onChange={(v) =>
            onChange({ ...value, mcqMulti: v as ScoringPolicyValue["mcqMulti"] })
          }
        />
      )}

      {showMultiTf && (
        <div className="space-y-2">
          <ModeRow
            title="Chấm câu Đúng–Sai nhiều ý"
            options={[
              { v: "graduated", label: "Lũy tiến theo số ý đúng" },
              { v: "weighted", label: "Trọng số từng ý" },
              { v: "full", label: "Toàn phần" },
            ]}
            value={value.ds}
            onChange={(v) =>
              onChange({ ...value, ds: v as ScoringPolicyValue["ds"] })
            }
          />

          {value.ds === "graduated" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-hint">
                Bảng lũy tiến (phần điểm khi đúng n ý):
              </span>
              {[1, 2, 3, 4].map((k) => (
                <label
                  key={k}
                  className="inline-flex items-center gap-1 text-hint"
                >
                  {k} ý
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={value.dsGraduatedTable[k] ?? 0}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        dsGraduatedTable: {
                          ...value.dsGraduatedTable,
                          [k]: Math.max(
                            0,
                            Math.min(1, Number(e.target.value) || 0),
                          ),
                        },
                      })
                    }
                    className="h-7 w-16 rounded border bg-card px-1 text-center"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    dsGraduatedTable: { ...DEFAULT_DS_GRADUATED },
                  })
                }
                className="text-hint text-primary underline"
              >
                THPT
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    dsGraduatedTable: { ...FSC_DS_GRADUATED },
                  })
                }
                className="text-hint text-primary underline"
              >
                FSC
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModeRow({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="mb-1.5 text-eyebrow text-foreground/65">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded-md border px-2 py-1 text-hint font-semibold transition",
              value === o.v
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent/30",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
