/**
 * Audit trail — append-only event log for every mutation to a production
 * entity. Required for enterprise integrity: legal defensibility,
 * historical reporting, "who changed what when and why".
 *
 * Storage: `/audit_events` collection in Firestore.
 *   - Create only — rules forbid update/delete.
 *   - Indexed by entityType+entityId for the audit drawer.
 *   - Indexed by campusId for tenant isolation.
 *
 * Writes are *non-blocking*: the mutation itself succeeds first, then
 * `recordAudit()` queues the event. If the audit write fails (offline,
 * rules), the user-facing action still completes; the failure is
 * logged to console. Stricter SLAs (audit-before-mutation, tx-bound)
 * are a Phase F item; the MVP optimises for not breaking the UX.
 */

export type AuditEntityType =
  | "user"
  | "question"
  | "blueprint"
  | "package"
  | "shift"
  | "exam_form"
  | "attempt"
  | "campus"
  | "class"
  | "subject"
  | "grade";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "restore"
  | "publish"
  | "approve"
  | "reject"
  | "submit"
  | "grade"
  | "snapshot"
  | "reset-password"
  | "lifecycle-transition";

export interface AuditEvent {
  /** Server-assigned doc id. */
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  /** Snapshot of relevant fields BEFORE the change. May be null for
   *  create. Kept as a plain JSON object; size capped to ~32 KB by the
   *  helper (heavy fields like media blobs are stripped). */
  before?: Record<string, unknown> | null;
  /** Snapshot AFTER the change. Null for delete/archive. */
  after?: Record<string, unknown> | null;
  /** Firebase UID of the user who initiated the action. "system" for
   *  background jobs / migrations. */
  actorUid: string;
  /** Role at action time — captured because user role can change later
   *  and audit must reflect what was true when the action happened. */
  actorRole: string;
  actorName?: string;
  campusId?: string | null;
  /** ISO timestamp. */
  at: string;
  /** Optional user-supplied reason (e.g. "Fix typo in question",
   *  "Khoá ca thi do gian lận"). */
  reason?: string;
}
