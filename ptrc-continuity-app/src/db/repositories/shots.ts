"use client";

import { db } from "@/db/schema";
import type { Shot } from "@/types";
import { baseFields, enqueueSync, logActivity, touch } from "./helpers";
import { createTake } from "./takes";

export async function createShot(sceneId: string, name: string, cameraLabel?: string): Promise<Shot> {
  const scene = await db.scenes.get(sceneId);
  const orderIndex = await db.shots.where({ sceneId }).count();
  const shot: Shot = {
    ...baseFields(),
    productionId: scene?.productionId ?? "",
    sceneId,
    name: name.trim().toUpperCase(),
    cameraLabel,
    orderIndex,
  };
  await db.shots.add(shot);
  await enqueueSync("shots", shot.id, "create", shot);
  if (scene) await logActivity(scene.productionId, `created Shot ${shot.name} on Scene ${scene.sceneNumber}`, "shots", shot.id);
  // Every shot starts with Take 1 so the camera screen always has somewhere to point.
  await createTake(shot.id);
  return shot;
}

export async function listShots(sceneId: string): Promise<Shot[]> {
  return db.shots.where({ sceneId }).filter((s) => !s.deletedAt).sortBy("orderIndex");
}

export async function getShot(id: string): Promise<Shot | undefined> {
  return db.shots.get(id);
}

export async function updateShot(id: string, patch: Partial<Shot>) {
  const shot = await db.shots.get(id);
  if (!shot) return;
  Object.assign(shot, patch);
  touch(shot);
  await db.shots.put(shot);
  await enqueueSync("shots", shot.id, "update", shot);
}
