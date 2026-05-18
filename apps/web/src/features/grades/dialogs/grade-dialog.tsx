"use client";

import { zodResolverSafe } from "@/lib/zod-resolver";
import { Check, LayoutGrid } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import type { Grade } from "../data/seed-grades";
import { GradeSchema, type GradeValues } from "../schemas";
import { useGradesStore } from "../state/grades-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Grade | null;
}

export function GradeDialog({ open, onOpenChange, editing }: Props) {
  const createGrade = useGradesStore((s) => s.createGrade);
  const updateGrade = useGradesStore((s) => s.updateGrade);

  const form = useForm<GradeValues>({
    resolver: zodResolverSafe(GradeSchema),
    defaultValues: { code: "", name: "", order: 0, status: "active" },
    mode: "onBlur",
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? { code: editing.code, name: editing.name, order: editing.order, status: editing.status }
        : { code: "", name: "", order: 0, status: "active" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  function onSubmit(values: GradeValues) {
    if (editing) {
      // Only mã + thứ tự + trạng thái are editable; tên khối is locked
      // to its catalog value so naming stays consistent across campuses.
      updateGrade(editing.id, {
        code: values.code,
        order: values.order,
        status: values.status,
      });
    } else {
      createGrade(values);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl p-0"
        srTitle={editing ? "Chỉnh sửa khối" : "Thêm khối mới"}
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
            <LayoutGrid className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">
              {editing ? "Chỉnh sửa khối" : "Thêm khối mới"}
            </h2>
            <p className="text-meta mt-0.5">
              {editing ? `Cập nhật thông tin ${editing.name}.` : "Khối học theo cấp giáo dục."}
            </p>
          </div>
        </header>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-4 px-6 py-5">
            {/* Tên khối is part of the global catalog and cannot be
                renamed from the campus admin UI — show it read-only so
                the admin still knows which grade they're editing. */}
            {editing && (
              <Field label="Tên khối">
                <Input value={editing.name} disabled readOnly />
                <p className="text-[11px] text-muted-foreground">
                  Tên khối thuộc catalog toàn cục, không sửa được tại đây.
                </p>
              </Field>
            )}
            {!editing && (
              <Field label="Tên khối" required error={form.formState.errors.name?.message}>
                <Input placeholder="VD: Khối 7" {...form.register("name")} />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã khối" required error={form.formState.errors.code?.message}>
                <Input placeholder="VD: K7" {...form.register("code")} />
              </Field>
              <Field label="Thứ tự" error={form.formState.errors.order?.message}>
                <Input type="number" min={0} {...form.register("order")} />
              </Field>
            </div>

            <Field label="Trạng thái">
              <Select {...form.register("status")}>
                <option value="active">Đang hoạt động</option>
                <option value="archived">Đã lưu trữ</option>
              </Select>
            </Field>
          </div>

          <footer className="flex items-center justify-between border-t bg-muted/20 px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit">
              <Check className="h-4 w-4" />
              {editing ? "Lưu thay đổi" : "Tạo khối"}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-medium text-foreground/80">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
