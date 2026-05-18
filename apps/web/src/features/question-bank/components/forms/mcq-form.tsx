"use client";

import {
  Divide,
  Image as ImageIcon,
  Link as LinkIcon,
  Music,
  Plus,
  Sigma,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { useState } from "react";
import {
  Controller,
  useFieldArray,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { AiAssistDialog } from "../ai-assist-dialog";
import { WysiwygEditor, type WysiwygApi } from "../wysiwyg-editor";

interface Props {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  /** "mcq-single" forces a single correct option (radio); "mcq-multi" allows many. */
  mode: "single" | "multi";
  error?: string;
}

/**
 * Shared MCQ options editor for both single- and multi-answer variants.
 *
 * For "single": clicking the correct toggle on an option unsets the others.
 * For "multi": correct toggles are independent.
 */
export function McqOptionsField({ control, setValue, mode, error }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });
  const [aiTarget, setAiTarget] = useState<number | null>(null);

  function setCorrectSingle(index: number) {
    fields.forEach((_, i) =>
      setValue(`options.${i}.isCorrect`, i === index, {
        shouldValidate: true,
        shouldDirty: true,
      }),
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-[13px] font-medium text-foreground/80">
          Phương án trả lời <span className="text-destructive">*</span>
        </Label>
        <p className="text-meta">
          {mode === "single" ? "Chọn đúng 1 phương án" : "Có thể chọn nhiều phương án"}
        </p>
      </div>

      <ul className="space-y-2">
        {fields.map((field, idx) => (
          <OptionRow
            key={field.id}
            idx={idx}
            mode={mode}
            control={control}
            canRemove={fields.length > 2}
            onSetCorrectSingle={() => setCorrectSingle(idx)}
            onRemove={() => remove(idx)}
            onOpenAi={() => setAiTarget(idx)}
          />
        ))}
      </ul>

      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}

      {fields.length < 8 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            append({
              id: `opt-${Date.now()}-${fields.length}`,
              content: "",
              isCorrect: false,
            } as never)
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm phương án
        </Button>
      )}

      {/* Single AI dialog reused across rows */}
      <Controller
        control={control}
        name={
          aiTarget !== null
            ? (`options.${aiTarget}.content` as const)
            : ("options.0.content" as const)
        }
        render={({ field }) => (
          <AiAssistDialog
            open={aiTarget !== null}
            onOpenChange={(o) => !o && setAiTarget(null)}
            intent="answer"
            onAccept={(text) => {
              field.onChange(field.value ? `${field.value}\n${text}` : text);
            }}
          />
        )}
      />
    </div>
  );
}

interface OptionRowProps {
  idx: number;
  mode: "single" | "multi";
  control: Control<any>;
  canRemove: boolean;
  onSetCorrectSingle: () => void;
  onRemove: () => void;
  onOpenAi: () => void;
}

function OptionRow({
  idx,
  mode,
  control,
  canRemove,
  onSetCorrectSingle,
  onRemove,
  onOpenAi,
}: OptionRowProps) {
  return (
    <li>
      <Controller
        control={control}
        name={`options.${idx}.isCorrect`}
        render={({ field: correctField }) => {
          const isCorrect = Boolean(correctField.value);
          return (
            <div
              className={cn(
                "relative rounded-xl border p-3 transition-colors",
                isCorrect
                  ? "border-[#86EFAC] bg-[#DCFCE7]/60"
                  : "border-border bg-card hover:border-border/80",
              )}
            >
              {isCorrect && (
                <span className="absolute right-3 top-3 rounded-full border border-[#86EFAC] bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#166534]">
                  Đúng
                </span>
              )}

              <div className="flex items-start gap-3">
                <label className="mt-1 inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type={mode === "single" ? "radio" : "checkbox"}
                    checked={isCorrect}
                    onChange={() => {
                      if (mode === "single") onSetCorrectSingle();
                      else correctField.onChange(!correctField.value);
                    }}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                    aria-label={`Đáp án ${String.fromCharCode(65 + idx)} đúng`}
                  />
                </label>

                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                    isCorrect
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-foreground/70",
                  )}
                >
                  {String.fromCharCode(65 + idx)}
                </span>

                <div className="min-w-0 flex-1">
                  <Controller
                    control={control}
                    name={`options.${idx}.content`}
                    render={({ field: contentField }) => (
                      <WysiwygEditor
                        compact
                        minHeight={40}
                        value={contentField.value ?? ""}
                        onChange={contentField.onChange}
                        placeholder={`Nội dung phương án ${String.fromCharCode(65 + idx)}…`}
                        toolbar={(api) => (
                          <RowToolbar api={api} onAi={onOpenAi} />
                        )}
                      />
                    )}
                  />
                </div>

                {canRemove && (
                  <IconButton
                    variant="destructive"
                    size="sm"
                    title="Xoá phương án"
                    onClick={onRemove}
                    className="mt-0.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                )}
              </div>
            </div>
          );
        }}
      />
    </li>
  );
}

function RowToolbar({ api, onAi }: { api: WysiwygApi; onAi: () => void }) {
  return (
    <>
      <IconButton
        size="sm"
        variant="primary"
        title="Công thức toán"
        onClick={api.openMath}
      >
        <Sigma className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>
      <IconButton size="sm" title="Chèn phân số" onClick={api.openFraction}>
        <Divide className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>
      <IconButton size="sm" title="Chèn ảnh" onClick={() => api.openMedia("image")}>
        <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Chèn video" onClick={() => api.openMedia("video")}>
        <Video className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Chèn audio" onClick={() => api.openMedia("audio")}>
        <Music className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Chèn liên kết" onClick={() => api.openMedia("link")}>
        <LinkIcon className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>

      <span aria-hidden className="mx-1 h-4 w-px bg-border" />

      <button
        type="button"
        title="AI gợi ý phương án"
        onClick={onAi}
        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100"
      >
        <Sparkles className="h-3 w-3" strokeWidth={2} />
        AI
      </button>
    </>
  );
}

export function McqExplanationField({ control }: { control: Control<any> }) {
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <Controller
      control={control}
      name="explanation"
      render={({ field }) => (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label className="text-[13px] font-medium text-foreground/80">
              Giải thích đáp án (tuỳ chọn)
            </Label>
            <button
              type="button"
              title="AI viết giải thích"
              onClick={() => setAiOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100"
            >
              <Sparkles className="h-3 w-3" strokeWidth={2} />
              AI hỗ trợ
            </button>
          </div>
          <textarea
            {...field}
            rows={2}
            placeholder="Giải thích vì sao đáp án đúng — hiển thị sau khi học sinh nộp."
            className={cn(
              "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            )}
          />
          <AiAssistDialog
            open={aiOpen}
            onOpenChange={setAiOpen}
            intent="explanation"
            onAccept={(text) => field.onChange(text)}
          />
        </div>
      )}
    />
  );
}
