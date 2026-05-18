"use client";

import { Eye, PencilLine, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { IconButton } from "@/components/ui/icon-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

import { findQuestionType } from "../data/question-types";
import type { Question } from "../data/seed-questions";

interface Props {
  questions: Question[];
  onView: (q: Question) => void;
  onEdit: (q: Question) => void;
  onDelete: (q: Question) => void;
}

const STATUS_TONE: Record<Question["status"], { label: string; cls: string }> = {
  draft: { label: "Bản nháp", cls: "bg-muted text-muted-foreground" },
  pending: {
    label: "Chờ duyệt",
    cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  approved: {
    label: "Đã duyệt",
    cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  rejected: {
    label: "Từ chối",
    cls: "bg-red-50 text-red-700 ring-1 ring-red-200",
  },
};

const DIFFICULTY_TONE: Record<Question["difficulty"], { label: string; cls: string }> = {
  easy: { label: "Dễ", cls: "text-emerald-700 bg-emerald-50" },
  medium: { label: "TB", cls: "text-amber-700 bg-amber-50" },
  hard: { label: "Khó", cls: "text-red-700 bg-red-50" },
};

export function QuestionsTable({ questions, onView, onEdit, onDelete }: Props) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  // Pre-build lookup maps so each row is O(1) instead of O(subjects) +
  // O(grades) — turns the table from O(rows * (subjects + grades)) into
  // O(rows + subjects + grades), which is a big win for big banks.
  const subjectById = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  );
  const gradeById = useMemo(
    () => new Map(grades.map((g) => [g.id, g])),
    [grades],
  );

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p className="text-section-title">Chưa có câu hỏi nào.</p>
        <p className="text-small mt-1 text-muted-foreground">
          Thử thay đổi bộ lọc hoặc tạo câu hỏi mới.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Mã</TableHead>
            <TableHead className="min-w-[280px]">Nội dung câu hỏi</TableHead>
            <TableHead>Dạng</TableHead>
            <TableHead>Môn · Khối</TableHead>
            <TableHead>Độ khó</TableHead>
            <TableHead>Kho</TableHead>
            <TableHead>Người tạo</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => {
            const meta = findQuestionType(q.type);
            const subject = subjectById.get(q.subjectId);
            const grade = q.gradeId ? gradeById.get(q.gradeId) : undefined;
            const Icon = meta.icon;
            return (
              <TableRow key={q.id}>
                <TableCell>
                  <span className="font-mono text-[12px] text-foreground/75">{q.id}</span>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onView(q)}
                    className="text-left text-[13px] text-foreground/90 hover:text-primary"
                  >
                    <span className="line-clamp-1 max-w-[420px]">
                      {stripMarkdown(q.content)}
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: `${meta.color}1A`,
                      color: meta.color,
                    }}
                  >
                    <Icon className="h-3 w-3" strokeWidth={2} />
                    {meta.name}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {subject && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${subject.color}1A`,
                          color: subject.color,
                        }}
                      >
                        {subject.code}
                      </span>
                    )}
                    {grade && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70">
                        {grade.code}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold",
                      DIFFICULTY_TONE[q.difficulty].cls,
                    )}
                  >
                    {DIFFICULTY_TONE[q.difficulty].label}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      q.kho === "campus"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-muted text-foreground/70",
                    )}
                  >
                    {q.kho === "campus" ? "Campus" : "Cá nhân"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-[12px] text-foreground/85">{q.ownerName}</span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      STATUS_TONE[q.status].cls,
                    )}
                  >
                    <span aria-hidden className="h-1 w-1 rounded-full bg-current" />
                    {STATUS_TONE[q.status].label}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    <IconButton title="Xem chi tiết" onClick={() => onView(q)}>
                      <Eye className="h-4 w-4" strokeWidth={1.75} />
                    </IconButton>
                    <IconButton variant="primary" title="Chỉnh sửa" onClick={() => onEdit(q)}>
                      <PencilLine className="h-4 w-4" strokeWidth={1.75} />
                    </IconButton>
                    <IconButton variant="destructive" title="Xoá" onClick={() => onDelete(q)}>
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Trim markdown markers for the table preview row. */
function stripMarkdown(s: string): string {
  return s
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[ảnh]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[(video|audio):[^\]]+\]/g, "[$1]")
    .replace(/\s+/g, " ")
    .trim();
}
