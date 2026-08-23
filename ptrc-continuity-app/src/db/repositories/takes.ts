"use client";

import { db } from "@/db/schema";
import type { Take } from "@/types";
import { baseFields, enqueueSync, logActivity, touch } from "./helpers";

export async function createTake(shotId: string, takeNumber?: number): Promise<Take> {
  const shot = await db.shots.get(shotId);
  const existing = await db.takes.where({ shotId }).filter((t) => !t.deletedAt).toArray();
  const nextNumber = takeNumber ?? (existing.length ? Math.max(...existing.map((t) => t.takeNumber)) + 1 : 1);
  const take: Take = {
    ...baseFields(),
    productionId: shot?.productionId ?? "",
    shotId,
    takeNumber: nextNumber,
    printFlag: false,
    circleFlag: false,
    ngFlag: false,
    continuityLock: false,
  };
  await db.takes.add(take);
  await enqueueSync("takes", take.id, "create", take);
  return take;
}

export async function listTakes(shotId: string): Promise<Take[]> {
  const takes = await db.takes.where({ shotId }).filter((t) => !t.deletedAt).toArray();
  return takes.sort((a, b) => a.takeNumber - b.takeNumber);
}

export async function getTake(id: string): Promise<Take | undefined> {
  return db.takes.get(id);
}

export async function getLatestTake(shotId: string): Promise<Take | undefined> {
  const takes = await listTakes(shotId);
  return takes[takes.length - 1];
}

export async function updateTakeFlags(
  id: string,
  patch: Partial<Pick<Take, "printFlag" | "circleFlag" | "ngFlag" | "continuityLock" | "notes">>
) {
  const take = await db.takes.get(id);
  if (!take) return;
  Object.assign(take, patch);
  touch(take);
  await db.takes.put(take);
  await enqueueSync("takes", take.id, "update", take);

  if (patch.continuityLock) {
    // Continuity lock is exclusive per shot — only one take is "the" reset reference.
    const siblings = await db.takes.where({ shotId: take.shotId }).filter((t) => t.id !== id && !t.deletedAt).toArray();
    for (const sib of siblings) {
      if (sib.continuityLock) {
        sib.continuityLock = false;
        touch(sib);
        await db.takes.put(sib);
        await enqueueSync("takes", sib.id, "update", sib);
      }
    }
  }

  const shot = await db.shots.get(take.shotId);
  if (shot) {
    const label = patch.printFlag ? "PRINT" : patch.circleFlag ? "CIRCLE" : patch.ngFlag ? "NG" : patch.continuityLock ? "CONTINUITY LOCK" : "updated";
    await logActivity(shot.productionId, `marked ${shot.name} Take ${take.takeNumber} ${label}`, "takes", id);
  }
}
