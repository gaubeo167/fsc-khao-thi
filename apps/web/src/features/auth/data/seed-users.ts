import type { Role } from "../state/auth-store";

/**
 * Seed user database.
 *
 * The platform is currently running against a mock backend, so this file
 * stands in for the eventual Postgres User table. Password is plain text by
 * design — production code MUST hash and the real auth endpoint will reject
 * these literals. All seed accounts share password "fpt2026" for dev ease.
 *
 * `campusId === null` is reserved for cross-campus roles (superadmin).
 */
export interface SeedUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
  campusId: string | null;
  /** Legacy single-subject label (display only). */
  subject?: string;
  className?: string;
  /**
   * Subjects this teacher / subject-lead is authorised to teach. Used by
   * the per-class teaching assignment editor to filter eligible teachers.
   */
  subjectIds?: string[];
  /**
   * Grades this teacher / subject-lead is responsible for. Combined with
   * subjectIds drives which classes the teacher can be assigned to.
   *
   * Also acts as a STUDENT SUPERVISION scope — a teacher with
   * `gradeIds = ["grade-5"]` manages every K5 class's roster (view roster,
   * reset password, send notification, etc.), even classes they don't
   * personally teach.
   */
  gradeIds?: string[];
  /**
   * Class-level student supervision — narrower than `gradeIds`. When set,
   * the teacher manages exactly these classes' rosters. Useful when 1
   * teacher is responsible for student lifecycle across selected classes
   * without being homeroom or teaching them.
   */
  classIds?: string[];
  /**
   * Per-user permission overrides — let an admin promote a specific
   * teacher to author blueprints / packages / shifts without changing
   * their role. Roles `subject-lead` and above have these implicitly
   * (helper `canCreate*` returns true regardless of the flag).
   */
  permissions?: {
    canCreateBlueprint?: boolean;
    canCreatePackage?: boolean;
    canCreateShift?: boolean;
  };
  status: "active" | "suspended" | "invited";
  createdAt: string;
}

export const SEED_USERS: SeedUser[] = [
  // Superadmin — system-wide, no campus binding
  {
    id: "U-000",
    email: "vietnb4@fpt.edu.vn",
    password: "fpt2026",
    name: "Nguyễn Bá Việt",
    role: "superadmin",
    campusId: null,
    status: "active",
    createdAt: "2026-01-05T00:00:00.000Z",
  },

  // Campus admins
  {
    id: "U-101",
    email: "admin.caugiay@fpt.edu.vn",
    password: "fpt2026",
    name: "Vũ Hà My",
    role: "campus-admin",
    campusId: "campus-cau-giay",
    status: "active",
    createdAt: "2026-01-10T00:00:00.000Z",
  },
  {
    id: "U-102",
    email: "admin.hoalac@fpt.edu.vn",
    password: "fpt2026",
    name: "Lê Tuấn Anh",
    role: "campus-admin",
    campusId: "campus-hoa-lac",
    status: "active",
    createdAt: "2026-01-12T00:00:00.000Z",
  },
  {
    id: "U-103",
    email: "admin.danang@fpt.edu.vn",
    password: "fpt2026",
    name: "Trần Thị Hà",
    role: "campus-admin",
    campusId: "campus-da-nang",
    status: "active",
    createdAt: "2026-02-01T00:00:00.000Z",
  },

  // Subject leads
  {
    id: "U-201",
    email: "tbm.toan.cg@fpt.edu.vn",
    password: "fpt2026",
    name: "Trần Văn Bình",
    role: "subject-lead",
    campusId: "campus-cau-giay",
    subject: "Toán",
    status: "active",
    createdAt: "2026-02-15T00:00:00.000Z",
  },
  {
    id: "U-202",
    email: "tbm.van.cg@fpt.edu.vn",
    password: "fpt2026",
    name: "Nguyễn Thu Hà",
    role: "subject-lead",
    campusId: "campus-cau-giay",
    subject: "Văn",
    status: "active",
    createdAt: "2026-02-18T00:00:00.000Z",
  },
  {
    id: "U-203",
    email: "tbm.toan.hl@fpt.edu.vn",
    password: "fpt2026",
    name: "Đỗ Quang Hưng",
    role: "subject-lead",
    campusId: "campus-hoa-lac",
    subject: "Toán",
    status: "active",
    createdAt: "2026-03-01T00:00:00.000Z",
  },

  // Teachers
  {
    id: "U-301",
    email: "gv.toan.minh@fpt.edu.vn",
    password: "fpt2026",
    name: "Phạm Minh",
    role: "teacher",
    campusId: "campus-cau-giay",
    subject: "Toán",
    status: "active",
    createdAt: "2026-03-05T00:00:00.000Z",
  },
  {
    id: "U-302",
    email: "gv.van.an@fpt.edu.vn",
    password: "fpt2026",
    name: "Lê Hồng An",
    role: "teacher",
    campusId: "campus-cau-giay",
    subject: "Văn",
    status: "active",
    createdAt: "2026-03-07T00:00:00.000Z",
  },
  {
    id: "U-303",
    email: "gv.toan.linh@fpt.edu.vn",
    password: "fpt2026",
    name: "Nguyễn Mỹ Linh",
    role: "teacher",
    campusId: "campus-hoa-lac",
    subject: "Toán",
    status: "active",
    createdAt: "2026-03-10T00:00:00.000Z",
  },
  {
    id: "U-304",
    email: "gv.ly.tuan@fpt.edu.vn",
    password: "fpt2026",
    name: "Trần Tuấn Khang",
    role: "teacher",
    campusId: "campus-da-nang",
    subject: "Vật lý",
    status: "invited",
    createdAt: "2026-04-01T00:00:00.000Z",
  },

  // Students
  {
    id: "U-401",
    email: "lan.nh.7a1@fpt.edu.vn",
    password: "fpt2026",
    name: "Nguyễn Hoàng Lan",
    role: "student",
    campusId: "campus-cau-giay",
    className: "7A1",
    status: "active",
    createdAt: "2026-03-15T00:00:00.000Z",
  },
  {
    id: "U-402",
    email: "duc.tm.7a1@fpt.edu.vn",
    password: "fpt2026",
    name: "Trần Minh Đức",
    role: "student",
    campusId: "campus-cau-giay",
    className: "7A1",
    status: "active",
    createdAt: "2026-03-15T00:00:00.000Z",
  },
  {
    id: "U-403",
    email: "khanh.pt.8b2@fpt.edu.vn",
    password: "fpt2026",
    name: "Phạm Tuấn Khánh",
    role: "student",
    campusId: "campus-hoa-lac",
    className: "8B2",
    status: "active",
    createdAt: "2026-03-16T00:00:00.000Z",
  },
  {
    id: "U-404",
    email: "thao.lt.9c1@fpt.edu.vn",
    password: "fpt2026",
    name: "Lê Thị Thảo",
    role: "student",
    campusId: "campus-da-nang",
    className: "9C1",
    status: "suspended",
    createdAt: "2026-04-02T00:00:00.000Z",
  },
];

export function findUserByIdentifier(identifier: string): SeedUser | undefined {
  const q = identifier.trim().toLowerCase();
  return SEED_USERS.find(
    (u) => u.email.toLowerCase() === q || u.id.toLowerCase() === q,
  );
}

export function validateCredentials(
  identifier: string,
  password: string,
): SeedUser | null {
  const user = findUserByIdentifier(identifier);
  if (!user) return null;
  if (user.password !== password) return null;
  if (user.status !== "active") return null;
  return user;
}
