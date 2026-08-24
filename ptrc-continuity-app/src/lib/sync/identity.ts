"use client";

// Before this file existed, a production's creator got a *local*, made-up
// user id (see src/lib/currentUser.ts) baked into their own production_members
// row. Supabase's row security only trusts `auth.uid()` (supabase/migrations),
// which that local id was never going to match. This reconciles the device's
// own admin/crew membership row(s) to the real (anonymous) Supabase identity
// once one exists, so `is_member_of()` actually recognizes them on their own
// production.

import { db } from "@/db/schema";
import { ensureAnonymousSession } from "./SupabaseSyncProvider";
import { getCurrentUser } from "@/lib/currentUser";
import { enqueueSync, nowIso } from "@/db/repositories/helpers";

export async function reconcileCloudIdentity(url: string, anonKey: string, productionId: string): Promise<void> {
  const localUser = getCurrentUser();
  if (!localUser) return;

  const cloudUserId = await ensureAnonymousSession(url, anonKey);

  const myRows = await db.productionMembers
    .where({ productionId })
    .filter((m) => !m.deletedAt && m.userId === localUser.id && m.userId !== cloudUserId)
    .toArray();

  for (const row of myRows) {
    row.userId = cloudUserId;
    row.updatedAt = nowIso();
    row.updatedBy = cloudUserId;
    row.rev += 1;
    row.dirty = true;
    await db.productionMembers.put(row);
    await enqueueSync("production_members", row.id, "update", row);
  }
}

/** createProduction() (src/db/repositories/productions.ts) used to add its
 *  creator's own admin membership row to the local database without ever
 *  queuing it for cloud sync at all — a since-fixed bug, but one that left
 *  every production created before the fix with a creator who is completely
 *  invisible to the cloud database. No failed sync entry, no error: it simply
 *  never tried. This finds that local admin-role row (as opposed to any other
 *  crew member added via addLocalMember, which was always queued correctly)
 *  and (re)queues it. Safe to call unconditionally and repeatedly — if the
 *  row already exists server-side, push() treats the resulting duplicate-key
 *  error as success, not a real failure. Returns false only if this device
 *  has no local admin row for the production at all (nothing to repair). */
export async function ensureOwnAdminMembershipSynced(
  url: string,
  anonKey: string,
  productionId: string
): Promise<boolean> {
  const cloudUserId = await ensureAnonymousSession(url, anonKey);
  const adminRow = await db.productionMembers
    .where({ productionId })
    .filter((m) => m.role === "admin" && !m.deletedAt)
    .first();
  if (!adminRow) return false;

  if (adminRow.userId !== cloudUserId) {
    adminRow.userId = cloudUserId;
    adminRow.updatedAt = nowIso();
    adminRow.updatedBy = cloudUserId;
    adminRow.rev += 1;
    adminRow.dirty = true;
    await db.productionMembers.put(adminRow);
  }
  await enqueueSync("production_members", adminRow.id, "create", adminRow);
  return true;
}
