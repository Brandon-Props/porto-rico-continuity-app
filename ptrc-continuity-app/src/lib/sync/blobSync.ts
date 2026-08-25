"use client";

// The row-sync work earlier in this file's siblings only ever moved metadata
// (which scene, what category, notes) — the actual photo *image* stayed
// device-local forever, because uploading it to Supabase Storage was never
// built (see build notes "known gaps"). This file is that missing half:
// - uploadPendingBlobs(): pushes a captured photo's three image variants
//   (original/display/thumb) to the `continuity-photos` bucket, then records
//   the resulting paths on the photo's row so other devices know where to
//   find them.
// - fetchAndCachePhotoBlob(): the download half, called lazily from
//   getPhotoBlob() (src/db/repositories/photos.ts) the first time something
//   actually tries to display a photo whose image isn't cached on this
//   device yet.
//
// Storage access rules already exist (supabase/migrations/0001_init.sql) —
// "members can read/upload their production's photos", gated by
// is_member_of() on the first path segment, same as every other table.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/db/schema";
import type { Photo } from "@/types";
import { enqueueSync, touch } from "@/db/repositories/helpers";
import { toStoredBlob, fromStoredRecord } from "@/lib/camera/blobStorage";
import { getSupabaseOverride } from "./index";
import { ensureAnonymousSession } from "./SupabaseSyncProvider";

// Exported so annotationBlobSync.ts (the same upload pipeline, applied to a
// photo annotation's drawn layer image instead of the photo itself) can
// reuse this module's Storage-client/credential/verification logic rather
// than duplicating it.
export const BUCKET = "continuity-photos";
const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function resolveCreds(): { url: string; anonKey: string } | null {
  const override = getSupabaseOverride();
  const url = ENV_URL ?? override?.url;
  const anonKey = ENV_KEY ?? override?.anonKey;
  return url && anonKey ? { url, anonKey } : null;
}

// Separate from SupabaseSyncProvider's own client cache — Storage calls don't
// go through PostgREST, but they need the exact same explicit-Bearer-token
// treatment (see getAuthedClient there) to make sure the upload/download
// request actually carries this device's real session, not just the anon key.
let cachedStorageClient: { token: string; client: SupabaseClient } | null = null;

export async function getStorageClient(url: string, anonKey: string): Promise<SupabaseClient> {
  await ensureAnonymousSession(url, anonKey);
  const base = createClient(url, anonKey);
  const { data } = await base.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return base;
  if (cachedStorageClient?.token === token) return cachedStorageClient.client;
  const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  cachedStorageClient = { token, client };
  return client;
}

export function extensionFor(blob: Blob): string {
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/webp") return "webp";
  return "jpg";
}

/** Reads a Blob's actual bytes and hands back a fresh Blob built from them,
 *  or null if it reads back empty. See the big comment at its call site for
 *  why this can't just check `.size`. */
export async function verifiedBlob(blob: Blob): Promise<Blob | null> {
  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength === 0) return null;
  return new Blob([buffer], { type: blob.type || "image/jpeg" });
}

type Variant = "original" | "display" | "thumb";

function blobKeyFor(photo: Photo, variant: Variant): string {
  return variant === "original" ? photo.originalBlobKey : variant === "display" ? photo.displayBlobKey : photo.thumbBlobKey;
}

function storagePathFor(photo: Photo, variant: Variant): string | null | undefined {
  return variant === "original" ? photo.originalStoragePath : variant === "display" ? photo.displayStoragePath : photo.thumbStoragePath;
}

