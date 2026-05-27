"use client";

import { useMemo } from "react";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { MaterialsTab } from "@/features/learning-materials/components/materials-tab";
import { useMaterialsStore } from "@/features/learning-materials/state/materials-store";
import { PageHeader } from "@/features/shell/components/page-header";

/**
 * Student-facing learning materials browser.
 *
 * Visibility rules:
 *   - Only approved campus materials in the student's own campus.
 *   - If the material is class-restricted (classIds non-empty), the
 *     student must belong to one of those classes.
 *   - Personal kho is never shown to students.
 *
 * Archived materials are filtered out by the override list itself, so
 * MaterialsTab's "show archived" toggle doesn't apply.
 */
export default function MyMaterialsPage() {
  const session = useAuthStore((s) => s.session);
  const allMaterials = useMaterialsStore((s) => s.materials);
  const myUser = useAuthStore((s) => s.session);
  const allClasses = useGradesStore((s) => s.classes);
  // Reuse the user record (loaded via users-store mirror) to find the
  // student's classIds + gradeIds — session itself only has campusId.
  // For now we derive from session.campusId + the user's enrolled
  // classes through allClasses ↔ user data; if your student records
  // include classIds via mirror, swap to that.

  const myStudentClassIds = useMemo(() => {
    // session.userId → look up in classes where studentIds includes me.
    if (!session) return new Set<string>();
    const ids = new Set<string>();
    for (const c of allClasses) {
      // Optional fields in some seed shapes
      const studentIds = (c as { studentIds?: string[] }).studentIds ?? [];
      if (studentIds.includes(session.userId)) ids.add(c.id);
    }
    return ids;
  }, [allClasses, session]);

  const visible = useMemo(() => {
    if (!session) return [];
    return allMaterials.filter((m) => {
      if (m.archivedAt) return false;
      if (m.kho !== "campus") return false;
      if (m.status !== "approved") return false;
      if (session.campusId && m.campusId !== session.campusId) return false;
      if (m.classIds && m.classIds.length > 0) {
        // Class-restricted — student must be in one of the listed classes.
        return m.classIds.some((cid) => myStudentClassIds.has(cid));
      }
      return true;
    });
  }, [allMaterials, session, myStudentClassIds]);

  return (
    <>
      <PageHeader
        title="Học liệu của tôi"
        description="Bài giảng, video, tài liệu giáo viên đã chia sẻ cho lớp / khối của bạn."
      />
      <MaterialsTab showAdminControls={false} materialsOverride={visible} />
    </>
  );
}
