/**
 * Version-chain primitives shared across questions, blueprints, packages.
 *
 * Model:
 *   - Each row has `version: number` (1-indexed) and `versionOfRootId: string`.
 *   - `versionOfRootId` points at the v1 doc id. v1 itself either has
 *     `versionOfRootId === id` or leaves the field undefined (legacy
 *     rows count as v1 of their own chain).
 *   - "Latest version" = the highest-`version` row in a chain. The
 *     `cloneAsNewVersion` flow does NOT delete or archive the parent —
 *     admins may keep older versions live in parallel if they want
 *     (e.g., two approved variants of the same prompt). The default
 *     list view hides older versions.
 *
 * Why this shape rather than parent-pointer:
 *   - All members of a chain share the same `rootId` → trivial grouping
 *     (single Map<rootId, T[]> pass).
 *   - "Show all versions" toggle becomes "stop dedup-ing by rootId".
 *   - "Latest of X" is O(N) over chain, vs. walking a parent pointer.
 */

export interface VersionedFields {
  id: string;
  version?: number;
  versionOfRootId?: string;
}

/** The id of v1 in this row's chain. Falls back to the row's own id
 *  for legacy/seed rows where the field is missing — those count as
 *  v1 of a singleton chain. */
export function rootId<T extends VersionedFields>(row: T): string {
  return row.versionOfRootId ?? row.id;
}

/** Defensive default — legacy rows are treated as v1. */
export function versionOf<T extends VersionedFields>(row: T): number {
  return row.version ?? 1;
}

/** Pretty label for badges — "v1" / "v2" / ... */
export function versionLabel<T extends VersionedFields>(row: T): string {
  return `v${versionOf(row)}`;
}

/**
 * Reduce a flat row list to "latest per chain". For each unique
 * rootId, picks the row with the highest `version`. Stable: ties on
 * version (shouldn't happen) keep the first occurrence.
 *
 * Archived rows are KEPT in the chain — if the only newer version is
 * archived, the older live one becomes "latest" again. List views
 * separately filter by `archivedAt`, so they end up showing the
 * latest LIVE version per chain.
 */
export function getLatestVersionsOf<T extends VersionedFields>(
  rows: T[],
): T[] {
  const byRoot = new Map<string, T>();
  for (const r of rows) {
    const root = rootId(r);
    const current = byRoot.get(root);
    if (!current || versionOf(r) > versionOf(current)) {
      byRoot.set(root, r);
    }
  }
  return [...byRoot.values()];
}

/** All versions in a chain, ordered oldest-first. */
export function getVersionChain<T extends VersionedFields>(
  root: string,
  rows: T[],
): T[] {
  return rows
    .filter((r) => rootId(r) === root)
    .sort((a, b) => versionOf(a) - versionOf(b));
}

/**
 * Generate fields for a NEW row in an existing chain. Caller picks the
 * new id (Firestore conventions vary per collection); we return
 * the version + root for it.
 */
export function nextVersionFields<T extends VersionedFields>(
  parent: T,
): { version: number; versionOfRootId: string } {
  return {
    version: versionOf(parent) + 1,
    versionOfRootId: rootId(parent),
  };
}
