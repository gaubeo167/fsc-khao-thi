"use client";

import { CheckCircle2, TriangleAlert, User, Building2 } from "lucide-react";
import { Controller, type Control } from "react-hook-form";

import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { findCampus } from "@/features/campus/data/seed-campuses";
import { cn } from "@/lib/utils";

interface Props {
  control: Control<any>;
}

/**
 * Two-card selector for "Vị trí lưu trữ" — personal vs campus.
 * Renders a yellow advisory note when the campus option is picked.
 */
export function KhoSelector({ control }: Props) {
  const session = useAuthStore((s) => s.session);
  const campus = findCampus(session?.campusId);
  const isStaff = session && session.role !== "student";

  return (
    <Controller
      control={control}
      name="kho"
      render={({ field }) => {
        const value = field.value as "personal" | "campus";
        return (
          <div className="space-y-2">
            <Label className="text-[13px] font-medium text-foreground/80">
              Vị trí lưu trữ <span className="text-destructive">*</span>
            </Label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <KhoCard
                tone="orange"
                icon={User}
                title="Kho cá nhân"
                hint="Chỉ tôi dùng · Không cần duyệt"
                active={value === "personal"}
                onClick={() => field.onChange("personal")}
              />
              <KhoCard
                tone="blue"
                icon={Building2}
                title="Kho trường (Campus)"
                hint={
                  isStaff && campus
                    ? `Toàn ${campus.name} · Cần TBM/Admin duyệt`
                    : "Yêu cầu tài khoản gắn campus"
                }
                active={value === "campus"}
                onClick={() => isStaff && field.onChange("campus")}
                disabled={!isStaff}
              />
            </div>

            {value === "personal" && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] leading-relaxed text-emerald-700">
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.85}
                  aria-hidden
                />
                <span>
                  Câu hỏi cá nhân — sẽ được{" "}
                  <span className="font-semibold">tự động duyệt</span> và sẵn
                  sàng dùng ngay sau khi lưu
                </span>
              </div>
            )}

            {value === "campus" && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-700">
                <TriangleAlert
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.85}
                  aria-hidden
                />
                <span>
                  Lưu vào <span className="font-semibold">kho trường</span> - câu hỏi sẽ
                  chờ TBM hoặc Admin duyệt
                </span>
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

function KhoCard({
  tone,
  icon: Icon,
  title,
  hint,
  active,
  onClick,
  disabled,
}: {
  tone: "orange" | "blue";
  icon: typeof User;
  title: string;
  hint: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneClass =
    tone === "orange"
      ? "bg-amber-50 text-amber-600 ring-amber-200"
      : "bg-blue-50 text-blue-600 ring-blue-200";
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/4 ring-1 ring-primary/30"
          : "border-border hover:bg-accent",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
          toneClass,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.85} />
      </span>
      <div className="leading-tight">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="text-meta mt-0.5">{hint}</p>
      </div>
    </button>
  );
}
