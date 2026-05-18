"use client";

import {
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Package2,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { DifficultyPills } from "@/features/exams/components/difficulty-pills";
import type { ExamPackage } from "@/features/exams/data/types";
import {
  countBlueprintByDifficulty,
  indexQuestions,
} from "@/features/exams/lib/blueprint-stats";
import { useBlueprintsStore } from "@/features/exams/state/blueprints-store";
import { usePackagesStore } from "@/features/exams/state/packages-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { QuestionCard } from "@/features/question-bank/components/question-card";
import {
  QUESTION_TYPES,
  type QuestionType,
} from "@/features/question-bank/data/question-types";
import type { Question } from "@/features/question-bank/data/seed-questions";
import { ViewQuestionDialog } from "@/features/question-bank/dialogs/view-question-dialog";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { PageHeader } from "@/features/shell/components/page-header";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Mode = "pending" | "approved" | "rejected";
type Kind = "questions" | "packages";

export default function ApprovalsPage() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const grades = useGradesStore((s) => s.grades);
  const subjects = useSubjectsStore((s) => s.subjects);
  const questions = useQuestionsStore((s) => s.questions);
  const setStatus = useQuestionsStore((s) => s.setStatus);

  const [kind, setKind] = useState<Kind>("questions");
  const [mode, setMode] = useState<Mode>("pending");
  const [viewing, setViewing] = useState<Question | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Question | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");

  // Scope: superadmin sees the active campus's queue; everyone else their own campus
  const scoped = useMemo(() => {
    if (!session) return [];
    return questions.filter((q) => {
      if (q.kho !== "campus") return false;
      if (session.role === "superadmin") {
        return activeCampusId ? q.campusId === activeCampusId : true;
      }
      return q.campusId === session.campusId;
    });
  }, [questions, session, activeCampusId]);

  const kpis = useMemo(() => {
    return {
      pending: scoped.filter((q) => q.status === "pending").length,
      approved: scoped.filter((q) => q.status === "approved").length,
      rejected: scoped.filter((q) => q.status === "rejected").length,
    };
  }, [scoped]);

  const filtered = useMemo(() => {
    return scoped.filter((q) => {
      if (q.status !== mode) return false;
      if (typeFilter !== "all" && q.type !== typeFilter) return false;
      if (subjectFilter !== "all" && q.subjectId !== subjectFilter) return false;
      if (gradeFilter !== "all" && q.gradeId !== gradeFilter) return false;
      if (search.trim()) {
        const t = search.trim().toLowerCase();
        if (!q.content.toLowerCase().includes(t) && !q.id.toLowerCase().includes(t))
          return false;
      }
      return true;
    });
  }, [scoped, mode, typeFilter, subjectFilter, gradeFilter, search]);

  function approve(q: Question) {
    setStatus(q.id, "approved", session?.userId);
  }
  function openReject(q: Question) {
    setRejectTarget(q);
  }
  function confirmReject(note: string) {
    if (!rejectTarget) return;
    setStatus(rejectTarget.id, "rejected", session?.userId, note);
    setRejectTarget(null);
  }
  function revertToPending(q: Question) {
    setStatus(q.id, "pending", session?.userId);
  }

  const canApprove =
    !!session &&
    (session.role === "subject-lead" ||
      session.role === "campus-admin" ||
      session.role === "academic-director" ||
      session.role === "superadmin");

  return (
    <>
      <PageHeader
        title={
          kind === "packages" ? "Phê duyệt gói đề" : "Phê duyệt câu hỏi"
        }
        description={
          kind === "packages"
            ? "Duyệt từng gói đề (ma trận câu hỏi) trước khi bốc vào ca thi. Mọi gói đề mới hoặc đã chỉnh sửa đều phải qua bước này."
            : "Duyệt câu hỏi do giáo viên gửi vào kho trường. Chỉ TBM / Admin campus / Giám đốc Học thuật / Superadmin có quyền."
        }
      />

      {/* Kind switcher: Câu hỏi vs Gói đề */}
      <div className="mb-4 inline-flex rounded-xl border bg-card p-1">
        <KindTab
          active={kind === "questions"}
          onClick={() => {
            setKind("questions");
            setMode("pending");
          }}
          icon={FileText}
          label="Câu hỏi"
        />
        <KindTab
          active={kind === "packages"}
          onClick={() => {
            setKind("packages");
            setMode("pending");
          }}
          icon={Package2}
          label="Gói đề"
        />
      </div>

      {kind === "packages" && (
        <PackageApprovalsSection canApprove={canApprove} />
      )}

      {kind === "questions" && (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard
          label="Chờ duyệt"
          value={kpis.pending.toLocaleString("vi-VN")}
          icon={Clock}
          tone="orange"
        />
        <KpiCard
          label="Đã duyệt"
          value={kpis.approved.toLocaleString("vi-VN")}
          icon={CheckCircle2}
          tone="green"
        />
        <KpiCard
          label="Từ chối"
          value={kpis.rejected.toLocaleString("vi-VN")}
          icon={XCircle}
          tone="red"
        />
      </div>

      {/* Tabs */}
      <div className="mt-5 inline-flex rounded-lg border bg-surface-2 p-1">
        {(["pending", "approved", "rejected"] as const).map((m) => {
          const label =
            m === "pending" ? "Chờ duyệt" : m === "approved" ? "Đã duyệt" : "Từ chối";
          const count = kpis[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium transition-colors",
                mode === m
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  mode === m ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo nội dung hoặc ID…"
          className="h-9 max-w-xs"
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as QuestionType | "all")}
          className="h-9"
        >
          <option value="all">Tất cả dạng</option>
          {QUESTION_TYPES.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </Select>
        <Select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="h-9"
        >
          <option value="all">Tất cả môn</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="h-9"
        >
          <option value="all">Tất cả khối</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Card list */}
      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
          <p className="text-section-title">
            {mode === "pending"
              ? "Không có câu hỏi nào chờ duyệt"
              : mode === "approved"
                ? "Chưa có câu hỏi nào được duyệt"
                : "Chưa có câu hỏi nào bị từ chối"}
          </p>
          <p className="text-meta mt-1.5">
            {mode === "pending"
              ? "Giáo viên gửi câu hỏi vào kho trường, hệ thống sẽ hiện ở đây."
              : "Câu hỏi sau khi xử lý sẽ chuyển sang tab tương ứng."}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3">
          {filtered.map((q, idx) => (
            <div key={q.id} className="space-y-2">
              <QuestionCard
                question={q}
                index={idx}
                onView={() => setViewing(q)}
                onEdit={() => setViewing(q)}
                onDelete={() => setViewing(q)}
              />
              <div className="flex items-center justify-end gap-2 rounded-lg border bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <Button size="sm" variant="outline" onClick={() => setViewing(q)}>
                  <Eye className="h-3.5 w-3.5" />
                  Xem chi tiết
                </Button>
                {mode === "pending" && canApprove && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openReject(q)}
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      Từ chối
                    </Button>
                    <Button size="sm" onClick={() => approve(q)}>
                      <ThumbsUp className="h-3.5 w-3.5" />
                      Duyệt
                    </Button>
                  </>
                )}
                {mode === "rejected" && canApprove && (
                  <Button size="sm" variant="outline" onClick={() => revertToPending(q)}>
                    Trả lại chờ duyệt
                  </Button>
                )}
                {mode === "approved" && canApprove && (
                  <Button size="sm" variant="outline" onClick={() => revertToPending(q)}>
                    Huỷ duyệt
                  </Button>
                )}
              </div>

              {q.status === "rejected" && q.rejectionNote && (
                <div className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-[12px] text-destructive-text">
                  <span className="font-semibold">Lý do từ chối: </span>
                  {q.rejectionNote}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      </>
      )}

      <ViewQuestionDialog question={viewing} onClose={() => setViewing(null)} />

      <RejectDialog
        target={rejectTarget}
        onCancel={() => setRejectTarget(null)}
        onConfirm={confirmReject}
      />
    </>
  );
}

function KindTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick(): void;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-foreground/65 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.85} />
      {label}
    </button>
  );
}

/* ───────── Package approvals ───────── */

function PackageApprovalsSection({ canApprove }: { canApprove: boolean }) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const packages = usePackagesStore((s) => s.packages);
  const setPackageStatus = usePackagesStore((s) => s.setStatus);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);

  const [mode, setMode] = useState<Mode>("pending");
  const [rejectTarget, setRejectTarget] = useState<ExamPackage | null>(null);
  const [search, setSearch] = useState("");

  // Scope: packages whose blueprint sits in the current campus.
  const scoped = useMemo(() => {
    if (!session) return [];
    const campusScope =
      session.role === "superadmin" ? activeCampusId : session.campusId ?? null;
    return packages.filter((p) => {
      const bp = blueprints.find((b) => b.id === p.blueprintId);
      if (!bp) return false;
      if (campusScope) return bp.campusId === campusScope;
      return true;
    });
  }, [packages, blueprints, session, activeCampusId]);

  const kpis = useMemo(() => {
    return {
      pending: scoped.filter((p) => p.status === "pending").length,
      approved: scoped.filter((p) => p.status === "approved").length,
      rejected: scoped.filter((p) => p.status === "rejected").length,
    };
  }, [scoped]);

  const filtered = useMemo(() => {
    return scoped.filter((p) => {
      if (p.status !== mode) return false;
      if (search.trim()) {
        const t = search.trim().toLowerCase();
        if (
          !p.name.toLowerCase().includes(t) &&
          !p.id.toLowerCase().includes(t) &&
          !p.ownerName.toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });
  }, [scoped, mode, search]);

  const questionsIndex = useMemo(
    () => indexQuestions(allQuestions),
    [allQuestions],
  );

  function approve(p: ExamPackage) {
    setPackageStatus(p.id, "approved", session?.userId);
  }
  function revertToPending(p: ExamPackage) {
    setPackageStatus(p.id, "pending", session?.userId);
  }
  function confirmReject(note: string) {
    if (!rejectTarget) return;
    setPackageStatus(rejectTarget.id, "rejected", session?.userId, note);
    setRejectTarget(null);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard
          label="Gói đề chờ duyệt"
          value={kpis.pending.toLocaleString("vi-VN")}
          icon={Clock}
          tone="orange"
        />
        <KpiCard
          label="Đã duyệt"
          value={kpis.approved.toLocaleString("vi-VN")}
          icon={CheckCircle2}
          tone="green"
        />
        <KpiCard
          label="Từ chối"
          value={kpis.rejected.toLocaleString("vi-VN")}
          icon={XCircle}
          tone="red"
        />
      </div>

      <div className="mt-5 inline-flex rounded-lg border bg-surface-2 p-1">
        {(["pending", "approved", "rejected"] as const).map((m) => {
          const label =
            m === "pending" ? "Chờ duyệt" : m === "approved" ? "Đã duyệt" : "Từ chối";
          const count = kpis[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium transition-colors",
                mode === m
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  mode === m
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên gói, mã hoặc tác giả…"
          className="h-9 max-w-md"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
          <p className="text-section-title">
            {mode === "pending"
              ? "Không có gói đề nào chờ duyệt"
              : mode === "approved"
                ? "Chưa có gói đề nào được duyệt"
                : "Chưa có gói đề nào bị từ chối"}
          </p>
          <p className="text-meta mt-1.5">
            {mode === "pending"
              ? "Khi giáo viên tạo gói đề, hệ thống sẽ hiện ở đây để Admin xét duyệt."
              : "Gói đề sau khi xử lý sẽ chuyển sang tab tương ứng."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((p) => {
            const bp = blueprints.find((b) => b.id === p.blueprintId);
            const subject = bp
              ? subjects.find((s) => s.id === bp.subjectId)
              : null;
            const grade = bp ? grades.find((g) => g.id === bp.gradeId) : null;
            const perExam = p.matrix.reduce(
              (s, r) => s + r.easyCount + r.mediumCount + r.hardCount,
              0,
            );
            const bpTotals = bp
              ? countBlueprintByDifficulty(bp, questionsIndex)
              : { easy: 0, medium: 0, hard: 0 };
            return (
              <li key={p.id}>
                <article className="overflow-hidden rounded-xl border bg-surface">
                  <header className="flex flex-wrap items-center gap-2 border-b bg-[var(--color-surface-2)] px-4 py-2.5">
                    <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/65">
                      {p.id}
                    </span>
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
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      ⏱ {p.duration}p · {perExam} câu/đề
                    </span>
                  </header>
                  <div className="space-y-2.5 px-4 py-3">
                    <p className="text-[15px] font-semibold text-foreground">
                      {p.name}
                    </p>
                    {bp && (
                      <p className="text-[12px] text-muted-foreground">
                        Khung đề:{" "}
                        <span className="font-semibold text-foreground/85">
                          {bp.name}
                        </span>
                      </p>
                    )}
                    <DifficultyPills counts={bpTotals} />
                    <p className="text-[11px] text-muted-foreground">
                      Tác giả:{" "}
                      <span className="font-semibold text-foreground/85">
                        {p.ownerName}
                      </span>
                    </p>
                    {p.status === "rejected" && p.rejectionNote && (
                      <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[12px] text-rose-700">
                        <span className="font-semibold">Lý do từ chối:</span>{" "}
                        {p.rejectionNote}
                      </p>
                    )}
                  </div>
                  <footer className="flex items-center justify-end gap-2 border-t bg-[var(--color-surface-2)] px-3 py-2">
                    {mode === "pending" && canApprove && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectTarget(p)}
                          className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          Từ chối
                        </Button>
                        <Button size="sm" onClick={() => approve(p)}>
                          <ThumbsUp className="h-3.5 w-3.5" />
                          Duyệt
                        </Button>
                      </>
                    )}
                    {mode === "approved" && canApprove && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revertToPending(p)}
                      >
                        Huỷ duyệt
                      </Button>
                    )}
                    {mode === "rejected" && canApprove && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revertToPending(p)}
                      >
                        Trả lại chờ duyệt
                      </Button>
                    )}
                  </footer>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <PackageRejectDialog
        target={rejectTarget}
        onCancel={() => setRejectTarget(null)}
        onConfirm={confirmReject}
      />
    </>
  );
}

function PackageRejectDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: ExamPackage | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md p-0" srTitle="Từ chối gói đề">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
            <ThumbsDown className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-title">Từ chối gói đề?</h2>
            <p className="text-meta mt-0.5">
              {target?.id} · giáo viên sẽ thấy lý do và có thể chỉnh sửa rồi
              gửi lại.
            </p>
          </div>
        </header>

        <div className="space-y-2 px-6 py-5">
          <Label className="text-[13px] font-medium text-foreground/80">
            Lý do từ chối <span className="text-destructive">*</span>
          </Label>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="vd: Ma trận không cân, NB quá ít so với VDC; cần thêm câu Vận dụng."
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={onCancel}>
            Huỷ
          </Button>
          <Button
            onClick={() => {
              onConfirm(note.trim() || "Không có lý do cụ thể");
              setNote("");
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            <ThumbsDown className="h-4 w-4" />
            Xác nhận từ chối
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: Question | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md p-0" srTitle="Từ chối câu hỏi">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
            <ThumbsDown className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-title">Từ chối câu hỏi?</h2>
            <p className="text-meta mt-0.5">
              {target?.id} · giáo viên sẽ thấy lý do và có thể chỉnh sửa rồi gửi lại.
            </p>
          </div>
        </header>

        <div className="space-y-2 px-6 py-5">
          <Label className="text-[13px] font-medium text-foreground/80">
            Lý do từ chối <span className="text-destructive">*</span>
          </Label>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="vd: Đề bài sai logic, đáp án không khớp; cần xem lại bước 3."
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={onCancel}>
            Huỷ
          </Button>
          <Button
            onClick={() => {
              onConfirm(note.trim() || "Không có lý do cụ thể");
              setNote("");
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            <ThumbsDown className="h-4 w-4" />
            Xác nhận từ chối
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
