/**
 * One-shot data healer for legacy localStorage state.
 *
 * Problem: when SEED_GRADES expanded from K6–K12 to K1–K12, the
 * `nextId` generator in grades-store kept incrementing past 12 because
 * earlier user-created K1..K6 records still occupied `grade-13`..`grade-18`.
 * Migration v4 then added the seed `grade-1`..`grade-6` alongside them,
 * leaving 6 duplicate "Khối N" entries with different ids. The ShiftWizard
 * Step 1 picker showed `grade-N` (seed) while blueprints/users created
 * pre-migration kept pointing at `grade-13..18` → filters silently missed.
 *
 * This module runs synchronously on first client mount, scans every store
 * that references gradeId, rewrites duplicates to the canonical seed id
 * (`grade-N` where N matches the K-number in the name), and flips a one-shot
 * flag so it never runs again.
 */

const HEAL_FLAG = "fsc-data-heal-v1";

type Json = Record<string, unknown>;

function readStore(key: string): Json | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Json) : null;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: Json): void {
  localStorage.setItem(key, JSON.stringify(value));
}

interface GradeLike {
  id: string;
  name: string;
}

function buildGradeRemap(grades: GradeLike[]): Map<string, string> {
  const byName = new Map<string, GradeLike[]>();
  for (const g of grades) {
    const arr = byName.get(g.name) ?? [];
    arr.push(g);
    byName.set(g.name, arr);
  }
  const remap = new Map<string, string>();
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const m = /(\d+)/.exec(name);
    if (!m) continue;
    const canonical = `grade-${m[1]}`;
    if (!list.some((g) => g.id === canonical)) continue;
    for (const g of list) {
      if (g.id !== canonical) remap.set(g.id, canonical);
    }
  }
  return remap;
}

/**
 * Run the healer. Returns `true` if anything changed (caller should reload
 * so Zustand stores rehydrate from the cleaned data).
 */
export function healDataOnce(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(HEAL_FLAG)) return false;

  try {
    const gradesStore = readStore("fsc-grades");
    if (!gradesStore) {
      localStorage.setItem(HEAL_FLAG, "1");
      return false;
    }
    const state = (gradesStore.state ?? {}) as Json;
    const grades = (state.grades as GradeLike[] | undefined) ?? [];
    const remap = buildGradeRemap(grades);

    if (remap.size === 0) {
      localStorage.setItem(HEAL_FLAG, "1");
      return false;
    }

    // 1. Dedupe grades in fsc-grades
    const seen = new Set<string>();
    const dedupedGrades: GradeLike[] = [];
    for (const g of grades) {
      const id = remap.get(g.id) ?? g.id;
      if (seen.has(id)) continue;
      seen.add(id);
      dedupedGrades.push({ ...g, id });
    }
    state.grades = dedupedGrades;

    // 2. Remap classes within fsc-grades
    const classes = state.classes as Array<{ gradeId: string }> | undefined;
    if (Array.isArray(classes)) {
      state.classes = classes.map((c) => ({
        ...c,
        gradeId: remap.get(c.gradeId) ?? c.gradeId,
      }));
    }
    writeStore("fsc-grades", { ...gradesStore, state });

    // 3. Remap blueprints
    const bp = readStore("fsc-exam-blueprints");
    if (bp) {
      const bpState = (bp.state ?? {}) as Json;
      const list = bpState.blueprints as Array<{ gradeId: string }> | undefined;
      if (Array.isArray(list)) {
        bpState.blueprints = list.map((b) => ({
          ...b,
          gradeId: remap.get(b.gradeId) ?? b.gradeId,
        }));
        writeStore("fsc-exam-blueprints", { ...bp, state: bpState });
      }
    }

    // 4. Remap users (gradeIds array — used by teacher/subject-lead permissions)
    const users = readStore("fsc-users");
    if (users) {
      const uState = (users.state ?? {}) as Json;
      const list = uState.users as
        | Array<{ gradeIds?: string[] | null }>
        | undefined;
      if (Array.isArray(list)) {
        uState.users = list.map((u) => ({
          ...u,
          gradeIds: Array.isArray(u.gradeIds)
            ? Array.from(
                new Set(u.gradeIds.map((id) => remap.get(id) ?? id)),
              )
            : u.gradeIds,
        }));
        writeStore("fsc-users", { ...users, state: uState });
      }
    }

    localStorage.setItem(HEAL_FLAG, "1");
    // eslint-disable-next-line no-console
    console.info(
      "[data-heal] deduped grades, remapped",
      remap.size,
      "ids",
      Array.from(remap.entries()),
    );
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[data-heal] failed:", e);
    return false;
  }
}
