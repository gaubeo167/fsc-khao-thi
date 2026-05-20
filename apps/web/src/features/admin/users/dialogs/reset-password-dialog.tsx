"use client";

import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SeedUser } from "@/features/auth/data/seed-users";
import { generatePassword, useUsersStore } from "@/features/admin/users/users-store";

interface Props {
  user: SeedUser | null;
  onClose: () => void;
}

export function ResetPasswordDialog({ user, onClose }: Props) {
  const resetPassword = useUsersStore((s) => s.resetPassword);

  const [stage, setStage] = useState<"confirm" | "issued">("confirm");
  const [issuedPassword, setIssuedPassword] = useState("");
  const [customPassword, setCustomPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setStage("confirm");
      setIssuedPassword("");
      setCustomPassword("");
      setCopied(false);
      setError(null);
      setSubmitting(false);
    }
  }, [user?.id]);

  async function runReset(pw: string) {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(user.id, pw);
      setIssuedPassword(pw);
      setStage("issued");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Đặt mật khẩu thất bại.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetCustom() {
    const pw = customPassword.trim();
    if (pw.length < 6) return;
    void runReset(pw);
  }

  function handleResetAuto() {
    void runReset(generatePassword(12));
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(issuedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stage === "confirm" ? "Đặt lại mật khẩu" : "Mật khẩu mới đã được tạo"}
          </DialogTitle>
          <DialogDescription>
            {stage === "confirm" ? (
              <>
                Sinh mật khẩu ngẫu nhiên cho{" "}
                <span className="font-medium text-foreground/85">{user?.name}</span>.
                Mật khẩu cũ sẽ bị vô hiệu hoá.
              </>
            ) : (
              <>Gửi mật khẩu này cho người dùng qua kênh an toàn. Bạn chỉ thấy được 1 lần.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {stage === "confirm" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-foreground/80">
                Đặt mật khẩu tuỳ chọn{" "}
                <span className="text-muted-foreground font-normal">
                  (≥ 6 ký tự)
                </span>
              </Label>
              <Input
                type="text"
                placeholder="vd: fpt2026 — để trống nếu muốn sinh ngẫu nhiên"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
              />
            </div>
            <p className="text-meta">
              Nhập mật khẩu tuỳ ý ở trên rồi bấm{" "}
              <span className="font-semibold">Lưu mật khẩu</span>, hoặc bấm
              "Sinh ngẫu nhiên" để hệ thống tạo password 12 ký tự an toàn. Mật
              khẩu cũ sẽ bị vô hiệu hoá ngay lập tức.
            </p>
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2 text-[13px] text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 font-mono text-[15px] tracking-tight">
              <KeyRound className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <span className="flex-1 select-all break-all">{issuedPassword}</span>
              <button
                type="button"
                onClick={copyToClipboard}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[12px] font-medium text-foreground/80 hover:bg-accent"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
                    Đã chép
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Chép
                  </>
                )}
              </button>
            </div>
            <p className="text-meta">
              Đã ghi đè mật khẩu cho <span className="font-mono">{user?.id}</span>.
            </p>
          </div>
        )}

        <DialogFooter>
          {stage === "confirm" ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Hủy
              </Button>
              <Button
                variant="outline"
                onClick={handleResetAuto}
                disabled={submitting}
              >
                <RefreshCw className="h-4 w-4" />
                {submitting ? "Đang lưu…" : "Sinh ngẫu nhiên"}
              </Button>
              <Button
                onClick={handleResetCustom}
                disabled={submitting || customPassword.trim().length < 6}
              >
                <KeyRound className="h-4 w-4" />
                {submitting ? "Đang lưu…" : "Lưu mật khẩu"}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Đã xong</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
