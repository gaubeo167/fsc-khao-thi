"use client";

import { useController, type Control } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import type { McqQuestion } from "../types";

interface McqRendererProps {
  question: McqQuestion;
  index: number;
  total: number;
  disabled?: boolean;
  control: Control<{ answers: Record<string, string> }>;
  onChange: (value: string) => void;
}

export function McqRenderer({
  question,
  index,
  total,
  disabled,
  control,
  onChange,
}: McqRendererProps) {
  const { field } = useController({
    control,
    name: `answers.${question.id}` as const,
    defaultValue: "",
  });

  return (
    <article className="space-y-5">
      <div>
        <p className="text-eyebrow">
          Câu {index + 1} / {total}
        </p>
        <h2 className="text-section-title mt-1.5 text-lg leading-snug">{question.prompt}</h2>
      </div>

      <RadioGroup
        value={field.value ?? ""}
        onValueChange={(v) => {
          field.onChange(v);
          onChange(v);
        }}
        disabled={disabled}
        className="gap-2"
      >
        {question.options.map((opt) => {
          const selected = field.value === opt.id;
          return (
            <Label
              key={opt.id}
              htmlFor={`${question.id}-${opt.id}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <RadioGroupItem
                value={opt.id}
                id={`${question.id}-${opt.id}`}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-body font-medium leading-snug">
                  <span className="mr-2 inline-block w-5 text-muted-foreground">
                    {opt.id.toUpperCase()}.
                  </span>
                  {opt.label}
                </div>
              </div>
            </Label>
          );
        })}
      </RadioGroup>
    </article>
  );
}
