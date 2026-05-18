"use client";

import {
  Check,
  KeyRound,
  Mail,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SeedUser } from "@/features/auth/data/seed-users";
import {
  generatePassword,
  useUsersStore,
} from "@/features/admin/users/users-store";
import { ConfirmActionDialog } from "@/features/admin/users/dialogs/confirm-action-dialog";
import { cn } from "@/lib/utils";

import type { Campus } from "../data/seed-campuses";

interface Props {
  campus: Campus;
}

/**
 * Lists every campus-admin account bound to `campus`. Lets superadmin:
 *   - Reset password to a custom or random string
 *   - Suspend / re-activate
 *   - Delete (only if at least 1 admin remains)
 *   - Add another admin account
 *
 * Surfaced directly on the Campus management cards since superadmin has no
 * other entry point into the user store (the /admin/users nav item is
 * hidden for their role).
 */
export function CampusAdminsSection({ campus }: Props) {
  const users = useUsersStore((s) => s.users);
  const createUser = useUsersStore((s) => s.create);
  const updateUser = useUsersStore((s) => s.update);
  const removeUser = useUsersStore((s) => s.remove);
  const setStatus = useUsersStore((s) => s.setStatus);
  const resetPassword = useUsersStore((s) => s.resetPassword);
  const findByIdentifier = useUsersStore((s) => s.findByIdentifier);

  const admins = useMemo(
    () =>
      users
        .filter((u) => u.role === "campus-admin" && u.campusId === campus.id)
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [users, campus.id],
  );

  const [resetTarget, setResetTarget] = useState<SeedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SeedUser | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-blue-700" strokeWidth={1.85} />
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue-900">
          Admin campus ({admins.length})
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          className="ml-auto"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Thêm admin
        </Button>
      </div>

      {admins.length === 0 ? (
        <p className="rounded-md border border-dashed bg-card px-3 py-2 text-[12px] text-muted-foreground">
          Campus chưa có tài khoản admin. Bấm "Thêm admin" để tạo.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {admins.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
            >
              <Mail
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.85}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-foreground/85">
                  {u.name}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {u.email}
                </p>
              </div>
              <StatusPill status={u.status} />
              <div className="flex items-center gap-0.5">
                <IconButton
                  size="sm"
                  variant="primary"
                  title="Đặt lại mật khẩu"
                  onClick={() => setResetTarget(u)}
                >
                  <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant={u.status === "active" ? "warning" : "success"}
                  title={u.status === "active" ? "Tạm khoá" : "Kích hoạt"}
                  onClick={() =>
                    setStatus(
                      u.id,
                      u.status === "active" ? "suspended" : "active",
                    )
                  }
                >
                  {u.status === "active" ? (
                    <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
                  ) : (
                    <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                </IconButton>
                {admins.length > 1 && (
                  <IconButton
                    size="sm"
                    variant="destructive"
                    title="Xoá admin"
                    onClick={() => setDeleteTarget(u)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddAdminDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        campus={campus}
        findByIdentifier={findByIdentifier}
        createUser={createUser}
      />

      <ResetAdminPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={(pw) => {
          if (resetTarget) resetPassword(resetTarget.id, pw);
        }}
      />

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        variant="destructive"
        title="Xoá tài khoản admin?"
        description={
          deleteTarget ? (
            <>
              Xoá <span className="font-semibold">{deleteTarget.name}</span> (
              <span className="font-mono">{deleteTarget.email}</span>). Tài
              khoản sẽ không đăng nhập được nữa.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Xoá admin"
        onConfirm={() => {
          if (deleteTarget) removeUser(deleteTarget.id);
        }}
      />
    </div>
  );
  // updateUser intentionally referenced once to keep the import alive in case
  // a future inline-edit lands here.
  void updateUser;
}

/* ───────── helpers ───────── */

function StatusPill({ status }: { status: SeedUser["status"] }) {
  const cfg =
    status === "active"
      ? { label: "Hoạt động", className: "bg-emerald-100 text-emerald-700" }
      : status === "suspended"
        ? { label: "Tạm khoá", className: "bg-rose-100 text-rose-700" }
        : { label: "Đã mời", className: "bg-amber-100 text-amber-700" };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

function slugifyCode(code: string): string {
  return code
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function AddAdminDialog({
  open,
  onClose,
  campus,
  findByIdentifier,
  createUser,
}: {
  open: boolean;
  onClose(): void;
  campus: Campus;
  findByIdentifier: ReturnType<typeof useUsersStore.getState>["findByIdentifier"];
  createUser: ReturnType<typeof useUsersStore.getState>["create"];
}) {
  const slug = slugifyCode(campus.code) || "campus";
  const defaultEmail = `admin.${slug}@fpt.edu.vn`;
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("fpt2026");
  const [error, setError] = useState<string | null>(null);

  // Reset state every open
  if (open && error) {
    // soft: rely on user closing to reset; nothing to do here
  }

  async function handleSubmit() {
    setError(null);
    const trimmedName = name.trim() || `Admin ${campus.name}`;
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Nhập email.");
      return;
    }
    if (findByIdentifier(trimmedEmail)) {
      setError("Email này đã có người dùng. Chọn email khác.");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return;
    }
    try {
      await createUser({
        name: trimmedName,
        email: trimmedEmail,
        role: "campus-admin",
        campusId: campus.id,
        password,
        status: "active",
      });
      setName("");
      setEmail(defaultEmail);
      setPassword("fpt2026");
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Tạo tài khoản thất bại.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-200">
            <UserPlus className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">
              Thêm admin campus
            </DialogTitle>
            <p className="text-meta mt-0.5">
              Tạo thêm 1 tài khoản admin cho{" "}
              <span className="font-semibold">{campus.name}</span>.
            </p>
          </div>
        </header>

        <div className="space-y-3 px-6 py-5">
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Họ và tên
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`vd: Admin ${campus.name}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin.x@fpt.edu.vn"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Mật khẩu khởi tạo <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="≥ 6 ký tự"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPassword(generatePassword(10))}
              >
                Random
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-[12.5px] text-destructive-text">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleSubmit}>
            <Plus className="h-4 w-4" />
            Tạo admin
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ResetAdminPasswordDialog({
  target,
  onClose,
  onReset,
}: {
  target: SeedUser | null;
  onClose(): void;
  onReset(pw: string): void;
}) {
  const [custom, setCustom] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!target) {
    return null;
  }

  function commit(pw: string) {
    if (pw.length < 6) return;
    onReset(pw);
    setIssued(pw);
  }

  function close() {
    setCustom("");
    setIssued(null);
    setCopied(false);
    onClose();
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md p-0">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <KeyRound className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">
              {issued ? "Đã đặt lại mật khẩu" : "Đặt lại mật khẩu"}
            </DialogTitle>
            <p className="text-meta mt-0.5">
              {target.name} · <span className="font-mono">{target.email}</span>
            </p>
          </div>
        </header>

        <div className="space-y-3 px-6 py-5">
          {issued ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-[13px]">
              <p className="text-meta mb-1">Mật khẩu mới (lưu lại ngay):</p>
              <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 font-mono text-[14px]">
                <span className="flex-1 select-all break-all">{issued}</span>
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" /> Đã chép
                    </>
                  ) : (
                    "Chép"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                  Đặt mật khẩu tuỳ chọn{" "}
                  <span className="font-normal text-muted-foreground">
                    (≥ 6 ký tự)
                  </span>
                </Label>
                <Input
                  type="text"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="vd: fpt2026"
                  autoFocus
                />
              </div>
              <p className="text-meta">
                Nhập mật khẩu ở trên rồi bấm <b>Lưu</b>, hoặc bấm{" "}
                <b>Sinh ngẫu nhiên</b> để hệ thống tạo password 12 ký tự.
              </p>
            </>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          {issued ? (
            <Button className="ml-auto" onClick={close}>
              <Check className="h-4 w-4" /> Đã xong
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Hủy
              </Button>
              <Button
                variant="outline"
                onClick={() => commit(generatePassword(12))}
              >
                Sinh ngẫu nhiên
              </Button>
              <Button
                onClick={() => commit(custom.trim())}
                disabled={custom.trim().length < 6}
              >
                <KeyRound className="h-4 w-4" />
                Lưu
              </Button>
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
