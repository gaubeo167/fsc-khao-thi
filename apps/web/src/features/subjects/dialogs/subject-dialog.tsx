"use client";

import { zodResolverSafe } from "@/lib/zod-resolver";
import { BookOpenText, Check, Save } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";

import type { Subject } from "../data/seed-subjects";
import { SUBJECT_COLORS } from "../data/seed-subjects";
import { SubjectSchema, type SubjectValues } from "../schemas";
import { useSubjectsStore } from "../state/subjects-store";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Subject | null;
}

export function SubjectDialog({ open, onOpenChange, editing }: Props) {
  const allGrades = useGradesStore((s) => s.grades);
  const allCampuses = useCampusesStore((s) => s.campuses);
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const createSubject = useSubjectsStore((s) => s.createSubject);
  const updateSubject = useSubjectsStore((s) => s.updateSubject);

  // Scope rules:
  //  - Superadmin → can apply to any campus / any grade in catalog
  //  - All other roles → locked to their session.campusId; grades
  //    restricted to that campus's tier (campus.gradeIds).
  const isSuperadmin = session?.role === "superadmin";
  const operatingCampusId = isSuperadmin
    ? activeCampusId
    : session?.campusId ?? null;
  const defaultCampusIds = operatingCampusId ? [operatingCampusId] : [];

  // Campus options visible in the picker.
  const campuses = isSuperadmin
    ? allCampuses
    : allCampuses.filter((c) => c.id === session?.campusId);

  const form = useForm<SubjectValues>({
    resolver: zodResolverSafe(SubjectSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      color: SUBJECT_COLORS[0]!,
      gradeIds: [],
      campusIds: defaultCampusIds,
      status: "active",
    },
    mode: "onBlur",
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? {
            code: editing.code,
            name: editing.name,
            description: editing.description ?? "",
            color: editing.color,
            gradeIds: editing.gradeIds,
            campusIds: editing.campusIds ?? [],
            status: editing.status,
          }
        : {
            code: "",
            name: "",
            description: "",
            color: SUBJECT_COLORS[0]!,
            gradeIds: [],
            campusIds: defaultCampusIds,
            status: "active",
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  function onSubmit(values: SubjectValues) {
    if (editing) updateSubject(editing.id, values);
    else createSubject(values);
    onOpenChange(false);
  }

  const watchedColor = form.watch("color");
  const watchedGradeIds = form.watch("gradeIds");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl"
        srTitle={editing ? "Sửa môn học" : "Thêm môn học"}
      >
        <header className="flex items-start gap-3 border-b pb-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `${watchedColor}1A`,
              color: watchedColor,
            }}
          >
            <BookOpenText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">
              {editing ? "Sửa môn học" : "Thêm môn học"}
            </h2>
            <p className="text-meta">Định nghĩa môn học và áp dụng theo khối.</p>
          </div>
        </header>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên môn" required error={form.formState.errors.name?.message}>
              <Input placeholder="vd: Tiếng Anh" {...form.register("name")} />
            </Field>
            <Field label="Mã môn" required error={form.formState.errors.code?.message}>
              <Input placeholder="vd: ENG" {...form.register("code")} />
            </Field>
          </div>

          <Field label="Mô tả" error={form.formState.errors.description?.message}>
            <textarea
              {...form.register("description")}
              rows={2}
              placeholder="Mô tả ngắn về môn học…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </Field>

          <Field label="Màu sắc">
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {SUBJECT_COLORS.map((c) => {
                    const selected = field.value.toLowerCase() === c.toLowerCase();
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => field.onChange(c)}
                        aria-label={`Màu ${c}`}
                        aria-pressed={selected}
                        className={cn(
                          "h-9 w-9 rounded-lg transition-all",
                          selected
                            ? "ring-[3px] ring-offset-2 ring-offset-background"
                            : "ring-1 ring-black/5 hover:scale-105",
                        )}
                        style={{
                          backgroundColor: c,
                          boxShadow: selected ? `0 0 0 2px ${c}` : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              )}
            />
          </Field>

          <Field
            label="Áp dụng cho khối"
            required
            error={form.formState.errors.gradeIds?.message}
            hint="Chọn các khối học mà môn này sẽ giảng dạy"
          >
            <Controller
              control={form.control}
              name="gradeIds"
              render={({ field }) => {
                // Compute the union of gradeIds across selected campuses
                // — that defines which grades the subject can apply to.
                // If no campus selected yet (rare), fall back to all.
                const selectedCampusIds: string[] =
                  (form.watch("campusIds") as string[] | undefined) ?? [];
                const allowedGradeIds = new Set<string>();
                for (const cid of selectedCampusIds) {
                  const c = allCampuses.find((x) => x.id === cid);
                  for (const gid of c?.gradeIds ?? []) allowedGradeIds.add(gid);
                }
                const scopedGrades =
                  selectedCampusIds.length === 0
                    ? allGrades
                    : allGrades.filter((g) => allowedGradeIds.has(g.id));
                // Dedupe by id just in case the catalog has duplicates.
                const dedupedGrades = Array.from(
                  new Map(scopedGrades.map((g) => [g.id, g])).values(),
                ).sort((a, b) => a.order - b.order);
                return (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {dedupedGrades.map((g) => {
                    const selected = field.value.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            selected
                              ? field.value.filter((id) => id !== g.id)
                              : [...field.value, g.id],
                          )
                        }
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary/8 text-primary"
                            : "border-border bg-card text-foreground/70 hover:bg-accent",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                          aria-hidden
                        >
                          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        {g.name}
                      </button>
                    );
                  })}
                </div>
                );
              }}
            />
            <p className="text-meta mt-1">
              Đã chọn{" "}
              <span className="font-semibold text-foreground/85 tabular-nums">
                {watchedGradeIds.length}
              </span>{" "}
              khối — chỉ hiện khối thuộc campus đã chọn ở dưới
            </p>
          </Field>

          <Field
            label="Áp dụng cho campus"
            required
            error={form.formState.errors.campusIds?.message}
            hint="Môn này chỉ xuất hiện ở các campus được chọn"
          >
            <Controller
              control={form.control}
              name="campusIds"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {campuses
                    .filter((c) => c.status === "active")
                    .map((c) => {
                      const selected = field.value.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            field.onChange(
                              selected
                                ? field.value.filter((id) => id !== c.id)
                                : [...field.value, c.id],
                            )
                          }
                          className={cn(
                            "flex items-center justify-start gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                            selected
                              ? "border-primary bg-primary/8 text-primary"
                              : "border-border bg-card text-foreground/70 hover:bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border",
                            )}
                            aria-hidden
                          >
                            {selected && (
                              <Check className="h-3 w-3" strokeWidth={3} />
                            )}
                          </span>
                          <span className="min-w-0 truncate text-left">
                            {c.name}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            />
            <p className="text-meta mt-1">
              Đã chọn{" "}
              <span className="font-semibold text-foreground/85 tabular-nums">
                {form.watch("campusIds")?.length ?? 0}
              </span>{" "}
              / {campuses.filter((c) => c.status === "active").length} campus
            </p>
          </Field>

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit">
              <Save className="h-4 w-4" />
              {editing ? "Lưu thay đổi" : "Tạo môn học"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <div className="space-y-1.5">
      <Label className="text-[13px] font-medium text-foreground/80">
        {label} {required && <span className="text-destructive">*</span>}
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
