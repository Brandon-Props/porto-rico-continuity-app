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
