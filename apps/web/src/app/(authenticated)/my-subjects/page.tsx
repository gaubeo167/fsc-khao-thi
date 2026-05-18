"use client";

import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Library,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useUserScope } from "@/features/auth/lib/use-scope";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { useTeachingStore } from "@/features/teaching/state/teaching-store";
import { cn } from "@/lib/utils";

export default function MySubjectsPage() {
  const session = useAuthStore((s) => s.session);
  const users = useUsersStore((s) => s.users);
  const allSubjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const classes = useGradesStore((s) => s.classes);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const packages = usePackagesStore((s) => s.packages);
  const assignments = useTeachingStore((s) => s.assignments);
  const scope = useUserScope();

  const mySubjects = useMemo(() => {
    if (!session) return [];
    if (scope.isUnscoped) return allSubjects.filter((s) => s.status === "active");
    if (!scope.allowedSubjectIds) return [];
    return allSubjects.filter(
      (s) => scope.allowedSubjectIds!.has(s.id) && s.status === "active",
    );
  }, [session, scope, allSubjects]);

  const myGrades = useMemo(() => {
    if (!session) return grades;
    if (scope.isUnscoped) return grades;
    if (!scope.allowedGradeIds) return grades; // null = all grades within subject
    return grades.filter((g) => scope.allowedGradeIds!.has(g.id));
  }, [session, scope, grades]);

  if (!session) return null;
  if (!["teacher", "subject-lead"].includes(session.role)) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Trang này dành cho giáo viên / TBM. Admin xem trang "Môn học" để
        quản lý toàn bộ.
      </div>
    );
  }

  // Resolve per-subject stats relevant to the teacher.
  function statsFor(subjectId: string) {
    const ownQuestions = allQuestions.filter(
      (q) =>
        q.subjectId === subjectId &&
        q.ownerId === session!.userId,
    );
    const approvedOwn = ownQuestions.filter((q) => q.status === "approved").length;
    const pendingOwn = ownQuestions.filter((q) => q.status === "pending").length;
    const myBp = blueprints.filter(
      (b) =>
        b.subjectId === subjectId &&
        b.ownerId === session!.userId,
    );
    const myPkg = packages.filter((p) => {
      const bp = blueprints.find((b) => b.id === p.blueprintId);
      return bp?.subjectId === subjectId && p.ownerId === session!.userId;
    });
    const taughtClassIds = new Set(
      assignments
        .filter(
          (a) =>
            a.teacherId === session!.userId &&
            a.subjectId === subjectId,
        )
        .map((a) => a.classId),
    );
    const taughtClasses = classes.filter((c) => taughtClassIds.has(c.id));
    return {
      ownTotal: ownQuestions.length,
      approvedOwn,
      pendingOwn,
      blueprintCount: myBp.length,
      packageCount: myPkg.length,
      taughtClassCount: taughtClasses.length,
    };
  }

  return (
    <>
      <PageHeader
        title="Môn của tôi"
        description="Các môn học bạn được phân công giảng dạy. Bấm 1 môn để vào kho câu hỏi / khung đề tương ứng."
      />

      {/* Scope summary banner */}
      <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">Phạm vi giảng dạy</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              <b>{mySubjects.length}</b> môn × <b>{myGrades.length}</b> khối —
              bạn chỉ được tạo câu hỏi / khung đề / ca thi cho phạm vi này.
              Để mở rộng, liên hệ Admin campus.
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {mySubjects.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold"
                  style={{ color: s.color, borderColor: `${s.color}30` }}
                >
                  {s.code ?? s.name.slice(0, 3).toUpperCase()} · {s.name}
                </span>
              ))}
              {mySubjects.length === 0 && (
                <span className="text-[11.5px] text-rose-700">
                  ⚠ Chưa được giao môn nào
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="text-[10.5px] text-muted-foreground">Khối:</span>
              {myGrades.map((g) => (
                <span
                  key={g.id}
                  className="rounded bg-muted px-1.5 py-0 text-[10.5px] font-semibold text-foreground/75"
                >
                  {g.code}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {mySubjects.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-[14px] font-semibold">
            Bạn chưa được giao môn nào
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Admin campus sẽ phân công môn dạy cho bạn ở mục Quản lý người dùng.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mySubjects.map((subject) => {
            const stats = statsFor(subject.id);
            return (
              <li key={subject.id}>
                <article
                  className="overflow-hidden rounded-xl border bg-card transition hover:shadow-md"
                  style={{ borderTop: `4px solid ${subject.color}` }}
                >
                  <header className="border-b px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-[12px] font-bold tracking-wide"
                        style={{
                          backgroundColor: `${subject.color}15`,
                          color: subject.color,
                        }}
                      >
                        {subject.code ?? subject.name.slice(0, 3).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold">
                          {subject.name}
                        </p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {stats.taughtClassCount} lớp đang dạy
                        </p>
                      </div>
                    </div>
                  </header>

                  <div className="space-y-2 px-4 py-3 text-[12px]">
                    <StatRow
                      icon={<Library className="h-3.5 w-3.5 text-blue-600" />}
                      label="Câu hỏi của tôi"
                      value={stats.ownTotal}
                      hint={`${stats.approvedOwn} duyệt · ${stats.pendingOwn} chờ duyệt`}
                    />
                    <StatRow
                      icon={<FileText className="h-3.5 w-3.5 text-violet-600" />}
                      label="Khung đề / Gói đề"
                      value={`${stats.blueprintCount}/${stats.packageCount}`}
                      hint="khung / gói tôi tạo"
                    />
                    <StatRow
                      icon={
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      }
                      label="Khối được dạy"
                      value={myGrades.length}
                      hint="cho môn này"
                    />
                  </div>

                  <footer className="grid grid-cols-2 gap-px border-t bg-muted">
                    <Link
                      href={`/admin/question-bank?subject=${subject.id}`}
                      className="bg-card px-3 py-2 text-center text-[11.5px] font-semibold text-blue-700 transition hover:bg-blue-50"
                    >
                      <Library className="mr-1 inline h-3 w-3" />
                      Ngân hàng câu hỏi
                    </Link>
                    <Link
                      href={`/admin/exam-blueprints?subject=${subject.id}`}
                      className="bg-card px-3 py-2 text-center text-[11.5px] font-semibold text-violet-700 transition hover:bg-violet-50"
                    >
                      <FileText className="mr-1 inline h-3 w-3" />
                      Quản lý đề
                    </Link>
                  </footer>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {/* Quick links to related teacher tools */}
      <div className="mt-6 rounded-xl border bg-card p-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-foreground/65">
          Liên kết nhanh
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          <Link
            href="/my-classes"
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-[12.5px] font-medium transition hover:bg-accent/20"
          >
            <GraduationCap className="h-4 w-4 text-emerald-600" />
            Lớp của tôi
            <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground" />
          </Link>
          <Link
            href="/grading"
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-[12.5px] font-medium transition hover:bg-accent/20"
          >
            <FileText className="h-4 w-4 text-violet-600" />
            Chấm tự luận
            <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground" />
          </Link>
          <Link
            href="/reports"
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-[12.5px] font-medium transition hover:bg-accent/20"
          >
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            Kết quả & Báo cáo
            <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground" />
          </Link>
        </ul>
      </div>
    </>
  );
}

function StatRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/40">
        {icon}
      </span>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto inline-flex items-center gap-1">
        <span className="font-semibold">{value}</span>
        {hint && (
          <span className="text-[10.5px] text-muted-foreground">({hint})</span>
        )}
      </span>
    </div>
  );
}
