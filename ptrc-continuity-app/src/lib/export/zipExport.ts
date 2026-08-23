import JSZip from "jszip";
import { saveAs } from "file-saver";
import { db } from "@/db/schema";
import { getPhotoBlob } from "@/db/repositories/photos";
import { buildExportFolder, buildPhotoFilename } from "./filename";
import type { Photo, Production } from "@/types";

/** Batch export (spec §29/§30): builds Production/ShootDay/Scene/Shot/Take folders with meaningful filenames. */
export async function exportPhotosAsZip(photos: Photo[], production: Production, zipName: string) {
  const zip = new JSZip();
  const perFolderCounters = new Map<string, number>();

  for (const photo of photos) {
    const scene = await db.scenes.get(photo.sceneId);
    if (!scene) continue;
    const shot = photo.shotId ? await db.shots.get(photo.shotId) : undefined;
    const take = photo.takeId ? await db.takes.get(photo.takeId) : undefined;
    const scheduleEntry = await db.sceneScheduleEntries.where({ sceneId: scene.id }).filter((e) => !e.deletedAt).first();
    const shootDay = scheduleEntry ? await db.shootDays.get(scheduleEntry.shootDayId) : undefined;

    const folder = buildExportFolder(production, shootDay?.dayNumber, scene, shot, take);
    const index = perFolderCounters.get(folder) ?? 0;
    perFolderCounters.set(folder, index + 1);

    const filename = buildPhotoFilename(production, scene, shot, take, photo, index);
    const blob = await getPhotoBlob(photo.originalBlobKey);
    if (blob) zip.file(`${folder}/${filename}`, blob);
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `${zipName}.zip`);
}

export function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveAs(blob, filename);
}

export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) {
    saveAs(new Blob([""], { type: "text/csv" }), filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  saveAs(blob, filename);
}
