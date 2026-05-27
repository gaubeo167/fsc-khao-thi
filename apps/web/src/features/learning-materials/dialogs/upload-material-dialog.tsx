"use client";

import {
  CloudUpload,
  FileText,
  Link2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  TOC_LEVELS,
  type TocNode,
} from "@/features/subjects/data/seed-toc";
import { uploadFile } from "@/lib/storage";
import { cn } from "@/lib/utils";

import {
  formatFileSize,
  inferFileType,
  inferFileTypeFromUrl,
  type LearningMaterial,
  type MaterialKho,
  type MaterialSourceType,
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
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const create = useMaterialsStore((s) => s.create);

  const [sourceType, setSourceType] = useState<MaterialSourceType>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [gradeId, setGradeId] = useState<string>("");
  const [tocNodeId, setTocNodeId] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [kho, setKho] = useState<MaterialKho>("personal");
  const [progress, setProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cascading TOC list — same logic as questions: prefer exact
  // (subject, grade) match, fall back to subject-only if the grade
  // hasn't authored its own TOC yet.
  const { tocOptions, tocFallback } = useMemo(() => {
    if (!subjectId) return { tocOptions: [], tocFallback: false };
    let inScope = tocNodes.filter(
      (n) => n.subjectId === subjectId && n.gradeId === gradeId,
    );
    let fell = false;
    if (inScope.length === 0) {
      inScope = tocNodes.filter((n) => n.subjectId === subjectId);
      if (inScope.length > 0) fell = true;
    }
    const byParent = new Map<string | null, TocNode[]>();
    for (const n of inScope) {
      const list = byParent.get(n.parentId) ?? [];
      list.push(n);
      byParent.set(n.parentId, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);
    const out: Array<{ id: string; label: string; depth: number }> = [];
    function walk(parentId: string | null, depth: number) {
      for (const c of byParent.get(parentId) ?? []) {
        out.push({ id: c.id, label: c.name, depth });
        walk(c.id, depth + 1);
      }
    }
    walk(null, 0);
    return { tocOptions: out, tocFallback: fell };
  }, [subjectId, gradeId, tocNodes]);

  function reset() {
    setSourceType("upload");
    setFile(null);
    setExternalUrl("");
    setTitle("");
    setDescription("");
    setSubjectId("");
    setGradeId("");
    setTocNodeId("");
    setTags([]);
    setTagDraft("");
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
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  function addTag() {
    const v = tagDraft.trim();
    if (!v || tags.includes(v)) {
      setTagDraft("");
      return;
    }
    setTags((prev) => [...prev, v]);
    setTagDraft("");
  }

  function validateUrl(raw: string): boolean {
    try {
      const u = new URL(raw);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function handleSubmit() {
    if (!session) return;
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
    try {
      // Personal kho is auto-approved; campus kho requires TBM/Admin
      // duyệt — same flow as questions.
      const status: LearningMaterial["status"] =
        kho === "personal" ? "approved" : "pending";

      if (sourceType === "link") {
        if (!validateUrl(externalUrl.trim())) {
          toast.error("Liên kết không hợp lệ (cần http:// hoặc https://).");
          setSubmitting(false);
          return;
        }
        const url = externalUrl.trim();
        const fileType = inferFileTypeFromUrl(url);
        create({
          title: title.trim(),
          description: description.trim() || undefined,
          sourceType: "link",
          fileType,
          storagePath: "",
          downloadUrl: url,
          externalUrl: url,
          originalFilename: "",
          contentType: "",
          sizeBytes: 0,
          subjectId,
          gradeId: gradeId || null,
          tocNodeId: tocNodeId || null,
          tags,
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
            ? "Đã thêm liên kết vào kho cá nhân"
            : "Đã thêm liên kết — chờ TBM/Admin duyệt",
        );
        reset();
        onOpenChange(false);
        return;
      }

      // Upload mode
      if (!file) {
        toast.error("Chọn file để upload.");
        setSubmitting(false);
        return;
      }
      setProgress(0);
      const materialId = `MAT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const scope =
        kho === "campus"
          ? campusId ?? "no-campus"
          : `personal-${session.userId}`;
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `materials/${scope}/${materialId}/${safeName}`;
      const upload = await uploadFile(path, file, (p) => setProgress(p.fraction));
      const fileType = inferFileType(upload.contentType, file.name);
      create({
        title: title.trim(),
        description: description.trim() || undefined,
        sourceType: "upload",
        fileType,
        storagePath: upload.storagePath,
        downloadUrl: upload.downloadUrl,
        originalFilename: file.name,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        subjectId,
        gradeId: gradeId || null,
        tocNodeId: tocNodeId || null,
        tags,
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
        err instanceof Error ? `Thao tác thất bại: ${err.message}` : "Thao tác thất bại",
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
        if (submitting) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <CloudUpload className="h-5 w-5" strokeWidth={1.85} />
            </span>
            <div>
              <DialogTitle className="text-[16px]">Thêm học liệu</DialogTitle>
              <DialogDescription className="mt-0.5">
                File (video / PDF / Word / PPT / Excel / ảnh, ≤{" "}
                {formatFileSize(MAX_BYTES)}) hoặc liên kết chia sẻ
                (YouTube / Drive / OneDrive…). Kho trường cần duyệt.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

        <div className="space-y-3">
          {/* Source toggle */}
          <div className="inline-flex rounded-xl border bg-card p-1">
            <SourceTab
              active={sourceType === "upload"}
              onClick={() => setSourceType("upload")}
              icon={CloudUpload}
              label="Upload file"
              disabled={submitting}
            />
            <SourceTab
              active={sourceType === "link"}
              onClick={() => setSourceType("link")}
              icon={Link2}
              label="Dán liên kết"
              disabled={submitting}
            />
          </div>

          {sourceType === "upload" ? (
            <div className="space-y-1.5">
              <Label>Tệp tin *</Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-3 hover:bg-muted/40">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {file ? (
                    <>
                      <p className="truncate text-[13px] font-medium">
                        {file.name}
                      </p>
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
          ) : (
            <div className="space-y-1.5">
              <Label>Liên kết chia sẻ *</Label>
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://youtu.be/… hoặc https://drive.google.com/…"
                disabled={submitting}
              />
              <p className="text-meta">
                Hỗ trợ YouTube, Google Drive (đặt "Anyone with link"),
                OneDrive, Dropbox, hoặc URL trực tiếp tới file PDF / MP4.
              </p>
            </div>
          )}

          {/* Common metadata */}
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
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setTocNodeId(""); // reset TOC when subject changes
                }}
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
                onChange={(e) => {
                  setGradeId(e.target.value);
                  setTocNodeId(""); // reset TOC when grade changes
                }}
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

          {/* TOC selector — only useful once subject is chosen and the
              subject has authored topics. Empty array = silent skip. */}
          {subjectId && tocOptions.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Mục lục (chương / chủ đề)</Label>
              <Select
                value={tocNodeId}
                onChange={(e) => setTocNodeId(e.target.value)}
                disabled={submitting}
              >
                <option value="">— Không gắn mục lục —</option>
                {tocOptions.map((n) => {
                  const lvl =
                    TOC_LEVELS[Math.min(n.depth, TOC_LEVELS.length - 1)]!;
                  return (
                    <option key={n.id} value={n.id}>
                      {"—".repeat(n.depth)} {n.depth > 0 ? " " : ""}[{lvl.short}]{" "}
                      {n.label}
                    </option>
                  );
                })}
              </Select>
              {tocFallback ? (
                <p className="text-[11px] text-amber-700">
                  Khối này chưa có mục lục riêng — đang hiển thị mục lục
                  của khối khác cùng môn.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tag tìm kiếm</Label>
            <div
              className={cn(
                "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5",
                "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
              )}
            >
              {tags.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() =>
                      setTags((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="rounded p-0.5 hover:bg-primary/15"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Nhập tag rồi Enter…"
                disabled={submitting}
                className="h-7 flex-1 min-w-[140px] border-0 bg-transparent px-0.5 shadow-none focus-visible:ring-0"
              />
              {tagDraft.trim() ? (
                <button
                  type="button"
                  onClick={addTag}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/8 px-2 text-[12px] font-medium text-primary hover:bg-primary/15"
                >
                  <Plus className="h-3 w-3" />
                  Thêm
                </button>
              ) : null}
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

          {/* Progress (only relevant in upload mode) */}
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
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-card px-5 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              (sourceType === "upload" && !file) ||
              (sourceType === "link" && !externalUrl.trim())
            }
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {sourceType === "upload" ? "Đang upload…" : "Đang lưu…"}
              </>
            ) : (
              <>
                {sourceType === "upload" ? (
                  <CloudUpload className="h-4 w-4" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {sourceType === "upload" ? "Upload" : "Lưu liên kết"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceTab({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-50",
        active
          ? "bg-foreground text-background"
          : "text-foreground/65 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
