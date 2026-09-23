"use client";

/**
 * Cấu hình chống gian lận — DÙNG CHUNG cho ca kíp thi và bài kiểm tra.
 *
 * Tách ra khỏi trình tạo ca thi vì hai màn phải cài y hệt nhau: học sinh làm
 * bài kiểm tra đi qua đúng màn làm bài của ca thi, nên một tuỳ chọn có ở đây
 * mà thiếu ở kia là giáo viên tưởng đã bật mà thực ra không.
 *
 * Hai hạn mức "tự nộp bài" đếm RIÊNG: Ctrl+Tab làm rớt toàn màn hình cùng lúc
 * với ẩn tab, nên một hành vi sinh hai vi phạm. Gộp chung một hạn mức thì mức
 * 2 bị tiêu hết chỉ bằng một lần chuyển tab.
 */

import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

import type { AntiCheatConfig } from "../data/types";

/**
 * Chỉ nhận khoá kiểu boolean. `fullscreenExitLimit` / `tabSwitchLimit` là số,
 * lọt vào lưới ô tick là render ra một ô tick câm.
 */
type BooleanAntiCheatKey = {
  [K in keyof AntiCheatConfig]-?: AntiCheatConfig[K] extends boolean
    ? K
    : never;
}[keyof AntiCheatConfig];

export const ANTI_CHEAT_FLAGS: Array<{
  key: BooleanAntiCheatKey;
  label: string;
  description: string;
  tone: "high" | "med" | "low";
}> = [
  {
    key: "randomizeQuestions",
    label: "Đảo thứ tự câu hỏi",
    description: "Mỗi học sinh nhận thứ tự câu khác nhau.",
    tone: "low",
  },
  {
    key: "randomizeOptions",
    label: "Đảo thứ tự phương án (MCQ)",
    description: "Đảo A/B/C/D để giảm copy đáp án giữa các máy.",
    tone: "low",
  },
  {
    key: "requireFullscreen",
    label: "Bắt buộc fullscreen",
    description: "Thoát fullscreen sẽ chặn màn hình + ghi vi phạm.",
    tone: "med",
  },
  {
    key: "blockTabSwitch",
    label: "Chặn chuyển tab / cửa sổ",
    description: "Phát hiện Alt-Tab, đếm lần vi phạm.",
    tone: "med",
  },
  {
    key: "blockCopyPaste",
    label: "Chặn copy / paste",
    description: "Disable Ctrl-C / Ctrl-V trong đề thi.",
    tone: "med",
  },
  {
    key: "blockRightClick",
    label: "Chặn chuột phải",
    description: "Tránh học sinh inspect element.",
    tone: "low",
  },
  {
    key: "oneTimeStart",
    label: "Vào thi 1 lần duy nhất",
    description: "Không cho pause/resume — phải làm liền mạch.",
    tone: "med",
  },
];

/**
 * Ô chọn hạn mức vi phạm → tự nộp bài. Dùng chung cho cả chuyển tab và thoát
 * toàn màn hình vì hai chính sách giống hệt nhau về hình dạng; chỉ khác danh
 * từ và câu cảnh báo.
 */
