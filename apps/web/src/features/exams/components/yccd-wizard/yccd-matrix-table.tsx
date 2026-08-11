"use client";

import { cn } from "@/lib/utils";
import { bloomMeta } from "@/features/competencies/data/types";

import { cellKey } from "../../lib/generate-yccd";
import type { YccdInventory } from "../../lib/yccd-inventory";
import type { YccdPart } from "../../data/types";

const BLOOMS = [1, 2, 3] as const;

export interface MatrixRow {
  topicId: string;
  topicName: string;
  chapterId: string | null;
  chapterName: string;
}

interface Props {
  rows: MatrixRow[];
  parts: YccdPart[];
  inventory: YccdInventory;
  cells: Record<string, number>;
  /** Điểm mỗi câu theo phần (partId → điểm) để tính tổng điểm + tỉ lệ %. */
  pointsByPart: Record<string, number>;
  onCellChange: (topicId: string, partId: string, bloom: number, value: number) => void;
}

/**
 * The MOET matrix table — rows = Bài/Chủ đề (grouped by Chương), columns =
 * (cấu phần × Bloom Biết/Hiểu/Vận dụng). Teacher fills số câu per cell,
 * clamped to inventory (`/kho`). Footer = Tổng số lệnh hỏi / Tổng điểm /
 * Tỉ lệ %; right = Tổng (B/H/VD) + Tỉ lệ % điểm per row.
 */
