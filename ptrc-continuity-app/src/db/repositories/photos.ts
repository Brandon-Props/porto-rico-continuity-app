"use client";

import { db } from "@/db/schema";
import type { Photo, PhotoFlag } from "@/types";
import { baseFields, enqueueSync, logActivity, newId, nowIso, touch } from "./helpers";
import { buildPhotoVariants } from "@/lib/camera/imageProcessing";
import { getCurrentUser } from "@/lib/currentUser";
import { queueBlobUpload, fetchAndCachePhotoBlob } from "@/lib/sync/blobSync";

export interface CapturePhotoInput {
  sceneId: string;
  shotId?: string | null;
  takeId?: string | null;
  category: string;
  cameraDeviceLabel?: string;
  propIds?: string[];
  characterIds?: string[];
  notes?: string;
}

/** The core "tap CAPTURE" action. Stores locally immediately; never blocks on a network. */
export async function capturePhoto(originalBlob: Blob, input: CapturePhotoInput): Promise<Photo> {
  const scene = await db.scenes.get(input.sceneId);
  const variants = await buildPhotoVariants(originalBlob);
  const user = getCurrentUser();

  const base = baseFields();
  const photo: Photo = {
    ...base,
    productionId: scene?.productionId ?? "",
    sceneId: input.sceneId,
    shotId: input.shotId ?? null,
    takeId: input.takeId ?? null,
    originalBlobKey: `${base.id}_original`,
    displayBlobKey: `${base.id}_display`,
    thumbBlobKey: `${base.id}_thumb`,
    category: input.category,
    cameraDeviceLabel: input.cameraDeviceLabel,
    takenBy: user?.id ?? "unknown",
    takenAt: nowIso(),
    pinned: false,
    flags: [],
    notes: input.notes,
    propIds: input.propIds ?? [],
    characterIds: input.characterIds ?? [],
  };

  await db.transaction("rw", db.photos, db.photoBlobs, async () => {
    await db.photoBlobs.bulkAdd([
      { key: photo.originalBlobKey, photoId: photo.id, variant: "original", blob: variants.original },
      { key: photo.displayBlobKey, photoId: photo.id, variant: "display", blob: variants.display },
      { key: photo.thumbBlobKey, photoId: photo.id, variant: "thumb", blob: variants.thumb },
    ]);
    await db.photos.add(photo);
  });

  await enqueueSync("photos", photo.id, "create", { ...photo, blobsPending: true });
  // Metadata above is queued for the row-sync path; the actual image bytes
  // travel separately over Supabase Storage (see src/lib/sync/blobSync.ts) —
  // queue that too so this photo's picture, not just its row, reaches the cloud.
  await queueBlobUpload(photo.id);
  if (scene) {
    await logActivity(scene.productionId, `captured a ${input.category} photo on Scene ${scene.sceneNumber}`, "photos", photo.id);
  }
  return photo;
}

export async function getPhoto(id: string): Promise<Photo | undefined> {
  return db.photos.get(id);
}

export async function getPhotoBlob(key: string): Promise<Blob | undefined> {
  const rec = await db.photoBlobs.get(key);
  if (rec) return rec.blob;

  // Not cached on this device — most likely a photo pulled down from another
  // device (see hydrate.ts) whose row arrived but whose actual image never
  // did. Work out which photo/variant this key is for and fetch it from
  // Supabase Storage instead, caching it locally so every view after this
  // first one is instant and works offline.
  const variant = key.endsWith("_original") ? "original" : key.endsWith("_display") ? "display" : key.endsWith("_thumb") ? "thumb" : null;
  if (!variant) return undefined;
  const photoId = key.slice(0, key.length - (variant.length + 1));
  const photo = await db.photos.get(photoId);
  if (!photo) return undefined;
  return fetchAndCachePhotoBlob(photo, variant);
}

export async function listPhotosForScene(sceneId: string): Promise<Photo[]> {
  const photos = await db.photos.where({ sceneId }).filter((p) => !p.deletedAt).toArray();
  return photos.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
}

export async function listPhotosForShot(shotId: string): Promise<Photo[]> {
  const photos = await db.photos.where({ shotId }).filter((p) => !p.deletedAt).toArray();
  return photos.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
}

