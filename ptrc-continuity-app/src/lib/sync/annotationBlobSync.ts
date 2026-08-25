"use client";

// A photo annotation's drawn layer image never had an upload path at all —
// saveAnnotation() (db/repositories/annotations.ts) only ever wrote it into
// this device's own IndexedDB. Its Postgres ROW synced fine (photo_annotations
// has been syncing since the blobPending/layerBlobKey column fixes), which is
// exactly what made this so confusing to spot: the annotation looked "saved"
// on every device that pulled the row, but the actual picture only ever
// existed on the phone that drew it. This file is the missing half, built the
// same way blobSync.ts does it for photos — same bucket, same path
// convention, same verify-before-upload guard against the iOS Safari Blob
// corruption bug, just one level deeper (production/{id}/annotations/{id}/).

import { db } from "@/db/schema";
import type { PhotoAnnotation } from "@/types";
import { enqueueSync, touch } from "@/db/repositories/helpers";
import { toStoredBlob, fromStoredRecord } from "@/lib/camera/blobStorage";
import { BUCKET, extensionFor, getStorageClient, resolveCreds, verifiedBlob } from "./blobSync";

/** `annotation.layerBlobKey` is a LOCAL-ONLY field (see LOCAL_ONLY_FIELDS in
 *  caseTransform.ts) — it's deliberately never sent to Postgres, so it never
 *  comes back on a pull either. Any device other than the one that drew the
 *  annotation sees `layerBlobKey: undefined` on the row it pulled down, not
 *  the value the originating device set. Trusting that field crashed
 *  IndexedDB lookups with "Invalid argument to Table.get()" and, in the
 *  photo page's annotation thumbnails, silently passed `undefined` as the
 *  key to look up — which the loading hook treats as "nothing to fetch" and
 *  just sits there forever. That combination is exactly why an annotation
 *  saved on one phone never appeared on another: this file's own upload
 *  path worked, but every READ was looking up the wrong (missing) key.
 *  Since the key is always `${annotationId}_layer`, every lookup below
 *  derives it fresh from the annotation's id instead of trusting the field
 *  to have survived the round trip. */
export function layerBlobKeyFor(annotationId: string): string {
  return `${annotationId}_layer`;
}

/** Queues an annotation's drawn layer image for upload — called right after
 *  it's saved. Safe to call more than once for the same annotation. */
export async function queueAnnotationBlobUpload(annotationId: string): Promise<void> {
  const existing = await db.annotationBlobUploads.get(annotationId);
  if (existing && existing.status !== "failed") return;
  await db.annotationBlobUploads.put({
    annotationId,
    status: "pending",
    attemptCount: existing?.attemptCount ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
}

/** Same "syncing" orphan as blobSync.ts's resetStuckBlobUploads, for
 *  annotation layer images — called once at app startup. */
export async function resetStuckAnnotationBlobUploads(): Promise<void> {
  const stuck = await db.annotationBlobUploads.where("status").equals("syncing").toArray();
  for (const item of stuck) {
    await db.annotationBlobUploads.update(item.annotationId, { status: "pending" });
  }
}

/** One-time backfill for annotations saved before this feature existed —
 *  their row already synced, but nothing ever queued the image itself. */
export async function queueMissingAnnotationBlobUploads(): Promise<void> {
  const annotations = await db.photoAnnotations.filter((a) => !a.deletedAt && !a.layerStoragePath).toArray();
  for (const annotation of annotations) {
    const hasLocalBlob = await db.annotationBlobs.get(layerBlobKeyFor(annotation.id));
    if (hasLocalBlob) await queueAnnotationBlobUpload(annotation.id);
  }
}

/** Uploads every annotation layer image still waiting to reach Supabase
 *  Storage. Called from SyncEngine.drain() (via
 *  SupabaseSyncProvider.uploadPendingBlobs) on the same cadence as photo blob
 *  uploads and row sync. */
export async function uploadPendingAnnotationBlobs(url: string, anonKey: string): Promise<void> {
  const pending = await db.annotationBlobUploads.where("status").anyOf("pending", "failed").toArray();
  if (pending.length === 0) return;

  const client = await getStorageClient(url, anonKey);

  for (const item of pending) {
    await db.annotationBlobUploads.update(item.annotationId, { status: "syncing" });
    try {
      const annotation = await db.photoAnnotations.get(item.annotationId);
      if (!annotation || annotation.deletedAt) {
        await db.annotationBlobUploads.delete(item.annotationId);
        continue;
      }

      const rec = await db.annotationBlobs.get(layerBlobKeyFor(annotation.id));
      const raw = fromStoredRecord(rec);
      if (!raw) {
        throw new Error("This device no longer has the local image data for this annotation — nothing to upload.");
      }
      const blob = await verifiedBlob(raw);
      if (!blob) {
        throw new Error(
          "This annotation's saved image is empty on this device (a known iOS storage glitch) and can't be uploaded — it will need to be redrawn."
        );
      }

      const path = `${annotation.productionId}/annotations/${annotation.id}/layer.${extensionFor(blob)}`;
      const { error } = await client.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: true,
      });
      if (error) throw error;

      const fresh = await db.photoAnnotations.get(annotation.id);
      if (fresh) {
        fresh.layerStoragePath = path;
        touch(fresh);
        await db.photoAnnotations.put(fresh);
        await enqueueSync("photo_annotations", fresh.id, "update", fresh);
      }

      await db.annotationBlobUploads.update(item.annotationId, { status: "done" });
    } catch (err) {
      await db.annotationBlobUploads.update(item.annotationId, {
        status: "failed",
        attemptCount: (item.attemptCount ?? 0) + 1,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** The download half: called lazily from getAnnotationBlob() the first time
 *  something tries to actually display an annotation whose layer image isn't
 *  cached on this device yet (i.e. it arrived via row-sync from another
 *  device, not drawn locally). */
export async function fetchAndCacheAnnotationBlob(annotation: PhotoAnnotation): Promise<Blob | undefined> {
  const path = annotation.layerStoragePath;
  if (!path) return undefined;
  const creds = resolveCreds();
  if (!creds) return undefined;

  try {
    const client = await getStorageClient(creds.url, creds.anonKey);
    const { data, error } = await client.storage.from(BUCKET).download(path);
    if (error || !data) return undefined;
    const stored = await toStoredBlob(data);
    await db.annotationBlobs.put({ key: layerBlobKeyFor(annotation.id), annotationId: annotation.id, ...stored });
    return data;
  } catch {
    return undefined;
  }
}
