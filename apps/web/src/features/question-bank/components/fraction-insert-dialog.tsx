"use client";

import { Check, Divide } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Math } from "./math";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (snippet: string) => void;
}

const QUICK: Array<{ n: string; d: string }> = [
  { n: "1", d: "2" },
  { n: "1", d: "3" },
  { n: "2", d: "3" },
  { n: "1", d: "4" },
  { n: "3", d: "4" },
  { n: "1", d: "5" },
  { n: "2", d: "5" },
  { n: "3", d: "5" },
  { n: "1", d: "6" },
  { n: "5", d: "6" },
  { n: "1", d: "8" },
  { n: "3", d: "8" },
];

export function FractionInsertDialog({ open, onOpenChange, onInsert }: Props) {
  const [num, setNum] = useState("");
  const [den, setDen] = useState("");
  const [display, setDisplay] = useState(false);

  useEffect(() => {
    if (!open) {
      setNum("");
      setDen("");
      setDisplay(false);
    }
  }, [open]);

  function insert(n: string, d: string) {
    const tex = `\\frac{${n.trim()}}{${d.trim()}}`;
    const snippet = display ? `$$${tex}$$` : `$${tex}$`;
    onInsert(snippet);
    onOpenChange(false);
  }

  function submit() {
    if (!num.trim() || !den.trim()) return;
    insert(num, den);
  }

  const previewTex =
    num.trim() && den.trim() ? `\\frac{${num.trim()}}{${den.trim()}}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 max-h-[88vh] overflow-y-auto"
        srTitle="Chèn phân số"
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200">
            <Divide className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-section-title">Chèn phân số</h2>
            <p className="text-meta mt-0.5">
              Nhập tử số + mẫu số — sẽ hiển thị dạng phân số chuẩn
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-foreground/80">
                Tử số
              </Label>
              <Input
                autoFocus
                value={num}
                onChange={(e) => setNum(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="vd: 1"
                className="text-center"
              />
            </div>
            <div className="pb-2 text-[28px] font-light text-muted-foreground">
              ⁄
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-foreground/80">
                Mẫu số
              </Label>
              <Input
                value={den}
                onChange={(e) => setDen(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="vd: 2"
                className="text-center"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={!display}
                onChange={() => setDisplay(false)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Inline (trong dòng)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={display}
                onChange={() => setDisplay(true)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Hiển thị riêng dòng
            </label>
          </div>

          <div>
            <p className="text-[13px] font-medium text-foreground/80 mb-1.5">
              Preview
            </p>
            <div className="flex min-h-[80px] items-center justify-center rounded-md border bg-muted/30 px-4 py-5">
              {previewTex ? (
                <Math tex={previewTex} displayMode={display} />
              ) : (
                <span className="text-meta">Nhập tử + mẫu để xem preview…</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[13px] font-medium text-foreground/80 mb-2">
              Phân số thường dùng — click để chèn ngay
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {QUICK.map((q) => (
                <button
                  key={`${q.n}-${q.d}`}
                  type="button"
                  onClick={() => insert(q.n, q.d)}
                  className="flex items-center justify-center rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/4"
                >
                  <Math tex={`\\frac{${q.n}}{${q.d}}`} className="text-[15px]" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={!num.trim() || !den.trim()}>
            <Check className="h-4 w-4" />
            Chèn phân số
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
