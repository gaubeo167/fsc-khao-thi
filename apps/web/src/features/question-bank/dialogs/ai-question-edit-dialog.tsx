"use client";

import { zodResolverSafe } from "@/lib/zod-resolver";
import { Check, FileText, X } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { ContentEditor } from "../components/content-editor";
import { TypeSpecificFields } from "../components/forms/type-specific-fields";
import { findQuestionType, type QuestionType } from "../data/question-types";

/**
 * Generic per-question edit dialog. Used by:
 *   - AiBatchDialog (review AI-generated questions before save)
 *   - ImportWordDialog (review .docx-imported questions before save)
 *
 * Renders the same `ContentEditor` + `TypeSpecificFields` combo as
 * `CreateQuestionDialog`, but without the kho / subject / grade / status meta
 * (those are managed at the batch level by the parent dialog).
 */
export interface AiEditValues {
  type: QuestionType;
  content: string;
  explanation?: string;
  difficulty: "easy" | "medium" | "hard";
  // mcq-single / mcq-multi
  options?: Array<{ id: string; content: string; isCorrect: boolean }>;
  // true-false
  correctAnswer?: boolean;
  // fill-blank
  blanks?: Array<{ acceptedAnswers: string[] }>;
  // matching
  pairs?: Array<{ id: string; left: string; right: string }>;
  // ordering
  items?: Array<{ id: string; content: string }>;
  // essay
  rubric?: Array<{ id: string; label: string; points: number }>;
  wordMin?: number;
  wordMax?: number;
  aiAssist?: boolean;
  // multi-tf
  subQuestions?: Array<{ id: string; statement: string; correctAnswer: boolean }>;
  // drag-drop
  zones?: Array<{ id: string; correctContent: string }>;
  distractors?: Array<{ id: string; content: string }>;
  // short-answer
  acceptedAnswers?: string[];
  caseSensitive?: boolean;
}

// Loose schema — only require content + type. Sub-fields are typed but not
// strictly enforced so the user can save mid-edit if needed.
const EditSchema = z.object({
  type: z.string(),
  content: z.string().trim().min(1, "Vui lòng nhập đề bài"),
  explanation: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  options: z
    .array(
      z.object({
        id: z.string(),
        content: z.string().trim().min(1, "Phương án không được trống"),
        isCorrect: z.boolean(),
      }),
    )
    .optional(),
  correctAnswer: z.boolean().optional(),
  blanks: z
    .array(z.object({ acceptedAnswers: z.array(z.string().trim().min(1)).min(1) }))
    .optional(),
  pairs: z
    .array(
      z.object({
        id: z.string(),
        left: z.string().trim().min(1, "Cột A không được trống"),
        right: z.string().trim().min(1, "Cột B không được trống"),
      }),
    )
    .optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        content: z.string().trim().min(1, "Mục không được trống"),
      }),
    )
    .optional(),
  rubric: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().trim().min(1, "Tiêu chí không được trống"),
        points: z.number().min(0),
      }),
    )
    .optional(),
  wordMin: z.number().optional(),
  wordMax: z.number().optional(),
  aiAssist: z.boolean().optional(),
  subQuestions: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string().trim().min(1, "Câu phụ không được trống"),
        correctAnswer: z.boolean(),
      }),
    )
    .optional(),
  zones: z
    .array(
      z.object({
        id: z.string(),
        correctContent: z.string(),
      }),
    )
    .optional(),
  distractors: z
    .array(
      z.object({
        id: z.string(),
        content: z.string(),
      }),
    )
    .optional(),
  acceptedAnswers: z.array(z.string()).optional(),
  caseSensitive: z.boolean().optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AiEditValues;
  onSave: (values: AiEditValues) => void;
}

export function AiQuestionEditDialog({ open, onOpenChange, initial, onSave }: Props) {
  const meta = findQuestionType(initial.type);
  const Icon = meta.icon;

  const form = useForm<any>({
    resolver: zodResolverSafe(EditSchema as any),
    defaultValues: initial,
    mode: "onBlur",
  });

  useEffect(() => {
    if (open) form.reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  function submit() {
    form.handleSubmit((v) => {
      onSave(v as AiEditValues);
      onOpenChange(false);
    })();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 max-h-[92vh] overflow-y-auto">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `${meta.color}1A`,
              color: meta.color,
            }}
          >
            <Icon className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">
              Chỉnh sửa câu hỏi · {meta.name}
            </DialogTitle>
            <p className="text-meta mt-0.5">
              Dùng đầy đủ thanh công cụ và các trường giống khi tạo câu hỏi mới.
            </p>
          </div>
        </header>

        <div className="space-y-5 px-6 py-5">
          {/* Difficulty */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Độ khó
            </Label>
            <Controller
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <select
                  {...field}
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="easy">Dễ (Nhận biết)</option>
                  <option value="medium">Trung bình (Thông hiểu)</option>
                  <option value="hard">Khó (Vận dụng)</option>
                </select>
              )}
            />
          </div>

          {/* Content */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              <FileText className="inline h-3 w-3" /> Đề bài câu hỏi
              <span className="ml-1 text-destructive">*</span>
            </Label>
            <Controller
              control={form.control}
              name="content"
              render={({ field, fieldState }) => (
                <ContentEditor
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  showBlankButton={initial.type === "fill-blank"}
                  showZoneButton={initial.type === "drag-drop"}
                  showUnderlineButton={initial.type === "underline"}
                />
              )}
            />
            {form.formState.errors.content?.message ? (
              <p className="text-[12px] text-destructive">
                {form.formState.errors.content.message as string}
              </p>
            ) : null}
          </div>

          {/* Per-type fields */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Đáp án
            </Label>
            <TypeSpecificFields
              type={initial.type}
              control={form.control}
              setValue={form.setValue}
              errors={form.formState.errors as any}
            />
          </div>
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
            Hủy
          </Button>
          <Button type="button" onClick={submit}>
            <Check className="h-4 w-4" />
            Lưu thay đổi
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
