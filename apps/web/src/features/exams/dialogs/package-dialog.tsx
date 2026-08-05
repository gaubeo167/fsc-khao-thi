"use client";

import { Boxes, Layers, Package2, Pin, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useQuestionsStore } from "@/features/question-bank/state/questions-store";
import { useSubjectsStore } from "@/features/subjects/state/subjects-store";
import { cn } from "@/lib/utils";

import { DifficultyPills } from "../components/difficulty-pills";
import type {
  ExamBlueprint,
  ExamPackage,
  PackageMatrixRow,
} from "../data/types";
import {
  countBlueprintByDifficulty,
  countTopicByDifficulty,
  indexQuestions,
  validateMatrix,
} from "../lib/blueprint-stats";
import { buildLeafInfo, topicCpAvailability } from "../lib/cp-breakdown";
import { useBlueprintsStore } from "../state/blueprints-store";
import { usePackagesStore } from "../state/packages-store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** If creating: the blueprint to use. If editing: derived from existing.blueprintId. */
  blueprint: ExamBlueprint | null;
  editing?: ExamPackage | null;
  /**
   * Fired right after the dialog closes on a successful save — the parent
   * page uses it to navigate to the packages tab so the user lands on the
   * thing they just created (instead of being dumped back on Khung đề).
   */
  onSaved?(pkg: ExamPackage): void;
}

