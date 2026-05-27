"use client";

import { CloudUpload, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { uploadFile } from "@/lib/storage";

import {
  formatFileSize,
  inferFileType,
  type LearningMaterial,
  type MaterialKho,
} from "../data/types";
import { useMaterialsStore } from "../state/materials-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_BYTES = 100 * 1024 * 1024;

export function UploadMaterialDialog({ open, onOpenChange }: Props) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const create = useMaterialsStore((s) => s.create);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [gradeId, setGradeId] = useState<string>("");
  const [kho, setKho] = useState<MaterialKho>("personal");
  const [progress, setProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFile(null);
    setTitle("");
    setDescription("");
    setSubjectId("");
    setGradeId("");
    setKho("personal");
    setProgress(null);
    setSubmitting(false);
  }

  function onFileChosen(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(
        `File quá lớn (${formatFileSize(f.size)}). Giới hạn ${formatFileSize(MAX_BYTES)}.`,
      );
      return;
    }
    setFile(f);
    if (!title.trim()) {
      setTitle(f.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function handleUpload() {
    if (!session || !file) return;
    if (!title.trim()) {
      toast.error("Nhập tiêu đề học liệu.");
      return;
    }
    if (!subjectId) {
      toast.error("Chọn môn học.");
      return;
    }
    const campusId =
      session.role === "superadmin"
        ? activeCampusId ?? null
        : session.campusId ?? null;
    if (kho === "campus" && !campusId) {
      toast.error("Cần campus đang active để lưu vào kho trường.");
      return;
    }

    setSubmitting(true);
    setProgress(0);
    try {
      const materialId = `MAT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const scope = kho === "campus" ? campusId ?? "no-campus" : `personal-${session.userId}`;
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `materials/${scope}/${materialId}/${safeName}`;
      const upload = await uploadFile(path, file, (p) => {
        setProgress(p.fraction);
      });
      const fileType = inferFileType(upload.contentType, file.name);
      const status: LearningMaterial["status"] =
        kho === "personal" ? "approved" : "pending";
      create({
        title: title.trim(),
        description: description.trim() || undefined,
        fileType,
        storagePath: upload.storagePath,
        downloadUrl: upload.downloadUrl,
        originalFilename: file.name,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        subjectId,
        gradeId: gradeId || null,
        tags: [],
        kho,
        status,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        campusId,
        version: 1,
        versionOfRootId: "",
      });
      toast.success(
        status === "approved"
          ? "Đã upload học liệu vào kho cá nhân"
          : "Đã upload — chờ TBM/Admin duyệt",
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? `Upload thất bại: ${err.message}` : "Upload thất bại",
      );
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submitting) return; // can't close mid-upload
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-w-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <CloudUpload className="h-5 w-5 text-primary" />
            Upload học liệu
          </DialogTitle>
          <DialogDescription>
            Cho phép upload video, PDF, Word, PowerPoint, Excel, hình ảnh.
            Tối đa {formatFileSize(MAX_BYTES)} / file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* File picker */}
          <div className="space-y-1.5">
            <Label>Tệp tin</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-3 hover:bg-muted/40">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                {file ? (
                  <>
                    <p className="truncate text-[13px] font-medium">{file.name}</p>
                    <p className="text-meta">{formatFileSize(file.size)}</p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    Bấm để chọn file
                  </p>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                accept="video/*,audio/*,image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.odt,.odp,.txt"
                onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
                disabled={submitting}
              />
            </label>
          </div>

          {/* Metadata */}
          <div className="space-y-1.5">
            <Label>Tiêu đề *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Bài giảng Phương trình bậc 2"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Mô tả</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Tóm tắt nội dung học liệu (tuỳ chọn)"
              className="w-full rounded-md border bg-background px-3 py-2 text-[13px] disabled:opacity-50"
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Môn học *</Label>
              <Select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={submitting}
              >
                <option value="">— Chọn môn —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Khối</Label>
              <Select
                value={gradeId}
                onChange={(e) => setGradeId(e.target.value)}
                disabled={submitting}
              >
                <option value="">— Mọi khối —</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Kho</Label>
            <Select
              value={kho}
              onChange={(e) => setKho(e.target.value as MaterialKho)}
              disabled={submitting}
            >
              <option value="personal">Kho cá nhân (chỉ tôi xem)</option>
              <option value="campus">
                Kho trường (chia sẻ HS + GV — cần TBM/Admin duyệt)
              </option>
            </Select>
          </div>

          {/* Progress */}
          {progress != null && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11.5px] text-muted-foreground">
                <span>Đang upload…</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Huỷ
          </Button>
          <Button onClick={handleUpload} disabled={!file || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang upload…
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                Upload
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
