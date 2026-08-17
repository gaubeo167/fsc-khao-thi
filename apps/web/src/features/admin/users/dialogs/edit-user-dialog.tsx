"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
  // Lỗi lưu phải hiện NGAY TRONG hộp thoại, không chỉ toast: trước đây
  // `onSubmit` không bắt lỗi nào cả, nên một lần lưu hỏng trông y hệt một
  // lần lưu thành công.
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
    const changingPassword = Boolean(values.password);
    try {
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
        // Ô để trống = giữ nguyên mật khẩu cũ. Có giá trị thì store sẽ
        // gọi /api/admin/reset-password để đặt thật vào Firebase Auth.
        ...(values.password ? { password: values.password } : {}),
        status: values.status,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Lưu thay đổi thất bại.";
      setSaveError(msg);
      toast.error(msg);
      return;
    }
    toast.success(
      changingPassword
        ? `Đã lưu và ĐỔI MẬT KHẨU cho ${user.name}. Mật khẩu cũ hết hiệu lực ngay.`
        : "Đã lưu thay đổi",
    );
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
            lockStudentCode
            editingUserId={user?.id}
            editingRole={user?.role}
          />

          {saveError ? (
            <div className="text-small rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2 text-destructive">
              {saveError}
            </div>
          ) : null}

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
