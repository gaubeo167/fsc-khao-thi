"use client";

import {
  Building2,
  Check,
  Eye,
  FileText,
  Link2,
  Paperclip,
  Search,
  User,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

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
import {
  FILE_TYPE_LABEL,
  type LearningMaterial,
  type MaterialFileType,
} from "@/features/learning-materials/data/types";

const MaterialViewerDialog = dynamic(
  () =>
    import(
      "@/features/learning-materials/dialogs/material-viewer-dialog"
    ).then((m) => m.MaterialViewerDialog),
  { ssr: false, loading: () => null },
);
import { useMaterialsStore } from "@/features/learning-materials/state/materials-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;

  subjectId: string;
  campusId: string | null;
}

type KhoView = "campus" | "personal";

export function MaterialPickerDialog({
  open,
  onOpenChange,
  selectedIds,
  onConfirm,
  subjectId,
  campusId,
}: Props) {
  const session = useAuthStore((s) => s.session);
  const allMaterials = useMaterialsStore((s) => s.materials);
  const subjects = useSubjectsStore((s) => s.subjects);

  const subject = subjects.find((s) => s.id === subjectId) ?? null;

  const [kho, setKho] = useState<KhoView>("campus");
  const [draft, setDraft] = useState<string[]>(selectedIds);
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState<MaterialFileType | "all">("all");
  const [sourceType, setSourceType] = useState<"all" | "upload" | "link">(
    "all",
  );
  const [viewing, setViewing] = useState<LearningMaterial | null>(null);

  if (open && draft.length === 0 && selectedIds.length > 0) {
    setDraft(selectedIds);
  }

  const pool = useMemo(() => {
    const sq = search.trim().toLowerCase();
    return allMaterials
      .filter((m) => {
        if (m.archivedAt) return false;
        if (subjectId && m.subjectId !== subjectId) return false;
        if (campusId && m.campusId && m.campusId !== campusId) return false;
        if (kho === "personal") {
          if (!(m.kho === "personal" && m.ownerId === session?.userId)) {
            return false;
          }
        } else {
          if (!(m.kho === "campus" && m.status === "approved")) return false;
        }
        if (fileType !== "all" && m.fileType !== fileType) return false;
        if (sourceType !== "all" && m.sourceType !== sourceType) return false;
        if (sq) {
          const hay = `${m.title} ${m.description ?? ""} ${m.tags.join(" ")}`
            .toLowerCase();
          if (!hay.includes(sq)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [
    allMaterials,
    search,
    subjectId,
    campusId,
    kho,
    fileType,
    sourceType,
    session?.userId,
  ]);

  function toggle(id: string) {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <Paperclip className="h-5 w-5" strokeWidth={1.85} />
            </span>
            <div>
              <DialogTitle className="text-[16px]">
                Chọn học liệu đính kèm
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                {subject ? `Đang lọc môn ${subject.name}` : "Chọn môn trước"} ·
                HS có thể xem học liệu này khi làm BTVN
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="shrink-0 border-b px-5 py-2">
          <div className="inline-flex rounded-xl border bg-card p-1">
            <KhoTab
              active={kho === "campus"}
              onClick={() => setKho("campus")}
              icon={Building2}
              label="Kho trường"
            />
            <KhoTab
              active={kho === "personal"}
              onClick={() => setKho("personal")}
              icon={User}
              label="Kho cá nhân"
            />
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 border-b px-5 py-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Loại file</Label>
            <Select
              value={fileType}
              onChange={(e) =>
                setFileType(e.target.value as MaterialFileType | "all")
              }
              className="h-9"
            >
              <option value="all">Tất cả</option>
              {Object.entries(FILE_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Nguồn</Label>
            <Select
              value={sourceType}
              onChange={(e) =>
                setSourceType(e.target.value as "all" | "upload" | "link")
              }
              className="h-9"
            >
              <option value="all">Tất cả</option>
              <option value="upload">File upload</option>
              <option value="link">Liên kết</option>
            </Select>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b px-5 py-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tiêu đề / mô tả / tag…"
              className="h-9 pl-8"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft((prev) => prev.filter((id) => !pool.some((m) => m.id === id)));
            }}
          >
            <X className="h-4 w-4" />
            Bỏ chọn hiển thị
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {pool.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/15 px-6 py-10 text-center">
              <p className="text-section-title">Không có học liệu nào phù hợp.</p>
              <p className="text-meta mt-1">
                Tạo thêm ở Ngân hàng câu hỏi → tab Học liệu.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pool.map((m) => {
                const checked = draft.includes(m.id);
                return (
                  <li key={m.id}>
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent/30",
                        checked && "border-primary bg-primary/5",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(m.id)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <span
                          className={cn(
                            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                        >
                          {checked ? (
                            <Check className="h-3 w-3" strokeWidth={3} />
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="line-clamp-1 text-[13px] font-medium">
                            {m.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            {m.sourceType === "link" ? (
                              <span className="inline-flex items-center gap-0.5">
                                <Link2 className="h-3 w-3" /> Liên kết
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5">
                                <FileText className="h-3 w-3" />
                                {m.originalFilename}
                              </span>
                            )}
                            <span className="rounded bg-foreground/8 px-1.5 py-0.5">
                              {FILE_TYPE_LABEL[m.fileType]}
                            </span>
                            {m.tags.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-muted/40 px-1.5 py-0.5"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewing(m);
                        }}
                        title="Xem chi tiết học liệu"
                        className="rounded-md border bg-background p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t bg-muted/15 px-5 py-3">
          <p className="text-[12.5px] font-medium text-foreground/80">
            Đã chọn <span className="text-primary">{draft.length}</span> học liệu
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={() => {
                onConfirm(draft);
                onOpenChange(false);
              }}
            >
              Xác nhận ({draft.length})
            </Button>
          </div>
        </footer>

        <MaterialViewerDialog
          material={viewing}
          onClose={() => setViewing(null)}
        />
      </DialogContent>
    </Dialog>
  );
}

function KhoTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
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
