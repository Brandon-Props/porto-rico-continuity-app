"use client";

import { db } from "@/db/schema";
import type { PhotoAnnotation } from "@/types";
import { baseFields, enqueueSync, logActivity, newId } from "./helpers";
import { toStoredBlob, fromStoredRecord } from "@/lib/camera/blobStorage";
import { queueAnnotationBlobUpload, fetchAndCacheAnnotationBlob, layerBlobKeyFor } from "@/lib/sync/annotationBlobSync";

export async function saveAnnotation(photoId: string, productionId: string, blob: Blob): Promise<PhotoAnnotation> {
  const base = baseFields();
  const annotation: PhotoAnnotation = {
    ...base,
    productionId,
    photoId,
    layerBlobKey: layerBlobKeyFor(base.id),
    toolType: "freehand",
  };
  const stored = await toStoredBlob(blob);
  await db.transaction("rw", db.photoAnnotations, db.annotationBlobs, async () => {
    await db.annotationBlobs.add({ key: annotation.layerBlobKey, annotationId: annotation.id, ...stored });
    await db.photoAnnotations.add(annotation);
  });
  await enqueueSync("photo_annotations", annotation.id, "create", { ...annotation, blobPending: true });
  // Metadata above is queued for the row-sync path; the actual layer image
  // travels separately over Supabase Storage (see annotationBlobSync.ts) —
  // queue that too so this annotation's picture, not just its row, reaches
  // the cloud. Without this, the annotation looks "saved" everywhere but
  // only ever displays on the device that drew it.
  await queueAnnotationBlobUpload(annotation.id);
  await logActivity(productionId, "added a photo annotation", "photo_annotations", annotation.id);
  return annotation;
}

export async function listAnnotations(photoId: string): Promise<PhotoAnnotation[]> {
  const list = await db.photoAnnotations.where({ photoId }).filter((a) => !a.deletedAt).toArray();
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getAnnotationBlob(key: string): Promise<Blob | undefined> {
  const rec = await db.annotationBlobs.get(key);
  if (rec) {
    const blob = fromStoredRecord(rec);
    // Same "trust the real bytes, not just that a record exists" guard as
    // getPhotoBlob (photos.ts) — a pre-fix record can exist but read back
    // empty from the iOS Safari IndexedDB Blob bug.
    if (blob && blob.size > 0) return blob;
  }

  // Not cached on this device — most likely an annotation pulled down from
  // another device whose row arrived but whose layer image never did (the
  // exact bug this file's queueAnnotationBlobUpload/fetchAndCacheAnnotationBlob
  // pair fixes). The key is `${annotationId}_layer` (see saveAnnotation
  // above) — recover the annotation id from it and fetch from Storage.
  if (!key.endsWith("_layer")) return undefined;
  const annotationId = key.slice(0, key.length - "_layer".length);
  const annotation = await db.photoAnnotations.get(annotationId);
  if (!annotation) return undefined;
  return fetchAndCacheAnnotationBlob(annotation);
}

export function newAnnotationId() {
  return newId();
}
