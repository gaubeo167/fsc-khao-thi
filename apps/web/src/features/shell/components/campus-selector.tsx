"use client";

import { Building2, Check, ChevronDown, Globe2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { cn } from "@/lib/utils";

export function CampusSelector() {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const setActive = useCampusStore((s) => s.setActive);
  const campuses = useCampusesStore((s) => s.campuses);

  if (!session) return null;

  const isSuperadmin = session.role === "superadmin";
  const active = campuses.find((c) => c.id === activeCampusId);
  const label = active?.name ?? (isSuperadmin ? "Tất cả campus" : "Campus");

  if (!isSuperadmin) {
    // Locked badge for non-superadmin — campus is fixed by their account.
    const Icon = active ? Building2 : Globe2;
    return (
      <div
        title={`Tài khoản ${session.role} bị giới hạn trong campus này`}
        className="hidden items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[13px] font-medium text-foreground/70 md:inline-flex"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="max-w-[180px] truncate">{label}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "hidden items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent md:inline-flex",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          )}
        >
          {active ? (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
          ) : (
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
          )}
          <span className="max-w-[200px] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <DropdownMenuLabel>Phạm vi dữ liệu</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setActive(null)}>
          <Globe2 className="h-4 w-4" strokeWidth={1.75} />
          <span>Tất cả campus</span>
          {activeCampusId === null ? (
            <Check className="ml-auto h-3.5 w-3.5 text-primary" />
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theo campus</DropdownMenuLabel>
        {campuses
          .filter((c) => c.status === "active")
          .map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => setActive(c.id)}>
            <Building2 className="h-4 w-4" strokeWidth={1.75} />
            <span className="truncate">{c.name}</span>
            <span className="ml-auto text-[11px] uppercase tracking-wider text-muted-foreground">
              {c.region}
            </span>
            {activeCampusId === c.id ? (
              <Check className="ml-1.5 h-3.5 w-3.5 text-primary" />
            ) : null}
          </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
