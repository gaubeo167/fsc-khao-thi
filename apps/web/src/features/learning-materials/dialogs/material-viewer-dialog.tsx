"use client";

import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FileType,
  ImageIcon,
  Link2,
  Music2,
  Play,
} from "lucide-react";

function FileTypeIconForViewer({
  fileType,
}: {
  fileType: MaterialFileType;
}) {
  switch (fileType) {
    case "video":
      return <Play className="h-5 w-5" strokeWidth={1.85} />;
    case "pdf":
    case "word":
      return <FileText className="h-5 w-5" strokeWidth={1.85} />;
    case "powerpoint":
      return <FileType className="h-5 w-5" strokeWidth={1.85} />;
    case "excel":
      return <FileSpreadsheet className="h-5 w-5" strokeWidth={1.85} />;
    case "image":
      return <ImageIcon className="h-5 w-5" strokeWidth={1.85} />;
    case "audio":
      return <Music2 className="h-5 w-5" strokeWidth={1.85} />;
    default:
      return <Link2 className="h-5 w-5" strokeWidth={1.85} />;
  }
}

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  FILE_TYPE_LABEL,
  formatFileSize,
  toEmbedUrl,
  type LearningMaterial,
  type MaterialFileType,
} from "../data/types";

interface Props {
  material: LearningMaterial | null;
  onClose: () => void;
}

export function MaterialViewerDialog({ material, onClose }: Props) {
  const open = Boolean(material);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden p-0"
        onPointerDownOutside={() => {
          // Single click outside should close — viewer is read-only, no
          // unsaved work to protect.
        }}
      >
        {material && (
          <>
            <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                  <FileTypeIconForViewer fileType={material.fileType} />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-section-title">
                    {material.title}
                  </DialogTitle>
                  <DialogDescription className="text-meta">
                    {FILE_TYPE_LABEL[material.fileType]} ·{" "}
                    {formatFileSize(material.sizeBytes)} ·{" "}
                    {material.originalFilename}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ViewerBody material={material} />
            </div>

            <footer className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-5 py-3">
              <p className="text-meta">
                Tải lên bởi{" "}
                <span className="font-medium text-foreground/75">
                  {material.ownerName}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a
                    href={material.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Mở tab mới
                  </a>
                </Button>
                <Button asChild size="sm">
                  <a
                    href={material.downloadUrl}
                    download={material.originalFilename}
                  >
                    <Download className="h-4 w-4" />
                    Tải về
                  </a>
                </Button>
              </div>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ material }: { material: LearningMaterial }) {
  // Link source — dispatch on hostname pattern to embed YouTube /
  // Drive / generic URLs. Falls back to "Open in new tab" CTA when
  // we can't tell.
  if (material.sourceType === "link") {
    const { embedUrl, canIframe } = toEmbedUrl(material.downloadUrl);
    if (canIframe) {
      return (
        <iframe
          src={embedUrl}
          title={material.title}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          className="h-[70vh] w-full rounded-md border"
        />
      );
    }
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-6 py-10 text-center">
        <p className="text-section-title">Không thể xem trực tiếp liên kết này</p>
        <p className="text-meta mt-1">
          Bấm "Mở tab mới" phía dưới để truy cập liên kết gốc.
        </p>
      </div>
    );
  }

  switch (material.fileType) {
    case "video":
      return (
        <video
          src={material.downloadUrl}
          controls
          className="mx-auto max-h-[70vh] w-full rounded-md bg-black"
        />
      );
    case "audio":
      return (
        <audio src={material.downloadUrl} controls className="w-full" />
      );
    case "image":
      return (
        <img
          src={material.downloadUrl}
          alt={material.title}
          className="mx-auto max-h-[70vh] w-auto rounded-md"
        />
      );
    case "pdf":
      return (
        <iframe
          src={material.downloadUrl}
          title={material.title}
          className="h-[70vh] w-full rounded-md border"
        />
      );
    case "word":
    case "powerpoint":
    case "excel":
      // Browsers can't render Office docs natively. Show the Office
      // Online viewer if the downloadUrl is publicly reachable —
      // Firebase Storage download tokens make this work without auth.
      return (
        <div className="space-y-3">
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(material.downloadUrl)}`}
            title={material.title}
            className="h-[70vh] w-full rounded-md border"
          />
          <p className="text-meta">
            Nếu trình xem ở trên không load (mạng / firewall), bấm "Tải về"
            phía dưới và mở bằng Word/PowerPoint/Excel.
          </p>
        </div>
      );
    default:
      return (
        <div className="rounded-lg border border-dashed bg-muted/30 px-6 py-10 text-center">
          <p className="text-section-title">Định dạng chưa hỗ trợ xem trước</p>
          <p className="text-meta mt-1">
            Bấm "Tải về" để mở bằng phần mềm tương ứng trên máy.
          </p>
        </div>
      );
  }
}
