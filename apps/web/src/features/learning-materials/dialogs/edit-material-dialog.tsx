"use client";

import { Loader2, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import {
  TOC_LEVELS,
  type TocNode,
} from "@/features/subjects/data/seed-toc";
import { cn } from "@/lib/utils";

import {
  inferFileTypeFromUrl,
  type LearningMaterial,
  type MaterialKho,
} from "../data/types";
import { useMaterialsStore } from "../state/materials-store";

interface Props {
  material: LearningMaterial | null;
  onClose: () => void;
}

/**
 * Edit dialog — content metadata only. The file itself is immutable
 * (uploads can't swap their bytes without re-uploading, which would
 * be a separate workflow). For link materials the URL is editable
 * (typos / dead links happen).
 */
export function EditMaterialDialog({ material, onClose }: Props) {
  const open = Boolean(material);
  const subjects = useSubjectsStore((s) => s.subjects);
  const grades = useGradesStore((s) => s.grades);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const update = useMaterialsStore((s) => s.update);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [tocNodeId, setTocNodeId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [kho, setKho] = useState<MaterialKho>("personal");
  const [submitting, setSubmitting] = useState(false);

  // Hydrate form when material changes.
  useEffect(() => {
    if (!material) return;
    setTitle(material.title);
    setDescription(material.description ?? "");
    setExternalUrl(material.externalUrl ?? "");
    setSubjectId(material.subjectId);
    setGradeId(material.gradeId ?? "");
    setTocNodeId(material.tocNodeId ?? "");
    setTags(material.tags);
    setKho(material.kho);
  }, [material?.id]);

  const { tocOptions } = useMemo(() => {
    if (!subjectId) return { tocOptions: [] };
    let inScope = tocNodes.filter(
      (n) => n.subjectId === subjectId && n.gradeId === gradeId,
    );
    if (inScope.length === 0) {
      inScope = tocNodes.filter((n) => n.subjectId === subjectId);
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
    return { tocOptions: out };
  }, [subjectId, gradeId, tocNodes]);

  function addTag() {
    const v = tagDraft.trim();
    if (!v || tags.includes(v)) {
      setTagDraft("");
      return;
    }
    setTags((prev) => [...prev, v]);
    setTagDraft("");
  }

  function handleSave() {
    if (!material) return;
    if (!title.trim()) {
      toast.error("Tiêu đề không được để trống");
      return;
    }
    if (material.sourceType === "link") {
      try {
        const u = new URL(externalUrl.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      } catch {
        toast.error("Liên kết không hợp lệ");
        return;
      }
    }
    setSubmitting(true);
    try {
      const isLink = material.sourceType === "link";
      const newUrl = externalUrl.trim();
      // Campus kho changes need re-approval if currently approved —
      // mirrors how question editor knocks pending state on edit. For
      // simplicity we keep current status; teacher must trigger
      // approval workflow separately if they made substantive changes.
      update(material.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        subjectId,
        gradeId: gradeId || null,
        tocNodeId: tocNodeId || null,
        tags,
        kho,
        // Link material — URL edit propagates to both downloadUrl and
        // externalUrl. fileType re-inferred from the new URL.
        ...(isLink
          ? {
              externalUrl: newUrl,
              downloadUrl: newUrl,
              fileType: inferFileTypeFromUrl(newUrl),
            }
          : {}),
      });
      toast.success("Đã cập nhật học liệu");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof Error ? `Cập nhật thất bại: ${e.message}` : "Cập nhật thất bại",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent
        className="max-w-xl max-h-[92vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault();
        }}
      >
        {material && (
          <>
            <DialogHeader>
              <DialogTitle className="inline-flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                Chỉnh sửa học liệu
              </DialogTitle>
              <DialogDescription>
                Nội dung file không thể đổi sau khi upload. Để thay file
                hãy upload học liệu mới rồi lưu trữ cái cũ.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {material.sourceType === "link" && (
                <div className="space-y-1.5">
                  <Label>Liên kết chia sẻ *</Label>
                  <Input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://youtu.be/… hoặc https://drive.google.com/…"
                    disabled={submitting}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Tiêu đề *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Mô tả</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
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
                      setTocNodeId("");
                    }}
                    disabled={submitting}
                  >
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
                      setTocNodeId("");
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

              {tocOptions.length > 0 ? (
                <div className="space-y-1.5">
                  <Label>Mục lục</Label>
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
                </div>
              ) : null}

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
                  <option value="personal">Kho cá nhân</option>
                  <option value="campus">Kho trường (cần duyệt nếu thay đổi)</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Huỷ
              </Button>
              <Button onClick={handleSave} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang lưu…
                  </>
                ) : (
                  "Lưu thay đổi"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
