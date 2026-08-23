"use client";

import { db } from "@/db/schema";
import type { PhotoAnnotation } from "@/types";
import { baseFields, enqueueSync, logActivity, newId } from "./helpers";

export async function saveAnnotation(photoId: string, productionId: string, blob: Blob): Promise<PhotoAnnotation> {
  const base = baseFields();
  const annotation: PhotoAnnotation = {
    ...base,
    productionId,
    photoId,
    layerBlobKey: `${base.id}_layer`,
    toolType: "freehand",
  };
  await db.transaction("rw", db.photoAnnotations, db.annotationBlobs, async () => {
    await db.annotationBlobs.add({ key: annotation.layerBlobKey, annotationId: annotation.id, blob });
    await db.photoAnnotations.add(annotation);
  });
  await enqueueSync("photo_annotations", annotation.id, "create", { ...annotation, blobPending: true });
  await logActivity(productionId, "added a photo annotation", "photo_annotations", annotation.id);
  return annotation;
}

export async function listAnnotations(photoId: string): Promise<PhotoAnnotation[]> {
  const list = await db.photoAnnotations.where({ photoId }).filter((a) => !a.deletedAt).toArray();
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getAnnotationBlob(key: string) {
  const rec = await db.annotationBlobs.get(key);
  return rec?.blob;
}

export function newAnnotationId() {
  return newId();
}
