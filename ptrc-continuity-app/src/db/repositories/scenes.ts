"use client";

import { db } from "@/db/schema";
import type { Scene, SceneScheduleEntry, SceneStatus } from "@/types";
import { baseFields, enqueueSync, logActivity, touch } from "./helpers";

export async function createScene(
  productionId: string,
  fields: Partial<Scene> & { sceneNumber: string; description: string }
): Promise<Scene> {
  const scene: Scene = {
    ...baseFields(),
    productionId,
    status: "not_shot",
    propIds: [],
    characterIds: [],
    ...fields,
  };
  await db.scenes.add(scene);
  await enqueueSync("scenes", scene.id, "create", scene);
  await logActivity(productionId, `created Scene ${scene.sceneNumber}`, "scenes", scene.id);
  return scene;
}

export async function listScenes(productionId: string): Promise<Scene[]> {
  const scenes = await db.scenes.where({ productionId }).filter((s) => !s.deletedAt).toArray();
  return scenes.sort((a, b) => a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true }));
}

export async function getScene(id: string): Promise<Scene | undefined> {
  return db.scenes.get(id);
}

export async function findSceneByNumber(productionId: string, sceneNumber: string): Promise<Scene | undefined> {
  return db.scenes.where({ productionId, sceneNumber }).first();
}

export async function updateScene(id: string, patch: Partial<Scene>) {
  const scene = await db.scenes.get(id);
  if (!scene) return;
  Object.assign(scene, patch);
  touch(scene);
  await db.scenes.put(scene);
  await enqueueSync("scenes", scene.id, "update", scene);
}

export async function setSceneStatus(id: string, status: SceneStatus) {
  await updateScene(id, { status });
  const scene = await db.scenes.get(id);
  if (scene) await logActivity(scene.productionId, `set Scene ${scene.sceneNumber} status to ${status}`, "scenes", id);
}

export async function scheduleSceneOnDay(
  sceneId: string,
  shootDayId: string,
  unit?: string
): Promise<SceneScheduleEntry> {
  const existingCount = await db.sceneScheduleEntries.where({ shootDayId }).count();
  const scene = await db.scenes.get(sceneId);
  const entry: SceneScheduleEntry = {
    ...baseFields(),
    productionId: scene?.productionId ?? "",
    sceneId,
    shootDayId,
    unit,
    orderIndex: existingCount,
    dropped: false,
  };
  await db.sceneScheduleEntries.add(entry);
  await enqueueSync("scene_schedule_entries", entry.id, "create", entry);
  return entry;
}

export async function moveSceneToShootDay(sceneId: string, newShootDayId: string) {
  const entries = await db.sceneScheduleEntries.where({ sceneId }).filter((e) => !e.deletedAt).toArray();
  for (const entry of entries) {
    entry.deletedAt = new Date().toISOString();
    touch(entry);
    await db.sceneScheduleEntries.put(entry);
    await enqueueSync("scene_schedule_entries", entry.id, "update", entry);
  }
  await scheduleSceneOnDay(sceneId, newShootDayId);
  const scene = await db.scenes.get(sceneId);
  if (scene) await logActivity(scene.productionId, `moved Scene ${scene.sceneNumber} to another shoot day`, "scenes", sceneId);
}

export async function listScenesForShootDay(shootDayId: string): Promise<Scene[]> {
  const entries = await db.sceneScheduleEntries
    .where({ shootDayId })
    .filter((e) => !e.deletedAt && !e.dropped)
    .sortBy("orderIndex");
  const scenes = await Promise.all(entries.map((e) => db.scenes.get(e.sceneId)));
  return scenes.filter((s): s is Scene => !!s && !s.deletedAt);
}

export async function listShootDayIdsForScene(sceneId: string): Promise<string[]> {
  const entries = await db.sceneScheduleEntries.where({ sceneId }).filter((e) => !e.deletedAt && !e.dropped).toArray();
  return entries.map((e) => e.shootDayId);
}

export async function toggleScenePropAssociation(sceneId: string, propId: string) {
  const scene = await db.scenes.get(sceneId);
  if (!scene) return;
  const has = scene.propIds.includes(propId);
  scene.propIds = has ? scene.propIds.filter((p) => p !== propId) : [...scene.propIds, propId];
  touch(scene);
  await db.scenes.put(scene);
  await enqueueSync("scenes", scene.id, "update", scene);
}