export function AutoSubmitLimit({
  title,
  hint,
  noun,
  value,
  onChange,
  canhBaoMotLan,
}: {
  title: string;
  hint: string;
  /** "Rời" / "Thoát" — ghép thành nhãn nút "Rời 1 lần". */
  noun: string;
  value: number;
  onChange(v: number): void;
  canhBaoMotLan: string;
}) {
  const OPTS = [
    { v: 0, label: "Không tự nộp", hint: "chỉ chặn màn hình + ghi vi phạm" },
    { v: 1, label: `${noun} 1 lần`, hint: "nộp ngay lần đầu" },
    { v: 2, label: `${noun} 2 lần`, hint: "cảnh báo rồi mới nộp" },
    { v: 3, label: `${noun} 3 lần`, hint: "hai lần cảnh báo" },
  ];
  return (
    <div className="mt-3 rounded-lg border-2 border-rose-200 bg-card p-3">
      <p className="text-small font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-hint text-muted-foreground">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {OPTS.map((opt) => (
          <button
            key={opt.v}
            type="button"
            title={opt.hint}
            onClick={() => onChange(opt.v)}
            className={cn(
              "rounded-md border-2 px-2.5 py-1 text-meta font-semibold transition",
              value === opt.v
                ? opt.v === 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-rose-300 bg-rose-50 text-rose-900"
                : "border-border bg-card text-muted-foreground hover:bg-accent/20",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {value === 1 && (
        <p className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-hint font-semibold text-rose-900">
          {canhBaoMotLan} Cân nhắc &ldquo;{noun} 2 lần&rdquo;.
        </p>
      )}
    </div>
  );
}

/**
 * Số biện pháp đang bật / tổng số biện pháp.
 *
 * Đếm bằng `Object.values(cfg).filter(Boolean)` là SAI: hai hạn mức tự nộp
 * (`tabSwitchLimit`, `fullscreenExitLimit`) là số, đặt 2 lần cũng tính là
 * "một biện pháp đã bật" — nên bảng tổng quan báo 9/9 trong khi chỉ có 7 cờ.
 */
export function countAntiCheatOn(cfg: AntiCheatConfig): {
  on: number;
  total: number;
} {
  return {
    on: ANTI_CHEAT_FLAGS.filter((f) => cfg[f.key]).length,
    total: ANTI_CHEAT_FLAGS.length,
  };
}

export function AntiCheatEditor({
  value,
  onChange,
  title = "Cấu hình Anti-cheat",
}: {
  value: AntiCheatConfig;
  onChange: (next: AntiCheatConfig) => void;
  title?: string;
}) {
  return (
    <>
      <p className="text-small mb-3 inline-flex items-center gap-1.5 font-semibold text-foreground/85">
        <ShieldCheck className="h-4 w-4" strokeWidth={2} />
        {title}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ANTI_CHEAT_FLAGS.map((flag) => {
          const checked = value[flag.key];
          const toneClass =
            flag.tone === "high"
              ? "border-rose-200"
              : flag.tone === "med"
                ? "border-amber-200"
                : "border-emerald-200";
          return (
            <li key={flag.key}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border-2 bg-card p-2.5 transition-colors",
                  checked ? toneClass : "border-border hover:bg-accent/20",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    onChange({ ...value, [flag.key]: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-semibold text-foreground">
                    {flag.label}
                  </p>
                  <p className="text-hint text-muted-foreground">
                    {flag.description}
                  </p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {/* Hạn mức → tự nộp bài. Tách khỏi lưới bật/tắt vì đây là con số, và vì
          đây là hai tuỳ chọn DUY NHẤT ở màn này có thể huỷ bài thi của HS —
          đáng được đặt riêng và nói rõ hậu quả. */}
      {value.blockTabSwitch && (
        <AutoSubmitLimit
          title="Tự nộp bài khi HS rời khỏi bài thi"
          hint="Chuyển tab, chuyển cửa sổ, sang ứng dụng khác. Trình duyệt không cho chặn Ctrl+Tab hay Alt+Tab, nên đây là hậu quả khi HS rời đi, không phải ngăn rời đi."
          noun="Rời"
          value={value.tabSwitchLimit ?? 0}
          onChange={(v) => onChange({ ...value, tabSwitchLimit: v })}
          canhBaoMotLan="⚠ Không có lần cảnh báo nào. Một thông báo bật lên, một cú vuốt trackpad nhỡ tay là HS mất bài, không khôi phục được."
        />
      )}
      {value.requireFullscreen && (
        <AutoSubmitLimit
          title="Tự nộp bài khi HS thoát toàn màn hình"
          hint="Trình duyệt không cho trang web chặn Esc / F11, nên đây là hậu quả khi HS thoát, không phải ngăn thoát."
          noun="Thoát"
          value={value.fullscreenExitLimit ?? 0}
          onChange={(v) => onChange({ ...value, fullscreenExitLimit: v })}
          canhBaoMotLan="⚠ Không có lần cảnh báo nào. Một cú Esc nhỡ tay, khoá màn hình, hay rút màn hình ngoài là HS mất bài, không khôi phục được."
        />
      )}
    </>
  );
}