export function PackageDialog({
  open,
  onOpenChange,
  onSaved,
  blueprint,
  editing,
}: Props) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const blueprints = useBlueprintsStore((s) => s.blueprints);
  const allQuestions = useQuestionsStore((s) => s.questions);
  const createPackage = usePackagesStore((s) => s.create);
  const updatePackage = usePackagesStore((s) => s.update);

  const resolvedBlueprint: ExamBlueprint | null = useMemo(() => {
    if (editing) {
      return blueprints.find((b) => b.id === editing.blueprintId) ?? null;
    }
    return blueprint;
  }, [editing, blueprint, blueprints]);

  const [name, setName] = useState("");
  const [blueprintId, setBlueprintId] = useState<string>("");
  const [duration, setDuration] = useState(60);
  const [matrix, setMatrix] = useState<PackageMatrixRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset state when (re)opened
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setBlueprintId(editing.blueprintId);
      setDuration(editing.duration);
      setMatrix(editing.matrix);
    } else if (blueprint) {
      setName(`Gói đề từ ${blueprint.name}`);
      setBlueprintId(blueprint.id);
      setDuration(blueprint.duration);
      setMatrix(
        blueprint.topics.map((t) => ({
          topicId: t.id,
          easyCount: 0,
          mediumCount: 0,
          hardCount: 0,
        })),
      );
    }
    setError(null);
  }, [open, editing, blueprint]);

  // Re-sync matrix rows if blueprint changes (cover the edge case of switching).
  useEffect(() => {
    if (!resolvedBlueprint) return;
    setMatrix((prev) => {
      const next: PackageMatrixRow[] = resolvedBlueprint.topics.map((t) => {
        const existing = prev.find((r) => r.topicId === t.id);
        return (
          existing ?? {
            topicId: t.id,
            easyCount: 0,
            mediumCount: 0,
            hardCount: 0,
          }
        );
      });
      return next;
    });
  }, [resolvedBlueprint]);

  const questionsIndex = useMemo(
    () => indexQuestions(allQuestions.filter((q) => !q.archivedAt)),
    [allQuestions],
  );

  // CP availability per mạch — for the per-chủ-điểm draw matrix.
  const tocNodes = useSubjectsStore((s) => s.tocNodes);
  const cpByTopic = useMemo(() => {
    const m = new Map<
      string,
      ReturnType<typeof topicCpAvailability>
    >();
    if (!resolvedBlueprint) return m;
    const leaf = buildLeafInfo(
      tocNodes,
      resolvedBlueprint.subjectId,
      resolvedBlueprint.gradeId,
    );
    for (const t of resolvedBlueprint.topics) {
      m.set(t.id, topicCpAvailability(t.pickedQuestionIds, questionsIndex, leaf));
    }
    return m;
  }, [resolvedBlueprint, tocNodes, questionsIndex]);

  // A mạch is drawn by CP when it has at least one CP (leaf) with questions.
  const topicHasCp = (topicId: string) =>
    (cpByTopic.get(topicId)?.cps.length ?? 0) > 0;

  function rowSubtotal(row: PackageMatrixRow): number {
    if (topicHasCp(row.topicId)) {
      const cps = cpByTopic.get(row.topicId)?.cps ?? [];
      const cpSum = cps.reduce((s, c) => s + (row.cpCounts?.[c.nodeId] ?? 0), 0);
      return cpSum + (row.outsideCount ?? 0);
    }
    return row.easyCount + row.mediumCount + row.hardCount;
  }

  const totalRequested = useMemo(
    () => matrix.reduce((s, r) => s + rowSubtotal(r), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matrix, cpByTopic],
  );

  // Any CP / outside / difficulty count exceeding its available pool?
  const cpValid = useMemo(() => {
    for (const r of matrix) {
      if (!topicHasCp(r.topicId)) continue;
      const info = cpByTopic.get(r.topicId);
      if (!info) continue;
      for (const c of info.cps) {
        if ((r.cpCounts?.[c.nodeId] ?? 0) > c.available) return false;
      }
      if ((r.outsideCount ?? 0) > info.outsideAvailable) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, cpByTopic]);

  const blueprintTotals = useMemo(() => {
    if (!resolvedBlueprint) return { easy: 0, medium: 0, hard: 0 };
    return countBlueprintByDifficulty(resolvedBlueprint, questionsIndex);
  }, [resolvedBlueprint, questionsIndex]);

  const validation = useMemo(() => {
    if (!resolvedBlueprint)
      return {
        ok: true,
        totalRequested: 0,
        exceeded: [],
      } as ReturnType<typeof validateMatrix>;
    return validateMatrix(resolvedBlueprint, matrix, questionsIndex);
  }, [resolvedBlueprint, matrix, questionsIndex]);

  function updateRow(
    topicId: string,
    field: "easyCount" | "mediumCount" | "hardCount",
    value: number,
  ) {
    setMatrix((prev) =>
      prev.map((r) =>
        r.topicId === topicId ? { ...r, [field]: Math.max(0, value) } : r,
      ),
    );
  }
  function updateCp(topicId: string, nodeId: string, value: number) {
    setMatrix((prev) =>
      prev.map((r) =>
        r.topicId === topicId
          ? { ...r, cpCounts: { ...(r.cpCounts ?? {}), [nodeId]: Math.max(0, value) } }
          : r,
      ),
    );
  }
  function updateOutside(topicId: string, value: number) {
    setMatrix((prev) =>
      prev.map((r) =>
        r.topicId === topicId ? { ...r, outsideCount: Math.max(0, value) } : r,
      ),
    );
  }

  function handleSubmit() {
    setError(null);
    if (!resolvedBlueprint) {
      setError("Khung đề không hợp lệ.");
      return;
    }
    if (!name.trim()) {
      setError("Vui lòng nhập tên gói đề.");
      return;
    }
    if (!validation.ok || !cpValid) {
      setError("Ma trận vượt quá số câu có sẵn. Giảm số lượng cho phù hợp.");
      return;
    }
    if (totalRequested === 0) {
      setError("Tổng số câu trong ma trận phải lớn hơn 0.");
      return;
    }
    if (!session) {
      setError("Không tìm thấy phiên đăng nhập.");
      return;
    }
    const campusId =
      session.role === "superadmin"
        ? activeCampusId ?? null
        : session.campusId ?? null;

    // Normalise CP-mode rows so cpCounts lists EVERY CP of the mạch (fill 0
    // for untouched ones). The generator uses those keys to tell CP vs
    // "ngoài CP" apart — a missing key would wrongly treat a CP's questions
    // as outside.
    const normalizedMatrix: PackageMatrixRow[] = matrix.map((r) => {
      if (!topicHasCp(r.topicId)) return r;
      const cps = cpByTopic.get(r.topicId)?.cps ?? [];
      const cpCounts: Record<string, number> = {};
      for (const c of cps) cpCounts[c.nodeId] = r.cpCounts?.[c.nodeId] ?? 0;
      return {
        topicId: r.topicId,
        easyCount: 0,
        mediumCount: 0,
        hardCount: 0,
        cpCounts,
        outsideCount: r.outsideCount ?? 0,
      };
    });

    // Approval workflow: every package (regardless of creator role) starts
    // as `pending` and needs Admin campus approval before it can be bốc into
    // a ca thi. Any edit to an approved package knocks it back to `pending`
    // so the new matrix gets reviewed again.
    let saved: ExamPackage | undefined;
    if (editing) {
      const needsReapproval = editing.status === "approved";
      updatePackage(editing.id, {
        name: name.trim(),
        blueprintId: resolvedBlueprint.id,
        duration: Number(duration) || resolvedBlueprint.duration,
        matrix: normalizedMatrix,
        ...(needsReapproval && {
          status: "pending" as const,
          approvedBy: null,
          rejectionNote: null,
        }),
      });
      saved = usePackagesStore.getState().findById(editing.id);
    } else {
      saved = createPackage({
        name: name.trim(),
        blueprintId: resolvedBlueprint.id,
        duration: Number(duration) || resolvedBlueprint.duration,
        matrix: normalizedMatrix,
        campusId,
        ownerId: session.userId,
        ownerName: session.name ?? "—",
        status: "pending",
        approvedBy: null,
        rejectionNote: null,
      });
    }
    onOpenChange(false);
    if (saved) onSaved?.(saved);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 max-h-[94vh] overflow-y-auto">
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <Package2 className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-section-title">Gói đề (Package)</DialogTitle>
            <p className="text-meta mt-0.5">
              Cấu hình ma trận & sinh đề tự động cho ca thi.
            </p>
          </div>
        </header>

        <div className="space-y-5 px-6 py-5">
          {/* Header info */}
          <section className="rounded-xl border bg-surface-2/40 p-4">
            <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
              <Pin className="h-3.5 w-3.5 text-rose-500" strokeWidth={2} />
              Thông tin gói đề
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                  Tên gói đề <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="vd: Gói đề Toán 7 — Test thi giữa kỳ"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                    Khung đề
                  </Label>
                  <Select
                    value={blueprintId}
                    disabled
                    onChange={(e) => setBlueprintId(e.target.value)}
                  >
                    <option value="">— Khung đề —</option>
                    {blueprints.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.06em] text-foreground/65">
                    Thời gian thi (phút)
                  </Label>
                  <Input
                    type="number"
                    min={5}
                    max={300}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value) || 60)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Pool summary */}
          {resolvedBlueprint && (
            <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Boxes className="h-4 w-4 text-blue-600" strokeWidth={2} />
                <p className="text-[13px] font-semibold text-foreground/85">
                  Câu hỏi có trong khung đề
                </p>
                <span className="ml-auto rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                  {resolvedBlueprint.name}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <DifficultyPills counts={blueprintTotals} size="md" />
                <span className="text-[12px] text-blue-900">
                  Tổng:{" "}
                  <span className="font-bold tabular-nums">
                    {blueprintTotals.easy + blueprintTotals.medium + blueprintTotals.hard}
                  </span>{" "}
                  câu khả dụng
                </span>
              </div>
            </section>
          )}

          {/* Matrix editor */}
          {resolvedBlueprint && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-600" strokeWidth={2} />
                <p className="text-[13px] font-semibold text-foreground/85">
                  Ma trận đề thi
                </p>
                <span className="text-meta">
                  — Mỗi đề sinh ra sẽ chứa{" "}
                  <span className="font-semibold text-foreground/85">
                    {totalRequested}
                  </span>{" "}
                  câu
                </span>
              </div>

              <ul className="space-y-3">
                {resolvedBlueprint.topics.map((t) => {
                  const row = matrix.find((r) => r.topicId === t.id) ?? {
                    topicId: t.id,
                    easyCount: 0,
                    mediumCount: 0,
                    hardCount: 0,
                  };
                  const hasCp = topicHasCp(t.id);
                  const info = cpByTopic.get(t.id);
                  const availDiff = countTopicByDifficulty(t, questionsIndex);
                  const subtotal = rowSubtotal(row);
                  return (
                    <li key={t.id} className="rounded-xl border bg-card p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground/85">
                          {t.name || (
                            <span className="italic text-muted-foreground">
                              (Chưa đặt tên)
                            </span>
                          )}
                        </p>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {hasCp
                            ? `${(info?.cps.reduce((s, c) => s + c.available, 0) ?? 0) + (info?.outsideAvailable ?? 0)} câu khả dụng`
                            : `${availDiff.easy + availDiff.medium + availDiff.hard} câu khả dụng`}
                        </span>
                        <span className="ml-auto rounded-md bg-primary-soft px-2.5 py-0.5 text-[12px] font-bold tabular-nums text-primary-text">
                          Bốc {subtotal} câu/đề
                        </span>
                      </div>

                      {hasCp && info ? (
                        <ul className="space-y-1.5">
                          <li className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground/50">
                            Số câu bốc theo chủ điểm (CP)
                          </li>
                          {info.cps.map((c) => (
                            <li
                              key={c.nodeId}
                              className="flex items-center gap-2 text-[12.5px]"
                            >
                              {c.code && (
                                <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
                                  {c.code}
                                </span>
                              )}
                              <span className="min-w-0 flex-1 truncate text-foreground/80">
                                {c.name}
                              </span>
                              <CountInput
                                value={row.cpCounts?.[c.nodeId] ?? 0}
                                max={c.available}
                                onChange={(v) => updateCp(t.id, c.nodeId, v)}
                              />
                            </li>
                          ))}
                          {info.outsideAvailable > 0 && (
                            <li className="flex items-center gap-2 text-[12.5px]">
                              <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                Ngoài CP
                              </span>
                              <span className="min-w-0 flex-1 text-muted-foreground">
                                Câu chưa gắn chủ điểm cụ thể
                              </span>
                              <CountInput
                                value={row.outsideCount ?? 0}
                                max={info.outsideAvailable}
                                onChange={(v) => updateOutside(t.id, v)}
                              />
                            </li>
                          )}
                        </ul>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                          <DiffCell
                            label="NB"
                            cls="text-emerald-700"
                            value={row.easyCount}
                            max={availDiff.easy}
                            onChange={(v) => updateRow(t.id, "easyCount", v)}
                          />
                          <DiffCell
                            label="TH"
                            cls="text-amber-700"
                            value={row.mediumCount}
                            max={availDiff.medium}
                            onChange={(v) => updateRow(t.id, "mediumCount", v)}
                          />
                          <DiffCell
                            label="VDC"
                            cls="text-rose-700"
                            value={row.hardCount}
                            max={availDiff.hard}
                            onChange={(v) => updateRow(t.id, "hardCount", v)}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {(!validation.ok || !cpValid) && (
                <div className="mt-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  Có ô yêu cầu vượt quá số câu có sẵn — giảm số lượng cho phù hợp.
                </div>
              )}
            </section>
          )}

          {error && (
            <div className="rounded-lg border border-destructive-border bg-destructive-soft px-3 py-2 text-[13px] text-destructive-text">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <span className="font-semibold">Lưu ý:</span> Mọi gói đề khi tạo
            mới hoặc chỉnh sửa đều chuyển về trạng thái{" "}
            <span className="font-semibold">Chờ duyệt</span> và cần Admin
            campus / Giám đốc Học thuật xét duyệt. Chỉ gói đề{" "}
            <span className="font-semibold">Đã duyệt</span> mới bốc được vào
            ca kíp thi.
            {editing?.status === "approved" && (
              <span className="mt-1 block font-semibold text-amber-900">
                Gói đề này đang ở trạng thái Đã duyệt — lưu thay đổi sẽ tự
                động đưa về Chờ duyệt lại.
              </span>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
            Hủy
          </Button>
          <Button onClick={handleSubmit}>
            <Save className="h-4 w-4" />
            {editing ? "Lưu thay đổi" : "Lưu gói đề"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function CountInput({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange(v: number): void;
}) {
  const over = value > max;
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={cn(
          "w-16 rounded-md border bg-background px-2 py-1 text-center text-[13px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          over
            ? "border-rose-400 bg-rose-50 text-rose-700"
            : "border-input focus-visible:border-ring",
        )}
      />
      <span className="text-[11px] text-muted-foreground tabular-nums">
        / {max}
      </span>
    </div>
  );
}

function DiffCell({
  label,
  cls,
  value,
  max,
  onChange,
}: {
  label: string;
  cls: string;
  value: number;
  max: number;
  onChange(v: number): void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-[11px] font-bold uppercase tracking-[0.06em]", cls)}>
        {label}
      </span>
      <CountInput value={value} max={max} onChange={onChange} />
    </div>
  );
}
