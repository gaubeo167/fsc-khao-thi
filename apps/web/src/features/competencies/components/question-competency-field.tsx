"use client";

import {
  Controller,
  type Control,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";

import { Label } from "@/components/ui/label";

import { CompetencyPicker } from "./competency-picker";
import { useCompetenciesStore } from "../state/competencies-store";

/**
 * Question-level YCCĐ tag (writes `competencyIds` as a 1-element array and
 * denormalises the outcome's Bloom into `bloomLevel`). Optional. For
 * multi-tf / mcq-multi the per-ý / per-option pickers carry the detail;
 * this is the question's primary competency.
 */
export function QuestionCompetencyField({
  control,
  watch,
  setValue,
}: {
  control: Control<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}) {
  const subjectId = watch("subjectId") as string;
  const gradeId = watch("gradeId") as string;

  return (
    <Controller
      control={control}
      name="competencyIds"
      render={({ field }) => {
        const arr = Array.isArray(field.value) ? (field.value as string[]) : [];
        const current = arr[0] ?? null;
        return (
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">
              Khung YCCĐ (tuỳ chọn)
            </Label>
            <CompetencyPicker
              subjectId={subjectId}
              gradeId={gradeId}
              value={current}
              placeholder="Gắn Yêu cầu cần đạt…"
              onChange={(id) => {
                field.onChange(id ? [id] : []);
                const c = id
                  ? useCompetenciesStore.getState().competencyById(id)
                  : undefined;
                setValue("bloomLevel", c?.bloomLevel ?? undefined, {
                  shouldDirty: true,
                });
              }}
            />
            <p className="text-meta">
              YCCĐ chính của câu (chuẩn đầu ra). Câu Đúng–Sai / nhiều đáp án có
              thể gắn thêm YCCĐ cho từng ý / phương án bên dưới.
            </p>
          </div>
        );
      }}
    />
  );
}
