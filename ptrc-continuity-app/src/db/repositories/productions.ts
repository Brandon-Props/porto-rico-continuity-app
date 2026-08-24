"use client";

import { db } from "@/db/schema";
import type { Production, ProductionMember, Role } from "@/types";
import { ROLE_DEFAULT_PERMISSIONS } from "@/types";
import { baseFields, enqueueSync, logActivity, nowIso, touch } from "./helpers";
import { getCurrentUser } from "@/lib/currentUser";
import { getSupabaseOverride } from "@/lib/sync";
import { ensureAnonymousSession } from "@/lib/sync/SupabaseSyncProvider";

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** The database's row-security rules only ever trust a real Supabase auth.uid()
 *  (see supabase/migrations) — never the purely-local id from currentUser.ts.
 *  When cloud sync is configured, a brand new production's own admin
 *  membership row has to be stamped with that real id from the start, or the
 *  very first sync push of it gets rejected (see 0003_fix_membership_rls_recursion.sql
 *  for the policy that only lets a production's first member self-insert as
 *  admin when their user_id already matches auth.uid()). Falls back to the
 *  local id when offline/not configured — same as always. */
async function resolveMembershipUserId(): Promise<string> {
  const localId = getCurrentUser()?.id ?? "unknown";
  const override = getSupabaseOverride();
  const url = ENV_URL ?? override?.url;
  const anonKey = ENV_KEY ?? override?.anonKey;
  if (!url || !anonKey) return localId;
  try {
    return await ensureAnonymousSession(url, anonKey);
  } catch {
    return localId;
  }
}

const ACTIVE_KEY = "ptrc.activeProductionId";

export function getActiveProductionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProductionId(id: string) {
  window.localStorage.setItem(ACTIVE_KEY, id);
}

export async function createProduction(name: string, shortCode: string): Promise<Production> {
  const base = baseFields();
  const production: Production = {
    ...base,
    name,
    shortCode: shortCode.toUpperCase(),
    status: "active",
  };
  await db.productions.add(production);

  const user = getCurrentUser();
  if (user) {
    const member: ProductionMember = {
      ...baseFields(),
      productionId: production.id,
      userId: await resolveMembershipUserId(),
      displayName: user.displayName,
      role: "admin",
      permissionsJson: ROLE_DEFAULT_PERMISSIONS.admin,
      joinedAt: nowIso(),
    };
    await db.productionMembers.add(member);
    // This line was missing entirely until now — the creator's own admin
    // membership row was being added to the local database but never queued
    // for cloud sync at all (unlike addLocalMember below, which does this
    // correctly). Every production ever created through this app had its
    // creator invisible to the cloud database — no error, no failed sync
    // entry, nothing to notice; it simply never tried.
    await enqueueSync("production_members", member.id, "create", member);
  }

  await enqueueSync("productions", production.id, "create", production);
  await logActivity(production.id, "created production", "productions", production.id, name);
  return production;
}

export async function listProductions(): Promise<Production[]> {
  return db.productions.filter((p) => !p.deletedAt).sortBy("name");
}

export async function getProduction(id: string): Promise<Production | undefined> {
  return db.productions.get(id);
}

export async function listMembers(productionId: string): Promise<ProductionMember[]> {
  return db.productionMembers.where({ productionId }).filter((m) => !m.deletedAt).toArray();
}

export async function addLocalMember(
  productionId: string,
  displayName: string,
  role: Role
): Promise<ProductionMember> {
  const member: ProductionMember = {
    ...baseFields(),
    productionId,
    userId: crypto.randomUUID(),
    displayName,
    role,
    permissionsJson: ROLE_DEFAULT_PERMISSIONS[role],
    invitedAt: nowIso(),
  };
  await db.productionMembers.add(member);
  await enqueueSync("production_members", member.id, "create", member);
  await logActivity(productionId, `invited ${displayName} as ${role}`, "production_members", member.id);
  return member;
}

export async function updateMemberRole(memberId: string, role: Role) {
  const member = await db.productionMembers.get(memberId);
  if (!member) return;
  member.role = role;
  member.permissionsJson = ROLE_DEFAULT_PERMISSIONS[role];
  touch(member);
  await db.productionMembers.put(member);
  await enqueueSync("production_members", member.id, "update", member);
}

