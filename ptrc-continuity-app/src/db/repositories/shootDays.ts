"use client";

import { db } from "@/db/schema";
import type { ShootDay } from "@/types";
import { baseFields, enqueueSync, logActivity, touch } from "./helpers";

export async function createShootDay(
  productionId: string,
  dayNumber: number,
  shootDate: string,
  unitLabel?: string
): Promise<ShootDay> {
  const day: ShootDay = { ...baseFields(), productionId, dayNumber, shootDate, unitLabel };
  await db.shootDays.add(day);
  await enqueueSync("shoot_days", day.id, "create", day);
  await logActivity(productionId, `created Shoot Day ${dayNumber}`, "shoot_days", day.id);
  return day;
}

export async function listShootDays(productionId: string): Promise<ShootDay[]> {
  return db.shootDays
    .where({ productionId })
    .filter((d) => !d.deletedAt)
    .sortBy("dayNumber");
}

export async function getShootDay(id: string): Promise<ShootDay | undefined> {
  return db.shootDays.get(id);
}

export async function getMostRecentOrTodayShootDay(productionId: string): Promise<ShootDay | undefined> {
  const days = await listShootDays(productionId);
  if (days.length === 0) return undefined;
  const todayIso = new Date().toISOString().slice(0, 10);
  const exact = days.find((d) => d.shootDate === todayIso);
  if (exact) return exact;
  // Otherwise: the most recent day at/before today, else the earliest upcoming day.
  const past = days.filter((d) => d.shootDate <= todayIso);
  return past.length ? past[past.length - 1] : days[0];
}

export async function updateShootDay(id: string, patch: Partial<ShootDay>) {
  const day = await db.shootDays.get(id);
  if (!day) return;
  Object.assign(day, patch);
  touch(day);
  await db.shootDays.put(day);
  await enqueueSync("shoot_days", day.id, "update", day);
}
