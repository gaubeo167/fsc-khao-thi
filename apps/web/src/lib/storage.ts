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
    // Chốt chống TREO Ở 0%.
    //
    // Khi kho file chưa mở quyền (chưa deploy storage.rules) hoặc bucket
    // trong biến môi trường trỏ sai, SDK không phải lúc nào cũng báo lỗi —
    // nó thử lại âm thầm và thanh tiến độ nằm im ở 0% mãi. Người dùng không
    // có cách nào biết đang chờ cái gì.
    //
    // Đếm giờ tới lần có tiến triển ĐẦU TIÊN, không phải tới lúc xong: file
    // to thì tải lâu là bình thường, nhưng không nhúc nhích trong 20 giây thì
    // gần như chắc chắn là hỏng cấu hình chứ không phải mạng chậm.
    let moved = false;
    const stall = setTimeout(() => {
      if (moved) return;
      task.cancel();
      // Ba nguyên nhân, xếp theo thứ tự đã gặp THẬT:
      //
      // 1. Dự án chưa BẬT Firebase Storage. Đây là ca đã xảy ra trên
      //    fsc-khao-thi: chưa bấm "Get Started" nên không có bucket nào cả.
      //    SDK không báo lỗi rõ — nó thử lại một cái đích không tồn tại, và
      //    thanh tiến độ nằm im ở 0%.
      // 2. Có bucket nhưng chưa deploy storage.rules → từ chối quyền ghi.
      // 3. Biến môi trường trỏ sai bucket.
      reject(
        new Error(
          "Không kết nối được kho file sau 20 giây. Theo thứ tự hay gặp: " +
            "(1) dự án chưa bật Firebase Storage — vào Firebase Console → " +
            "Storage → Get Started; (2) chưa chạy `firebase deploy --only " +
            "storage`; (3) NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET trỏ sai bucket.",
        ),
      );
    }, 20_000);
    const done = () => clearTimeout(stall);

    task.on(
      "state_changed",
      (snap) => {
        if (snap.bytesTransferred > 0) moved = true;
        onProgress?.({
          bytesTransferred: snap.bytesTransferred,
          totalBytes: snap.totalBytes,
          fraction:
            snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0,
        });
      },
      (err) => {
        done();
        reject(new Error(storageErrorMessage(err)));
      },
      async () => {
        done();
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

/**
 * Đổi mã lỗi của Firebase Storage thành câu người dùng đọc được VÀ làm được.
 *
 * `storage/unauthorized` in ra màn hình thì không ai biết phải làm gì; nói
 * "chưa deploy storage.rules" thì có việc để làm ngay.
 */
export function storageErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
  switch (code) {
    case "storage/unauthorized":
      return "Kho file từ chối quyền ghi. Chạy `firebase deploy --only storage` để cập nhật storage.rules.";
    case "storage/bucket-not-found":
    case "storage/project-not-found":
      return "Không tìm thấy kho file. Kiểm NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET trong biến môi trường.";
    case "storage/unauthenticated":
      return "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi tải lên.";
    case "storage/retry-limit-exceeded":
      return "Mạng chập chờn nên tải lên bị bỏ dở. Thử lại, hoặc dùng file nhỏ hơn.";
    case "storage/canceled":
      return "Đã huỷ tải lên.";
    case "storage/quota-exceeded":
      return "Kho file đã đầy dung lượng của gói.";
    default:
      return err instanceof Error && err.message
        ? err.message
        : "Tải lên thất bại (không rõ nguyên nhân).";
  }
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
