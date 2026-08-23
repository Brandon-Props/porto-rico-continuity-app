"use client";

// The crew-facing half of sharing a production: turn an invite code into a
// fully hydrated local production, with this device recognized server-side
// from the very first push. See supabase/migrations/0002_invites_and_auth.sql
// for the join_production_by_code() function this calls through to.

import { db } from "@/db/schema";
import type { Production, ProductionMember, Role } from "@/types";
import { ROLE_DEFAULT_PERMISSIONS } from "@/types";
import { nowIso } from "@/db/repositories/helpers";
import { getCurrentUser } from "@/lib/currentUser";
import { getSupabaseOverride } from "./index";
import { joinProductionByCode } from "./SupabaseSyncProvider";
import { hydrateProductionFromCloud } from "./hydrate";
import { setActiveProductionId } from "@/db/repositories/productions";

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireCreds(): { url: string; anonKey: string } {
  const override = getSupabaseOverride();
  const url = ENV_URL ?? override?.url;
  const anonKey = ENV_KEY ?? override?.anonKey;
  if (!url || !anonKey) {
    throw new Error("Cloud sync isn't set up on this device yet — add your Supabase URL and key in Settings first.");
  }
  return { url, anonKey };
}

export interface JoinOutcome {
  productionId: string;
  productionName: string;
  scenesFound: number;
}

/** Joins an existing production by its invite code and pulls down everything
 *  already in it — schedule, scenes, crew, props, characters. Photos' metadata
 *  comes down too; the photo files themselves follow once Storage upload is
 *  wired up (see ARCHITECTURE.md §6 — not done yet). */
export async function joinProductionWithCode(code: string): Promise<JoinOutcome> {
  const { url, anonKey } = requireCreds();
  const localUser = getCurrentUser();
  if (!localUser) throw new Error("Set your name first (Login screen) before joining a production.");

  const joined = await joinProductionByCode(url, anonKey, code, localUser.displayName);

  // Hydrate first so the production/member rows below have somewhere to land
  // alongside everything else, then make sure OUR OWN membership + a local
  // production stub exist even if the pull raced ahead of Postgres commit.
  const result = await hydrateProductionFromCloud(url, anonKey, joined.productionId);

  const existingProduction = await db.productions.get(joined.productionId);
  if (!existingProduction) {
    const stub: Production = {
      id: joined.productionId,
      name: joined.productionName,
      shortCode: joined.productionName.slice(0, 4).toUpperCase(),
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: localUser.id,
      updatedBy: localUser.id,
      deletedAt: null,
      rev: 1,
      dirty: false,
      syncedAt: nowIso(),
    };
    await db.productions.put(stub);
  }

  const existingMembership = await db.productionMembers.get(joined.memberId);
  if (!existingMembership) {
    const member: ProductionMember = {
      id: joined.memberId,
      productionId: joined.productionId,
      userId: localUser.id,
      displayName: localUser.displayName,
      role: joined.role as Role,
      permissionsJson: ROLE_DEFAULT_PERMISSIONS[joined.role as Role] ?? ROLE_DEFAULT_PERMISSIONS.crew,
      joinedAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: localUser.id,
      updatedBy: localUser.id,
      deletedAt: null,
      rev: 1,
      dirty: false,
      syncedAt: nowIso(),
    };
    await db.productionMembers.put(member);
  }

  setActiveProductionId(joined.productionId);

  return {
    productionId: joined.productionId,
    productionName: joined.productionName,
    scenesFound: result.tableCounts["scenes"] ?? 0,
  };
}
