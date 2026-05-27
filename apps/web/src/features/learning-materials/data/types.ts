/**
 * Learning Materials (Học liệu) — uploaded videos / PDFs / Word / PPT
 * teachers attach for students. Sister module of /questions in the
 * same admin shell; same kho (personal vs campus) + status workflow.
 *
 * Bytes live in Firebase Storage (`materials/{scope}/{id}/{filename}`);
 * this Firestore doc only carries metadata + the resolved downloadUrl.
 */

export type MaterialFileType =
  | "video"
  | "pdf"
  | "word"
  | "powerpoint"
  | "excel"
  | "image"
  | "audio"
  | "other";

export type MaterialKho = "personal" | "campus";

export type MaterialStatus = "draft" | "pending" | "approved" | "rejected";

export interface LearningMaterial {
  id: string;

  title: string;
  description?: string;

  /** Inferred from the uploaded file's MIME type. */
  fileType: MaterialFileType;
  /** Storage object path. Use deleteStoredFile() with this when archiving. */
  storagePath: string;
  /** Public download URL resolved at upload time. Firebase Storage
   *  download URLs are stable for the lifetime of the object. */
  downloadUrl: string;
  /** Original filename uploaded — kept for display + download attribute. */
  originalFilename: string;
  /** Raw MIME type from the upload. */
  contentType: string;
  sizeBytes: number;

  /** Subject + grade tagging (mirrors question metadata) so the
   *  student-facing list can filter by what they're studying. */
  subjectId: string;
  gradeId: string | null;
  /** Optional class restriction — when set, only those classIds see it. */
  classIds?: string[];
  /** Optional TOC node link — same hierarchy as questions. */
  tocNodeId?: string | null;
  tags: string[];

  /** Same approval pattern as questions: personal = no approval, campus
   *  = TBM/admin duyệt. */
  kho: MaterialKho;
  status: MaterialStatus;
  approvedBy?: string | null;
  rejectionNote?: string | null;

  ownerId: string;
  ownerName: string;
  campusId: string | null;

  /** Soft-delete bookkeeping (see lib/lifecycle.ts). */
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;

  /** Version chain (see lib/version.ts). */
  version?: number;
  versionOfRootId?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Map a MIME type / filename to our coarse file-type bucket so the UI
 * picks the right icon + viewer.
 */
export function inferFileType(
  contentType: string,
  filename: string,
): MaterialFileType {
  const ct = (contentType ?? "").toLowerCase();
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ct.startsWith("video/") || ["mp4", "webm", "mov", "mkv"].includes(ext)) {
    return "video";
  }
  if (ct === "application/pdf" || ext === "pdf") return "pdf";
  if (
    ct.includes("word") ||
    ext === "doc" ||
    ext === "docx" ||
    ext === "odt"
  ) {
    return "word";
  }
  if (
    ct.includes("presentation") ||
    ext === "ppt" ||
    ext === "pptx" ||
    ext === "odp"
  ) {
    return "powerpoint";
  }
  if (
    ct.includes("spreadsheet") ||
    ct.includes("excel") ||
    ext === "xls" ||
    ext === "xlsx" ||
    ext === "csv"
  ) {
    return "excel";
  }
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("audio/")) return "audio";
  return "other";
}

export const FILE_TYPE_LABEL: Record<MaterialFileType, string> = {
  video: "Video",
  pdf: "PDF",
  word: "Word",
  powerpoint: "PowerPoint",
  excel: "Excel",
  image: "Hình ảnh",
  audio: "Audio",
  other: "Tệp khác",
};

/** Format bytes → human-friendly string (KB / MB / GB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
