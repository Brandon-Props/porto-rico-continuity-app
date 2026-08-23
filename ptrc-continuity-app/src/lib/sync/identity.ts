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
