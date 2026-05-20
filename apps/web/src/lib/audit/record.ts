"use client";

/**
 * `recordAudit()` — append a single AuditEvent to `/audit_events`.
 *
 * Non-blocking by design: callers `void`-fire it after the primary
 * mutation. If the audit write fails (offline, rules), the primary
 * mutation has already succeeded; we log to console and move on.
 *
 * The caller passes the actor manually because some flows (e.g.
 * system migrations) don't have a session.
 */

import {
  addDoc,
  serverTimestamp,
  collection,
} from "firebase/firestore";

import { useAuthStore } from "@/features/auth/state/auth-store";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore-collections";
import { sanitizeForFirestore } from "@/lib/firestore-sync";

import type { AuditAction, AuditEntityType, AuditEvent } from "./types";

interface RecordInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  campusId?: string | null;
  reason?: string;
  /** Override actor (for system jobs). Defaults to current session. */
  actor?: {
    uid: string;
    role: string;
    name?: string;
  };
}

/** Hard cap for serialized before/after JSON to keep audit_events
 *  doc size under Firestore's 1MB limit even when something exotic
 *  gets passed in. ~32KB each side is plenty for diffing. */
const MAX_PAYLOAD_BYTES = 32 * 1024;

export function recordAudit(input: RecordInput): void {
  // Run async without awaiting — the primary mutation already won.
  void doRecord(input).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[audit] write failed", err);
  });
}

async function doRecord(input: RecordInput): Promise<void> {
  if (!isFirebaseConfigured()) return; // demo mode — skip silently
  const session = useAuthStore.getState().session;
  const actor =
    input.actor ??
    (session
      ? { uid: session.userId, role: session.role, name: session.name }
      : { uid: "anonymous", role: "anonymous" });

  const event: Omit<AuditEvent, "id"> = {
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    before: capPayload(input.before ?? null),
    after: capPayload(input.after ?? null),
    actorUid: actor.uid,
    actorRole: actor.role,
    actorName: actor.name,
    campusId: input.campusId ?? session?.campusId ?? null,
    at: new Date().toISOString(),
    reason: input.reason,
  };

  await addDoc(
    collection(getDb(), COLLECTIONS.auditEvents),
    sanitizeForFirestore({ ...event, _serverAt: serverTimestamp() }),
  );
}

function capPayload(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!payload) return null;
  // Cheap size check via JSON length. If too big, replace with a
  // sentinel pointing the auditor to the entity itself.
  const json = JSON.stringify(payload);
  if (json.length > MAX_PAYLOAD_BYTES) {
    return {
      __truncated: true,
      __originalSizeBytes: json.length,
      __hint: "Payload too large for audit row; consult entity directly.",
    };
  }
  return payload;
}
