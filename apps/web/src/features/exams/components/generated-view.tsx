"use client";

/**
 * Danh sách "Đề đã sinh" gom theo gói đề — DÙNG CHUNG cho cả luồng khung đề
 * (/admin/exam-blueprints) và luồng YCCĐ (/admin/yccd-exam) để hai bên nhìn
 * y hệt nhau. Trước đây mỗi bên tự vẽ một kiểu.
 */

import { Eye, PlayCircle, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import type { useGradesStore } from "@/features/grades/state/grades-store";
import type { useSubjectsStore } from "@/features/subjects/state/subjects-store";

import type { ExamBlueprint, ExamPackage, GeneratedExam } from "../data/types";

function formatGenAt(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-10 text-center">
      <p className="text-section-title">{title}</p>
      <p className="text-small mt-1 text-muted-foreground">{description}</p>
    </div>
  );
}

export function GeneratedView({
  generated,
  packages,
  blueprints,
  subjects,
  grades,
  onView,
  onTrial,
  onDelete,
  onGenerateMore,
  emptyHint,
  generateMoreLabel = "Sinh thêm",
}: {
  generated: GeneratedExam[];
  packages: ExamPackage[];
  blueprints: ExamBlueprint[];
  subjects: ReturnType<typeof useSubjectsStore.getState>["subjects"];
  grades: ReturnType<typeof useGradesStore.getState>["grades"];
  onView(g: GeneratedExam): void;
  onTrial(g: GeneratedExam): void;
  onDelete(g: GeneratedExam): void;
  onGenerateMore(p: ExamPackage): void;
  /** Câu gợi ý khi rỗng — hai luồng sinh đề ở chỗ khác nhau. */
  emptyHint: string;
  /** Nhãn nút sinh thêm (YCCĐ mở wizard thay vì sinh tại chỗ). */
  generateMoreLabel?: string;
}) {
  if (generated.length === 0) {
    return <EmptyState title="Chưa có đề nào được sinh" description={emptyHint} />;
  }
  // Group by packageId, preserving generated order (newest first per package).
  const groups = new Map<string, GeneratedExam[]>();
  for (const g of generated) {
    const list = groups.get(g.packageId);
    if (list) list.push(g);
    else groups.set(g.packageId, [g]);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([packageId, exams]) => {
        const pkg = packages.find((p) => p.id === packageId);
        const bp = pkg ? blueprints.find((b) => b.id === pkg.blueprintId) : null;
        const subject = bp ? subjects.find((s) => s.id === bp.subjectId) : null;
        const grade = bp ? grades.find((g) => g.id === bp.gradeId) : null;
        const perExam = exams[0]?.questionIds.length ?? 0;
        return (
          <section
            key={packageId}
            className="overflow-hidden rounded-xl border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            {/* Group header (Gói đề meta + sinh thêm) */}
            <header className="flex flex-wrap items-center gap-3 border-b bg-blue-50/40 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  {subject && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: `${subject.color}1A`,
                        color: subject.color,
                      }}
                    >
                      {subject.name}
                    </span>
                  )}
                  {grade && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
                      {grade.code}
                    </span>
                  )}
                  <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/65">
                    {packageId}
                  </span>
                </div>
                <p className="text-[15px] font-semibold leading-snug text-foreground">
                  {pkg?.name ?? `Gói đề đã bị xoá (${packageId})`}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {perExam} câu/đề · {pkg?.duration ?? "?"} phút ·{" "}
                  {bp ? `Khung: ${bp.name}` : "Khung đề đã bị xoá"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold tabular-nums text-primary-text">
                  {exams.length} đề
                </span>
                {pkg && (
                  <Button size="sm" onClick={() => onGenerateMore(pkg)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {generateMoreLabel}
                  </Button>
                )}
              </div>
            </header>

            {/* Exam cards */}
            <ul className="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {exams.map((g, idx) => (
                <li
                  key={g.id}
                  className="overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)]"
                >
                  <div className="space-y-2 border-b bg-primary/8 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                        #{idx + 1}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                        {g.id}
                      </span>
                    </div>
                    <p className="text-[13px] font-semibold leading-snug text-foreground">
                      {g.name}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>📑 {g.questionIds.length} câu</span>
                      <span>· ⏱ {g.duration}p</span>
                      <span>· {formatGenAt(g.createdAt)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-2">
                    <Button
                      size="sm"
                      onClick={() => onTrial(g)}
                      className="flex-1"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Thi thử
                    </Button>
                    <IconButton
                      size="sm"
                      title="Xem chi tiết"
                      onClick={() => onView(g)}
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      variant="destructive"
                      title="Xoá đề"
                      onClick={() => onDelete(g)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
