"use client";

import { zodResolverSafe } from "@/lib/zod-resolver";
import { Check, School as SchoolIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUsersStore } from "@/features/admin/users/users-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { TeachingAssignmentsEditor } from "@/features/teaching/components/teaching-assignments-editor";
import type { SchoolClass } from "../data/seed-grades";
import { ClassSchema, type ClassValues } from "../schemas";
import { useGradesStore } from "../state/grades-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: SchoolClass | null;
  /** Pre-select grade when "Thêm lớp" is clicked from a grade row. */
  presetGradeId?: string | null;
}

export function ClassDialog({ open, onOpenChange, editing, presetGradeId }: Props) {
  const session = useAuthStore((s) => s.session);
  const campuses = useCampusesStore((s) => s.campuses);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const isSuperadmin = session?.role === "superadmin";
  const lockedCampus = isSuperadmin
    ? null
    : campuses.find((c) => c.id === session?.campusId) ?? null;
  // When superadmin pinned a campus via the top-nav selector, default the
  // form's campus to it. Still overridable via dropdown since superadmin can
  // legitimately switch mid-flow.
  const defaultCampusId =
    lockedCampus?.id ?? (isSuperadmin && activeCampusId ? activeCampusId : "");

  const grades = useGradesStore((s) => s.grades);
  const createClass = useGradesStore((s) => s.createClass);
  const updateClass = useGradesStore((s) => s.updateClass);
  const users = useUsersStore((s) => s.users);

  const form = useForm<ClassValues>({
    resolver: zodResolverSafe(ClassSchema),
    defaultValues: {
      gradeId: "",
      code: "",
      name: "",
      homeroomTeacher: "",
      homeroomTeacherId: null,
      studentCount: 0,
      campusId: "",
      status: "active",
    },
    mode: "onBlur",
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? {
            gradeId: editing.gradeId,
            code: editing.code,
            name: editing.name,
            homeroomTeacher: editing.homeroomTeacher,
            homeroomTeacherId: editing.homeroomTeacherId ?? null,
            studentCount: editing.studentCount,
            campusId: editing.campusId,
            status: editing.status,
          }
        : {
            gradeId: presetGradeId ?? "",
            code: "",
            name: "",
            homeroomTeacher: "",
            homeroomTeacherId: null,
            studentCount: 0,
            campusId: defaultCampusId,
            status: "active",
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  function onSubmit(values: ClassValues) {
    // Resolve homeroomTeacher display label from the picked teacher id so
    // older code paths reading the free-text field still show a real name.
    const picked = values.homeroomTeacherId
      ? users.find((u) => u.id === values.homeroomTeacherId)
      : null;
    const payload: ClassValues = {
      ...values,
      homeroomTeacher: picked?.name ?? values.homeroomTeacher ?? "",
    };
    if (editing) {
      updateClass(editing.id, payload);
    } else {
      createClass(payload);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl p-0"
        srTitle={editing ? "Chỉnh sửa lớp" : "Thêm lớp mới"}
      >
        <header className="flex items-start gap-3 border-b px-6 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-200">
            <SchoolIcon className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">
              {editing ? "Chỉnh sửa lớp" : "Thêm lớp mới"}
            </h2>
            <p className="text-meta mt-0.5">
              {editing ? `Cập nhật thông tin ${editing.name}.` : "Lớp thuộc về một khối và campus cụ thể."}
            </p>
          </div>
        </header>

        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <Field label="Campus" error={form.formState.errors.campusId?.message}>
            {lockedCampus ? (
              <>
                <input type="hidden" {...form.register("campusId")} value={lockedCampus.id} />
                <Input value={lockedCampus.name} disabled />
              </>
            ) : (
              <Select {...form.register("campusId")}>
                <option value="">— Chọn campus —</option>
                {campuses
                  .filter((c) => c.status === "active")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>

          <Field label="Khối" error={form.formState.errors.gradeId?.message}>
            {(() => {
              const selectedCampusId = lockedCampus
                ? lockedCampus.id
                : form.watch("campusId");
              const selectedCampus = campuses.find(
                (c) => c.id === selectedCampusId,
              );
              const allowedGradeIds = selectedCampus
                ? new Set(selectedCampus.gradeIds)
                : null;
              const allowedGrades = allowedGradeIds
                ? grades.filter((g) => allowedGradeIds.has(g.id))
                : [];
              if (!selectedCampus) {
                return (
                  <Select disabled>
                    <option>— Chọn campus trước —</option>
                  </Select>
                );
              }
              return (
                <Select {...form.register("gradeId")}>
                  <option value="">— Chọn khối —</option>
                  {allowedGrades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              );
            })()}
          </Field>

          <Field label="Mã lớp" error={form.formState.errors.code?.message}>
            <Input placeholder="vd: 10A1" {...form.register("code")} />
          </Field>

          <Field label="Tên lớp" error={form.formState.errors.name?.message}>
            <Input placeholder="vd: Lớp 10A1" {...form.register("name")} />
          </Field>

          <Field
            label="Giáo viên chủ nhiệm"
            error={form.formState.errors.homeroomTeacherId?.message}
            className="sm:col-span-2"
          >
            {(() => {
              const selectedCampusId = lockedCampus
                ? lockedCampus.id
                : form.watch("campusId");
              const teachers = users
                .filter(
                  (u) =>
                    u.campusId === selectedCampusId &&
                    u.status === "active" &&
                    (u.role === "teacher" ||
                      u.role === "subject-lead" ||
                      u.role === "campus-admin"),
                )
                .sort((a, b) => a.name.localeCompare(b.name, "vi"));
              if (!selectedCampusId) {
                return (
                  <Select disabled>
                    <option>— Chọn campus trước —</option>
                  </Select>
                );
              }
              if (teachers.length === 0) {
                return (
                  <Select disabled>
                    <option>
                      Chưa có giáo viên trong campus này — tạo tài khoản
                      giáo viên ở trang Người dùng
                    </option>
                  </Select>
                );
              }
              return (
                <Select
                  value={form.watch("homeroomTeacherId") ?? ""}
                  onChange={(e) =>
                    form.setValue(
                      "homeroomTeacherId",
                      e.target.value || null,
                      { shouldDirty: true },
                    )
                  }
                >
                  <option value="">— Chưa phân công —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.subject ? ` — ${t.subject}` : ""}
                    </option>
                  ))}
                </Select>
              );
            })()}
          </Field>

          <Field label="Sĩ số (tự tính)">
            <Input
              value="Tự tính theo số HS thực tế"
              disabled
              className="bg-muted/40 text-muted-foreground"
            />
            <input type="hidden" {...form.register("studentCount")} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sĩ số lấy từ số tài khoản học sinh có className trùng mã lớp này.
              Thêm/xoá HS ở mục Quản lý người dùng.
            </p>
          </Field>

          <Field label="Trạng thái" error={form.formState.errors.status?.message}>
            <Select {...form.register("status")}>
              <option value="active">Đang hoạt động</option>
              <option value="archived">Đã lưu trữ</option>
            </Select>
          </Field>
        </form>

        {/* Teaching assignments — only when editing an existing class. */}
        {editing && (
          <div className="border-t bg-muted/20 px-6 py-4">
            <TeachingAssignmentsEditor
              classId={editing.id}
              campusId={editing.campusId}
              gradeId={editing.gradeId}
            />
          </div>
        )}
        {!editing && (
          <div className="border-t bg-muted/20 px-6 py-3 text-[12px] text-muted-foreground">
            Lưu lớp này trước, sau đó mở lại để{" "}
            <span className="font-semibold">phân công giảng dạy</span> môn
            theo từng giáo viên.
          </div>
        )}

        <footer className="flex items-center justify-between border-t bg-muted/20 px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="button" onClick={form.handleSubmit(onSubmit)}>
            <Check className="h-4 w-4" />
            {editing ? "Lưu thay đổi" : "Tạo lớp"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-[13px] font-medium text-foreground/80">{label}</Label>
      {children}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
