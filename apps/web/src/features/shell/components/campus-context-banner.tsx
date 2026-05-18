"use client";

import { Building2, Globe2, X } from "lucide-react";
import { memo } from "react";

import { useAuthStore } from "@/features/auth/state/auth-store";
import {
  CAMPUS_TIER_LABEL,
} from "@/features/campus/data/seed-campuses";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";

/**
 * Banner shown only to superadmin while they have a specific campus pinned.
 * Signals "you're acting as admin of THIS campus" — every create/edit dialog
 * across the app defaults to this campus, every list view scopes to it.
 *
 * Click the X to drop back to the cross-campus ("Tất cả campus") view.
 */
export const CampusContextBanner = memo(function CampusContextBanner() {
  // Select primitive `role` instead of the whole session object so this
  // banner doesn't re-render when unrelated auth-store fields change.
  const isSuperadmin = useAuthStore((s) => s.session?.role === "superadmin");
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const setActive = useCampusStore((s) => s.setActive);
  const campuses = useCampusesStore((s) => s.campuses);

  if (!isSuperadmin) return null;
  if (!activeCampusId) return null;

  const campus = campuses.find((c) => c.id === activeCampusId);
  if (!campus) return null;

  return (
    <div className="border-b bg-blue-50/70">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2 lg:px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600 ring-1 ring-blue-200">
          <Building2 className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[12px] font-semibold text-blue-900">
            Đang thao tác trong{" "}
            <span className="font-bold">{campus.name}</span>
          </p>
          <p className="text-[11px] text-blue-700/85">
            Mã <span className="font-mono">{campus.code}</span> ·{" "}
            {CAMPUS_TIER_LABEL[campus.tier]} · Mọi thay đổi (lớp, môn, câu
            hỏi, ca thi…) sẽ áp dụng cho campus này.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActive(null)}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
        >
          <Globe2 className="h-3.5 w-3.5" strokeWidth={1.85} />
          Quay lại tất cả campus
          <X className="h-3 w-3 text-blue-500" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
});
