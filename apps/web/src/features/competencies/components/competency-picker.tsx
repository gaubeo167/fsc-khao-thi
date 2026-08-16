"use client";

import { Check, ChevronsUpDown, Search, Target, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useGradesStore } from "@/features/grades/state/grades-store";
import { cn } from "@/lib/utils";

import { bloomMeta, type Competency } from "../data/types";
import { useCompetenciesStore } from "../state/competencies-store";

interface Props {
  subjectId: string | null | undefined;
  gradeId: string | null | undefined;
  value: string | null | undefined;
  onChange: (competencyId: string | null) => void;
  /** Smaller footprint for inline use inside option / ý rows. */
  compact?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Searchable single-select of OUTCOME competencies (YCCĐ) for a subject+grade.
 * Used to tag a whole question, an mcq option, or one ý of a multi-tf. Shows
 * mã + nội dung + Bloom chip. Optional — clearing sets null.
 */
export function CompetencyPicker({
  subjectId,
  gradeId,
  value,
  onChange,
  compact = false,
  placeholder = "Gắn YCCĐ…",
  className,
}: Props) {
  const competencies = useCompetenciesStore((s) => s.competencies);
  const grades = useGradesStore((s) => s.grades);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Outcomes for this subject+grade (accept null-grade too). If the grade
  // scope is empty, fall back to ALL grades of the subject — mirrors
  // TocTagFields, so YCCĐ imported under a different grade still show.
  const { outcomes, fromOtherGrade, otherGradeIds } = useMemo(() => {
    const none = {
      outcomes: [] as Competency[],
      fromOtherGrade: false,
      otherGradeIds: [] as string[],
    };
    if (!subjectId) return none;
    const isLeaf = (n: Competency) => n.kind === "outcome";
    const sortByCode = (list: Competency[]) =>
      list
        .slice()
        .sort(
          (a, b) => (a.code ?? "").localeCompare(b.code ?? "") || a.order - b.order,
        );

    const exact = competencies.filter(
      (n) =>
        isLeaf(n) &&
        n.subjectId === subjectId &&
        (n.gradeId === gradeId || n.gradeId == null),
    );
    if (exact.length > 0) {
      return {
        outcomes: sortByCode(exact),
        fromOtherGrade: false,
        otherGradeIds: [] as string[],
      };
    }
    // Lùi về mọi khối của môn: khung nhập dưới khối khác vẫn dùng được.
    // NHƯNG phải nói ra. Im lặng ở đây chính là chỗ người dùng thấy "chọn
    // Toán khối 1 mà ra khung của khối 10" và tưởng hệ thống lẫn môn — trong
    // khi thật ra khung đó đang nằm nhầm khối, và không có dấu hiệu nào cho
    // thấy danh sách đang là của khối khác.
    const anyGrade = competencies.filter(
      (n) => isLeaf(n) && n.subjectId === subjectId,
    );
    return {
      outcomes: sortByCode(anyGrade),
      fromOtherGrade: anyGrade.length > 0,
      otherGradeIds: Array.from(
        new Set(anyGrade.map((n) => n.gradeId).filter(Boolean) as string[]),
      ),
    };
  }, [competencies, subjectId, gradeId]);

  /** Tên khối mà khung mượn về đang thuộc — nói tên ra thì người dùng lần
   *  được ngay, thay vì phải đi dò từng khối. */
  const otherGradeNames = (otherGradeIds ?? [])
    .map((id) => grades.find((g) => g.id === id)?.name ?? id)
    .join(", ");

  const byId = useMemo(
    () => new Map(competencies.map((n) => [n.id, n])),
    [competencies],
  );
  const selected = value ? byId.get(value) : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return outcomes;
    return outcomes.filter(
      (n) =>
        (n.code ?? "").toLowerCase().includes(q) ||
        n.title.toLowerCase().includes(q),
    );
  }, [outcomes, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const noFramework = !!subjectId && outcomes.length === 0;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={noFramework}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border bg-card px-2 text-left transition",
          compact ? "h-7 text-[11.5px]" : "h-8 text-[12.5px]",
          noFramework
            ? "cursor-not-allowed border-dashed text-muted-foreground"
            : "hover:border-border/80",
        )}
        title={
          noFramework
            ? "Chưa có khung YCCĐ cho môn/khối này — tạo ở tab Khung YCCĐ"
            : selected
              ? `${selected.code ?? ""} — ${selected.title}`
              : placeholder
        }
      >
        <Target
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            selected ? "text-teal-600" : "text-muted-foreground",
          )}
        />
        {selected ? (
          <SelectedLabel node={selected} compact={compact} />
        ) : (
          <span className="truncate text-muted-foreground">
            {noFramework ? "Chưa có khung YCCĐ" : placeholder}
          </span>
        )}
        {selected && !noFramework && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Bỏ gắn"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        {!selected && !noFramework && (
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && !noFramework && (
        <div className="absolute z-50 mt-1 w-[min(420px,80vw)] rounded-lg border bg-card p-1.5 shadow-lg">
          <div className="relative mb-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo mã / nội dung YCCĐ…"
              className="h-8 w-full rounded-md border bg-card pl-7 pr-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {fromOtherGrade && (
            <p className="text-meta mb-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 leading-snug text-amber-900">
              Khối đang chọn chưa có khung YCCĐ nào. Danh sách dưới đây là khung
              của <b>{otherGradeNames || "khối khác"}</b> trong cùng môn — kiểm
              mã trước khi gắn, hoặc nhập khung cho đúng khối ở mục Chuẩn đầu ra
              (YCCĐ).
            </p>
          )}
          <ul className="max-h-[280px] space-y-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-[12px] text-muted-foreground">
                Không tìm thấy YCCĐ khớp.
              </li>
            ) : (
              filtered.map((n) => {
                const bloom = bloomMeta(n.bloomLevel ?? null);
                const active = n.id === value;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(n.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition",
                        active
                          ? "bg-primary/10"
                          : "hover:bg-accent/40",
                      )}
                    >
                      <span className="mt-0.5 w-3.5 shrink-0">
                        {active && <Check className="h-3.5 w-3.5 text-primary" />}
                      </span>
                      {n.code && (
                        <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">
                          {n.code}
                        </span>
                      )}
                      {bloom && (
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 rounded px-1 text-[9.5px] font-semibold",
                            bloom.chipBg,
                            bloom.chipFg,
                          )}
                        >
                          {bloom.short}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 leading-snug text-foreground/90">
                        {n.title}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function SelectedLabel({
  node,
  compact,
}: {
  node: Competency;
  compact: boolean;
}) {
  const bloom = bloomMeta(node.bloomLevel ?? null);
  return (
    <span className="flex min-w-0 items-center gap-1">
      {node.code && (
        <span className="shrink-0 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">
          {node.code}
        </span>
      )}
      {bloom && (
        <span
          className={cn(
            "shrink-0 rounded px-1 text-[9.5px] font-semibold",
            bloom.chipBg,
            bloom.chipFg,
          )}
        >
          {bloom.short}
        </span>
      )}
      {!compact && (
        <span className="truncate text-foreground/85">{node.title}</span>
      )}
    </span>
  );
}
