"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { useCampusStore } from "@/features/campus/state/campus-store";
import { useCampusesStore } from "@/features/campus/state/campuses-store";
import { useGradesStore } from "@/features/grades/state/grades-store";
import { useUsersStore } from "@/features/admin/users/users-store";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  rowNumber: number;
  email?: string;
  name?: string;
  password?: string;
  gradeCode?: string;
  className?: string;
  studentCode?: string;
  phone?: string;
  parentPhone?: string;
  dob?: string;
  gender?: string;
}

type RowState =
  | { kind: "ready" }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; reason: string }
  | { kind: "creating" }
  | { kind: "done"; createdClass?: boolean };

type Stage = "upload" | "review" | "done";

export function BulkCreateStudentsDialog({ open, onOpenChange }: Props) {
  const session = useAuthStore((s) => s.session);
  const activeCampusId = useCampusStore((s) => s.activeCampusId);
  const allCampuses = useCampusesStore((s) => s.campuses);
  const allGrades = useGradesStore((s) => s.grades);
  const allClasses = useGradesStore((s) => s.classes);
  const createClass = useGradesStore((s) => s.createClass);
  const allUsers = useUsersStore((s) => s.users);
  const createUser = useUsersStore((s) => s.create);

  const campusId =
    session?.role === "superadmin"
      ? activeCampusId
      : session?.campusId ?? null;
  const campus = campusId
    ? allCampuses.find((c) => c.id === campusId) ?? null
    : null;
  const campusGrades = useMemo(
    () => allGrades.filter((g) => campus?.gradeIds.includes(g.id)),
    [allGrades, campus],
  );

  const [stage, setStage] = useState<Stage>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({});
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdClassNames, setCreatedClassNames] = useState<string[]>([]);
  const [doneStats, setDoneStats] = useState<{
    created: number;
    skipped: number;
    errors: number;
  } | null>(null);

  function reset() {
    setStage("upload");
    setRows([]);
    setRowStates({});
    setFileWarnings([]);
    setCreatedClassNames([]);
    setDoneStats(null);
  }

  function close() {
    if (creating) return;
    reset();
    onOpenChange(false);
  }

  const templateHref = useMemo(() => {
    const params = new URLSearchParams();
    if (campus) {
      params.set("campusName", campus.name);
      params.set("campusId", campus.id);
      params.set("grades", campusGrades.map((g) => g.code).join(","));
    }
    return `/api/admin/import/students-template?${params.toString()}`;
  }, [campus, campusGrades]);

  async function handleFile(file: File) {
    if (!campus) {
      toast.error("Chọn campus trước khi import");
      return;
    }
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/import/students", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "Đọc file thất bại");
        return;
      }
      const parsedRows: ParsedRow[] = data.rows ?? [];
      if (parsedRows.length === 0) {
        toast.error("File chưa có học sinh nào");
        return;
      }
      setRows(parsedRows);
      setFileWarnings(data.warnings ?? []);

      // Pre-validate each row + plan new classes to create.
      const states: Record<number, RowState> = {};
      const plannedClasses = new Set<string>();
      const seenEmails = new Set<string>();
      const existingEmails = new Set(
        allUsers.map((u) => (u.email ?? "").toLowerCase()),
      );

      for (const r of parsedRows) {
        const reqMissing: string[] = [];
        if (!r.email) reqMissing.push("Email");
        if (!r.name) reqMissing.push("Họ tên");
        if (!r.password) reqMissing.push("Mật khẩu");
        if (!r.gradeCode) reqMissing.push("Khối");
        if (!r.className) reqMissing.push("Lớp");
        if (reqMissing.length > 0) {
          states[r.rowNumber] = {
            kind: "error",
            reason: `Thiếu ${reqMissing.join(", ")}`,
          };
          continue;
        }
        const grade = campusGrades.find(
          (g) =>
            g.code.toLowerCase() === r.gradeCode!.toLowerCase() ||
            g.name.toLowerCase() === r.gradeCode!.toLowerCase(),
        );
        if (!grade) {
          states[r.rowNumber] = {
            kind: "error",
            reason: `Khối "${r.gradeCode}" không nằm trong campus "${campus.name}"`,
          };
          continue;
        }
        const emailKey = r.email!.toLowerCase();
        if (existingEmails.has(emailKey) || seenEmails.has(emailKey)) {
          states[r.rowNumber] = {
            kind: "skipped",
            reason: `Email "${r.email}" đã tồn tại`,
          };
          continue;
        }
        seenEmails.add(emailKey);
        // Check whether class exists; if not, plan its creation.
        const existingClass = allClasses.find(
          (c) =>
            c.gradeId === grade.id &&
            c.campusId === campus.id &&
            (c.name.toLowerCase() === r.className!.toLowerCase() ||
              c.code.toLowerCase() === r.className!.toLowerCase()),
        );
        if (!existingClass) {
          plannedClasses.add(`${grade.id}::${r.className!.trim()}`);
        }
        states[r.rowNumber] = { kind: "ready" };
      }
      setRowStates(states);
      // Surface planned class creations in UI before user confirms.
      setCreatedClassNames(
        Array.from(plannedClasses).map((key) => {
          const [gid, name] = key.split("::");
          const grade = campusGrades.find((g) => g.id === gid);
          return `${name} (${grade?.code ?? gid})`;
        }),
      );
      setStage("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi đọc file");
    } finally {
      setParsing(false);
    }
  }

  async function executeCreation() {
    if (!campus || !session) return;
    setCreating(true);
    let created = 0;
    let skipped = 0;
    let errors = 0;
    // Track newly-created classes so multiple HS in the same new lớp
    // share the same classId.
    const newClassByKey = new Map<string, string>();

    const newStates: Record<number, RowState> = { ...rowStates };

    for (const r of rows) {
      const st = newStates[r.rowNumber];
      if (!st || st.kind !== "ready") {
        if (st?.kind === "skipped") skipped++;
        if (st?.kind === "error") errors++;
        continue;
      }
      newStates[r.rowNumber] = { kind: "creating" };
      setRowStates({ ...newStates });

      const grade = campusGrades.find(
        (g) =>
          g.code.toLowerCase() === r.gradeCode!.toLowerCase() ||
          g.name.toLowerCase() === r.gradeCode!.toLowerCase(),
      )!;
      let classId: string;
      let madeNewClass = false;
      const classKey = `${grade.id}::${r.className!.trim().toLowerCase()}`;
      const cached = newClassByKey.get(classKey);
      if (cached) {
        classId = cached;
      } else {
        const existing = allClasses.find(
          (c) =>
            c.gradeId === grade.id &&
            c.campusId === campus.id &&
            (c.name.toLowerCase() === r.className!.toLowerCase() ||
              c.code.toLowerCase() === r.className!.toLowerCase()),
        );
        if (existing) {
          classId = existing.id;
        } else {
          const newClass = createClass({
            gradeId: grade.id,
            code: r.className!.trim(),
            name: r.className!.trim(),
            homeroomTeacher: "—",
            homeroomTeacherId: null,
            studentCount: 0,
            campusId: campus.id,
            status: "active",
          });
          classId = newClass.id;
          madeNewClass = true;
        }
        newClassByKey.set(classKey, classId);
      }
      try {
        await createUser({
          name: r.name!.trim(),
          email: r.email!.trim(),
          role: "student",
          campusId: campus.id,
          className: r.className!.trim(),
          classIds: [classId],
          gradeIds: [grade.id],
          password: r.password!,
          status: "active",
          studentCode: r.studentCode || undefined,
          parentPhone: r.parentPhone || undefined,
        });
        newStates[r.rowNumber] = {
          kind: "done",
          createdClass: madeNewClass,
        };
        created++;
      } catch (err) {
        newStates[r.rowNumber] = {
          kind: "error",
          reason: err instanceof Error ? err.message : "Tạo HS thất bại",
        };
        errors++;
      }
      setRowStates({ ...newStates });
    }

    setDoneStats({ created, skipped, errors });
    setStage("done");
    setCreating(false);
    if (created > 0) toast.success(`Đã tạo ${created} HS`);
    if (errors > 0) toast.error(`${errors} dòng lỗi — xem chi tiết bên dưới`);
  }

  const readyCount = useMemo(
    () =>
      Object.values(rowStates).filter((s) => s.kind === "ready").length,
    [rowStates],
  );
  const errorCount = useMemo(
    () =>
      Object.values(rowStates).filter((s) => s.kind === "error").length,
    [rowStates],
  );
  const skippedCount = useMemo(
    () =>
      Object.values(rowStates).filter((s) => s.kind === "skipped").length,
    [rowStates],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="flex h-[90vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <FileSpreadsheet className="h-5 w-5" strokeWidth={1.85} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">Tạo HS hàng loạt từ Excel</h2>
            <p className="text-meta mt-0.5">
              {campus
                ? `Campus đích: ${campus.name} · ${campusGrades.length} khối có sẵn`
                : "Chọn campus trước khi import"}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={creating}
            className="rounded-md border bg-card px-2 py-1 text-[12px] font-medium hover:bg-accent disabled:opacity-50"
          >
            <X className="inline h-3.5 w-3.5" /> Đóng
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {stage === "upload" && (
            <UploadStage
              templateHref={templateHref}
              parsing={parsing}
              onFile={handleFile}
              campusReady={Boolean(campus)}
            />
          )}

          {stage === "review" && (
            <ReviewStage
              rows={rows}
              rowStates={rowStates}
              fileWarnings={fileWarnings}
              createdClassNames={createdClassNames}
              readyCount={readyCount}
              errorCount={errorCount}
              skippedCount={skippedCount}
            />
          )}

          {stage === "done" && doneStats && (
            <DoneStage
              rows={rows}
              rowStates={rowStates}
              stats={doneStats}
            />
          )}
        </div>

        {(stage === "review" || stage === "done") && (
          <footer className="flex shrink-0 items-center justify-between border-t bg-muted/15 px-5 py-3">
            {stage === "review" ? (
              <>
                <Button variant="outline" onClick={() => setStage("upload")}>
                  Tải lại file
                </Button>
                <Button
                  onClick={executeCreation}
                  disabled={creating || readyCount === 0}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Tạo {readyCount} HS
                  {createdClassNames.length > 0 &&
                    ` · + ${createdClassNames.length} lớp mới`}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={reset}>
                  Import file khác
                </Button>
                <Button onClick={close}>Xong</Button>
              </>
            )}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadStage({
  templateHref,
  parsing,
  onFile,
  campusReady,
}: {
  templateHref: string;
  parsing: boolean;
  onFile: (file: File) => void;
  campusReady: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-[12.5px] leading-relaxed text-amber-900">
        <p className="font-semibold">📋 Trước khi import:</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>
            Tải file mẫu (.xlsx) ở dưới — đã có sẵn danh sách khối hợp lệ của
            campus.
          </li>
          <li>
            Các cột <span className="font-semibold">Email, Họ tên, Mật khẩu, Khối, Lớp</span> là bắt buộc.
          </li>
          <li>
            Nếu lớp chưa có trong khối → hệ thống <b>tự tạo lớp</b>.
          </li>
          <li>
            Nếu khối không nằm trong campus → dòng đó <b>báo lỗi</b>, không tạo.
          </li>
          <li>Email trùng với HS đã có → bỏ qua + báo cảnh báo.</li>
        </ul>
      </section>

      <a
        href={templateHref}
        download
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 px-4 py-4 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-blue-50",
          !campusReady && "pointer-events-none opacity-50",
        )}
      >
        <Download className="h-4 w-4" />
        Tải file mẫu (Excel)
      </a>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-12 text-center transition-colors",
          dragging ? "border-blue-500 bg-blue-50" : "border-border",
          !campusReady && "pointer-events-none opacity-50",
        )}
      >
        {parsing ? (
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        ) : (
          <Upload className="h-8 w-8 text-foreground/60" />
        )}
        <p className="text-section-title">
          {parsing ? "Đang đọc file…" : "Chọn file Excel hoặc kéo thả vào đây"}
        </p>
        <p className="text-meta">.xlsx · Tối đa 10MB</p>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          disabled={parsing || !campusReady}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>

      {!campusReady && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          ⚠ Bạn cần chọn campus đang hoạt động (header trên cùng) trước khi
          import HS.
        </p>
      )}
    </div>
  );
}