export function YccdMatrixTable({
  rows,
  parts,
  inventory,
  cells,
  pointsByPart,
  onCellChange,
}: Props) {
  const get = (t: string, p: string, b: number) =>
    cells[cellKey(t, p, b)] ?? 0;
  const cap = (t: string, p: string, b: number) =>
    inventory[cellKey(t, p, b)] ?? 0;

  // Per-row points (for Tỉ lệ % điểm).
  const rowPoints = (t: string) =>
    parts.reduce(
      (sum, p) =>
        sum + BLOOMS.reduce((s, b) => s + get(t, p.id, b), 0) * (pointsByPart[p.id] ?? 0),
      0,
    );
  const totalPoints = rows.reduce((s, r) => s + rowPoints(r.topicId), 0);

  // Column-total per Bloom (across all parts+rows) for the footer.
  const bloomTotalQ = (b: number) =>
    rows.reduce(
      (s, r) => s + parts.reduce((ss, p) => ss + get(r.topicId, p.id, b), 0),
      0,
    );
  const grandQ = BLOOMS.reduce((s, b) => s + bloomTotalQ(b), 0);
  const bloomPoints = (b: number) =>
    rows.reduce(
      (s, r) => s + parts.reduce((ss, p) => ss + get(r.topicId, p.id, b) * (pointsByPart[p.id] ?? 0), 0),
      0,
    );

  // Group rows by chapter for the rowspan cells.
  const chapters: { id: string | null; name: string; rows: MatrixRow[] }[] = [];
  for (const r of rows) {
    const last = chapters[chapters.length - 1];
    if (last && last.id === r.chapterId) last.rows.push(r);
    else chapters.push({ id: r.chapterId, name: r.chapterName, rows: [r] });
  }

  const pct = (n: number) =>
    totalPoints > 0 ? Math.round((n / totalPoints) * 1000) / 10 : 0;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-[1000px] w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-surface-2 text-center">
            <th rowSpan={3} className="border px-2 py-1.5 align-middle">TT</th>
            <th rowSpan={3} className="border px-2 py-1.5 align-middle">Chủ đề / Chương</th>
            <th rowSpan={3} className="border px-2 py-1.5 align-middle">Bài / Nội dung</th>
            <th colSpan={parts.length * 3} className="border px-2 py-1.5 font-bold">
              Mức độ đánh giá
            </th>
            <th colSpan={3} className="border px-2 py-1.5 font-bold">Tổng</th>
            <th rowSpan={3} className="border px-2 py-1.5 align-middle">Tỉ lệ % điểm</th>
          </tr>
          <tr className="bg-surface-2 text-center">
            {parts.map((p) => (
              <th key={p.id} colSpan={3} className="border px-2 py-1 font-semibold">
                {p.label}
              </th>
            ))}
            <th rowSpan={2} className="border px-2 py-1 align-middle">Biết</th>
            <th rowSpan={2} className="border px-2 py-1 align-middle">Hiểu</th>
            <th rowSpan={2} className="border px-2 py-1 align-middle">VD</th>
          </tr>
          <tr className="bg-surface-2 text-center text-[10.5px] text-muted-foreground">
            {parts.map((p) =>
              BLOOMS.map((b) => (
                <th key={`${p.id}-${b}`} className="border px-1.5 py-1 font-medium">
                  {bloomMeta(b as 1 | 2 | 3)?.short}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3 + parts.length * 3 + 4} className="border px-3 py-6 text-center text-muted-foreground">
                Chưa chọn Bài nào ở bước ①.
              </td>
            </tr>
          ) : (
            chapters.map((ch, ci) => {
              let chapterFirst = true;
              const startTT = rows.findIndex((r) => r.topicId === ch.rows[0]!.topicId);
              return ch.rows.map((r, ri) => {
                const rowBloomQ = (b: number) =>
                  parts.reduce((s, p) => s + get(r.topicId, p.id, b), 0);
                const showChapter = chapterFirst;
                chapterFirst = false;
                return (
                  <tr key={r.topicId} className="text-center hover:bg-surface-2/40">
                    <td className="border px-2 py-1">{startTT + ri + 1}</td>
                    {showChapter && (
                      <td rowSpan={ch.rows.length} className="border px-2 py-1 text-left align-top font-medium">
                        {ci + 1}. {ch.name}
                      </td>
                    )}
                    <td className="border px-2 py-1 text-left">{r.topicName}</td>
                    {parts.map((p) =>
                      BLOOMS.map((b) => {
                        const max = cap(r.topicId, p.id, b);
                        const val = get(r.topicId, p.id, b);
                        return (
                          <td
                            key={`${p.id}-${b}`}
                            className={cn("border p-0.5", max > 0 && "bg-emerald-50/50")}
                          >
                            {max > 0 ? (
                              <div className="flex flex-col items-center leading-none">
                                <input
                                  type="number"
                                  min={0}
                                  max={max}
                                  value={val || ""}
                                  onChange={(e) =>
                                    onCellChange(
                                      r.topicId,
                                      p.id,
                                      b,
                                      Math.max(0, Math.min(max, Number(e.target.value) || 0)),
                                    )
                                  }
                                  placeholder="0"
                                  title={`Có ${max} câu trong kho — điền tối đa ${max}`}
                                  className={cn(
                                    "h-6 w-11 rounded border-none bg-transparent text-center text-[13px] tabular-nums placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50",
                                    val > 0 ? "font-semibold text-foreground" : "text-muted-foreground",
                                  )}
                                />
                                <span
                                  className="text-[9px] font-medium text-emerald-700/80"
                                  title="Số câu có trong kho"
                                >
                                  /{max}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-block h-9 w-11 leading-9 text-muted-foreground/25">
                                ·
                              </span>
                            )}
                          </td>
                        );
                      }),
                    )}
                    <td className="border px-2 py-1 font-semibold">{rowBloomQ(1) || ""}</td>
                    <td className="border px-2 py-1 font-semibold">{rowBloomQ(2) || ""}</td>
                    <td className="border px-2 py-1 font-semibold">{rowBloomQ(3) || ""}</td>
                    <td className="border px-2 py-1 font-bold text-primary">
                      {rowPoints(r.topicId) > 0 ? `${pct(rowPoints(r.topicId))}%` : ""}
                    </td>
                  </tr>
                );
              });
            })
          )}
        </tbody>
        <tfoot className="bg-surface-2 text-center font-semibold">
          <tr>
            <td colSpan={3} className="border px-2 py-1.5 text-right">Tổng số lệnh hỏi</td>
            {parts.map((p) =>
              BLOOMS.map((b) => (
                <td key={`tq-${p.id}-${b}`} className="border px-1.5 py-1.5">
                  {rows.reduce((s, r) => s + get(r.topicId, p.id, b), 0) || 0}
                </td>
              )),
            )}
            <td className="border px-2 py-1.5">{bloomTotalQ(1)}</td>
            <td className="border px-2 py-1.5">{bloomTotalQ(2)}</td>
            <td className="border px-2 py-1.5">{bloomTotalQ(3)}</td>
            <td className="border px-2 py-1.5">{grandQ}</td>
          </tr>
          <tr>
            <td colSpan={3} className="border px-2 py-1.5 text-right">Tổng điểm</td>
            {parts.map((p) => (
              <td key={`tp-${p.id}`} colSpan={3} className="border px-1.5 py-1.5">
                {Math.round(
                  rows.reduce(
                    (s, r) => s + BLOOMS.reduce((ss, b) => ss + get(r.topicId, p.id, b), 0),
                    0,
                  ) * (pointsByPart[p.id] ?? 0) * 100,
                ) / 100}
              </td>
            ))}
            <td className="border px-2 py-1.5">{Math.round(bloomPoints(1) * 100) / 100}</td>
            <td className="border px-2 py-1.5">{Math.round(bloomPoints(2) * 100) / 100}</td>
            <td className="border px-2 py-1.5">{Math.round(bloomPoints(3) * 100) / 100}</td>
            <td className="border px-2 py-1.5 text-primary">{Math.round(totalPoints * 100) / 100}</td>
          </tr>
          <tr>
            <td colSpan={3} className="border px-2 py-1.5 text-right">Tỉ lệ %</td>
            {parts.map((p) => {
              const pp =
                rows.reduce(
                  (s, r) => s + BLOOMS.reduce((ss, b) => ss + get(r.topicId, p.id, b), 0),
                  0,
                ) * (pointsByPart[p.id] ?? 0);
              return (
                <td key={`tr-${p.id}`} colSpan={3} className="border px-1.5 py-1.5">
                  {pct(pp)}%
                </td>
              );
            })}
            <td className="border px-2 py-1.5">{pct(bloomPoints(1))}%</td>
            <td className="border px-2 py-1.5">{pct(bloomPoints(2))}%</td>
            <td className="border px-2 py-1.5">{pct(bloomPoints(3))}%</td>
            <td className="border px-2 py-1.5 text-primary">{totalPoints > 0 ? 100 : 0}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
