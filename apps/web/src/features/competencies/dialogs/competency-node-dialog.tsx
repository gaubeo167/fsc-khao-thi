"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  BLOOM_LEVELS,
  competencyKindMeta,
  type BloomLevel,
  type CompetencyKind,
} from "../data/types";

export interface CompetencyNodeDraft {
  title: string;
  code: string | null;
  bloomLevel: BloomLevel | null;
}

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  mode: "add" | "edit";
  kind: CompetencyKind;
  initial?: CompetencyNodeDraft;
  onSubmit(draft: CompetencyNodeDraft): void;
}

export function CompetencyNodeDialog({
  open,
  onOpenChange,
  mode,
  kind,
  initial,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [bloom, setBloom] = useState<BloomLevel | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setCode(initial?.code ?? "");
      setBloom(initial?.bloomLevel ?? (kind === "outcome" ? 1 : null));
    }
  }, [open, initial, kind]);

  const meta = competencyKindMeta(kind);
  const canSave = title.trim().length > 0;

  function submit() {
    if (!canSave) return;
    onSubmit({
      title: title.trim(),
      code: code.trim() || null,
      bloomLevel: kind === "outcome" ? bloom : null,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent srDescription="Tạo hoặc sửa một mục trong khung Yêu cầu cần đạt: mã, tên và cấp bậc." className="max-w-md p-0">
        <header className="border-b px-5 py-3.5">
          <DialogTitle className="text-section-title">
            {mode === "add" ? "Thêm" : "Sửa"} {meta.full}
          </DialogTitle>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {kind === "outcome"
              ? "Yêu cầu cần đạt (YCCĐ) — nội dung + mã + mức Bloom."
              : `${meta.full} — nhóm chứa các mục con.`}
          </p>
        </header>

        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Nội dung {kind === "outcome" ? "YCCĐ" : "tên"}
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={kind === "outcome" ? 3 : 1}
              placeholder={
                kind === "outcome"
                  ? "vd: Nêu được đối tượng nghiên cứu của Sinh học"
                  : "vd: Sinh học tế bào"
              }
              className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              Mã (tuỳ chọn)
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="vd: SI10.01.1.D01"
              className="mt-1 h-8 font-mono text-[12px]"
            />
          </div>

          {kind === "outcome" && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                Mức nhận thức (Bloom)
              </label>
              <div className="mt-1 flex gap-1.5">
                {BLOOM_LEVELS.map((b) => (
                  <button
                    key={b.level}
                    type="button"
                    onClick={() => setBloom(b.level)}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-[12px] font-semibold transition",
                      bloom === b.level
                        ? cn(b.chipBg, b.chipFg, b.border, "ring-1")
                        : "border-border bg-card text-muted-foreground hover:bg-accent/30",
                    )}
                  >
                    {b.full}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t bg-[var(--color-surface-2)] px-5 py-3">
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button size="sm" onClick={submit} disabled={!canSave}>
            {mode === "add" ? "Thêm" : "Lưu"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
