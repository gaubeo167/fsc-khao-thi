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

/**
 * Mỗi cách chấm phải NÓI RA nó làm gì.
 *
 * Trước đây bấm "Trọng số từng ý" hay "Toàn phần" thì màn hình không đổi gì
 * (chỉ mỗi bảng lũy tiến biến mất), nên người dùng tưởng nút chết.
 */
const DS_MODE_NOTE: Record<ScoringPolicyValue["ds"], string> = {
  graduated:
    "Đúng càng nhiều ý càng nhiều điểm, theo bảng bên dưới. Đúng hết là trọn điểm câu.",
  weighted:
    "Điểm chia theo trọng số của từng ý. Ý nào không đặt trọng số riêng thì tính ngang nhau — khi đó đúng 2/4 ý được nửa số điểm câu.",
  full: "Phải đúng HẾT các ý mới có điểm. Sai một ý là 0 điểm cả câu.",
};

const MCQ_MULTI_NOTE: Record<ScoringPolicyValue["mcqMulti"], string> = {
  full: "Phải chọn đúng và đủ mọi đáp án đúng mới có điểm.",
  partial: "Mỗi đáp án đúng được một phần điểm; chọn thừa đáp án sai bị trừ phần tương ứng.",
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
      {showMcqMulti && (
        <p className="text-hint rounded-md border bg-muted/30 px-2.5 py-1.5 text-muted-foreground">
          {MCQ_MULTI_NOTE[value.mcqMulti]}
        </p>
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

          <p className="text-hint rounded-md border bg-muted/30 px-2.5 py-1.5 text-muted-foreground">
            {DS_MODE_NOTE[value.ds]}
          </p>

          {value.ds === "graduated" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-hint">
                Bảng lũy tiến — điểm khi đúng n ý:
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
                    step={0.25}
                    value={value.dsGraduatedTable[k] ?? 0}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        dsGraduatedTable: {
                          ...value.dsGraduatedTable,
                          [k]: Math.max(0, Number(e.target.value) || 0),
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

          {value.ds === "graduated" && gradTableProblem(value.dsGraduatedTable) && (
            <p className="text-hint rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-900">
              ⚠ {gradTableProblem(value.dsGraduatedTable)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bảng lũy tiến đọc theo TỈ LỆ VỚI DÒNG CUỐI, nên gõ 0,5/1/1,5/2 cho câu 2
 * điểm là hợp lệ. Hai thứ thì không: bảng đi lùi (đúng nhiều ý hơn lại ít
 * điểm hơn) và dòng cuối bằng 0 (không có mốc để quy tỉ lệ). Cả hai đều bị
 * bộ chấm tự chữa cháy trong im lặng, nên phải nói ra ở đây.
 */
function gradTableProblem(table: Record<number, number>): string | null {
  const keys = [1, 2, 3, 4];
  const last = table[4] ?? 0;
  if (last <= 0) {
    return "Mức đúng đủ 4 ý đang là 0 — bài chấm sẽ rơi về chia đều theo số ý.";
  }
  for (let i = 1; i < keys.length; i += 1) {
    if ((table[keys[i]!] ?? 0) < (table[keys[i - 1]!] ?? 0)) {
      return "Bảng đang đi lùi: đúng nhiều ý hơn mà điểm thấp hơn. Kiểm lại các mốc.";
    }
  }
  return null;
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
