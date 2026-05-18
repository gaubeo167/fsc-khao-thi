"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { zodResolverSafe } from "@/lib/zod-resolver";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { CreateUserSchema, type CreateUserValues } from "@/features/admin/users/schemas";
import { generatePassword, useUsersStore } from "@/features/admin/users/users-store";

import { UserFormFields } from "./user-form-fields";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onCreated?: (id: string) => void;
}

export function CreateUserDialog({ open, onOpenChange, onCreated }: Props) {
  const session = useAuthStore((s) => s.session);
  const isSuperadmin = session?.role === "superadmin";
  const create = useUsersStore((s) => s.create);

  const form = useForm<CreateUserValues>({
    resolver: zodResolverSafe(CreateUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "student",
      campusId: isSuperadmin ? "" : (session?.campusId ?? ""),
      subject: "",
      className: "",
      subjectIds: [],
      gradeIds: [],
      password: generatePassword(10),
      status: "active",
    },
    // Only validate on submit (or blur after a submit attempt). Validating on
    // every blur fires the resolver against half-filled fields and made
    // diagnosing real issues harder.
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  });

  const [submitError, setSubmitError] = useState<string | null>(null);

  // Re-seed password on open
  useEffect(() => {
    if (open) {
      setSubmitError(null);
      form.reset({
        name: "",
        email: "",
        role: "student",
        campusId: isSuperadmin ? "" : (session?.campusId ?? ""),
        subject: "",
        className: "",
        subjectIds: [],
        gradeIds: [],
        password: generatePassword(10),
        status: "active",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function rerollPassword() {
    form.setValue("password", generatePassword(10), { shouldValidate: true });
  }

  async function onSubmit(values: CreateUserValues) {
    setSubmitError(null);
    try {
      const created = await create({
        name: values.name,
        email: values.email,
        role: values.role,
        campusId: values.campusId || null,
        subject: values.subject || undefined,
        className: values.className || undefined,
        subjectIds: values.subjectIds ?? [],
        gradeIds: values.gradeIds ?? [],
        classIds: values.classIds ?? [],
        permissions: values.permissions,
        password: values.password,
        status: values.status,
      });
      onCreated?.(created.id);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Lỗi không xác định khi tạo user.",
      );
    }
  }

  // When validation blocks submission, surface a top-level banner so the
  // user can immediately see which field is failing (each field error is
  // also shown inline, but in a tall form the inline message may be off-
  // screen at the moment of click).
  function onInvalid(errors: Record<string, { message?: string }>) {
    const first = Object.entries(errors)[0];
    if (!first) return;
    const [field, info] = first;
    const fieldLabel =
      field === "name"
        ? "Họ và tên"
        : field === "email"
          ? "Email"
          : field === "campusId"
            ? "Campus"
            : field === "subject"
              ? "Bộ môn"
              : field === "className"
                ? "Lớp"
                : field === "password"
                  ? "Mật khẩu"
                  : field;
    setSubmitError(`${fieldLabel}: ${info?.message ?? "không hợp lệ"}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>Thêm người dùng</DialogTitle>
          <DialogDescription>
            Tạo tài khoản mới và gán vai trò + campus.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          className="space-y-5 pt-2"
        >
          <UserFormFields
            register={form.register}
            errors={form.formState.errors}
            watch={form.watch}
            setValue={form.setValue}
            withPassword
          />

          <button
            type="button"
            onClick={rerollPassword}
            className="text-meta inline-flex items-center gap-1.5 font-medium text-foreground/70 hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" strokeWidth={2} />
            Sinh lại mật khẩu ngẫu nhiên
          </button>

          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                strokeWidth={1.85}
              />
              <span className="min-w-0 flex-1">{submitError}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Tạo người dùng
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
