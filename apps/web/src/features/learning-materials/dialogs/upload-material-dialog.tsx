"use client";

import {
  BookOpen,
  CloudUpload,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  Link2,
  Loader2,
  Plus,
  Tag,
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
const MAX_TITLE = 255;
const MAX_DESC = 500;

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
  // Drag-hover state for the upload zone — switches the dashed border
  // to a solid amber accent so the user gets immediate feedback.
  const [dragHover, setDragHover] = useState(false);

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
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
              {sourceType === "upload" ? (
                <CloudUpload className="h-6 w-6" strokeWidth={1.85} />
              ) : (
                <Link2 className="h-6 w-6" strokeWidth={1.85} />
              )}
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[17px]">Thêm học liệu</DialogTitle>
              <DialogDescription className="mt-0.5 leading-snug">
                {sourceType === "upload" ? (
                  <>
                    Hỗ trợ: video, PDF, Word, PPT, Excel, ảnh (≤{" "}
                    {formatFileSize(MAX_BYTES)}) hoặc liên kết. Có thể chia
                    sẻ từ: YouTube, Google Drive, OneDrive…
                  </>
                ) : (
                  <>
                    Chia sẻ liên kết từ YouTube, Google Drive, OneDrive,
                    Dropbox… hoặc URL trực tiếp tới file PDF / MP4.
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Source toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/20 p-1">
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
            <div
              className={cn(
                "relative rounded-xl border-2 border-dashed px-4 py-6 transition-colors",
                dragHover
                  ? "border-amber-400 bg-amber-50"
                  : "border-zinc-200 bg-muted/15 hover:bg-muted/25",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (!submitting) setDragHover(true);
              }}
              onDragLeave={() => setDragHover(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragHover(false);
                if (submitting) return;
                const f = e.dataTransfer.files?.[0];
                if (f) onFileChosen(f);
              }}
            >
              <label className="flex cursor-pointer flex-col items-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600 shadow-inner">
                  <CloudUpload className="h-6 w-6" strokeWidth={1.85} />
                </span>
                {file ? (
                  <>
                    <p className="mt-3 line-clamp-1 max-w-full text-[14px] font-semibold text-foreground">
                      {file.name}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {formatFileSize(file.size)} · bấm để thay file khác
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-[14px] font-semibold text-foreground">
                      Kéo & thả file vào đây
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      hoặc bấm để chọn file
                    </p>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="video/*,audio/*,image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.odt,.odp,.txt"
                  onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
                  disabled={submitting}
                />
              </label>
              <span className="absolute bottom-2 right-3 text-[10.5px] text-muted-foreground">
                Tối đa {formatFileSize(MAX_BYTES)}
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>
                Liên kết chia sẻ <span className="text-rose-500">*</span>
              </Label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://youtu.be/… hoặc https://drive.google.com/…"
                  disabled={submitting}
                  className="pl-9"
                />
              </div>
              <div className="flex items-start justify-between gap-3 text-[11px] text-muted-foreground">
                <p className="flex-1">
                  Hỗ trợ: YouTube, Google Drive (đặt "Anyone with link"),
                  OneDrive, Dropbox hoặc URL trực tiếp tới file PDF / MP4.
                </p>
                <a
                  href="https://support.google.com/drive/answer/2494822"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-blue-600 hover:underline"
                >
                  <HelpCircle className="h-3 w-3" />
                  Hướng dẫn
                </a>
              </div>
            </div>
          )}

          {/* Title with char counter */}
          <FieldWithCounter
            label="Tiêu đề"
            required
            value={title}
            max={MAX_TITLE}
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
              placeholder="VD: Bài giảng Phương trình bậc 2"
              disabled={submitting}
              maxLength={MAX_TITLE}
            />
          </FieldWithCounter>

          {/* Description with char counter */}
          <FieldWithCounter label="Mô tả" value={description} max={MAX_DESC}>
            <textarea
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, MAX_DESC))
              }
              rows={2}
              placeholder="Tóm tắt nội dung học liệu (tuỳ chọn)"
              className="w-full rounded-md border bg-background px-3 py-2 text-[13px] disabled:opacity-50"
              disabled={submitting}
              maxLength={MAX_DESC}
            />
          </FieldWithCounter>

          {/* Subject + Grade with icon-prefixed selects */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Môn học <span className="text-rose-500">*</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                  <BookOpen className="h-3.5 w-3.5" />
                </span>
                <Select
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setTocNodeId("");
                  }}
                  disabled={submitting}
                  className="pl-10"
                >
                  <option value="">Chọn môn học</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Khối</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                  <GraduationCap className="h-3.5 w-3.5" />
                </span>
                <Select
                  value={gradeId}
                  onChange={(e) => {
                    setGradeId(e.target.value);
                    setTocNodeId("");
                  }}
                  disabled={submitting}
                  className="pl-10"
                >
                  <option value="">Chọn khối lớp</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {/* TOC selector — only when subject has authored topics */}
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
                "flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5",
                "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
              )}
            >
              <Tag className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Nhập tag và nhấn Enter…"
                disabled={submitting}
                className="h-7 flex-1 min-w-[160px] border-0 bg-transparent px-0.5 text-[13px] shadow-none outline-none focus-visible:ring-0 disabled:opacity-50"
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
            <p className="text-[11px] text-muted-foreground">
              VD: phương trình, toán 9, bài giảng…
            </p>
          </div>

          {/* Kho */}
          <div className="space-y-1.5">
            <Label>Kho lưu trữ</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <FolderOpen className="h-3.5 w-3.5" />
              </span>
              <Select
                value={kho}
                onChange={(e) => setKho(e.target.value as MaterialKho)}
                disabled={submitting}
                className="pl-10"
              >
                <option value="personal">Kho cá nhân (chỉ tôi xem)</option>
                <option value="campus">
                  Kho trường (chia sẻ HS + GV — cần duyệt)
                </option>
              </Select>
            </div>
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
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width]"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
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
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:from-amber-600 hover:to-orange-600"
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
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors disabled:opacity-50",
        active
          ? "bg-card text-blue-700 shadow-sm ring-1 ring-blue-100"
          : "text-foreground/65 hover:bg-card/60 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/** Field label that shows a "N/MAX" character counter to the right.
 *  Wraps a single input/textarea child so the counter stays in sync
 *  with whatever the user has typed without prop-drilling. */
function FieldWithCounter({
  label,
  required,
  value,
  max,
  children,
}: {
  label: string;
  required?: boolean;
  value: string;
  max: number;
  children: React.ReactNode;
}) {
  const over = value.length > max * 0.9;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>
          {label}
          {required ? <span className="ml-1 text-rose-500">*</span> : null}
        </Label>
        <span
          className={cn(
            "text-[10.5px] font-medium tabular-nums",
            over ? "text-amber-700" : "text-muted-foreground",
          )}
        >
          {value.length}/{max}
        </span>
      </div>
      {children}
    </div>
  );
}
