import { v4 as uuid } from "uuid";
import { db } from "@/db/schema";
import { getCurrentUser } from "@/lib/currentUser";

/** Every offline-created record gets its id here — never wait on a server. */
export function newId(): string {
  return uuid();
}

export function nowIso(): string {
  return new Date().toISOString();
}

interface SyncableBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  deletedAt: null;
  rev: number;
  dirty: boolean;
  syncedAt: null;
}

/** Base fields shared by every syncable record, per ARCHITECTURE.md §2. */
export function baseFields(): SyncableBase {
  const ts = nowIso();
  const userId = getCurrentUser()?.id ?? "unknown";
  return {
    id: newId(),
    createdAt: ts,
    updatedAt: ts,
    createdBy: userId,
    updatedBy: userId,
    deletedAt: null,
    rev: 1,
    dirty: true,
    syncedAt: null,
  };
}

export function touch<T extends { updatedAt: string; updatedBy: string; rev: number; dirty: boolean }>(
  record: T
): T {
  record.updatedAt = nowIso();
  record.updatedBy = getCurrentUser()?.id ?? "unknown";
  record.rev += 1;
  record.dirty = true;
  return record;
}

/** Enqueue a change for the (currently no-op) sync layer, and log it for the activity feed. */
export async function enqueueSync(
  entityTable: string,
  entityId: string,
  op: "create" | "update" | "delete",
  payload: unknown
) {
  await db.syncOperations.add({
    id: newId(),
    entityTable,
    entityId,
    op,
    payload,
    attemptCount: 0,
    status: "pending",
    createdAt: nowIso(),
  });
}

export async function logActivity(
  productionId: string,
  action: string,
  entityTable: string,
  entityId: string,
  detail?: string
) {
  const user = getCurrentUser();
  await db.activityLog.add({
    id: newId(),
    productionId,
    actorId: user?.id ?? "unknown",
    actorName: user?.displayName ?? "Unknown",
    action,
    entityTable,
    entityId,
    detail,
    createdAt: nowIso(),
  });
}
