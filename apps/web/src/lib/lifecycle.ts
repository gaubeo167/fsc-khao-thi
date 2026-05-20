/**
 * Lifecycle + soft-delete primitives shared across production entities
 * (questions, blueprints, packages, shifts, exam_forms).
 *
 * The enterprise spec forbids hard-deleting any entity that has been
 * referenced by another (audit, analytics, legal defensibility all
 * depend on historical rows staying queryable forever). We replace
 * `deleteDoc` with `archive()`, which simply sets `archivedAt` and
 * `archivedBy` on the doc; UI list views hide archived rows by default
 * but admins can flip a toggle to inspect them.
 */

export interface ArchivableFields {
  /** ISO timestamp when the row was archived. `undefined`/`null` = live. */
  archivedAt?: string | null;
  /** UID of the staff member who archived it. */
  archivedBy?: string | null;
  /** Free-text reason — surfaced in the audit drawer + restore dialog. */
  archiveReason?: string | null;
}

/** True for any row currently live (not archived). Defensive against
 *  legacy rows where the field is missing entirely. */
export function isLive<T extends ArchivableFields>(row: T): boolean {
  return !row.archivedAt;
}

/** Inverse — true for archived rows. */
export function isArchived<T extends ArchivableFields>(row: T): boolean {
  return Boolean(row.archivedAt);
}

/** Filter helper for list views: by default, hide archived. Pass
 *  `{ includeArchived: true }` to show everything (admin "show archived"
 *  toggle). */
export function filterByLifecycle<T extends ArchivableFields>(
  rows: T[],
  options?: { includeArchived?: boolean },
): T[] {
  if (options?.includeArchived) return rows;
  return rows.filter(isLive);
}
