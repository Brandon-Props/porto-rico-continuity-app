"use client";

import { db } from "@/db/schema";
import type { Production, ProductionMember, Role } from "@/types";
import { ROLE_DEFAULT_PERMISSIONS } from "@/types";
import { baseFields, enqueueSync, logActivity, nowIso, touch } from "./helpers";
import { getCurrentUser } from "@/lib/currentUser";

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
      userId: user.id,
      displayName: user.displayName,
      role: "admin",
      permissionsJson: ROLE_DEFAULT_PERMISSIONS.admin,
      joinedAt: nowIso(),
    };
    await db.productionMembers.add(member);
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
