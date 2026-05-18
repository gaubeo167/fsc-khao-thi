"use client";

import {
  ArrowRight,
  CheckCircle2,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { QuestionType } from "../../data/question-types";

import { AiAssistDialog } from "../ai-assist-dialog";
import { AnswerListField } from "./answer-list-field";
import { McqExplanationField, McqOptionsField } from "./mcq-form";

interface Props {
  type: QuestionType;
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  errors: Record<string, any>;
}

/**
 * Renders the per-type answer fields. Question content + meta sit above this
 * inside `CreateQuestionDialog`; this component only fills the type-variable
 * bottom half.
 */
export function TypeSpecificFields({ type, control, setValue, errors }: Props) {
  switch (type) {
    case "mcq-single":
      return (
        <div className="space-y-4">
          <McqOptionsField control={control} setValue={setValue} mode="single" error={errors.options?.message as string} />
          <McqExplanationField control={control} />
        </div>
      );
    case "mcq-multi":
      return (
        <div className="space-y-4">
          <McqOptionsField control={control} setValue={setValue} mode="multi" error={errors.options?.message as string} />
          <McqExplanationField control={control} />
        </div>
      );
    case "true-false":
      return (
        <div className="space-y-4">
          <Controller
            control={control}
            name="correctAnswer"
            render={({ field }) => (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground/80">
                  Đáp án đúng <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => field.onChange(true)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                      field.value === true
                        ? "border-[#86EFAC] bg-[#DCFCE7]/60 text-[#166534]"
                        : "border-border bg-card text-foreground/70 hover:bg-accent",
                    )}
                  >
                    Đúng
                  </button>
                  <button
                    type="button"
                    onClick={() => field.onChange(false)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                      field.value === false
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-border bg-card text-foreground/70 hover:bg-accent",
                    )}
                  >
                    Sai
                  </button>
                </div>
              </div>
            )}
          />
          <McqExplanationField control={control} />
        </div>
      );
    case "multi-tf":
      return <MultiTfFields control={control} setValue={setValue} errors={errors} />;
    case "short-answer":
      return <ShortAnswerFields control={control} errors={errors} />;
    case "fill-blank":
      return <FillBlankBlanksField control={control} setValue={setValue} errors={errors} />;
    case "matching":
      return <MatchingPairsField control={control} errors={errors} />;
    case "ordering":
      return <OrderingItemsField control={control} setValue={setValue} errors={errors} />;
    case "drag-drop":
      return <DragDropFields control={control} setValue={setValue} errors={errors} />;
    case "underline":
      return <UnderlineFields control={control} errors={errors} />;
    case "essay":
      return <EssayFields control={control} errors={errors} />;
  }
}

/* ───────────── Essay (Tự luận) ───────────── */

