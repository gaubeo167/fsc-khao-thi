"use client";

import { ArrowRight, Building2, Copy, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { LearningMaterial } from "../data/types";

interface Props {
  material: LearningMaterial | null;
  onClose: () => void;
  onConfirm: (m: LearningMaterial) => void;
}

/**
 * Confirmation dialog for copying a learning material between
 * kho cá nhân ↔ kho trường. Mirrors CopyQuestionDialog:
 *   - source = campus  → personal (auto-approved, dùng được ngay)
 *   - source = personal → campus  (status = pending, TBM/Admin duyệt)
 *
 * The underlying Storage object is REUSED — both Firestore docs
 * reference the same storagePath, so no double upload + no extra
 * bandwidth. Archive uses best-effort delete; since the path is shared,
 * archiving the source after a copy leaves the copy pointing at a dead
 * object — acceptable for this MVP, the same caveat applies to the
 * question→question copy flow.
 */
export function CopyMaterialDialog({ material, onClose, onConfirm }: Props) {
  if (!material) return null;

  const sourceIsCampus = material.kho === "campus";
  const SourceIcon = sourceIsCampus ? Building2 : User;
  const TargetIcon = sourceIsCampus ? User : Building2;
  const sourceLabel = sourceIsCampus ? "Kho trường" : "Kho cá nhân";
  const targetLabel = sourceIsCampus ? "Kho cá nhân" : "Kho trường";
  const targetTone = sourceIsCampus ? "emerald" : "amber";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Copy className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <DialogTitle>Sao chép học liệu</DialogTitle>
          </div>
          <DialogDescription>
            Tạo bản sao của học liệu{" "}
            <span className="font-mono">{material.id}</span> sang kho ngược lại.
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="rounded-lg border bg-card px-3 py-2.5 text-center">
            <SourceIcon
              className="mx-auto h-4 w-4 text-foreground/65"
              strokeWidth={1.85}
            />
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-foreground/55">
              Nguồn
            </p>
            <p className="text-[13px] font-semibold text-foreground/85">
              {sourceLabel}
            </p>
          </div>
          <ArrowRight
            className="h-5 w-5 text-muted-foreground"
            strokeWidth={1.85}
          />
          <div
            className={
              targetTone === "emerald"
                ? "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-center"
                : "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-center"
            }
          >
            <TargetIcon
              className={
                targetTone === "emerald"
                  ? "mx-auto h-4 w-4 text-emerald-700"
                  : "mx-auto h-4 w-4 text-amber-700"
              }
              strokeWidth={1.85}
            />
            <p
              className={
                targetTone === "emerald"
                  ? "mt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-700"
                  : "mt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700"
              }
            >
              Đích
            </p>
            <p
              className={
                targetTone === "emerald"
                  ? "text-[13px] font-semibold text-emerald-800"
                  : "text-[13px] font-semibold text-amber-800"
              }
            >
              {targetLabel}
            </p>
          </div>
        </div>

        {sourceIsCampus ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12px] leading-relaxed text-emerald-800">
            <span className="font-semibold">Tự duyệt</span> · Bản sao sẽ vào kho
            cá nhân của bạn với trạng thái{" "}
            <span className="font-semibold">Đã duyệt</span>, dùng được ngay.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
            <span className="font-semibold">Cần duyệt</span> · Bản sao sẽ vào
            kho trường với trạng thái{" "}
            <span className="font-semibold">Chờ duyệt</span>; TBM hoặc Admin
            campus xét duyệt như luồng thông thường.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={() => onConfirm(material)}>
            <Copy className="h-4 w-4" />
            Sao chép sang {targetLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
