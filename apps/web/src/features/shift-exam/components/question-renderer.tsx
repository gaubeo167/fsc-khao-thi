"use client";

import { ArrowDown, ArrowUp, GripVertical, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentEditor } from "@/features/question-bank/components/content-editor";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import type {
  AiGeneratedQuestion,
  DragDropQuestion,
  EssayQuestion,
  FillBlankQuestion,
  MatchingQuestion,
  McqMultiQuestion,
  McqSingleQuestion,
  MultiTfQuestion,
  OrderingQuestion,
  Question,
  ShortAnswerQuestion,
  TrueFalseQuestion,
  UnderlineQuestion,
} from "@/features/question-bank/data/seed-questions";
import { cn } from "@/lib/utils";

import type { Answer } from "../state/attempts-store";

interface Props {
  question: Question;
  answer: Answer | undefined;
  onChange(answer: Answer): void;
  disabled?: boolean;
  /**
   * Stable seed string used to shuffle randomised pools (matching right
   * column, ordering items, drag-drop chips). Same `(student, question)`
   * always yields the same scramble; different students see different
   * orders. Pass `${attemptId}-${questionId}`.
   */
  seed?: string;
}

export function QuestionRenderer({
  question,
  answer,
  onChange,
  disabled,
  seed,
}: Props) {
  switch (question.type) {
    case "mcq-single":
      return (
        <McqSingleAnswer
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "mcq-multi":
      return (
        <McqMultiAnswer
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "true-false":
      return (
        <TrueFalseAnswer
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "multi-tf":
      return (
        <MultiTfAnswer
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "short-answer":
      return (
        <ShortAnswerInput
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "fill-blank":
      return (
        <FillBlankInput
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "matching":
      return (
        <MatchingAnswer
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
          seed={seed}
        />
      );
    case "ordering":
      return (
        <OrderingAnswer
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
          seed={seed}
        />
      );
    case "drag-drop":
      return (
        <DragDropAnswer
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
          seed={seed}
        />
      );
    case "underline":
      return (
        <UnderlineAnswer
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "essay":
      return (
        <EssayInput
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "ai-generated":
      return (
        <AiGeneratedInput
          q={question}
          answer={answer}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return <UnsupportedTypeNote type={(question as { type: string }).type} />;
  }
}

/* ───── Helpers ───── */

/** djb2 hash → 32-bit unsigned int. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Deterministic Fisher–Yates shuffle keyed by a stable seed string. */
function stableShuffle<T>(arr: T[], seed: string): T[] {
  let s = hash(seed) || 1;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = Math.floor(((s & 2147483647) / 2147483647) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function McqSingleAnswer({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: McqSingleQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  const chosen =
    answer && answer.kind === "mcq-single" ? answer.optionId : null;
  return (
    <ul className="space-y-2">
      {q.options.map((opt, idx) => {
        const selected = chosen === opt.id;
        return (
          <li key={opt.id}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-2.5 transition",
                disabled && "cursor-not-allowed opacity-60",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "hover:border-foreground/30 hover:bg-accent/20",
              )}
            >
              <input
                type="radio"
                name={q.id}
                disabled={disabled}
                checked={selected}
                onChange={() =>
                  onChange({ kind: "mcq-single", optionId: opt.id })
                }
                className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="text-[13px] font-bold uppercase text-foreground/65">
                {String.fromCharCode(65 + idx)}.
              </span>
              <RenderedContent
                content={opt.content}
                inline
                className="flex-1 text-[14px] leading-relaxed"
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function McqMultiAnswer({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: McqMultiQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  const chosen =
    answer && answer.kind === "mcq-multi" ? answer.optionIds : [];
  function toggle(id: string) {
    const set = new Set(chosen);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ kind: "mcq-multi", optionIds: Array.from(set) });
  }
  return (
    <>
      <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
        <Info className="h-3 w-3" /> Có thể có nhiều đáp án đúng.
      </p>
      <ul className="space-y-2">
        {q.options.map((opt, idx) => {
          const selected = chosen.includes(opt.id);
          return (
            <li key={opt.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-2.5 transition",
                  disabled && "cursor-not-allowed opacity-60",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "hover:border-foreground/30 hover:bg-accent/20",
                )}
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected}
                  onChange={() => toggle(opt.id)}
                  className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                />
                <span className="text-[13px] font-bold uppercase text-foreground/65">
                  {String.fromCharCode(65 + idx)}.
                </span>
                <RenderedContent
                  content={opt.content}
                  inline
                  className="flex-1 text-[14px] leading-relaxed"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TrueFalseAnswer({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: TrueFalseQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  const value =
    answer && answer.kind === "true-false" ? answer.value : null;
  const opts: Array<{ label: string; v: boolean }> = [
    { label: "Đúng", v: true },
    { label: "Sai", v: false },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {opts.map((o) => {
        const selected = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange({ kind: "true-false", value: o.v })
            }
            className={cn(
              "rounded-lg border bg-card px-4 py-3 text-center text-[14px] font-semibold transition",
              disabled && "cursor-not-allowed opacity-60",
              selected
                ? o.v
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                  : "border-rose-300 bg-rose-50 text-rose-800 ring-1 ring-rose-200"
                : "hover:border-foreground/30 hover:bg-accent/20",
            )}
          >
            {o.v ? "✓" : "✕"} {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ShortAnswerInput({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: ShortAnswerQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  const value =
    answer && answer.kind === "short-answer" ? answer.text : "";
  return (
    <div>
      <Label className="text-[12px] font-semibold">Đáp án của bạn</Label>
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange({ kind: "short-answer", text: e.target.value })
        }
        placeholder={
          q.caseSensitive
            ? "Nhập chính xác (phân biệt chữ hoa/thường)"
            : "Nhập đáp án ngắn"
        }
        className="mt-1"
      />
    </div>
  );
}

function FillBlankInput({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: FillBlankQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  const values = answer && answer.kind === "fill-blank" ? answer.blanks : [];
  function setBlank(i: number, v: string) {
    const next = [...values];
    while (next.length < q.blanks.length) next.push("");
    next[i] = v;
    onChange({ kind: "fill-blank", blanks: next });
  }
  return (
    <div className="space-y-2.5">
      {q.blanks.map((_, i) => (
        <div key={i}>
          <Label className="text-[12px] font-semibold">Ô trống #{i + 1}</Label>
          <Input
            value={values[i] ?? ""}
            disabled={disabled}
            onChange={(e) => setBlank(i, e.target.value)}
            placeholder={`Đáp án cho ô #${i + 1}`}
            className="mt-1"
          />
        </div>
      ))}
    </div>
  );
}

function EssayInput({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: EssayQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  const value = answer && answer.kind === "essay" ? answer.text : "";
  // Word count strips markdown / HTML markers for a fair count of words
  // the student actually typed (math, images, etc don't count).
  const plain = value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ") // images
    .replace(/\$[^$]+\$/g, " formula ") // inline math
    .replace(/<[^>]+>/g, " ") // any leftover HTML tags from WYSIWYG
    .trim();
  const wc = plain ? plain.split(/\s+/).length : 0;
  return (
    <div>
      <Label className="mb-1 block text-[12px] font-semibold">
        Bài viết của bạn
      </Label>
      {disabled ? (
        // Read-only render (after submit) — show as rich content.
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-[14px] leading-relaxed">
          {value ? (
            <RenderedContent content={value} />
          ) : (
            <span className="italic text-muted-foreground">(Bỏ trống)</span>
          )}
        </div>
      ) : (
        <ContentEditor
          value={value}
          onChange={(next) => onChange({ kind: "essay", text: next })}
          placeholder="Trình bày bài viết của bạn — có thể dùng định dạng, công thức toán, chèn ảnh, vẽ hình…"
          minHeight={200}
          hideAi
        />
      )}
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Số từ: {wc}</span>
        {(q.wordMin || q.wordMax) && (
          <span>
            Yêu cầu: {q.wordMin ?? 0}
            {q.wordMax ? `–${q.wordMax}` : "+"} từ
          </span>
        )}
      </div>
    </div>
  );
}

function UnsupportedTypeNote({ type }: { type: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center">
      <p className="text-[13px] font-semibold">Chưa hỗ trợ trong demo</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Loại câu hỏi <code className="rounded bg-muted px-1">{type}</code> sẽ được
        bổ sung ở phiên bản sau. Tạm bỏ qua để làm tiếp các câu khác.
      </p>
    </div>
  );
}

/* ───── Multi T/F ───── */

function MultiTfAnswer({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: MultiTfQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  const values =
    answer && answer.kind === "multi-tf" ? answer.values : {};
  function setOne(subId: string, v: boolean) {
    onChange({
      kind: "multi-tf",
      values: { ...values, [subId]: v },
    });
  }
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">
        Mỗi mệnh đề chọn Đúng hoặc Sai:
      </p>
      <ul className="space-y-2">
        {q.subQuestions.map((sub, idx) => {
          const v = values[sub.id];
          return (
            <li
              key={sub.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
            >
              <span className="text-[12px] font-bold uppercase text-foreground/65">
                {String.fromCharCode(97 + idx)})
              </span>
              <RenderedContent
                content={sub.statement}
                inline
                className="min-w-[180px] flex-1 text-[13.5px] leading-relaxed"
              />
              <div className="flex gap-1.5">
                {[
                  { label: "Đúng", val: true, tone: "emerald" },
                  { label: "Sai", val: false, tone: "rose" },
                ].map((opt) => {
                  const selected = v === opt.val;
                  return (
                    <button
                      key={String(opt.val)}
                      type="button"
                      disabled={disabled}
                      onClick={() => setOne(sub.id, opt.val)}
                      className={cn(
                        "rounded-md border px-3 py-1 text-[12px] font-semibold transition",
                        disabled && "cursor-not-allowed opacity-60",
                        selected
                          ? opt.tone === "emerald"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                            : "border-rose-300 bg-rose-50 text-rose-800 ring-1 ring-rose-200"
                          : "border-border bg-card hover:bg-accent/30",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───── Matching ───── */

function MatchingAnswer({
  q,
  answer,
  onChange,
  disabled,
  seed,
}: {
  q: MatchingQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
  seed?: string;
}) {
  // Right column is shown shuffled — left column stays in author's order.
  // Each left has a select that picks one of the right items by *original
  // pair id*. We compare against the matching pair id at grade-time.
  const rightOptions = useMemo(
    () => stableShuffle(q.pairs, `${seed ?? ""}-right`),
    [q.pairs, seed],
  );
  const pairings =
    answer && answer.kind === "matching" ? answer.pairings : {};

  function setPair(leftId: string, rightId: string) {
    const next = { ...pairings };
    if (rightId === "") {
      delete next[leftId];
    } else {
      // Enforce 1-to-1: if another left previously chose this right, clear it.
      for (const k of Object.keys(next)) {
        if (next[k] === rightId && k !== leftId) delete next[k];
      }
      next[leftId] = rightId;
    }
    onChange({ kind: "matching", pairings: next });
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">
        Ghép mỗi mục bên trái với mục đúng bên phải.
      </p>
      <ul className="space-y-2">
        {q.pairs.map((p, idx) => {
          const chosen = pairings[p.id] ?? "";
          return (
            <li
              key={p.id}
              className="grid items-center gap-2 rounded-lg border bg-card px-3 py-2.5 sm:grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <span className="text-[12px] font-bold uppercase text-foreground/65">
                {idx + 1}.
              </span>
              <RenderedContent
                content={p.left}
                inline
                className="text-[13.5px] leading-relaxed"
              />
              <select
                value={chosen}
                disabled={disabled}
                onChange={(e) => setPair(p.id, e.target.value)}
                className="h-9 w-full rounded-md border bg-card px-2 text-[12.5px]"
              >
                <option value="">— Chọn ghép —</option>
                {rightOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {/* `<option>` can only contain text — keep raw text;
                       images inside right column won't render but the
                       label still identifies the pair. */}
                    {r.right}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───── Ordering ───── */

function OrderingAnswer({
  q,
  answer,
  onChange,
  disabled,
  seed,
}: {
  q: OrderingQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
  seed?: string;
}) {
  // Initial order = shuffled. Student rearranges via drag-and-drop OR
  // the ↑/↓ keyboard-style buttons (mirror of the question-bank
  // try-it-panel for consistency between trial and live exams).
  const initial = useMemo(
    () => stableShuffle(q.items, `${seed ?? ""}-ord`).map((i) => i.id),
    [q.items, seed],
  );
  const currentOrder =
    answer && answer.kind === "ordering" && answer.orderedIds.length > 0
      ? answer.orderedIds
      : initial;
  const byId = useMemo(() => new Map(q.items.map((i) => [i.id, i])), [q.items]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);

  function moveTo(fromIdx: number, toIdx: number) {
    if (disabled) return;
    if (fromIdx === toIdx) return;
    const next = [...currentOrder];
    const [pulled] = next.splice(fromIdx, 1);
    if (pulled == null) return;
    next.splice(toIdx, 0, pulled);
    onChange({ kind: "ordering", orderedIds: next });
  }
  function moveByStep(idx: number, dir: -1 | 1) {
    moveTo(idx, idx + dir);
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">
        💡 Kéo thả các mục (giữ icon{" "}
        <GripVertical className="inline h-3 w-3 align-middle" />) hoặc dùng
        nút ↑ ↓ để sắp xếp đúng thứ tự.
      </p>
      <ol className="space-y-1.5">
        {currentOrder.map((id, idx) => {
          const it = byId.get(id);
          if (!it) return null;
          const isDragged = dragId === id;
          const isDropTarget = dropOver === idx && !isDragged;
          return (
            <li
              key={id}
              onDragOver={(e) => {
                if (disabled || dragId === null) return;
                e.preventDefault();
                setDropOver(idx);
              }}
              onDragLeave={() => {
                if (dropOver === idx) setDropOver(null);
              }}
              onDrop={(e) => {
                if (disabled || dragId === null) return;
                e.preventDefault();
                const fromIdx = currentOrder.findIndex((x) => x === dragId);
                if (fromIdx !== -1) moveTo(fromIdx, idx);
                setDragId(null);
                setDropOver(null);
              }}
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition",
                isDragged && "opacity-40",
                isDropTarget && "border-primary ring-2 ring-primary/30",
              )}
            >
              <button
                type="button"
                draggable={!disabled}
                onDragStart={(e) => {
                  setDragId(id);
                  e.dataTransfer.setData("text/plain", id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropOver(null);
                }}
                disabled={disabled}
                title="Kéo để sắp xếp"
                className="cursor-grab rounded p-1 text-muted-foreground transition hover:bg-accent/40 hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
              >
                <GripVertical className="h-3.5 w-3.5" strokeWidth={1.85} />
              </button>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary-soft text-[11px] font-bold text-primary-text">
                {idx + 1}
              </span>
              <RenderedContent
                content={it.content}
                inline
                className="flex-1 text-[13.5px]"
              />
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={disabled || idx === 0}
                  onClick={() => moveByStep(idx, -1)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent/30 disabled:opacity-30"
                  title="Lên"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={disabled || idx === currentOrder.length - 1}
                  onClick={() => moveByStep(idx, 1)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent/30 disabled:opacity-30"
                  title="Xuống"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ───── Drag-drop ───── */

function DragDropAnswer({
  q,
  answer,
  onChange,
  disabled,
  seed,
}: {
  q: DragDropQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
  seed?: string;
}) {
  // Pool = correct contents + distractors, shuffled deterministically.
  const pool = useMemo(() => {
    const correct = q.zones.map((z) => z.correctContent);
    const fillers = q.distractors.map((d) => d.content);
    return stableShuffle([...correct, ...fillers], `${seed ?? ""}-dd`);
  }, [q.zones, q.distractors, seed]);

  const zoneValues =
    answer && answer.kind === "drag-drop"
      ? answer.zones
      : (q.zones.map(() => "") as string[]);

  function setZone(i: number, value: string) {
    const next = [...zoneValues];
    while (next.length < q.zones.length) next.push("");
    next[i] = value;
    onChange({ kind: "drag-drop", zones: next });
  }

  // Render content with [zone:N] markers replaced by inline select dropdowns.
  const segments = useMemo(() => {
    const parts: Array<{ kind: "text" | "zone"; value: string; index?: number }> = [];
    const re = /\[zone:(\d+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(q.content)) != null) {
      if (m.index > last)
        parts.push({ kind: "text", value: q.content.slice(last, m.index) });
      parts.push({ kind: "zone", value: m[0], index: Number(m[1]) - 1 });
      last = m.index + m[0].length;
    }
    if (last < q.content.length)
      parts.push({ kind: "text", value: q.content.slice(last) });
    return parts;
  }, [q.content]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium text-muted-foreground">
        Chọn cụm từ phù hợp điền vào mỗi ô{" "}
        <code className="rounded bg-muted px-1">[…]</code>.
      </p>
      <p className="rounded-lg border bg-card px-3 py-2.5 text-[14px] leading-relaxed">
        {segments.length === 0 || segments.every((s) => s.kind === "text") ? (
          <>
            {q.content}
            <span className="text-rose-700">
              {" "}
              (Câu hỏi không có dấu [zone:N] — chọn cụm theo thứ tự bên dưới.)
            </span>
          </>
        ) : (
          segments.map((seg, i) =>
            seg.kind === "text" ? (
              <span key={i}>{seg.value}</span>
            ) : (
              <select
                key={i}
                value={zoneValues[seg.index!] ?? ""}
                disabled={disabled}
                onChange={(e) => setZone(seg.index!, e.target.value)}
                className="mx-1 inline-block h-7 rounded-md border bg-primary/5 px-2 align-middle text-[12.5px] font-semibold"
              >
                <option value="">— chọn —</option>
                {pool.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ),
          )
        )}
      </p>
      {/* Fallback: if content has no [zone:N], render numbered selects. */}
      {segments.every((s) => s.kind === "text") && (
        <ul className="space-y-1.5">
          {q.zones.map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
            >
              <span className="text-[12px] font-bold uppercase text-foreground/65">
                Ô {i + 1}.
              </span>
              <select
                value={zoneValues[i] ?? ""}
                disabled={disabled}
                onChange={(e) => setZone(i, e.target.value)}
                className="h-8 flex-1 rounded-md border bg-card px-2 text-[12.5px]"
              >
                <option value="">— chọn —</option>
                {pool.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg bg-muted/20 px-3 py-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-foreground/65">
          Pool chip
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {pool.map((p) => {
            const used = zoneValues.includes(p);
            return (
              <li
                key={p}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  used
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 line-through"
                    : "border-border bg-card text-foreground/80",
                )}
              >
                {p}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ───── Underline ───── */

function UnderlineAnswer({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: UnderlineQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  // Strip `[u:phrase]` markers to render the plain passage for the student,
  // but tokenise so each *clickable unit* is either an authored phrase or a
  // plain word. Authored phrases are the correct underline targets at grade
  // time; we don't reveal them in the UI.
  const tokens = useMemo(() => {
    const out: Array<{
      key: number;
      text: string;
      /** True if this token came from an authored `[u:...]` marker. */
      candidate: boolean;
    }> = [];
    const re = /\[u:([^\]\n]+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(q.content)) != null) {
      if (m.index > last) {
        const plain = q.content.slice(last, m.index);
        // Split plain segment into word tokens preserving spaces/punct.
        plain
          .split(/(\s+|[.,;:!?()])/g)
          .filter((s) => s.length > 0)
          .forEach((piece) => {
            out.push({ key: key++, text: piece, candidate: false });
          });
      }
      out.push({ key: key++, text: m[1]!, candidate: true });
      last = m.index + m[0].length;
    }
    if (last < q.content.length) {
      q.content
        .slice(last)
        .split(/(\s+|[.,;:!?()])/g)
        .filter((s) => s.length > 0)
        .forEach((piece) => {
          out.push({ key: key++, text: piece, candidate: false });
        });
    }
    return out;
  }, [q.content]);

  const underlined = new Set(
    answer && answer.kind === "underline"
      ? answer.underlinedPhrases.map((p) => p.toLowerCase())
      : [],
  );

  function toggle(text: string) {
    const t = text.toLowerCase();
    const next = new Set(underlined);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange({
      kind: "underline",
      underlinedPhrases: Array.from(next),
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">
        Click vào cụm từ cần gạch chân (có thể chọn nhiều).
      </p>
      <p className="rounded-lg border bg-card px-3 py-3 text-[14.5px] leading-relaxed">
        {tokens.map((t) => {
          const isWord = /\S/.test(t.text);
          if (!isWord) return <span key={t.key}>{t.text}</span>;
          const active = underlined.has(t.text.toLowerCase());
          return (
            <button
              key={t.key}
              type="button"
              disabled={disabled}
              onClick={() => toggle(t.text)}
              className={cn(
                "rounded px-0.5 transition",
                active
                  ? "bg-emerald-100 text-emerald-900 underline decoration-2 decoration-emerald-600 underline-offset-2"
                  : "hover:bg-amber-50",
                disabled && "cursor-not-allowed",
              )}
            >
              {t.text}
            </button>
          );
        })}
      </p>
      {underlined.size > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Đã gạch:{" "}
          {Array.from(underlined)
            .map((p) => `"${p}"`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

/* ───── AI-generated (essay-like input) ───── */

function AiGeneratedInput({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: AiGeneratedQuestion;
  answer: Answer | undefined;
  onChange(a: Answer): void;
  disabled?: boolean;
}) {
  const value =
    answer && answer.kind === "ai-generated" ? answer.text : "";
  return (
    <div>
      <p className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
        ✨ AI-generated · Câu hỏi do AI tạo
      </p>
      {q.prompt && (
        <p className="mb-2 rounded-md border-l-2 border-violet-300 bg-muted/20 px-3 py-1.5 text-[12px] italic text-muted-foreground">
          Hint AI: {q.prompt}
        </p>
      )}
      <Label className="mb-1 block text-[12px] font-semibold">
        Trả lời của bạn
      </Label>
      {disabled ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-[14px] leading-relaxed">
          {value ? (
            <RenderedContent content={value} />
          ) : (
            <span className="italic text-muted-foreground">(Bỏ trống)</span>
          )}
        </div>
      ) : (
        <ContentEditor
          value={value}
          onChange={(next) => onChange({ kind: "ai-generated", text: next })}
          placeholder="Trình bày câu trả lời — có thể dùng định dạng, công thức toán, chèn ảnh, vẽ hình…"
          minHeight={160}
          hideAi
        />
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Câu này sẽ được AI / GV chấm sau khi nộp bài.
      </p>
    </div>
  );
}
