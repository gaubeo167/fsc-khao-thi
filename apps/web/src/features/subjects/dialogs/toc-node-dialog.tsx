"use client";

import { zodResolverSafe } from "@/lib/zod-resolver";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { TOC_LEVEL_LABEL } from "../data/seed-toc";
import { TocNodeSchema, type TocNodeValues } from "../schemas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  depth: number;
  initialName?: string;
  parentName?: string;
  onSubmit: (values: TocNodeValues) => void;
}

export function TocNodeDialog({
  open,
  onOpenChange,
  mode,
  depth,
  initialName = "",
  parentName,
  onSubmit,
}: Props) {
  const levelLabel = TOC_LEVEL_LABEL[Math.min(depth, TOC_LEVEL_LABEL.length - 1)];

  const form = useForm<TocNodeValues>({
    resolver: zodResolverSafe(TocNodeSchema),
    defaultValues: { name: initialName },
    mode: "onBlur",
  });

  useEffect(() => {
    if (open) form.reset({ name: initialName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName]);

  function submit(values: TocNodeValues) {
    onSubmit(values);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? `Thêm ${levelLabel}` : `Chỉnh sửa ${levelLabel}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" && parentName ? (
              <>
                Thêm vào{" "}
                <span className="font-medium text-foreground/85">{parentName}</span>.
              </>
            ) : mode === "create" ? (
              "Tạo mục gốc trong cây mục lục."
            ) : (
              "Đổi tên mục đã chọn."
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/80">
              Tên {levelLabel.toLowerCase()}
            </Label>
            <Input
              placeholder={`vd: ${
                depth === 0
                  ? "Chương 1: Mệnh đề - Tập hợp"
                  : depth === 1
                    ? "1.1 Mệnh đề"
                    : depth === 2
                      ? "Khái niệm cơ bản về mệnh đề"
                      : "Vận dụng giải bài toán cụ thể"
              }`}
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register("name")}
              autoFocus
            />
            {form.formState.errors.name ? (
              <p className="text-[12px] text-destructive">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit">
              {mode === "create" ? `Thêm ${levelLabel.toLowerCase()}` : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
