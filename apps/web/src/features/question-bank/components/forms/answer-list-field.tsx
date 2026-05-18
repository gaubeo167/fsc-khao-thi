"use client";

import { Plus, Sigma, X } from "lucide-react";
import { useState } from "react";
import { Controller, type Control } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { MathInsertDialog } from "../math-insert-dialog";
import { RenderedContent } from "../rendered-content";

interface Props {
  control: Control<any>;
  name: string;
  label: string;
  placeholder?: string;
  error?: string;
}

/**
 * Chip-style "accepted answers" field — used for short answers and each
 * fill-blank slot. Enter (or "+") adds; X removes. Math button inserts a
 * LaTeX chip via `$...$` so the answer can render formulas.
 */
export function AnswerListField({ control, name, label, placeholder, error }: Props) {
  const [draft, setDraft] = useState("");
  const [mathOpen, setMathOpen] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const value: string[] = Array.isArray(field.value) ? field.value : [];

        function add(raw?: string) {
          const v = (raw ?? draft).trim();
          if (!v) return;
          if (value.includes(v)) {
            if (raw === undefined) setDraft("");
            return;
          }
          field.onChange([...value, v]);
          if (raw === undefined) setDraft("");
        }
        function remove(i: number) {
          field.onChange(value.filter((_, idx) => idx !== i));
        }

        return (
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">{label}</Label>

            <div
              className={cn(
                "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5",
                "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
              )}
            >
              {value.map((v, i) => (
                <span
                  key={`${v}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary"
                >
                  <RenderedContent content={v} className="inline" />
                  <button
                    type="button"
                    aria-label="Xoá đáp án"
                    onClick={() => remove(i)}
                    className="rounded p-0.5 hover:bg-primary/15"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder={placeholder ?? "Nhập đáp án rồi Enter…"}
                className="h-7 flex-1 min-w-[140px] border-0 bg-transparent px-0.5 shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => setMathOpen(true)}
                title="Chèn công thức toán làm đáp án"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/8 px-2 text-[12px] font-medium text-primary hover:bg-primary/15"
              >
                <Sigma className="h-3 w-3" strokeWidth={2} />
                Math
              </button>
              <button
                type="button"
                onClick={() => add()}
                title="Thêm đáp án"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/8 px-2 text-[12px] font-medium text-primary hover:bg-primary/15"
              >
                <Plus className="h-3 w-3" />
                Thêm
              </button>
            </div>

            {error ? <p className="text-[12px] text-destructive">{error}</p> : null}

            <MathInsertDialog
              open={mathOpen}
              onOpenChange={setMathOpen}
              onInsert={(snippet) => add(snippet)}
            />
          </div>
        );
      }}
    />
  );
}
