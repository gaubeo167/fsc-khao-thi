"use client";

import {
  Building2,
  Check,
  Copy,
  KeyRound,
  Layers,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUsersStore } from "@/features/admin/users/users-store";
import { cn } from "@/lib/utils";

import {
  CAMPUS_TIER_LABEL,
  gradeIdsForTier,
  type Campus,
  type CampusTier,
} from "../data/seed-campuses";
import { useCampusesStore } from "../state/campuses-store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  editing?: Campus | null;
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

interface IssuedCredentials {
  campusName: string;
  email: string;
  password: string;
}

const TIER_ORDER: CampusTier[] = [
  "primary",
  "secondary",
  "high",
  "primary-secondary",
  "all",
];

export function CampusDialog({ open, onOpenChange, editing }: Props) {
  const create = useCampusesStore((s) => s.create);
  const update = useCampusesStore((s) => s.update);
  const createUser = useUsersStore((s) => s.create);
  const findUserByIdentifier = useUsersStore((s) => s.findByIdentifier);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [region, setRegion] = useState<Campus["region"]>("Bắc");
  const [tier, setTier] = useState<CampusTier>("all");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Campus["status"]>("active");
  const [error, setError] = useState<string | null>(null);
  /**
   * Set after a new campus is created — surfaces the auto-generated admin
   * account credentials so the superadmin can hand them off to the school.
   */
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIssued(null);
    setCopied(null);
    if (editing) {
      setName(editing.name);
      setCode(editing.code);
      setRegion(editing.region);
      setTier(editing.tier);
      setAddress(editing.address ?? "");
      setPhone(editing.phone ?? "");
      setStatus(editing.status);
    } else {
      setName("");
      setCode("");
      setRegion("Bắc");
      setTier("all");
      setAddress("");
      setPhone("");
      setStatus("active");
    }
  }, [open, editing]);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Nhập tên campus.");
      return;
    }
    if (!code.trim()) {
      setError("Nhập mã campus (vd: CG, HL, HCM).");
      return;
    }
    if (editing) {
      update(editing.id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        region,
        tier,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        status,
      });
      toast.success(`Đã cập nhật campus "${name.trim()}"`);
      onOpenChange(false);
      return;
    }
    // Create campus first
    const campus = create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      region,
      tier,
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      status,
    });
    toast.success(`Đã tạo campus "${campus.name}"`);

    // Then auto-create a default admin account for that campus. Email +
    // password are deterministic and shown to the operator in the success
    // panel so they can hand them off to the school.
    const slug = slugifyCode(code) || "campus";
    let email = `admin.${slug}@fpt.edu.vn`;
    // Make sure the email is unique — if a previous deletion left a user
    // with the same address, suffix `-2`, `-3`, …
    let suffix = 2;
    while (findUserByIdentifier(email)) {
      email = `admin.${slug}-${suffix}@fpt.edu.vn`;
      suffix++;
    }
    // Random 10-char password: easier to satisfy Firebase Auth strength
    // policy and avoids the predictable "fpt2026" default.
    const password = randomPassword();
    try {
      await createUser({
        name: `Admin ${campus.name}`,
        email,
        role: "campus-admin",
        campusId: campus.id,
        password,
        status: "active",
      });
      setIssued({ campusName: campus.name, email, password });
      toast.success(`Đã cấp tài khoản admin cho ${campus.name}`);
    } catch (e) {
      const msg = friendlyAuthError(e);
      setError(`Tạo admin campus thất bại: ${msg}`);
      toast.error(`Tạo admin campus thất bại: ${msg}`);
    }
  }

  /** 10-char random password with mixed case + digits — meets Firebase
   *  default strength policy. */
  function randomPassword(): string {
    const chars =
      "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 10; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  /** Translate Firebase Auth error codes to Vietnamese hints. */
  function friendlyAuthError(e: unknown): string {
    if (!(e instanceof Error)) return "Lỗi không xác định";
    const code = (e as { code?: string }).code ?? "";
    if (code === "auth/email-already-in-use" || e.message.includes("email-already"))
      return "Email này đã có người dùng — chọn mã campus khác.";
    if (code === "auth/weak-password" || e.message.includes("weak-password"))
      return "Password chưa đủ mạnh — thử lại để sinh password khác.";
    if (code === "auth/invalid-email")
      return "Email không hợp lệ.";
    if (code === "permission-denied")
      return "Tài khoản hiện tại không có quyền tạo người dùng (cần superadmin / admin).";
    return e.message;
  }

  async function copy(value: string, kind: "email" | "password") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // silent
    }
  }

  const previewGrades = gradeIdsForTier(tier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 max-h-[94vh] overflow-y-auto">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-200">
            <Building2 className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">
              {editing ? "Sửa campus" : "Thêm campus mới"}
            </DialogTitle>
            <p className="text-meta mt-0.5">
              Cấp học quyết định các khối lớp campus này được phép quản lý.
            </p>
          </div>
        </header>

        {issued ? (
          <div className="space-y-4 px-6 py-5">
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-5 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-6 w-6" strokeWidth={1.85} />
              </span>
              <p className="mt-2 text-[17px] font-bold text-emerald-900">
                Đã tạo campus {issued.campusName}
              </p>
              <p className="mt-1 text-[12.5px] text-emerald-800/85">
                Hệ thống đã tạo sẵn một tài khoản{" "}
                <span className="font-semibold">Admin campus</span> để bàn
                giao cho đơn vị nhà trường đăng nhập và quản lý nội bộ
                campus này.
              </p>
            </div>

            <div className="rounded-xl border bg-card p-3 text-[13px]">
              <div className="flex items-center gap-2 border-b pb-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" strokeWidth={1.85} />
                <p className="font-semibold text-foreground/85">
                  Tài khoản quản trị mặc định
                </p>
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                  Lưu lại 1 lần duy nhất
                </span>
              </div>
              <dl className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <dt className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                    Email
                  </dt>
                  <dd className="flex-1 select-all break-all font-mono text-[13px]">
                    {issued.email}
                  </dd>
                  <button
                    type="button"
                    onClick={() => copy(issued.email, "email")}
                    className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent"
                  >
                    {copied === "email" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" /> Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Chép
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                    Mật khẩu
                  </dt>
                  <dd className="flex-1 select-all break-all font-mono text-[13px]">
                    {issued.password}
                  </dd>
                  <button
                    type="button"
                    onClick={() => copy(issued.password, "password")}
                    className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent"
                  >
                    {copied === "password" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" /> Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Chép
                      </>
                    )}
                  </button>
                </div>
              </dl>
              <p className="mt-3 text-[11.5px] text-muted-foreground">
                Admin campus có toàn quyền trong campus này: khối/lớp, môn
                học, người dùng, ngân hàng câu hỏi, ca thi, phê duyệt. Có
                thể đổi mật khẩu sau khi đăng nhập.
              </p>
            </div>
          </div>
        ) : (
        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Tên campus <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="vd: FSchools Cầu Giấy"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Mã <span className="text-destructive">*</span>
              </Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CG"
                maxLength={10}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Vùng miền
              </Label>
              <Select
                value={region}
                onChange={(e) => setRegion(e.target.value as Campus["region"])}
              >
                <option value="Bắc">Miền Bắc</option>
                <option value="Trung">Miền Trung</option>
                <option value="Nam">Miền Nam</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Trạng thái
              </Label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as Campus["status"])}
              >
                <option value="active">Đang hoạt động</option>
                <option value="archived">Đã lưu trữ</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Cấp học <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {TIER_ORDER.map((t) => {
                const active = t === tier;
                const grades = gradeIdsForTier(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-3 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/8"
                        : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
                    )}
                  >
                    <p className="text-[13px] font-semibold text-foreground">
                      {CAMPUS_TIER_LABEL[t]}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {grades.length} khối · K
                      {grades[0]?.replace("grade-", "")}–K
                      {grades[grades.length - 1]?.replace("grade-", "")}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800">
              <Layers className="h-3.5 w-3.5" strokeWidth={1.85} />
              Campus này sẽ áp dụng cho các khối:{" "}
              <span className="font-semibold">
                {previewGrades
                  .map((g) => g.replace("grade-", "K"))
                  .join(" · ")}
              </span>
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Địa chỉ
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="vd: Cầu Giấy, Hà Nội"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Điện thoại
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="vd: 024 1234 5678"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-[13px] text-destructive-text">
              {error}
            </div>
          )}
        </div>
        )}

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          {issued ? (
            <Button className="ml-auto" onClick={() => onOpenChange(false)}>
              <Check className="h-4 w-4" />
              Đã xong
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
                Hủy
              </Button>
              <Button onClick={handleSubmit}>
                <Save className="h-4 w-4" />
                {editing ? "Lưu thay đổi" : "Tạo campus"}
              </Button>
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
