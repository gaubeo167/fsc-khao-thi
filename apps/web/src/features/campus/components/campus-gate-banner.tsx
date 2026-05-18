"use client";

import { Globe2, Info } from "lucide-react";
import { memo } from "react";

import { useCampusGate } from "../hooks/use-campus-gate";

/**
 * Slim banner shown at the top of admin pages when the user is in "Tất cả
 * campus" view (superadmin not pinned to a campus). Communicates that the
 * page is read-only and the create-buttons are disabled for that reason.
 *
 * Returns null in any state where mutations are allowed, so call sites can
 * drop it in unconditionally.
 */
export const CampusGateBanner = memo(function CampusGateBanner() {
  const { canMutate, reason } = useCampusGate();
  if (canMutate || !reason) return null;
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
        <Globe2 className="h-3.5 w-3.5" strokeWidth={1.85} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-blue-900">
          Chế độ xem tổng quan toàn hệ thống (chỉ đọc)
        </p>
        <p className="mt-0.5 text-[12px] text-blue-800/90">
          <Info className="mr-1 inline h-3 w-3" strokeWidth={1.85} />
          {reason}
        </p>
      </div>
    </div>
  );
});
