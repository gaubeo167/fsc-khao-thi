"use client";

import { useEffect } from "react";
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
import type { SeedUser } from "@/features/auth/data/seed-users";
import { EditUserSchema, type EditUserValues } from "@/features/admin/users/schemas";
import { useUsersStore } from "@/features/admin/users/users-store";

import { UserFormFields } from "./user-form-fields";

interface Props {
  user: SeedUser | null;
  onClose: () => void;
}

export function EditUserDialog({ user, onClose }: Props) {
  const update = useUsersStore((s) => s.update);

  const form = useForm<EditUserValues>({
    resolver: zodResolverSafe(EditUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "student",
      campusId: "",
      subject: "",
      className: "",
      subjectIds: [],
      gradeIds: [],
      password: "",
      status: "active",
    },
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        // Hide the synthetic `…@students.fsc.local` email from the form
        // so admins don't accidentally see / edit it. Real contact
        // emails are kept as-is.
        email:
          user.role === "student" && user.email.endsWith("@students.fsc.local")
            ? ""
            : user.email,
        role: user.role as EditUserValues["role"],
        campusId: user.campusId ?? "",
        subject: user.subject ?? "",
        className: user.className ?? "",
        subjectIds: user.subjectIds ?? [],
        gradeIds: user.gradeIds ?? [],
        classIds: user.classIds ?? [],
        permissions: user.permissions,
        studentCode: user.studentCode ?? "",
        username: user.username ?? "",
        parentPhone: user.parentPhone ?? "",
        parentEmail: user.parentEmail ?? "",
        password: "",
        status: user.status,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function onSubmit(values: EditUserValues) {
    if (!user) return;
    await update(user.id, {
      name: values.name,
      // Only overwrite email when admin actually typed one. Empty
      // value would clobber the synthetic Firebase Auth address used
      // by students.
      ...(values.email ? { email: values.email } : {}),
      role: values.role,
      campusId: values.campusId || null,
      subject: values.subject || null,
      className: values.className || null,
      subjectIds: values.subjectIds ?? [],
      gradeIds: values.gradeIds ?? [],
      classIds: values.classIds ?? [],
      permissions: values.permissions,
      studentCode: values.studentCode || null,
      username: values.username || null,
      parentPhone: values.parentPhone || null,
      parentEmail: values.parentEmail || null,
      // Pass password only when actually provided so the store keeps the
      // existing one otherwise.
      ...(values.password ? { password: values.password } : {}),
      status: values.status,
    });
    onClose();
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa người dùng</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin tài khoản ·{" "}
            <span className="font-mono">{user?.id}</span>
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5 pt-2"
        >
          <UserFormFields
            register={form.register}
            errors={form.formState.errors}
            watch={form.watch}
            setValue={form.setValue}
            withStatus
            withOptionalPassword
            lockUsername
            editingUserId={user?.id}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
