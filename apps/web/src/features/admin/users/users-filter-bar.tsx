"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Role } from "@/features/auth/state/auth-store";
import type { SeedUser } from "@/features/auth/data/seed-users";
import { useCampusesStore } from "@/features/campus/state/campuses-store";

import { ROLE_LABEL } from "./role-labels";

export interface UserFilters {
  query: string;
  role: Role | "all";
  status: SeedUser["status"] | "all";
  campusId: string | "all";
}

interface Props {
  filters: UserFilters;
  onChange: (next: UserFilters) => void;
  hideCampusFilter?: boolean;
  allowedRoles: Role[];
}

export function UsersFilterBar({ filters, onChange, hideCampusFilter, allowedRoles }: Props) {
  const campuses = useCampusesStore((s) => s.campuses);
  const reset = () => onChange({ query: "", role: "all", status: "all", campusId: "all" });
  const dirty =
    filters.query !== "" ||
    filters.role !== "all" ||
    filters.status !== "all" ||
    filters.campusId !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card p-3">
      <div className="relative min-w-[240px] flex-1">
        <Search
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <Input
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Tìm theo tên, email hoặc mã người dùng…"
          className="h-9 pl-8"
        />
      </div>

      <ComboField label="Vai trò">
        <Select
          value={filters.role}
          onChange={(e) => onChange({ ...filters, role: e.target.value as Role | "all" })}
          className="h-9 min-w-[140px]"
        >
          <option value="all">Tất cả</option>
          {allowedRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </ComboField>

      <ComboField label="Trạng thái">
        <Select
          value={filters.status}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value as SeedUser["status"] | "all" })
          }
          className="h-9 min-w-[130px]"
        >
          <option value="all">Tất cả</option>
          <option value="active">Hoạt động</option>
          <option value="invited">Đã mời</option>
          <option value="suspended">Tạm khoá</option>
        </Select>
      </ComboField>

      {!hideCampusFilter ? (
        <ComboField label="Campus">
          <Select
            value={filters.campusId}
            onChange={(e) => onChange({ ...filters, campusId: e.target.value })}
            className="h-9 min-w-[150px]"
          >
            <option value="all">Tất cả</option>
            {campuses
              .filter((c) => c.status === "active")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.replace(/^FSchools /, "")}
                </option>
              ))}
          </Select>
        </ComboField>
      ) : null}

      {dirty ? (
        <button
          type="button"
          onClick={reset}
          className="text-[12px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Xoá bộ lọc
        </button>
      ) : (
        <span className="text-meta hidden items-center gap-1 md:inline-flex">
          <SlidersHorizontal className="h-3 w-3" strokeWidth={1.75} />
          Bộ lọc
        </span>
      )}
    </div>
  );
}

function ComboField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-meta whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}
