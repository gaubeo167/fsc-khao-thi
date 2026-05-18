"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Role } from "@/features/auth/state/auth-store";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { ROLE_LABEL } from "@/features/admin/users/role-labels";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface FormValues {
  name: string;
  email: string;
  role: Role;
  campusId: string;
  subject?: string;
  className?: string;
  status?: "active" | "invited" | "suspended";
  password?: string;
}

interface Props {
  register: UseFormRegister<any>;
  errors: FieldErrors<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  /** Show the required password field on create mode. */
  withPassword?: boolean;
  /** Show an optional password change field on edit mode. */
  withOptionalPassword?: boolean;
  /** Hide the status field on create mode. */
  withStatus?: boolean;
}

const ASSIGNABLE_FOR_SUPERADMIN: Role[] = [
  "campus-admin",
  "subject-lead",
  "teacher",
  "student",
];

const ASSIGNABLE_FOR_CAMPUS_ADMIN: Role[] = ["subject-lead", "teacher", "student"];

export function UserFormFields({
  register,
  errors,
  watch,
  setValue,
  withPassword,
  withOptionalPassword,
  withStatus,
}: Props) {
  const session = useAuthStore((s) => s.session);
  const campuses = useCampusesStore((s) => s.campuses);
  const grades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);
  const allSubjects = useSubjectsStore((s) => s.subjects);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);

  const role = watch("role") as Role;
  const campusId = watch("campusId") as string | undefined;
  const className = watch("className") as string | undefined;
  const subjectIds = (watch("subjectIds") as string[] | undefined) ?? [];
  const gradeIds = (watch("gradeIds") as string[] | undefined) ?? [];

  const isSuperadmin = session?.role === "superadmin";
  const allowedRoles = isSuperadmin
    ? ASSIGNABLE_FOR_SUPERADMIN
    : ASSIGNABLE_FOR_CAMPUS_ADMIN;
  const lockedCampus = isSuperadmin
    ? null
    : campuses.find((c) => c.id === session?.campusId);

  // Single effect for campus auto-default — covers both staff (lockedCampus)
  // and superadmin-with-pinned-campus paths. Avoids two effects that could
  // both fire on the same render.
  useEffect(() => {
    if (lockedCampus) {
      if (campusId !== lockedCampus.id) {
        setValue("campusId", lockedCampus.id, { shouldValidate: false });
      }
      return;
    }
    if (isSuperadmin && activeCampusId && !campusId) {
      setValue("campusId", activeCampusId, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedCampus?.id, isSuperadmin, activeCampusId]);

  // The campus that's currently chosen — either the locked one (staff) or
  // whatever the superadmin selected from the dropdown.
  const selectedCampus = useMemo(
    () =>
      lockedCampus ??
      (campusId ? campuses.find((c) => c.id === campusId) ?? null : null),
    [lockedCampus, campusId, campuses],
  );

  // Cascading filter for students: Campus → Khối → Lớp. We keep the chosen
  // grade as local state because the saved value is just `className` — grade
  // is purely a filtering aid in the form UI.
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");

  // Available grades for the current campus. Sort by the numeric part of the
  // name so K1 → K2 → … → K12 (not lex order which would give K1, K10, K11, K12, K2…).
  const gradesForCampus = useMemo(() => {
    if (!selectedCampus) return [];
    const allowed = new Set(selectedCampus.gradeIds);
    return grades
      .filter((g) => allowed.has(g.id) && g.status === "active")
      .sort((a, b) =>
        a.name.localeCompare(b.name, "vi", { numeric: true, sensitivity: "base" }),
      );
  }, [selectedCampus, grades]);

  // When campus changes (in cross-campus mode) reset grade + class so the
  // student doesn't keep a stale class from another campus.
  useEffect(() => {
    if (!selectedCampus) {
      setSelectedGradeId("");
      return;
    }
    // If the grade no longer fits the campus, clear it.
    if (
      selectedGradeId &&
      !selectedCampus.gradeIds.includes(selectedGradeId)
    ) {
      setSelectedGradeId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampus?.id]);

  // Hydrate `selectedGradeId` from an existing className (edit flow).
  useEffect(() => {
    if (!className || selectedGradeId) return;
    const klass = allClasses.find((c) => c.code === className);
    if (klass) setSelectedGradeId(klass.gradeId);
  }, [className, allClasses, selectedGradeId]);

  // Classes restricted to (a) the selected campus, (b) that campus's
  // tier-driven grade list, and (c) the user-picked grade.
  const classesForCampus = useMemo(() => {
    if (!selectedCampus) return [];
    const allowedGrades = new Set(selectedCampus.gradeIds);
    return allClasses
      .filter(
        (c) =>
          c.campusId === selectedCampus.id &&
          c.status === "active" &&
          allowedGrades.has(c.gradeId) &&
          (selectedGradeId ? c.gradeId === selectedGradeId : true),
      )
      .sort((a, b) =>
        a.code.localeCompare(b.code, "vi", { numeric: true, sensitivity: "base" }),
      );
  }, [selectedCampus, allClasses, selectedGradeId]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Họ và tên"
        error={errors.name?.message as string | undefined}
        className="sm:col-span-2"
      >
        <Input
          autoFocus
          placeholder="vd: Nguyễn Hoàng Lan"
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
      </Field>

      <Field label="Email" error={errors.email?.message as string | undefined}>
        <Input
          type="email"
          placeholder="vd: lan.nh@example.com"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
      </Field>

      <Field label="Vai trò" error={errors.role?.message as string | undefined}>
        <Select aria-invalid={Boolean(errors.role)} {...register("role")}>
          {allowedRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={
          <span className="inline-flex items-center gap-1.5">
            Campus / Phân hiệu
            {lockedCampus && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                🔒 Cố định
              </span>
            )}
          </span>
        }
        error={errors.campusId?.message as string | undefined}
      >
        {lockedCampus ? (
          <>
            <input
              type="hidden"
              {...register("campusId")}
              value={lockedCampus.id}
            />
            <Input value={lockedCampus.name} disabled />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Bạn chỉ có thể tạo người dùng cho campus của mình.
            </p>
          </>
        ) : (
          <Select
            aria-invalid={Boolean(errors.campusId)}
            {...register("campusId")}
          >
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
        {selectedCampus && !lockedCampus && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {selectedCampus.gradeIds.length} khối · K
            {selectedCampus.gradeIds[0]?.replace("grade-", "")}–K
            {selectedCampus.gradeIds[
              selectedCampus.gradeIds.length - 1
            ]?.replace("grade-", "")}
          </p>
        )}
      </Field>

      {(role === "teacher" || role === "subject-lead") && (
        <div className="sm:col-span-2 space-y-3 rounded-xl border bg-surface-2/40 p-3">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
            <span aria-hidden>📚</span>
            Môn dạy & khối phụ trách
          </p>

          {/* Subjects multi-select */}
          {(() => {
            const eligibleSubjects = (
              selectedCampus
                ? allSubjects.filter((s) => {
                    if (s.status !== "active") return false;
                    return (
                      !s.campusIds ||
                      s.campusIds.length === 0 ||
                      s.campusIds.includes(selectedCampus.id)
                    );
                  })
                : allSubjects.filter((s) => s.status === "active")
            ).sort((a, b) => a.name.localeCompare(b.name, "vi"));
            return (
              <div>
                <p className="mb-2 text-[12px] font-medium text-foreground/75">
                  Môn dạy (tick các môn):
                </p>
                {eligibleSubjects.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                    Campus chưa cấu hình môn học. Vào "Môn học" để bổ sung.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {eligibleSubjects.map((s) => {
                      const checked = subjectIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setValue(
                              "subjectIds",
                              checked
                                ? subjectIds.filter((id) => id !== s.id)
                                : [...subjectIds, s.id],
                              { shouldDirty: true },
                            )
                          }
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                            checked
                              ? "border-primary bg-primary/8 text-primary"
                              : "border-border bg-card text-foreground/75 hover:bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border",
                            )}
                            aria-hidden
                          >
                            {checked && (
                              <Check className="h-3 w-3" strokeWidth={3} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 leading-tight">
                            {s.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Grades multi-select */}
          {(() => {
            const eligibleGrades = (
              selectedCampus
                ? grades.filter((g) =>
                    selectedCampus.gradeIds.includes(g.id),
                  )
                : grades
            ).sort((a, b) =>
              a.name.localeCompare(b.name, "vi", { numeric: true }),
            );
            return (
              <div>
                <p className="mb-2 text-[12px] font-medium text-foreground/75">
                  Khối phụ trách:
                </p>
                {eligibleGrades.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                    Campus chưa khai báo khối — chọn cấp học cho campus trước.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {eligibleGrades.map((g) => {
                      const checked = gradeIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() =>
                            setValue(
                              "gradeIds",
                              checked
                                ? gradeIds.filter((id) => id !== g.id)
                                : [...gradeIds, g.id],
                              { shouldDirty: true },
                            )
                          }
                          className={cn(
                            "inline-flex items-center justify-start gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-[13px] transition-colors",
                            checked
                              ? "border-primary bg-primary/8 text-primary"
                              : "border-border bg-card text-foreground/75 hover:bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border",
                            )}
                            aria-hidden
                          >
                            {checked && (
                              <Check className="h-3 w-3" strokeWidth={3} />
                            )}
                          </span>
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Class-level student supervision — narrower than gradeIds.
              If the teacher manages specific classes (not the whole
              grade), admin picks them here. Empty = grade-level only. */}
          {(() => {
            const classIds = (watch("classIds") as string[] | undefined) ?? [];
            const candidateClasses = (
              selectedCampus
                ? allClasses.filter((c) => c.campusId === selectedCampus.id)
                : allClasses
            )
              .filter(
                (c) =>
                  gradeIds.length === 0 || gradeIds.includes(c.gradeId),
              )
              .sort((a, b) =>
                a.code.localeCompare(b.code, "vi", { numeric: true }),
              );
            return (
              <div>
                <p className="mb-1 text-[12px] font-medium text-foreground/75">
                  Lớp quản lý (tuỳ chọn — chi tiết hơn cấp khối):
                </p>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Để trống = quản lý toàn bộ HS các <b>khối</b> đã chọn ở
                  trên. Tick các lớp cụ thể để hẹp lại phạm vi quản lý HS
                  (chỉ HS các lớp này thay vì toàn khối).
                </p>
                {candidateClasses.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                    Không có lớp nào khớp khối đã chọn.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                    {candidateClasses.map((c) => {
                      const checked = classIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setValue(
                              "classIds",
                              checked
                                ? classIds.filter((id) => id !== c.id)
                                : [...classIds, c.id],
                              { shouldDirty: true },
                            )
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] transition-colors",
                            checked
                              ? "border-primary bg-primary/8 text-primary"
                              : "border-border bg-card text-foreground/75 hover:bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border",
                            )}
                            aria-hidden
                          >
                            {checked && (
                              <Check className="h-2.5 w-2.5" strokeWidth={3} />
                            )}
                          </span>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Legacy free-text label — kept for the "Bộ môn" column in users
              table where a single canonical subject is displayed. */}
          <Field
            label="Bộ môn (mô tả ngắn)"
            error={errors.subject?.message as string | undefined}
          >
            <Input
              placeholder="vd: Toán, Văn, Vật lý…"
              {...register("subject")}
            />
          </Field>

          {/* Per-user create permissions — admin can elevate a teacher
              to author blueprints / packages / shifts without changing
              their role. subject-lead has all three implicitly so we
              hide the panel for that role. */}
          {role === "teacher" && (
            <div className="sm:col-span-2 space-y-3 rounded-xl border bg-card p-4">
              <div>
                <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
                  <span aria-hidden>🔐</span>
                  Quyền tạo nội dung (tuỳ chọn)
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Mặc định <b>giáo viên</b> chỉ tạo câu hỏi vào kho cá nhân /
                  gửi duyệt vào kho trường. Bật các quyền dưới để cho phép
                  giáo viên này tạo khung đề / gói đề / ca thi cho các khối -
                  môn họ được giao.
                </p>
              </div>
              <ul className="space-y-1.5">
                {(
                  [
                    {
                      // ONE umbrella permission covering the full
                      // exam-paper authoring pipeline: khung đề + gói đề +
                      // sinh đề ngẫu nhiên. Splitting these doesn't add
                      // value — they always flow together. The flag name
                      // stays `canCreateBlueprint` for storage stability;
                      // UI labels reflect the merged scope.
                      key: "permissions.canCreateBlueprint",
                      label: "Quản lý đề thi",
                      hint: "Tự soạn khung đề · tạo gói đề · bốc/sinh đề ngẫu nhiên cho môn được giao.",
                    },
                    {
                      key: "permissions.canCreateShift",
                      label: "Tạo ca kíp thi",
                      hint: "Lên lịch ca thi, phân phòng, gán giám thị, cấu hình anti-cheat.",
                    },
                  ] as const
                ).map((row) => (
                  <li
                    key={row.key}
                    className="flex items-start gap-2 rounded-md border bg-card px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      id={`perm-${row.key}`}
                      {...register(row.key as never)}
                      className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <label
                      htmlFor={`perm-${row.key}`}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <p className="text-[12.5px] font-semibold">{row.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {row.hint}
                      </p>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                💡 Quyền tạo vẫn bị giới hạn trong{" "}
                <b>khối / môn / lớp</b> đã được phân công ở mục trên. Để mở
                rộng phạm vi, chỉnh "Môn dạy & khối phụ trách".
              </p>
            </div>
          )}
        </div>
      )}

      {role === "student" && (
        <>
          <Field label="Khối">
            {!selectedCampus ? (
              <Select disabled>
                <option>— Chọn campus trước —</option>
              </Select>
            ) : gradesForCampus.length === 0 ? (
              <Select disabled>
                <option>Campus chưa có khối khả dụng</option>
              </Select>
            ) : (
              <Select
                value={selectedGradeId}
                onChange={(e) => {
                  setSelectedGradeId(e.target.value);
                  // Reset class whenever grade changes so users don't keep
                  // a class that belongs to a different khối. We deliberately
                  // skip `shouldValidate` here — validating the whole form
                  // mid-edit triggers Zod errors on still-empty siblings
                  // like email (which is fine until the user submits).
                  setValue("className", "", {
                    shouldValidate: false,
                    shouldDirty: true,
                  });
                }}
              >
                <option value="">— Chọn khối —</option>
                {gradesForCampus.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
            {selectedCampus && gradesForCampus.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Hiện {gradesForCampus.length} khối của {selectedCampus.name}.
              </p>
            )}
          </Field>

          <Field
            label="Lớp (tuỳ chọn)"
            error={errors.className?.message as string | undefined}
          >
            {!selectedCampus ? (
              <Select disabled>
                <option>— Chọn campus trước —</option>
              </Select>
            ) : !selectedGradeId ? (
              <Select disabled>
                <option>— Chọn khối trước —</option>
              </Select>
            ) : classesForCampus.length === 0 ? (
              <Select {...register("className")} disabled>
                <option value="">Khối chưa có lớp — sẽ xếp lớp sau</option>
              </Select>
            ) : (
              <Select {...register("className")}>
                <option value="">— Chưa xếp lớp —</option>
                {classesForCampus.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
            {selectedGradeId && classesForCampus.length > 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {classesForCampus.length} lớp thuộc khối đã chọn tại{" "}
                {selectedCampus?.name}. Có thể để trống và xếp lớp sau.
              </p>
            ) : selectedGradeId && classesForCampus.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">
                Khối này chưa khai báo lớp. Bạn vẫn có thể tạo người dùng và
                xếp lớp ở trang "Khối · lớp" sau.
              </p>
            ) : null}
          </Field>
        </>
      )}

      {withPassword && (
        <Field
          label="Mật khẩu khởi tạo"
          error={errors.password?.message as string | undefined}
          className="sm:col-span-2"
        >
          <Input
            type="text"
            placeholder="Tự sinh hoặc nhập tay (≥ 6 ký tự)"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
          <p className="text-meta mt-1">
            Người dùng sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.
          </p>
        </Field>
      )}

      {withOptionalPassword && (
        <div className="sm:col-span-2 space-y-1.5 rounded-xl border bg-muted/20 p-3">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
            <span aria-hidden>🔒</span>
            Bảo mật
          </p>
          <Field
            label="Mật khẩu mới (tuỳ chọn)"
            error={errors.password?.message as string | undefined}
          >
            <Input
              type="text"
              placeholder="Để trống nếu không đổi mật khẩu"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <p className="text-meta mt-1">
              Để trống nếu không đổi mật khẩu. Tối thiểu 6 ký tự nếu nhập.
            </p>
          </Field>
        </div>
      )}

      {withStatus && (
        <Field
          label="Trạng thái"
          error={errors.status?.message as string | undefined}
          className="sm:col-span-2"
        >
          <Select {...register("status")}>
            <option value="active">Đang hoạt động</option>
            <option value="invited">Đã mời (chờ kích hoạt)</option>
            <option value="suspended">Tạm khoá</option>
          </Select>
        </Field>
      )}
    </div>
  );
}

// Allow `label` to be a node so we can decorate it with chips (e.g. the
// "🔒 Cố định" badge on the campus field).
function Field({
  label,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-[13px] font-medium text-foreground/80">
        {label}
      </Label>
      {children}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
