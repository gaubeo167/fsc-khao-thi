"use client";

import { ArrowLeft, BarChart3, FileText, Paperclip } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useMaterialsStore } from "@/features/learning-materials/state/materials-store";
import type { LearningMaterial } from "@/features/learning-materials/data/types";
import { RenderedContent } from "@/features/question-bank/components/rendered-content";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";

import { useHomeworkStore } from "@/features/homework/state/homework-store";

const MaterialViewerDialog = dynamic(
  () =>
    import(
      "@/features/learning-materials/dialogs/material-viewer-dialog"
    ).then((m) => m.MaterialViewerDialog),
  { ssr: false, loading: () => null },
);

export default function HomeworkPreviewPage() {
  const params = useParams<{ id: string }>();
  const homework = useHomeworkStore((s) => s.findById(params.id));
  const allQuestions = useQuestionsStore((s) => s.questions);
  const allMaterials = useMaterialsStore((s) => s.materials);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);

  const [viewingMaterial, setViewingMaterial] =
    useState<LearningMaterial | null>(null);

  if (!homework) return notFound();

  const subject = subjects.find((s) => s.id === homework.subjectId);
  const grade = homework.gradeId
    ? grades.find((g) => g.id === homework.gradeId)
    : null;
  const classes = homework.classIds
    .map((cid) => allClasses.find((c) => c.id === cid))
    .filter(Boolean);
  const questions = homework.questionIds
    .map((qid) => allQuestions.find((q) => q.id === qid))
    .filter((q): q is NonNullable<typeof q> => !!q);
  const materials = homework.materialIds
    .map((mid) => allMaterials.find((m) => m.id === mid))
    .filter((m): m is LearningMaterial => !!m);

  return (
    <>
      <PageHeader
        title={homework.title}
        description={homework.description}
        actions={
          <div className="flex gap-2">
            <Link
              href="/admin/homework"
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2 text-[12px] font-medium hover:bg-accent/30"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Quay lại
            </Link>
            <Link
              href={`/admin/homework/${homework.id}/stats`}
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2 text-[12px] font-medium hover:bg-accent/30"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Thống kê
            </Link>
          </div>
        }
      />

      {/* Metadata strip */}
      <section className="mb-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          {subject && (
            <span
              className="rounded px-1.5 py-0.5 font-semibold"
              style={{
                backgroundColor: `${subject.color}1A`,
                color: subject.color,
              }}
            >
              {subject.name}
            </span>
          )}
          {grade && (
            <span className="rounded bg-foreground/8 px-1.5 py-0.5">
              {grade.name}
            </span>
          )}
          <span>
            📅 {homework.assignedAt} → {homework.dueAt}
          </span>
          <span>· {questions.length} câu</span>
          <span>· {classes.length} lớp giao</span>
          <span className="text-muted-foreground">· GV: {homework.ownerName}</span>
        </div>
        {classes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {classes.map((c) =>
              c ? (
                <span
                  key={c.id}
                  className="rounded bg-muted/40 px-1.5 py-0.5 text-[11.5px]"
                >
                  {c.name}
                </span>
              ) : null,
            )}
          </div>
        )}
      </section>

      {/* Materials */}
      {materials.length > 0 && (
        <section className="mb-4 rounded-xl border bg-card p-4">
          <p className="mb-2 inline-flex items-center gap-1 text-[12.5px] font-semibold">
            <Paperclip className="h-3.5 w-3.5" />
            Học liệu đính kèm
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {materials.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setViewingMaterial(m)}
                  className="flex w-full items-start gap-2 rounded-md border bg-card p-2 text-left hover:bg-accent/30"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-[12.5px] font-medium">
                      {m.title}
                    </p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {m.fileType}
                      {m.sourceType === "link" ? " · liên kết" : ""}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Question preview */}
      <section className="rounded-xl border bg-card">
        <p className="border-b px-4 py-3 text-section-title">
          Danh sách câu hỏi ({questions.length})
        </p>
        <ol className="divide-y">
          {questions.map((q, idx) => (
            <li key={q.id} className="px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <span className="font-mono">{q.id}</span>
                <span>· {q.type}</span>
                <span>· {q.difficulty}</span>
              </div>
              <div className="text-[13px]">
                <span className="mr-1 font-semibold">Câu {idx + 1}:</span>
                <RenderedContent content={q.content} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <MaterialViewerDialog
        material={viewingMaterial}
        onClose={() => setViewingMaterial(null)}
      />
    </>
  );
}
