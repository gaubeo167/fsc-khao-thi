"use client";

import { Pencil, Search, Trash2, UserCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import type { ExamShift } from "@/features/exam-shifts/data/types";
import { useGradingStore } from "@/features/grading/state/grading-store";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  shift: ExamShift;
  /** Count of essay/ai-generated questions in the shift — shown for context. */
  manualQuestionCount: number;
}

export function AssignGradersDialog({
  open,
  onOpenChange,
  shift,
  manualQuestionCount,
}: Props) {
  const session = useAuthStore((s) => s.session);
  const users = useUsersStore((s) => s.users);
  const assignments = useGradingStore((s) => s.assignments);
  const assignGrader = useGradingStore((s) => s.assignGrader);
  const unassignGrader = useGradingStore((s) => s.unassignGrader);

  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");

  // Eligible graders: teachers / subject-leads / campus-admins in the
  // same campus as the shift. Subject-lead and teacher are the typical
  // assignees; campus-admin is included so the admin can self-assign.
  const eligible = useMemo(() => {
    return users.filter(
      (u) =>
        u.status === "active" &&
        ["teacher", "subject-lead", "campus-admin", "academic-director"].includes(
          u.role,
        ) &&
        (shift.campusId == null || u.campusId === shift.campusId),
    );
  }, [users, shift.campusId]);

  const shiftAssignments = useMemo(
    () => assignments.filter((a) => a.shiftId === shift.id),
    [assignments, shift.id],
  );
  const assignedIds = new Set(shiftAssignments.map((a) => a.graderId));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligible.filter((u) => {
      if (assignedIds.has(u.id)) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.subject ?? "").toLowerCase().includes(q)
      );
    });
  }, [eligible, search, assignedIds]);

  function handleAdd(graderId: string, graderName: string) {
    if (!session) return;
    assignGrader({
      shiftId: shift.id,
      graderId,
      graderName,
      assignedBy: session.userId,
      assignedByName: session.name ?? "Admin",
      note: note.trim() || null,
    });
    setNote("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <header className="flex items-start gap-3 border-b px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <UserCheck className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-section-title">
              Phân công chấm — {shift.name}
            </DialogTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Gán giáo viên / TBM chấm các câu tự luận của ca thi. Mỗi câu sẽ
              được chấm theo rubric đã định nghĩa.
            </p>
            <p className="mt-1 inline-flex items-center gap-2 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              📝 {manualQuestionCount} câu cần chấm thủ công
            </p>
          </div>
        </header>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {/* Currently assigned */}
          <section>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Người chấm hiện tại ({shiftAssignments.length})
            </h3>
            {shiftAssignments.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                Chưa gán ai. Chọn giáo viên ở cột bên phải để bắt đầu.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {shiftAssignments.map((a) => {
                  const u = users.find((x) => x.id === a.graderId);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-800">
                        {a.graderName.charAt(0)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold">
                          {a.graderName}
                        </p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {u?.role ?? "—"}
                          {u?.subject ? ` · ${u.subject}` : ""}
                        </p>
                        {a.note && (
                          <p className="mt-0.5 truncate text-[10.5px] italic text-muted-foreground">
                            "{a.note}"
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => unassignGrader(a.id)}
                        title="Gỡ phân công"
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3">
              <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Ghi chú cho người chấm (tuỳ chọn)
              </label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="vd: Chấm xong trước thứ 6"
                className="mt-1 h-8 text-[12px]"
              />
            </div>
          </section>

          {/* Available graders */}
          <section>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Giáo viên khả dụng
            </h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên / môn dạy…"
                className="mb-2 h-8 pl-8 text-[12px]"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                {eligible.length === 0
                  ? "Campus chưa có giáo viên / TBM nào."
                  : "Không tìm thấy giáo viên khớp."}
              </p>
            ) : (
              <ul className="max-h-[300px] space-y-1 overflow-y-auto">
                {filtered.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold">
                        {u.name}
                      </p>
                      <p className="truncate text-[10.5px] text-muted-foreground">
                        {u.role}
                        {u.subject ? ` · ${u.subject}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdd(u.id, u.name)}
                      className="gap-1"
                    >
                      <Pencil className="h-3 w-3" />
                      Gán
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex justify-end border-t bg-[var(--color-surface-2)] px-5 py-3">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Đóng
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
