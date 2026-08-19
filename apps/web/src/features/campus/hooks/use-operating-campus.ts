"use client";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";

import { operatingCampusId } from "../lib/campus-scope";

/**
 * Id cơ sở đang thao tác, cho các màn cần lọc dữ liệu theo cơ sở.
 *
 * Cùng luật với `currentCampusId()` (bản đọc ngoài React dùng trong store) —
 * cố ý gọi chung `operatingCampusId` để hai đường không lệch nhau. Trả `null`
 * khi chưa xác định được; nơi gọi hiểu `null` là KHÔNG lọc theo cơ sở.
 */
export function useOperatingCampusId(): string | null {
  const role = useAuthStore((s) => s.session?.role);
  const sessionCampusId = useAuthStore((s) => s.session?.campusId);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  return operatingCampusId(role, sessionCampusId, activeCampusId);
}
