"use client";

import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormWatch,
} from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import {
  filterGradesByScope,
  filterSubjectsByScope,
  useUserScope,
} from "@/features/auth/lib/use-scope";
import { findCampus } from "@/features/campus/data/seed-campuses";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

interface Props {
  register: UseFormRegister<any>;
  control: Control<any>;
  errors: FieldErrors<any>;
  watch: UseFormWatch<any>;
}

/**
 * Shared meta-fields used by every question type form:
 * subject · grade · difficulty · kho (personal/campus) selector.
 *
 * Teachers are LOCKED to the subjects/grades they're assigned via
 * `user.subjectIds` / `user.gradeIds`. Admin-class roles (campus-admin,
 * academic-director, superadmin) see the full list.
 */
export function SharedMetaFields({ register, errors, watch }: Props) {
  const session = useAuthStore((s) => s.session);
  const grades = useGradesStore((s) => s.grades);
  const subjects = useSubjectsStore((s) => s.subjects);
  const kho = watch("kho") as "personal" | "campus";
  const scope = useUserScope();

  const allowedSubjects = filterSubjectsByScope(subjects, scope);
  const allowedGrades = filterGradesByScope(grades, scope);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Scope debug banner — surfaces the resolved permission scope so
          users (and admins helping users) can self-diagnose when the
          dropdowns look wrong. */}
      {session && (
        <div
          className={cn(
            "col-span-full rounded-md border px-3 py-2 text-[11.5px]",
            scope.isUnscoped
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : scope.hasScope
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900",
          )}
        >
          <b>🔐 Phạm vi của bạn ({session.role}):</b>{" "}
          {scope.isUnscoped ? (
            <span>Toàn campus — không giới hạn môn/khối.</span>
          ) : scope.hasScope ? (
            <span>
              {allowedSubjects.length} môn (
              {allowedSubjects.map((s) => s.name).join(", ")}) ·{" "}
              {scope.allowedGradeIds
                ? `${allowedGrades.length} khối (${allowedGrades.map((g) => g.code).join(", ")})`
                : "tất cả khối trong môn"}
            </span>
          ) : (
            <span>
              <b>Chưa được giao môn nào.</b> Liên hệ Admin campus → /admin/users
              → mở user của bạn → tick "Môn dạy" để được tạo câu hỏi.
            </span>
          )}
        </div>
      )}
      {!scope.isUnscoped && !scope.hasScope && (
        <div className="col-span-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          ⚠ Bạn chưa được giao môn nào — không thể tạo câu hỏi. Liên hệ Admin
          campus để được cấp quyền môn / khối.
        </div>
      )}
      <Field label="Môn học" required error={errors.subjectId?.message as string}>
        <Select {...register("subjectId")}>
          <option value="">— Chọn môn —</option>
          {allowedSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {!scope.isUnscoped && (
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            🔒 Giới hạn theo phân công: {allowedSubjects.length} môn được phép.
          </p>
        )}
      </Field>

      <Field label="Khối" required error={errors.gradeId?.message as string}>
        <Select {...register("gradeId")}>
          <option value="">— Chọn khối —</option>
          {allowedGrades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        {!scope.isUnscoped && scope.allowedGradeIds && (
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            🔒 Giới hạn theo phân công: {allowedGrades.length} khối được phép.
          </p>
        )}
      </Field>

      <Field label="Độ khó" error={errors.difficulty?.message as string}>
        <Select {...register("difficulty")}>
          <option value="easy">Dễ</option>
          <option value="medium">Trung bình</option>
          <option value="hard">Khó</option>
        </Select>
      </Field>

      <Field label="Lưu vào kho" required hint="Kho cá nhân không cần duyệt. Kho campus cần TBM hoặc Admin campus duyệt.">
        <div className="grid grid-cols-2 gap-2">
          <KhoCard
            register={register}
            value="personal"
            active={kho === "personal"}
            label="Kho cá nhân"
            hint="Tự động duyệt"
          />
          <KhoCard
            register={register}
            value="campus"
            active={kho === "campus"}
            label="Kho campus"
            hint={
              session?.role === "campus-admin" || session?.role === "subject-lead" || session?.role === "superadmin"
                ? "Cần TBM/Admin duyệt"
                : `Sẽ chờ duyệt · ${findCampus(session?.campusId)?.name ?? ""}`
            }
          />
        </div>
        {/* The hidden campusId is set on submit based on session — keep registered for RHF */}
        <input type="hidden" {...register("campusId")} />
      </Field>
    </div>
  );
}

function KhoCard({
  register,
  value,
  active,
  label,
  hint,
}: {
  register: UseFormRegister<any>;
  value: "personal" | "campus";
  active: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        active ? "border-primary bg-primary/8" : "border-border bg-card hover:bg-accent",
      )}
    >
      <input
        type="radio"
        value={value}
        {...register("kho")}
        className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
      />
      <div className="leading-tight">
        <p className={cn("text-[13px] font-medium", active ? "text-primary" : "text-foreground/85")}>
          {label}
        </p>
        <p className="text-meta mt-0.5">{hint}</p>
      </div>
    </label>
  );
}

function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 [&:has(>[type=hidden])]:col-span-2">
      <Label className="text-[13px] font-medium text-foreground/80">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[12px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-meta">{hint}</p>
      ) : null}
    </div>
  );
}