function EssayFields({
  control,
  errors,
}: {
  control: Control<any>;
  errors: Record<string, any>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "rubric" });
  const rubric: { id: string; label: string; points: number }[] =
    useWatch({ control, name: "rubric" }) ?? [];
  const total = rubric.reduce((sum, c) => sum + (Number(c.points) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Rubric criteria */}
      <div className="space-y-2">
        {errors.rubric?.message && (
          <p className="text-[12px] text-destructive">
            {errors.rubric.message as string}
          </p>
        )}

        <ul className="space-y-2">
          {fields.map((f, idx) => (
            <li key={f.id}>
              <div className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-center gap-2">
                <Controller
                  control={control}
                  name={`rubric.${idx}.label`}
                  render={({ field }) => (
                    <input
                      {...field}
                      placeholder={`vd: Nội dung & ý tưởng`}
                      className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`rubric.${idx}.points`}
                  render={({ field }) => (
                    <input
                      type="number"
                      step={0.5}
                      min={0.5}
                      max={20}
                      value={field.value ?? 1}
                      onChange={(e) =>
                        field.onChange(Number(e.target.value) || 0)
                      }
                      className="block w-full rounded-md border border-input bg-background px-3 py-2 text-right text-sm tabular-nums focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  )}
                />
                {fields.length > 1 ? (
                  <IconButton
                    variant="destructive"
                    size="sm"
                    title="Xoá tiêu chí"
                    onClick={() => remove(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                ) : (
                  <span className="inline-block h-7 w-7" />
                )}
              </div>
              {(errors.rubric as any)?.[idx]?.label?.message && (
                <p className="mt-1 text-[12px] text-destructive">
                  {(errors.rubric as any)[idx].label.message}
                </p>
              )}
            </li>
          ))}
        </ul>

        <p className="text-right text-[13px] font-semibold tabular-nums text-foreground/85">
          Tổng:{" "}
          <span className="text-[15px] text-primary">
            {total.toFixed(total % 1 === 0 ? 0 : 1)}
          </span>{" "}
          điểm
        </p>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            append(
              {
                id: `r-${Date.now()}-${fields.length}`,
                label: "",
                points: 1,
              } as never,
            )
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm tiêu chí
        </Button>
      </div>

      {/* Word count range */}
      <div className="grid grid-cols-2 gap-3 border-t pt-4">
        <div className="space-y-1">
          <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
            Số từ tối thiểu
          </Label>
          <Controller
            control={control}
            name="wordMin"
            render={({ field }) => (
              <input
                type="number"
                min={0}
                max={10000}
                value={field.value ?? 0}
                onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            )}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
            Số từ tối đa
          </Label>
          <Controller
            control={control}
            name="wordMax"
            render={({ field }) => (
              <input
                type="number"
                min={0}
                max={10000}
                value={field.value ?? 0}
                onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            )}
          />
        </div>
      </div>

      {/* AI grading toggle */}
      <Controller
        control={control}
        name="aiAssist"
        render={({ field }) => (
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-foreground/80">
            <input
              type="checkbox"
              checked={Boolean(field.value)}
              onChange={(e) => field.onChange(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Bật AI hỗ trợ chấm sơ bộ{" "}
            <span className="text-meta">(giáo viên review lại)</span>
          </label>
        )}
      />

      <McqExplanationField control={control} />
    </div>
  );
}

/* ───────────── Underline (Gạch chân) ───────────── */

function UnderlineFields({
  control,
  errors,
}: {
  control: Control<any>;
  errors: Record<string, any>;
}) {
  const content: string = useWatch({ control, name: "content" }) ?? "";
  const matches = useMemo(
    () => content.match(/\[u:[^\]]+\]/g) ?? [],
    [content],
  );
  const phrases = matches.map((m) => m.slice(3, -1));

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
        <span className="text-base leading-none">💡</span>
        <p className="min-w-0">
          Trong khung đề bài: <span className="font-semibold">bôi đen</span> từ
          / cụm từ mà học sinh phải gạch chân, rồi bấm nút{" "}
          <span className="rounded border border-emerald-300 bg-white px-1.5 py-0.5 font-semibold text-emerald-700">
            <span className="underline decoration-emerald-600">Ab</span> Đánh
            dấu gạch chân
          </span>
          . Click vào chip đã đánh dấu để bỏ.
        </p>
      </div>

      {(errors.content as any)?.message && (
        <p className="text-[12px] text-destructive">
          {(errors.content as any).message as string}
        </p>
      )}

      <div className="rounded-lg border bg-card p-3">
        <p className="text-eyebrow mb-2">
          Đã đánh dấu {phrases.length} cụm gạch chân
        </p>
        {phrases.length === 0 ? (
          <p className="text-meta italic">
            Chưa đánh dấu cụm nào. Bôi đen text trong đề bài rồi bấm "Đánh dấu
            gạch chân".
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {phrases.map((p, i) => (
              <span
                key={`${i}-${p}`}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-800 underline decoration-emerald-600 decoration-2 underline-offset-2"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      <McqExplanationField control={control} />
    </div>
  );
}

/* ───────────── Drag-drop (Kéo thả) ───────────── */

function DragDropFields({
  control,
  setValue,
  errors,
}: {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  errors: Record<string, any>;
}) {
  const content: string = useWatch({ control, name: "content" }) ?? "";
  const zones: { id: string; correctContent: string }[] =
    useWatch({ control, name: "zones" }) ?? [];
  const distractors: { id: string; content: string }[] =
    useWatch({ control, name: "distractors" }) ?? [];

  const detectedCount = useMemo(
    () => (content.match(/\[zone:\d+\]/g) ?? []).length,
    [content],
  );

  // Sync zones array length with chip count in content
  useEffect(() => {
    if (detectedCount === zones.length) return;
    const next = [...zones];
    if (detectedCount > zones.length) {
      for (let i = zones.length; i < detectedCount; i++) {
        next.push({ id: `z-${Date.now()}-${i}`, correctContent: "" });
      }
    } else {
      next.length = detectedCount;
    }
    setValue("zones", next, { shouldValidate: true, shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedCount]);

  function addDistractor() {
    const next = [
      ...distractors,
      { id: `d-${Date.now()}`, content: "" },
    ];
    setValue("distractors", next, { shouldValidate: true, shouldDirty: true });
  }
  function removeDistractor(idx: number) {
    const next = distractors.filter((_, i) => i !== idx);
    setValue("distractors", next, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <div className="space-y-4">
      {/* 3-step instructions */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-800">
        <p className="mb-1.5 font-semibold">Cách soạn câu kéo thả linh động:</p>
        <ol className="space-y-0.5">
          <li>
            <span className="font-semibold">Bước 1:</span> Đặt con trỏ vào đề bài,
            click{" "}
            <span className="rounded border border-amber-300 bg-white px-1.5 py-0.5 font-semibold">
              + Chèn vùng thả
            </span>{" "}
            để thêm các chip <ZoneChipMini n={1} /> <ZoneChipMini n={2} /> vào
            đúng vị trí trong câu văn.
          </li>
          <li>
            <span className="font-semibold">Bước 2:</span> Khai báo đáp án đúng
            cho mỗi vùng ở phần <span className="font-semibold">"Vùng thả"</span>.
          </li>
          <li>
            <span className="font-semibold">Bước 3:</span> Thêm các{" "}
            <span className="font-semibold">cụm từ gây nhiễu</span> ở phần{" "}
            <span className="font-semibold">"Cụm từ kéo"</span> (đáp án sai để
            học sinh phân biệt).
          </li>
        </ol>
      </div>

      {/* Section: Zones */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-700">
            ◧
          </span>
          <p className="text-[13px] font-semibold text-foreground/85">
            Vùng thả & đáp án đúng{" "}
            <span className="text-meta font-normal">
              — Mỗi vùng là 1 ô trống, học sinh kéo từ cụm từ vào
            </span>
          </p>
        </div>

        {errors.zones?.message && (
          <p className="text-[12px] text-destructive">
            {errors.zones.message as string}
          </p>
        )}

        {detectedCount === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
            <p className="text-meta">
              Chưa có vùng nào. Click{" "}
              <span className="font-semibold">+ Chèn vùng thả</span> ở thanh
              công cụ đề bài để bắt đầu.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {Array.from({ length: detectedCount }).map((_, idx) => (
              <li
                key={idx}
                className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3 rounded-xl border bg-card p-3"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-[12px] font-bold text-white">
                  {idx + 1}
                </span>
                <Controller
                  control={control}
                  name={`zones.${idx}.correctContent`}
                  render={({ field }) => (
                    <input
                      {...field}
                      placeholder={`Đáp án đúng cho vùng ${idx + 1}`}
                      className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  )}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Section: Distractors */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-rose-100 text-rose-700">
            ◳
          </span>
          <p className="text-[13px] font-semibold text-foreground/85">
            Cụm từ gây nhiễu{" "}
            <span className="text-meta font-normal">
              — Học sinh thấy chung với đáp án đúng. Càng nhiều cụm gây nhiễu,
              câu hỏi càng khó.
            </span>
          </p>
        </div>

        <p className="text-meta">
          Tổng số cụm trong pool ={" "}
          <span className="font-semibold text-foreground">
            {detectedCount + distractors.length}
          </span>{" "}
          (đáp án đúng: {detectedCount} · gây nhiễu: {distractors.length})
        </p>

        {distractors.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-4 text-[12px] text-muted-foreground">
            Chưa có cụm gây nhiễu nào — học sinh sẽ chỉ thấy đáp án đúng nên rất
            dễ. Thêm vài cụm để tăng độ khó.
          </div>
        ) : (
          <ul className="space-y-2">
            {distractors.map((d, idx) => (
              <li
                key={d.id}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-card p-3"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-[12px] font-bold text-rose-700">
                  ✗
                </span>
                <Controller
                  control={control}
                  name={`distractors.${idx}.content`}
                  render={({ field }) => (
                    <input
                      {...field}
                      placeholder={`Cụm từ gây nhiễu #${idx + 1}`}
                      className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  )}
                />
                <IconButton
                  variant="destructive"
                  size="sm"
                  title="Xoá cụm này"
                  onClick={() => removeDistractor(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <Button type="button" size="sm" variant="outline" onClick={addDistractor}>
          <Plus className="h-3.5 w-3.5" />
          Thêm cụm từ gây nhiễu
        </Button>
      </div>

      <McqExplanationField control={control} />
    </div>
  );
}

function ZoneChipMini({ n }: { n: number }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-0.5 rounded border border-dashed border-amber-500 bg-white px-1 text-[11px] font-semibold text-amber-700">
      <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
        {n}
      </span>
      vùng {n}
    </span>
  );
}

/* ───────────── Ordering (Sắp xếp) ───────────── */

function OrderingItemsField({
  control,
  setValue,
  errors,
}: {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  errors: Record<string, any>;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "items" });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);

  function handleDragOver(e: React.DragEvent, idx: number) {
    if (dragId === null) return;
    e.preventDefault();
    setDropOver(idx);
  }
  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    if (dragId === null) return;
    const fromIdx = fields.findIndex((f) => f.id === dragId);
    if (fromIdx === -1 || fromIdx === idx) {
      setDragId(null);
      setDropOver(null);
      return;
    }
    move(fromIdx, idx);
    setDragId(null);
    setDropOver(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-meta">
        <span className="font-semibold text-foreground/85">Mẹo: </span>
        Kéo thả mục để sắp xếp đúng thứ tự. Hệ thống sẽ{" "}
        <span className="font-semibold">xáo trộn các mục</span> khi học sinh
        làm bài.
      </p>

      {errors.items?.message && (
        <p className="text-[12px] text-destructive">
          {errors.items.message as string}
        </p>
      )}

      <ul className="space-y-2">
        {fields.map((f, idx) => (
          <li
            key={f.id}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            className={cn(
              "relative rounded-xl border bg-card p-3 transition-all",
              dragId === f.id && "opacity-40",
              dropOver === idx &&
                dragId !== f.id &&
                "border-primary ring-2 ring-primary/30",
            )}
          >
            <div className="grid grid-cols-[18px_28px_minmax(0,1fr)_auto] items-center gap-3">
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  setDragId(f.id);
                  e.dataTransfer.setData("text/plain", f.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropOver(null);
                }}
                title="Kéo để sắp xếp"
                className="cursor-grab rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" strokeWidth={1.85} />
              </button>

              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold tabular-nums text-primary-text">
                {idx + 1}
              </span>

              <Controller
                control={control}
                name={`items.${idx}.content`}
                render={({ field }) => (
                  <input
                    {...field}
                    placeholder={`Mục số ${idx + 1}`}
                    className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                )}
              />

              {fields.length > 2 ? (
                <IconButton
                  variant="destructive"
                  size="sm"
                  title="Xoá mục này"
                  onClick={() => remove(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              ) : (
                <span className="inline-block h-7 w-7" />
              )}
            </div>
            {(errors.items as any)?.[idx]?.content?.message && (
              <p className="ml-12 mt-1 text-[12px] text-destructive">
                {(errors.items as any)[idx].content.message}
              </p>
            )}
          </li>
        ))}
      </ul>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          append(
            {
              id: `i-${Date.now()}-${fields.length}`,
              content: "",
            } as never,
          )
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Thêm mục
      </Button>

      <McqExplanationField control={control} />
    </div>
  );
}

/* ───────────── Matching (Ghép cặp) ───────────── */

function MatchingPairsField({
  control,
  errors,
}: {
  control: Control<any>;
  errors: Record<string, any>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "pairs" });

  return (
    <div className="space-y-3">
      <p className="text-meta">
        <span className="font-semibold text-foreground/85">Mẹo: </span>
        Hệ thống sẽ <span className="font-semibold">xáo trộn cột phải</span> khi
        học sinh làm bài — học sinh phải kéo thả để ghép đúng cặp.
      </p>

      {errors.pairs?.message && (
        <p className="text-[12px] text-destructive">
          {errors.pairs.message as string}
        </p>
      )}

      <ul className="space-y-2">
        {fields.map((f, idx) => (
          <li key={f.id}>
            <div className="grid grid-cols-[28px_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border bg-card p-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-[12px] font-bold tabular-nums text-primary-text">
                {idx + 1}
              </span>

              <Controller
                control={control}
                name={`pairs.${idx}.left`}
                render={({ field }) => (
                  <input
                    {...field}
                    placeholder={`Cột A · Mục ${idx + 1}`}
                    className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                )}
              />

              <ArrowRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={1.85}
                aria-hidden
              />

              <Controller
                control={control}
                name={`pairs.${idx}.right`}
                render={({ field }) => (
                  <input
                    {...field}
                    placeholder={`Cột B · Đáp án ${idx + 1}`}
                    className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                )}
              />

              {fields.length > 2 ? (
                <IconButton
                  variant="destructive"
                  size="sm"
                  title="Xoá cặp này"
                  onClick={() => remove(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              ) : (
                <span className="inline-block h-7 w-7" />
              )}
            </div>
            {((errors.pairs as any)?.[idx]?.left?.message ||
              (errors.pairs as any)?.[idx]?.right?.message) && (
              <p className="ml-9 mt-1 text-[12px] text-destructive">
                {(errors.pairs as any)[idx].left?.message ||
                  (errors.pairs as any)[idx].right?.message}
              </p>
            )}
          </li>
        ))}
      </ul>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          append(
            {
              id: `p-${Date.now()}-${fields.length}`,
              left: "",
              right: "",
            } as never,
          )
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Thêm cặp
      </Button>

      <McqExplanationField control={control} />
    </div>
  );
}

/* ───────────── Multi-TF (Đúng/Sai nhiều câu phụ) ───────────── */

function MultiTfFields({
  control,
  setValue,
  errors,
}: {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  errors: Record<string, any>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "subQuestions" });
  const topError = (errors.subQuestions as any)?.message as string | undefined;

  return (
    <div className="space-y-3">
      {/* Yellow hint banner explaining the structure */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
        <span className="text-base leading-none">💡</span>
        <p className="min-w-0">
          <span className="font-semibold">Đề bài</span> ở phía trên là{" "}
          <span className="font-semibold">đoạn văn / ngữ liệu chung</span>. Bên dưới
          khai báo các câu hỏi phụ, học sinh sẽ chọn Đúng/Sai cho từng câu.
        </p>
      </div>

      {topError && <p className="text-[12px] text-destructive">{topError}</p>}

      <ul className="space-y-2.5">
        {fields.map((f, idx) => (
          <SubQuestionRow
            key={f.id}
            idx={idx}
            control={control}
            setValue={setValue}
            canRemove={fields.length > 2}
            onRemove={() => remove(idx)}
            error={(errors.subQuestions as any)?.[idx]?.statement?.message}
          />
        ))}
      </ul>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          append(
            {
              id: `sub-${Date.now()}-${fields.length}`,
              statement: "",
              correctAnswer: true,
            } as never,
          )
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Thêm câu phụ
      </Button>

      <McqExplanationField control={control} />
    </div>
  );
}

function SubQuestionRow({
  idx,
  control,
  setValue,
  canRemove,
  onRemove,
  error,
}: {
  idx: number;
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  canRemove: boolean;
  onRemove: () => void;
  error?: string;
}) {
  return (
    <li>
      <Controller
        control={control}
        name={`subQuestions.${idx}.correctAnswer`}
        render={({ field: correctField }) => {
          const isTrue = Boolean(correctField.value);
          return (
            <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
              <span className="mt-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-[12px] font-bold tabular-nums text-primary-text">
                {idx + 1}
              </span>

              <div className="min-w-0 flex-1 space-y-1.5">
                <Controller
                  control={control}
                  name={`subQuestions.${idx}.statement`}
                  render={({ field }) => (
                    <textarea
                      {...field}
                      rows={2}
                      placeholder={`Nhập nội dung câu phụ ${idx + 1}…`}
                      className={cn(
                        "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                      )}
                    />
                  )}
                />
                {error && <p className="text-[12px] text-destructive">{error}</p>}
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setValue(`subQuestions.${idx}.correctAnswer`, true, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                    isTrue
                      ? "border-[#86EFAC] bg-[#DCFCE7] text-[#166534]"
                      : "border-border bg-card text-foreground/60 hover:bg-accent",
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                  Đúng
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setValue(`subQuestions.${idx}.correctAnswer`, false, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                    !isTrue
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-border bg-card text-foreground/60 hover:bg-accent",
                  )}
                >
                  <XCircle className="h-3.5 w-3.5" strokeWidth={2} />
                  Sai
                </button>
              </div>

              {canRemove && (
                <IconButton
                  variant="destructive"
                  size="sm"
                  title="Xoá câu phụ"
                  onClick={onRemove}
                  className="mt-1"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              )}
            </div>
          );
        }}
      />
    </li>
  );
}

function ShortAnswerFields({
  control,
  errors,
}: {
  control: Control<any>;
  errors: Record<string, any>;
}) {
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="space-y-4">
      <AnswerSectionHeader
        hint="Học sinh nhập đáp án dạng văn bản — bạn liệt kê các cách viết được chấp nhận."
        onAi={() => setAiOpen(true)}
      />

      <AnswerListField
        control={control}
        name="acceptedAnswers"
        label="Đáp án chấp nhận *"
        placeholder="vd: Hà Nội, Hanoi…"
        error={errors.acceptedAnswers?.message as string}
      />
      <Controller
        control={control}
        name="caseSensitive"
        render={({ field }) => (
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-foreground/80">
            <input
              type="checkbox"
              checked={Boolean(field.value)}
              onChange={(e) => field.onChange(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Phân biệt chữ hoa / chữ thường khi chấm
          </label>
        )}
      />
      <McqExplanationField control={control} />

      <Controller
        control={control}
        name="acceptedAnswers"
        render={({ field }) => (
          <AiAssistDialog
            open={aiOpen}
            onOpenChange={setAiOpen}
            intent="answer"
            onAccept={(text) => {
              const suggestions = parseAcceptedAnswers(text);
              const current: string[] = Array.isArray(field.value) ? field.value : [];
              const merged = Array.from(new Set([...current, ...suggestions]));
              field.onChange(merged);
            }}
          />
        )}
      />
    </div>
  );
}

function FillBlankBlanksField({
  control,
  setValue,
  errors,
}: {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  errors: Record<string, any>;
}) {
  const [aiBlank, setAiBlank] = useState<number | null>(null);

  // Watch the question content for blank chip tokens. The number of chips in
  // content drives how many answer fields appear below — keep them in sync.
  const content: string = useWatch({ control, name: "content" }) ?? "";
  const blanks: { acceptedAnswers: string[] }[] =
    useWatch({ control, name: "blanks" }) ?? [];

  const detectedCount = useMemo(
    () => (content.match(/\[blank:\d+\]/g) ?? []).length,
    [content],
  );

  // Sync blanks array length to detected count whenever content changes.
  useEffect(() => {
    const current = blanks.length;
    if (detectedCount === current) return;
    const next = [...blanks];
    if (detectedCount > current) {
      for (let i = current; i < detectedCount; i++) next.push({ acceptedAnswers: [] });
    } else {
      next.length = detectedCount;
    }
    setValue("blanks", next, { shouldValidate: true, shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedCount]);

  return (
    <div className="space-y-3">
      {/* Hint banner — replaces the old ___ instruction */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
        <span className="text-base leading-none">💡</span>
        <p className="min-w-0">
          Bấm nút <span className="font-semibold">Thêm ô trống</span> trên thanh
          công cụ ở khung đề bài để chèn ô trống có số. Mỗi ô trống tạo ra một
          khu vực nhập đáp án bên dưới — click vào chip ô trống trong đề bài để
          xoá.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Đang có{" "}
          <span className="font-semibold text-foreground">
            {detectedCount}
          </span>{" "}
          ô trống trong đề bài.
        </p>
        {detectedCount > 0 && (
          <button
            type="button"
            onClick={() => setAiBlank(0)}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700 hover:border-amber-300 hover:bg-amber-100"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            AI gợi ý đáp án tất cả
          </button>
        )}
      </div>

      {detectedCount === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
          <p className="text-section-title text-muted-foreground">
            Chưa có ô trống nào
          </p>
          <p className="text-meta mt-1">
            Bấm <span className="font-semibold">+ Thêm ô trống</span> trên thanh
            công cụ trong khung đề bài để bắt đầu.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {Array.from({ length: detectedCount }).map((_, idx) => (
            <li key={idx} className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/80">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                    {idx + 1}
                  </span>
                  Ô trống số {idx + 1}
                </Label>
                <button
                  type="button"
                  title="AI gợi ý đáp án cho ô trống này"
                  onClick={() => setAiBlank(idx)}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:border-amber-300 hover:bg-amber-100"
                >
                  <Sparkles className="h-3 w-3" strokeWidth={2} />
                  AI
                </button>
              </div>
              <AnswerListField
                control={control}
                name={`blanks.${idx}.acceptedAnswers`}
                label="Đáp án chấp nhận"
                placeholder="Thêm đáp án rồi Enter…"
                error={(errors.blanks as any)?.[idx]?.acceptedAnswers?.message}
              />
            </li>
          ))}
        </ul>
      )}

      <Controller
        control={control}
        name={
          aiBlank !== null
            ? (`blanks.${aiBlank}.acceptedAnswers` as const)
            : ("blanks.0.acceptedAnswers" as const)
        }
        render={({ field }) => (
          <AiAssistDialog
            open={aiBlank !== null}
            onOpenChange={(o) => !o && setAiBlank(null)}
            intent="answer"
            onAccept={(text) => {
              const suggestions = parseAcceptedAnswers(text);
              const current: string[] = Array.isArray(field.value) ? field.value : [];
              const merged = Array.from(new Set([...current, ...suggestions]));
              field.onChange(merged);
            }}
          />
        )}
      />
    </div>
  );
}

function AnswerSectionHeader({
  hint,
  onAi,
}: {
  hint: string;
  onAi: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-dashed bg-muted/20 p-3">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground/85">Mẹo: </span>
        {hint}
      </p>
      <button
        type="button"
        onClick={onAi}
        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700 hover:border-amber-300 hover:bg-amber-100"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
        AI gợi ý đáp án
      </button>
    </div>
  );
}

/**
 * The "answer" intent returns formatted A./B./C./D. lines + "Đáp án đúng: X"
 * + "Giải thích". For short-answer / fill-blank we strip prefixes and split
 * everything into accepted-answer candidates.
 */
function parseAcceptedAnswers(raw: string): string[] {
  const candidates = new Set<string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Drop "Giải thích:" lines wholesale
    if (/^Giải thích/i.test(trimmed)) continue;
    if (/^Đáp án đúng/i.test(trimmed)) continue;
    // Strip "A. ", "B) ", "- " prefixes
    const cleaned = trimmed.replace(/^[A-Da-d][\.\)]\s*/, "").replace(/^[-•]\s*/, "");
    if (cleaned.length > 0) candidates.add(cleaned);
  }
  return Array.from(candidates).slice(0, 8);
}