export async function listPhotosForTake(takeId: string): Promise<Photo[]> {
  const photos = await db.photos.where({ takeId }).filter((p) => !p.deletedAt).toArray();
  return photos.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
}

export async function listPinnedForScene(sceneId: string): Promise<Photo[]> {
  const photos = await listPhotosForScene(sceneId);
  return photos.filter((p) => p.pinned);
}

export async function listPhotosForProduction(productionId: string): Promise<Photo[]> {
  const photos = await db.photos.where({ productionId }).filter((p) => !p.deletedAt).toArray();
  return photos.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
}

export async function togglePin(photoId: string) {
  const photo = await db.photos.get(photoId);
  if (!photo) return;
  photo.pinned = !photo.pinned;
  if (photo.pinned && !photo.flags.includes("master")) photo.flags = [...photo.flags, "master"];
  touch(photo);
  await db.photos.put(photo);
  await enqueueSync("photos", photo.id, "update", photo);
  const scene = await db.scenes.get(photo.sceneId);
  if (scene) {
    await logActivity(
      scene.productionId,
      photo.pinned ? `pinned a photo as Master Continuity on Scene ${scene.sceneNumber}` : `unpinned a photo on Scene ${scene.sceneNumber}`,
      "photos",
      photoId
    );
  }
}

export async function toggleFlag(photoId: string, flag: PhotoFlag) {
  const photo = await db.photos.get(photoId);
  if (!photo) return;
  photo.flags = photo.flags.includes(flag) ? photo.flags.filter((f) => f !== flag) : [...photo.flags, flag];
  touch(photo);
  await db.photos.put(photo);
  await enqueueSync("photos", photo.id, "update", photo);
}

export async function updatePhotoMetadata(photoId: string, patch: Partial<Photo>) {
  const photo = await db.photos.get(photoId);
  if (!photo) return;
  Object.assign(photo, patch);
  touch(photo);
  await db.photos.put(photo);
  await enqueueSync("photos", photo.id, "update", photo);
}

export async function linkPhotoReference(photoId: string, referencesPhotoId: string) {
  await updatePhotoMetadata(photoId, { referencesPhotoId });
}

export async function softDeletePhoto(photoId: string) {
  const photo = await db.photos.get(photoId);
  if (!photo) return;
  photo.deletedAt = nowIso();
  touch(photo);
  await db.photos.put(photo);
  await enqueueSync("photos", photo.id, "delete", photo);

  const user = getCurrentUser();
  await db.deletedItems.add({
    id: newId(),
    entityTable: "photos",
    entityId: photo.id,
    deletedBy: user?.id ?? "unknown",
    deletedByName: user?.displayName ?? "Unknown",
    deletedAt: nowIso(),
    restorable: true,
    snapshotJson: JSON.stringify(photo),
  });

  const scene = await db.scenes.get(photo.sceneId);
  if (scene) await logActivity(scene.productionId, `moved a photo to Trash on Scene ${scene.sceneNumber}`, "photos", photoId);
}

export async function listTrash(productionId: string) {
  const items = await db.deletedItems.where({ entityTable: "photos" }).toArray();
  const withPhotos = await Promise.all(
    items.map(async (item) => ({ item, photo: await db.photos.get(item.entityId) }))
  );
  return withPhotos.filter(
    (x): x is { item: (typeof items)[number]; photo: Photo } =>
      !!x.photo && x.photo.productionId === productionId && !!x.photo.deletedAt
  );
}

export async function restorePhoto(photoId: string) {
  const photo = await db.photos.get(photoId);
  if (!photo) return;
  photo.deletedAt = null;
  touch(photo);
  await db.photos.put(photo);
  await enqueueSync("photos", photo.id, "update", photo);
}

export async function permanentlyDeletePhoto(photoId: string) {
  await db.transaction("rw", db.photos, db.photoBlobs, db.deletedItems, async () => {
    const photo = await db.photos.get(photoId);
    if (!photo) return;
    await db.photoBlobs.bulkDelete([photo.originalBlobKey, photo.displayBlobKey, photo.thumbBlobKey]);
    await db.photos.delete(photoId);
  });
  await enqueueSync("photos", photoId, "delete", { hardDelete: true });
}
