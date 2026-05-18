"use client";

import { Boxes, Layers, PencilLine, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useGradesStore } from "@/features/grades/state/grades-store";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import type { ExamBlueprint } from "../data/types";
import {
  countBlueprintByDifficulty,
  countTopicByDifficulty,
  indexQuestions,
} from "../lib/blueprint-stats";

import { DifficultyPills } from "./difficulty-pills";

interface Props {
  blueprint: ExamBlueprint;
  questions: Question[];
  onEdit(b: ExamBlueprint): void;
  onDelete(b: ExamBlueprint): void;
  onCreatePackage(b: ExamBlueprint): void;
}

export function BlueprintCard({
  blueprint,
  questions,
  onEdit,
  onDelete,
  onCreatePackage,
}: Props) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const subject = subjects.find((s) => s.id === blueprint.subjectId);
  const grade = grades.find((g) => g.id === blueprint.gradeId);

  const idx = indexQuestions(questions);
  const total = countBlueprintByDifficulty(blueprint, idx);
  const totalCount = total.easy + total.medium + total.hard;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)]">
      <header className="flex items-center gap-2 border-b bg-[var(--color-surface-2)] px-4 py-2.5">
        <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/65">
          {blueprint.id}
        </span>
        {subject && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: `${subject.color}1A`, color: subject.color }}
          >
            {subject.name}
          </span>
        )}
        {grade && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
            {grade.code}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          ⏱ {blueprint.duration}p
        </span>
      </header>

      <div className="space-y-3 px-4 py-3.5">
        <p className="text-[15px] font-semibold leading-snug text-foreground">
          {blueprint.name}
        </p>

        {blueprint.topics.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-center text-[12px] text-muted-foreground">
            Chưa khai báo mạch kiến thức nào.
          </p>
        ) : (
          <ul className="space-y-2">
            {blueprint.topics.map((t) => {
              const c = countTopicByDifficulty(t, idx);
              const sum = c.easy + c.medium + c.hard;
              return (
                <li
                  key={t.id}
                  className="rounded-lg border bg-card px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-foreground/85">
                      {t.name || (
                        <span className="italic text-muted-foreground">
                          (Chưa đặt tên)
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] font-semibold tabular-nums text-primary">
                      {sum} câu
                    </span>
                  </div>
                  <DifficultyPills counts={c} className="mt-1.5" />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-[var(--color-surface-2)] px-4 py-2.5 text-[11px]">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Layers className="h-3 w-3" strokeWidth={1.85} />
          {blueprint.topics.length} mạch
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Boxes className="h-3 w-3" strokeWidth={1.85} />
          <span className="font-semibold text-foreground/80">{totalCount}</span>{" "}
          tổng câu đã bốc
        </span>
        <span className="text-muted-foreground">
          · {blueprint.ownerName}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton size="sm" title="Sửa khung đề" onClick={() => onEdit(blueprint)}>
            <PencilLine className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            size="sm"
            variant="destructive"
            title="Xoá khung đề"
            onClick={() => onDelete(blueprint)}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
          <Button
            size="sm"
            className="ml-1.5"
            disabled={totalCount === 0}
            onClick={() => onCreatePackage(blueprint)}
          >
            <Plus className="h-3.5 w-3.5" />
            Tạo gói đề
          </Button>
        </div>
      </footer>
    </article>
  );
}
