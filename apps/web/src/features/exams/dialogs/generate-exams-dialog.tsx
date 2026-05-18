"use client";

import { Hash, Sparkles, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";

import type { ExamPackage, GeneratedExam } from "../data/types";
import { generateExams, totalMatrixCount } from "../lib/generate";
import { indexQuestions, validateMatrix } from "../lib/blueprint-stats";
import { useBlueprintsStore } from "../state/blueprints-store";
import { useGeneratedStore } from "../state/generated-store";

interface Props {
  package_: ExamPackage | null;
  onClose(): void;
  /**
   * Fires once the newly generated papers exist in the store. The parent
   * page uses it to jump straight to the "Đề đã sinh" tab so the user can
   * see + thi thử the freshly-minted papers without one extra click.
   */
  onGenerated?(exams: GeneratedExam[]): void;
}

export function GenerateExamsDialog({ package_, onClose, onGenerated }: Props) {
  const blueprint = useBlueprintsStore((s) =>
    package_ ? s.blueprints.find((b) => b.id === package_.blueprintId) ?? null : null,
  );
  const allQuestions = useQuestionsStore((s) => s.questions);
  const addBatch = useGeneratedStore((s) => s.addBatch);
  // Select raw array, then derive — selector must return a stable reference
  // to avoid Zustand's "result of getSnapshot should be cached" warning.
  const allGenerated = useGeneratedStore((s) => s.generated);
  const existing = useMemo(
    () => allGenerated.filter((e) => e.packageId === package_?.id),
    [allGenerated, package_?.id],
  );

  const [count, setCount] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const questionsIndex = useMemo(
    () => indexQuestions(allQuestions),
    [allQuestions],
  );

  const validation = useMemo(() => {
    if (!blueprint || !package_)
      return { ok: false, totalRequested: 0, exceeded: [] };
    return validateMatrix(blueprint, package_.matrix, questionsIndex);
  }, [blueprint, package_, questionsIndex]);

  if (!package_) return null;

  function handleGenerate() {
    setError(null);
    if (!blueprint || !package_) return;
    if (!validation.ok) {
      setError(
        "Khung đề hiện không đủ câu để khớp ma trận. Hãy bốc thêm câu rồi thử lại.",
      );
      return;
    }
    const drafts = generateExams(blueprint, package_, questionsIndex, count);
    const inputs = drafts.map((d) => ({
      packageId: package_.id,
      questionIds: d.questionIds,
      duration: package_.duration,
    }));
    // Continue numbering from existing exams in this package.
    const startIdx = existing.length;
    const created = addBatch(inputs, (i) =>
      `${package_.name} · Đề ${String(startIdx + i).padStart(3, "0")}`,
    );
    onClose();
    onGenerated?.(created);
  }

  const perExam = totalMatrixCount(package_.matrix);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-200">
            <Sparkles className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">Sinh đề tự động</DialogTitle>
            <p className="text-meta mt-0.5">
              Tạo nhiều đề thi khác nhau từ cùng một gói đề, mỗi đề có{" "}
              <span className="font-semibold">{perExam}</span> câu.
            </p>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-lg border bg-surface-2/40 px-3 py-2 text-[12px] text-foreground/75">
            <p>
              <span className="font-semibold">Gói đề:</span> {package_.name}
            </p>
            <p className="mt-0.5">
              <span className="font-semibold">Đã sinh:</span> {existing.length} đề
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
              <Hash className="inline h-3 w-3" /> Số lượng đề cần sinh thêm
            </Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) =>
                setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
              }
            />
            <p className="text-meta">
              Mỗi đề rút random từ pool và được xáo trộn thứ tự câu hỏi — học
              sinh các ca khác nhau sẽ nhận đề khác nhau.
            </p>
          </div>

          {!validation.ok && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Khung đề chưa đủ câu</p>
                <p>
                  Ma trận yêu cầu nhiều câu hơn số đã bốc. Hãy cập nhật khung
                  đề trước khi sinh.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-[13px] text-destructive-text">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
            Hủy
          </Button>
          <Button onClick={handleGenerate} disabled={!validation.ok}>
            <Sparkles className="h-4 w-4" />
            Sinh {count} đề
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