// Dexie table -> the entityTable name used in syncOperations/enqueueSync for
// that table (see ENTITY_TO_TABLE in SupabaseSyncProvider.ts). Needed below to
// clean up any still-queued pushes for rows this function is about to delete.
const PRODUCTION_SCOPED_TABLES = [
  { dexie: "shootDays", entity: "shoot_days" },
  { dexie: "scenes", entity: "scenes" },
  { dexie: "sceneScheduleEntries", entity: "scene_schedule_entries" },
  { dexie: "shots", entity: "shots" },
  { dexie: "takes", entity: "takes" },
  { dexie: "photos", entity: "photos" },
  { dexie: "photoAnnotations", entity: "photo_annotations" },
  { dexie: "continuityNotes", entity: "continuity_notes" },
  { dexie: "props", entity: "props" },
  { dexie: "characters", entity: "characters" },
  { dexie: "productionMembers", entity: "production_members" },
] as const;

/**
 * Removes a production from THIS DEVICE ONLY — it never touches Supabase.
 * Exists for the junk local productions that pile up from working around the
 * old "no Settings access without an open production" bug (see
 * SupabaseConnectPanel.tsx — that bug is fixed now, but productions created
 * that way before the fix still need somewhere to go), or from any other
 * duplicate/test production someone doesn't want cluttering their list.
 *
 * Deliberately local-only and non-destructive to the shared data: if this
 * happens to be a real production other crew still use, nothing is deleted
 * on the server, and rejoining with its invite code brings it right back.
 * Safe to use on a genuine mistake, unlike a real delete would be.
 */
export async function removeProductionLocally(productionId: string): Promise<void> {
  const allTables = [
    db.productions,
    db.productionMembers,
    db.shootDays,
    db.scenes,
    db.sceneScheduleEntries,
    db.shots,
    db.takes,
    db.photos,
    db.photoAnnotations,
    db.continuityNotes,
    db.props,
    db.characters,
    db.activityLog,
    db.syncOperations,
    db.photoBlobs,
    db.blobUploads,
  ];

  await db.transaction("rw", allTables, async () => {
    // `.where({ productionId })` requires productionId to be part of that
    // table's declared Dexie index (schema.ts) — true for scenes/shootDays/
    // photos/etc., but NOT for sceneScheduleEntries, shots, or takes (they're
    // only indexed by sceneId/shotId, even though every row still HAS a
    // productionId field). Calling `.where()` on those three threw a schema
    // error that aborted this whole transaction — silently rolling back the
    // delete along with everything else, which is exactly why the button
    // looked like it was doing nothing. `.toArray()` + a plain JS filter
    // works on every table regardless of what's indexed, so use that
    // uniformly here instead of assuming an index that isn't always there.
    const photos = (await db.photos.toArray()).filter((p) => p.productionId === productionId);
    const photoIds = photos.map((p) => p.id);
    const blobKeys = photos.flatMap((p) => [p.originalBlobKey, p.displayBlobKey, p.thumbBlobKey].filter(Boolean));

    const removedIdsByEntity = new Map<string, Set<string>>();
    removedIdsByEntity.set("productions", new Set([productionId]));

    for (const { dexie, entity } of PRODUCTION_SCOPED_TABLES) {
      const table = (db as unknown as Record<string, import("dexie").EntityTable<{ id: string; productionId?: string }, "id">>)[dexie];
      const rows = (await table.toArray()).filter((r) => r.productionId === productionId);
      const ids = rows.map((r) => r.id);
      removedIdsByEntity.set(entity, new Set(ids));
      if (ids.length > 0) await table.bulkDelete(ids);
    }

    const activityLogIds = (await db.activityLog.toArray())
      .filter((a) => a.productionId === productionId)
      .map((a) => a.id);
    if (activityLogIds.length > 0) await db.activityLog.bulkDelete(activityLogIds);

    await db.productions.delete(productionId);
    if (blobKeys.length > 0) await db.photoBlobs.bulkDelete(blobKeys);
    if (photoIds.length > 0) await db.blobUploads.bulkDelete(photoIds);

    // Any push still sitting in the queue for something that no longer
    // exists locally would just fail forever (or worse, silently recreate a
    // production that was supposed to be gone) — clear those out too.
    const allOps = await db.syncOperations.toArray();
    const staleOpIds = allOps
      .filter((op) => {
        const ids = removedIdsByEntity.get(op.entityTable);
        return ids?.has(op.entityId);
      })
      .map((op) => op.id);
    if (staleOpIds.length > 0) await db.syncOperations.bulkDelete(staleOpIds);
  });

  if (getActiveProductionId() === productionId) {
    window.localStorage.removeItem(ACTIVE_KEY);
  }
}
