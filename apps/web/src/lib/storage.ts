"use client";

/**
 * Firebase Storage helpers — used by the learning-materials feature to
 * upload videos / PDFs / docs and resolve their download URLs.
 *
 * Storage layout:
 *   materials/{campusId | "personal"}/{materialId}/{filename}
 *
 * The path is content-addressable by materialId so renaming the title
 * doesn't move bytes. campusId is part of the path so security rules
 * can scope writes per-campus without consulting Firestore.
 */

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";

import { getStorageSafe, isFirebaseConfigured } from "./firebase";

export interface UploadProgress {
  /** Bytes already uploaded. */
  bytesTransferred: number;
  /** Total file size. */
  totalBytes: number;
  /** 0–1 ratio for progress bars. */
  fraction: number;
}

export interface UploadResult {
  storagePath: string;
  downloadUrl: string;
  sizeBytes: number;
  contentType: string;
}

/**
 * Upload a File / Blob to Firebase Storage at the given path.
 *
 * Returns a Promise resolving with the final downloadUrl. While in
 * flight, calls `onProgress` after every chunk so the UI can render a
 * progress bar. Aborting is not yet exposed (callers can drop the
 * promise; the upload continues in the background but no UX touches
 * happen). Phase F could add an abort handle.
 */
export async function uploadFile(
  path: string,
  file: Blob,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "[storage] Firebase chưa được cấu hình. Set NEXT_PUBLIC_FIREBASE_* trước khi upload.",
    );
  }
  const storage = getStorageSafe();
  const objectRef = ref(storage, path);
  const task = uploadBytesResumable(objectRef, file, {
    contentType: (file as File).type || "application/octet-stream",
  });
  return new Promise<UploadResult>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        onProgress?.({
          bytesTransferred: snap.bytesTransferred,
          totalBytes: snap.totalBytes,
          fraction:
            snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0,
        });
      },
      (err) => reject(err),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve({
            storagePath: path,
            downloadUrl,
            sizeBytes: task.snapshot.totalBytes,
            contentType:
              task.snapshot.metadata.contentType ?? "application/octet-stream",
          });
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

/** Best-effort delete of a stored object. Swallows "not found" errors
 *  so the caller (archive flow) can stay idempotent. */
export async function deleteStoredFile(path: string): Promise<void> {
  if (!isFirebaseConfigured() || !path) return;
  try {
    await deleteObject(ref(getStorageSafe(), path));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[storage] deleteObject ${path} failed (ignored)`, err);
  }
}

/* ── Media của câu hỏi (audio bài nghe) ────────────────────────────────── */

/** Trần dung lượng một file audio. ~20 phút mp3 128kbps. */
export const MAX_QUESTION_AUDIO_BYTES = 20 * 1024 * 1024;

/**
 * Đường lưu file media của câu hỏi.
 *
 *   question-media/{uid}/{dấu-thời-gian}-{tên-file-đã-làm-sạch}
 *
 * Vì sao KHÔNG nhét thẳng vào nội dung câu hỏi dưới dạng base64 như ảnh:
 * base64 làm phình 33%, mà một tài liệu Firestore chỉ chứa được 1MB. Ảnh
 * chặn ở 2MB đã sát trần; một bài nghe 5 phút là 5MB, nhét vào là câu hỏi
 * KHÔNG LƯU ĐƯỢC — và lỗi chỉ nổ lúc bấm lưu, sau khi người soạn đã gõ xong
 * cả câu.
 *
 * uid nằm trong đường dẫn để rules chặn người này ghi đè file người kia mà
 * không phải đọc Firestore.
 */
export function questionAudioPath(uid: string, fileName: string): string {
  const clean = (fileName || "audio")
    .normalize("NFKD")
    // Bỏ dấu tiếng Việt: tên file có dấu đi qua URL storage thành %-encode
    // dài loằng ngoằng, và một số trình phát cũ không đọc được.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-80);
  return `question-media/${uid}/${Date.now()}-${clean || "audio"}`;
}