async function uploadOne(client: SupabaseClient, productionId: string, photoId: string, variant: Variant, blob: Blob): Promise<string> {
  const path = `${productionId}/photos/${photoId}/${variant}.${extensionFor(blob)}`;
  const { error } = await client.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** Queues a photo's image for upload — called right after capture, as a
 *  one-time backfill (see queueMissingBlobUploads) for photos that existed
 *  before this feature did, and after a crop replaces a photo's local bytes
 *  (see cropPhoto in db/repositories/photos.ts). Safe to call more than once
 *  for the same photo (the underlying table's primary key is photoId).
 *
 *  Normally a no-op if this photo already finished uploading — but a crop
 *  needs the NEW bytes to go up even though the old ones already made it to
 *  "done", so it passes `force: true` to re-queue regardless of status. */
export async function queueBlobUpload(photoId: string, force = false): Promise<void> {
  const existing = await db.blobUploads.get(photoId);
  if (existing && existing.status !== "failed" && !force) return;
  await db.blobUploads.put({ photoId, status: "pending", attemptCount: existing?.attemptCount ?? 0, createdAt: existing?.createdAt ?? new Date().toISOString() });
}

/** One-time backfill for photos captured before blob upload existed at all —
 *  their metadata already synced, but nothing ever queued the image itself. */
export async function queueMissingBlobUploads(): Promise<void> {
  const photos = await db.photos.filter((p) => !p.deletedAt && !p.originalStoragePath).toArray();
  for (const photo of photos) {
    const hasLocalBlob = await db.photoBlobs.get(photo.originalBlobKey);
    if (hasLocalBlob) await queueBlobUpload(photo.id);
  }
}

/** Uploads every photo image still waiting to reach Supabase Storage. Called
 *  from SyncEngine.drain() (via SupabaseSyncProvider.uploadPendingBlobs) on
 *  the same 4-second cadence as row sync, so it needs to stay cheap to call
 *  when there's nothing to do. */
export async function uploadPendingBlobs(url: string, anonKey: string): Promise<void> {
  const pending = await db.blobUploads.where("status").anyOf("pending", "failed").toArray();
  if (pending.length === 0) return;

  const client = await getStorageClient(url, anonKey);

  for (const item of pending) {
    await db.blobUploads.update(item.photoId, { status: "syncing" });
    try {
      const photo = await db.photos.get(item.photoId);
      if (!photo || photo.deletedAt) {
        await db.blobUploads.delete(item.photoId);
        continue;
      }

      const [originalRec, displayRec, thumbRec] = await Promise.all([
        db.photoBlobs.get(photo.originalBlobKey),
        db.photoBlobs.get(photo.displayBlobKey),
        db.photoBlobs.get(photo.thumbBlobKey),
      ]);
      const rawOriginal = fromStoredRecord(originalRec);
      const rawDisplay = fromStoredRecord(displayRec);
      const rawThumb = fromStoredRecord(thumbRec);
      if (!rawOriginal || !rawDisplay || !rawThumb) {
        throw new Error("This device no longer has the local image data for this photo — nothing to upload.");
      }
      // Actually READ each blob's bytes here rather than trusting its
      // reported `.size` — the iOS Safari IndexedDB Blob bug this guards
      // against can leave a Blob whose `.size` still reports the original
      // byte count while its real content silently reads back empty. That's
      // exactly the shape of bug that made "No content provided" from
      // Supabase such a confusing dead end: the blob "looked" fine right up
      // until the upload actually tried to send it. Rebuilding a fresh Blob
      // from the verified bytes also means the same underlying object never
      // gets handed to fetch/upload twice.
      const [originalBlob, displayBlob, thumbBlob] = await Promise.all([
        verifiedBlob(rawOriginal),
        verifiedBlob(rawDisplay),
        verifiedBlob(rawThumb),
      ]);
      if (!originalBlob || !displayBlob || !thumbBlob) {
        throw new Error(
          "This photo's saved image is empty on this device (a known iOS storage glitch) and can't be uploaded — the picture will need to be retaken."
        );
      }

      const [originalPath, displayPath, thumbPath] = await Promise.all([
        uploadOne(client, photo.productionId, photo.id, "original", originalBlob),
        uploadOne(client, photo.productionId, photo.id, "display", displayBlob),
        uploadOne(client, photo.productionId, photo.id, "thumb", thumbBlob),
      ]);

      const fresh = await db.photos.get(photo.id);
      if (fresh) {
        fresh.originalStoragePath = originalPath;
        fresh.displayStoragePath = displayPath;
        fresh.thumbStoragePath = thumbPath;
        touch(fresh);
        await db.photos.put(fresh);
        await enqueueSync("photos", fresh.id, "update", fresh);
      }

      await db.blobUploads.update(item.photoId, { status: "done" });
    } catch (err) {
      await db.blobUploads.update(item.photoId, {
        status: "failed",
        attemptCount: (item.attemptCount ?? 0) + 1,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** The download half: called lazily from getPhotoBlob() the first time
 *  something tries to actually display a photo whose image isn't cached on
 *  this device yet. Downloads once, caches into photoBlobs so every
 *  subsequent view is instant and works offline from then on. */
export async function fetchAndCachePhotoBlob(photo: Photo, variant: Variant): Promise<Blob | undefined> {
  const path = storagePathFor(photo, variant);
  if (!path) return undefined;
  const creds = resolveCreds();
  if (!creds) return undefined;

  try {
    const client = await getStorageClient(creds.url, creds.anonKey);
    const { data, error } = await client.storage.from(BUCKET).download(path);
    if (error || !data) return undefined;
    const stored = await toStoredBlob(data);
    await db.photoBlobs.put({ key: blobKeyFor(photo, variant), photoId: photo.id, variant, ...stored });
    return data;
  } catch {
    return undefined;
  }
}
