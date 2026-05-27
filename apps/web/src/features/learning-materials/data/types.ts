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

/** Where the material's bytes live:
 *   - "upload" — uploaded to Firebase Storage; downloadUrl resolves to it.
 *   - "link"   — external share link (Google Drive / YouTube / OneDrive
 *                / website). No bytes in Storage; storagePath is empty.
 *                The viewer dispatches on hostname to pick an embed mode.
 */
export type MaterialSourceType = "upload" | "link";

export interface LearningMaterial {
  id: string;

  title: string;
  description?: string;

  sourceType: MaterialSourceType;
  /** Inferred from the uploaded file's MIME type. For link sources, we
   *  heuristically classify by URL pattern (youtube → video, .pdf → pdf). */
  fileType: MaterialFileType;
  /** Storage object path. Empty string for link sources. */
  storagePath: string;
  /** Resolved viewer URL — Firebase Storage downloadURL for uploads,
   *  the user-supplied externalUrl for link sources. */
  downloadUrl: string;
  /** Mirror of downloadUrl for link sources — kept separately so archive
   *  flows know to skip Storage deletion. */
  externalUrl?: string;
  /** Original filename uploaded — kept for display + download attribute.
   *  Empty for link sources. */
  originalFilename: string;
  /** Raw MIME type from the upload. Empty for link sources. */
  contentType: string;
  /** File size in bytes (0 for link). */
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

/**
 * Heuristic classifier for an external link's content type. Used in
 * link-mode upload so the card / viewer can show the right icon and
 * dispatch to the right embed.
 */
export function inferFileTypeFromUrl(rawUrl: string): MaterialFileType {
  const url = rawUrl.toLowerCase();
  if (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("vimeo.com") ||
    url.endsWith(".mp4") ||
    url.endsWith(".webm")
  ) {
    return "video";
  }
  if (url.endsWith(".pdf") || url.includes("/pdf/")) return "pdf";
  if (url.endsWith(".docx") || url.endsWith(".doc")) return "word";
  if (url.endsWith(".pptx") || url.endsWith(".ppt")) return "powerpoint";
  if (url.endsWith(".xlsx") || url.endsWith(".xls") || url.endsWith(".csv")) {
    return "excel";
  }
  if (
    url.endsWith(".png") ||
    url.endsWith(".jpg") ||
    url.endsWith(".jpeg") ||
    url.endsWith(".gif") ||
    url.endsWith(".webp")
  ) {
    return "image";
  }
  if (
    url.endsWith(".mp3") ||
    url.endsWith(".wav") ||
    url.endsWith(".m4a") ||
    url.endsWith(".ogg")
  ) {
    return "audio";
  }
  return "other";
}

/**
 * Best-effort transform of a sharing URL into an embeddable iframe URL.
 *
 *   - YouTube → /embed/{id} so the viewer iframe plays inline.
 *   - Google Drive → /preview link so the iframe shows the file.
 *   - Other → return URL as-is; caller can wrap in <a> if iframe fails.
 */
export function toEmbedUrl(rawUrl: string): {
  embedUrl: string;
  canIframe: boolean;
} {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    // YouTube short link: https://youtu.be/{id}
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return { embedUrl: `https://www.youtube.com/embed/${id}`, canIframe: true };
    }
    // YouTube full: https://www.youtube.com/watch?v={id}
    if (host.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return { embedUrl: `https://www.youtube.com/embed/${id}`, canIframe: true };
      // /embed/{id} already embeddable
      if (u.pathname.startsWith("/embed/")) {
        return { embedUrl: rawUrl, canIframe: true };
      }
    }
    // Google Drive — convert /file/d/{id}/view → /file/d/{id}/preview
    if (host.includes("drive.google.com")) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m) {
        return {
          embedUrl: `https://drive.google.com/file/d/${m[1]}/preview`,
          canIframe: true,
        };
      }
    }
    // Generic — try as-is.
    return { embedUrl: rawUrl, canIframe: true };
  } catch {
    return { embedUrl: rawUrl, canIframe: false };
  }
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
