/**
 * Campus master data.
 *
 * Tiers in Vietnamese K-12 schooling map onto fixed grade ranges:
 *   - primary           → Tiểu học             (Khối 1–5)
 *   - secondary         → THCS                 (Khối 6–9)
 *   - high              → THPT                 (Khối 10–12)
 *   - primary-secondary → Liên cấp 1-2         (Khối 1–9)
 *   - all               → Liên cấp 1-2-3       (Khối 1–12)
 *
 * The tier choice on a campus dictates which grades exist there, which in
 * turn constrains class creation, user assignment, and question banks.
 */

export type CampusTier =
  | "primary"
  | "secondary"
  | "high"
  | "primary-secondary"
  | "all";

export const CAMPUS_TIER_LABEL: Record<CampusTier, string> = {
  primary: "Tiểu học (cấp 1)",
  secondary: "THCS (cấp 2)",
  high: "THPT (cấp 3)",
  "primary-secondary": "Liên cấp 1 & 2",
  all: "Liên cấp 1 · 2 · 3",
};

export const CAMPUS_TIER_SHORT: Record<CampusTier, string> = {
  primary: "Cấp 1",
  secondary: "Cấp 2",
  high: "Cấp 3",
  "primary-secondary": "Cấp 1 & 2",
  all: "Liên cấp",
};

/** Returns the grade ids (`grade-1` … `grade-12`) that a tier offers. */
export function gradeIdsForTier(tier: CampusTier): string[] {
  switch (tier) {
    case "primary":
      return [1, 2, 3, 4, 5].map((n) => `grade-${n}`);
    case "secondary":
      return [6, 7, 8, 9].map((n) => `grade-${n}`);
    case "high":
      return [10, 11, 12].map((n) => `grade-${n}`);
    case "primary-secondary":
      return Array.from({ length: 9 }, (_, i) => `grade-${i + 1}`);
    case "all":
      return Array.from({ length: 12 }, (_, i) => `grade-${i + 1}`);
  }
}

export interface Campus {
  id: string;
  code: string;
  name: string;
  region: "Bắc" | "Trung" | "Nam";
  tier: CampusTier;
  /**
   * Cached list of grade ids this campus offers — derived from `tier` but
   * stored so future per-campus overrides (e.g. drop a grade) are possible.
   */
  gradeIds: string[];
  address?: string;
  phone?: string;
  status: "active" | "archived";
  createdAt: string;
}

export const SEED_CAMPUSES: Campus[] = [
  {
    id: "campus-cau-giay",
    code: "CG",
    name: "FSchools Cầu Giấy",
    region: "Bắc",
    tier: "all",
    gradeIds: gradeIdsForTier("all"),
    address: "Cầu Giấy, Hà Nội",
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "campus-hoa-lac",
    code: "HL",
    name: "FSchools Hòa Lạc",
    region: "Bắc",
    tier: "primary-secondary",
    gradeIds: gradeIdsForTier("primary-secondary"),
    address: "Hòa Lạc, Hà Nội",
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "campus-da-nang",
    code: "DN",
    name: "FSchools Đà Nẵng",
    region: "Trung",
    tier: "high",
    gradeIds: gradeIdsForTier("high"),
    address: "Đà Nẵng",
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "campus-hcm",
    code: "HCM",
    name: "FSchools TP. Hồ Chí Minh",
    region: "Nam",
    tier: "all",
    gradeIds: gradeIdsForTier("all"),
    address: "TP. Hồ Chí Minh",
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "campus-can-tho",
    code: "CT",
    name: "FSchools Cần Thơ",
    region: "Nam",
    tier: "secondary",
    gradeIds: gradeIdsForTier("secondary"),
    address: "Cần Thơ",
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
  },
];

export function findCampus(id: string | null | undefined): Campus | undefined {
  if (!id) return undefined;
  return SEED_CAMPUSES.find((c) => c.id === id);
}
