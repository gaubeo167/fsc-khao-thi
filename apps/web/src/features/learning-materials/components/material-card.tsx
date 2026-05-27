"use client";

import {
  Copy,
  Eye,
  FileSpreadsheet,
  FileText,
  FileType,
  ImageIcon,
  Link2,
  Music2,
  PencilLine,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { memo } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { versionOf } from "@/lib/version";

import {
  FILE_TYPE_LABEL,
  formatFileSize,
  type LearningMaterial,
  type MaterialFileType,
} from "../data/types";

const STATUS_LABEL: Record<LearningMaterial["status"], string> = {
  approved: "Đã duyệt",
  pending: "Chờ duyệt",
  draft: "Bản nháp",
  rejected: "Từ chối",
};

interface Props {
  material: LearningMaterial;
  onView: (m: LearningMaterial) => void;
  onEdit?: (m: LearningMaterial) => void;
  onArchive?: (m: LearningMaterial) => void;
  onRestore?: (m: LearningMaterial) => void;
  /** When provided, renders a Copy icon button that opens a confirm
   *  dialog (mirrors câu hỏi copy). The destination kho is the opposite
   *  of the source — personal → campus needs TBM duyệt. */
  onDuplicate?: (m: LearningMaterial) => void;
}

function MaterialCardImpl({
  material,
  onView,
  onEdit,
  onArchive,
  onRestore,
  onDuplicate,
}: Props) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const grades = useGradesStore((s) => s.grades);

  const subject = subjects.find((s) => s.id === material.subjectId);
  const grade = material.gradeId
    ? grades.find((g) => g.id === material.gradeId)
    : null;
  const tocLabel = material.tocNodeId
    ? buildTocPathLocal(tocNodes, material.tocNodeId)
    : null;
  const Icon = iconForType(material.fileType);

  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: colorForType(material.fileType) }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.85} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-foreground">
            {material.title}
          </p>
          <p className="truncate text-meta inline-flex items-center gap-1">
            {material.sourceType === "link" ? (
              <>
                <Link2 className="h-3 w-3" /> Liên kết · {FILE_TYPE_LABEL[material.fileType]}
              </>
            ) : (
              <>
                {FILE_TYPE_LABEL[material.fileType]} ·{" "}
                {formatFileSize(material.sizeBytes)} · {material.originalFilename}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            title={material.fileType === "video" ? "Phát" : "Xem"}
            onClick={() => onView(material)}
          >
            {material.fileType === "video" ? (
              <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
          </IconButton>
          {onEdit && !material.archivedAt ? (
            <IconButton
              size="sm"
              variant="primary"
              title="Chỉnh sửa"
              onClick={() => onEdit(material)}
            >
              <PencilLine className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          ) : null}
          {onDuplicate && !material.archivedAt ? (
            <IconButton
              size="sm"
              title={
                material.kho === "campus"
                  ? "Sao chép sang kho cá nhân"
                  : "Sao chép sang kho trường (cần duyệt)"
              }
              onClick={() => onDuplicate(material)}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          ) : null}
          {material.archivedAt && onRestore ? (
            <IconButton
              size="sm"
              variant="primary"
              title="Khôi phục"
              onClick={() => onRestore(material)}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          ) : onArchive ? (
            <IconButton
              size="sm"
              variant="destructive"
              title="Lưu trữ"
              onClick={() => onArchive(material)}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </div>
      </header>

      {material.description || tocLabel || material.tags.length > 0 ? (
        <div className="space-y-2 px-4 py-3 text-[12.5px] leading-relaxed text-foreground/80">
          {material.description ? <p>{material.description}</p> : null}
          {tocLabel ? (
            <p className="text-meta">
              📖 <span className="font-medium text-foreground/75">{tocLabel}</span>
            </p>
          ) : null}
          {material.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {material.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10.5px] font-medium text-foreground/70"
                >
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 border-t bg-card/50 px-4 py-2.5 text-[11.5px]">
        {subject && (
          <span
            className="rounded px-1.5 py-0.5 font-semibold"
            style={{
              backgroundColor: `${subject.color}1A`,
              color: subject.color,
            }}
          >
            {subject.name}
          </span>
        )}
        {grade && (
          <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-foreground/70">
            {grade.name}
          </span>
        )}
        <span className="text-muted-foreground">
          Tải lên bởi{" "}
          <span className="font-medium text-foreground/75">{material.ownerName}</span>
        </span>
        <span className="text-muted-foreground">
          ·{" "}
          {material.kho === "campus" ? (
            <span className="text-blue-700">Kho trường</span>
          ) : (
            <span>Kho cá nhân</span>
          )}
        </span>

        {versionOf(material) > 1 ? (
          <span className="ml-auto rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
            v{versionOf(material)}
          </span>
        ) : null}
        <StatusBadge
          variant={material.status}
          className={versionOf(material) > 1 ? "" : "ml-auto"}
        >
          {STATUS_LABEL[material.status]}
        </StatusBadge>
        {material.archivedAt ? (
          <span className="rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
            🗄 Đã lưu trữ
          </span>
        ) : null}
      </footer>
    </article>
  );
}

function iconForType(t: MaterialFileType) {
  switch (t) {
    case "video":
      return Play;
    case "pdf":
    case "word":
      return FileText;
    case "powerpoint":
      return FileType;
    case "excel":
      return FileSpreadsheet;
    case "image":
      return ImageIcon;
    case "audio":
      return Music2;
    default:
      return FileText;
  }
}
function colorForType(t: MaterialFileType): string {
  switch (t) {
    case "video":
      return "#DC2626";
    case "pdf":
      return "#D97706";
    case "word":
      return "#1D4ED8";
    case "powerpoint":
      return "#EA580C";
    case "excel":
      return "#059669";
    case "image":
      return "#7C3AED";
    case "audio":
      return "#0891B2";
    default:
      return "#525252";
  }
}

/** Walk the parent chain to build a slash-separated TOC path label.
 *  Inlined here (instead of importing) since the question-bank version
 *  is local to its dialog. */
function buildTocPathLocal(
  nodes: Array<{ id: string; name: string; parentId: string | null }>,
  nodeId: string,
): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const target = byId.get(nodeId);
  if (!target) return null;
  const labels: string[] = [];
  let current: { id: string; name: string; parentId: string | null } | undefined =
    target;
  let safety = 16;
  while (current && safety-- > 0) {
    labels.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return labels.join(" / ");
}

export const MaterialCard = memo(MaterialCardImpl);
