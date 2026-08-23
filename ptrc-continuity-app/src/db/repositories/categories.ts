"use client";

import { db } from "@/db/schema";
import { DEFAULT_PHOTO_CATEGORIES } from "@/types";
import { touch, enqueueSync } from "./helpers";

export async function listCategories(productionId: string): Promise<string[]> {
  const production = await db.productions.get(productionId);
  const custom = (production?.settingsJson?.customCategories as string[] | undefined) ?? [];
  return [...DEFAULT_PHOTO_CATEGORIES, ...custom];
}

export async function addCustomCategory(productionId: string, name: string) {
  const production = await db.productions.get(productionId);
  if (!production) return;
  const custom = (production.settingsJson?.customCategories as string[] | undefined) ?? [];
  if (custom.includes(name) || (DEFAULT_PHOTO_CATEGORIES as readonly string[]).includes(name)) return;
  production.settingsJson = { ...production.settingsJson, customCategories: [...custom, name] };
  touch(production);
  await db.productions.put(production);
  await enqueueSync("productions", production.id, "update", production);
}
