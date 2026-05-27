"use client";

import { Download, ExternalLink } from "lucide-react";

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
  type LearningMaterial,
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
        className="max-w-4xl max-h-[92vh] overflow-y-auto p-0"
        onPointerDownOutside={(e) => {
          // Single click outside should close — viewer is read-only, no
          // unsaved work to protect.
        }}
      >
        {material && (
          <>
            <DialogHeader className="border-b px-5 py-3">
              <DialogTitle className="text-section-title">
                {material.title}
              </DialogTitle>
              <DialogDescription className="text-meta">
                {FILE_TYPE_LABEL[material.fileType]} ·{" "}
                {formatFileSize(material.sizeBytes)} · {material.originalFilename}
              </DialogDescription>
            </DialogHeader>

            <div className="px-5 py-4">
              <ViewerBody material={material} />
            </div>

            <footer className="flex items-center justify-between border-t bg-muted/30 px-5 py-3">
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