function ReviewStage({
  rows,
  rowStates,
  fileWarnings,
  createdClassNames,
  readyCount,
  errorCount,
  skippedCount,
}: {
  rows: ParsedRow[];
  rowStates: Record<number, RowState>;
  fileWarnings: string[];
  createdClassNames: string[];
  readyCount: number;
  errorCount: number;
  skippedCount: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat tone="emerald" label="Sẵn sàng tạo" value={readyCount} />
        <Stat tone="rose" label="Lỗi" value={errorCount} />
        <Stat tone="amber" label="Bỏ qua" value={skippedCount} />
      </div>

      {fileWarnings.length > 0 && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
          <p className="font-semibold">⚠ File có vấn đề:</p>
          <ul className="mt-1 list-inside list-disc">
            {fileWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {createdClassNames.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12.5px] text-blue-800">
          <p className="font-semibold">
            🆕 Sẽ tự tạo {createdClassNames.length} lớp mới:
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {createdClassNames.map((n) => (
              <span
                key={n}
                className="rounded-full border border-blue-300 bg-white px-2 py-0.5 text-[11px] font-semibold"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/30 text-[11px] font-semibold uppercase text-foreground/60">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">Họ tên</th>
              <th className="px-2 py-2 text-left">Khối</th>
              <th className="px-2 py-2 text-left">Lớp</th>
              <th className="px-2 py-2 text-left">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const st = rowStates[r.rowNumber] ?? { kind: "ready" };
              return (
                <tr
                  key={r.rowNumber}
                  className={cn(
                    st.kind === "error" && "bg-rose-50/50",
                    st.kind === "skipped" && "bg-amber-50/50",
                  )}
                >
                  <td className="px-2 py-1.5 text-foreground/60">
                    {r.rowNumber}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px]">
                    {r.email || "—"}
                  </td>
                  <td className="px-2 py-1.5">{r.name || "—"}</td>
                  <td className="px-2 py-1.5">{r.gradeCode || "—"}</td>
                  <td className="px-2 py-1.5">{r.className || "—"}</td>
                  <td className="px-2 py-1.5">
                    <StatusChip state={st} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DoneStage({
  rows,
  rowStates,
  stats,
}: {
  rows: ParsedRow[];
  rowStates: Record<number, RowState>;
  stats: { created: number; skipped: number; errors: number };
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
        <p className="text-section-title text-emerald-900">
          Hoàn tất: {stats.created} HS được tạo
        </p>
        {(stats.skipped > 0 || stats.errors > 0) && (
          <p className="text-meta mt-1 text-emerald-700/80">
            {stats.skipped > 0 && `${stats.skipped} bỏ qua · `}
            {stats.errors > 0 && `${stats.errors} lỗi`}
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/30 text-[11px] font-semibold uppercase text-foreground/60">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">Họ tên</th>
              <th className="px-2 py-2 text-left">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const st = rowStates[r.rowNumber] ?? { kind: "ready" };
              return (
                <tr
                  key={r.rowNumber}
                  className={cn(
                    st.kind === "error" && "bg-rose-50/40",
                    st.kind === "skipped" && "bg-amber-50/40",
                  )}
                >
                  <td className="px-2 py-1.5 text-foreground/60">
                    {r.rowNumber}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px]">
                    {r.email || "—"}
                  </td>
                  <td className="px-2 py-1.5">{r.name || "—"}</td>
                  <td className="px-2 py-1.5">
                    <StatusChip state={st} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusChip({ state }: { state: RowState }) {
  switch (state.kind) {
    case "ready":
      return (
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
          Sẵn sàng
        </span>
      );
    case "creating":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" />
          Đang tạo…
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          {state.createdClass ? "Đã tạo HS + lớp mới" : "Đã tạo"}
        </span>
      );
    case "skipped":
      return (
        <span
          className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700"
          title={state.reason}
        >
          Bỏ qua: {state.reason}
        </span>
      );
    case "error":
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700"
          title={state.reason}
        >
          <AlertCircle className="h-3 w-3" />
          {state.reason}
        </span>
      );
  }
}

function Stat({
  tone,
  label,
  value,
}: {
  tone: "emerald" | "rose" | "amber";
  label: string;
  value: number;
}) {
  const className =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={cn("rounded-lg border px-3 py-2", className)}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] opacity-80">
        {label}
      </p>
      <p className="text-[20px] font-bold tabular-nums">{value}</p>
    </div>
  );
}
