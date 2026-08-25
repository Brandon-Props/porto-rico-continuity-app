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
import { getSupabaseOverride } from "./index";
import { ensureAnonymousSession } from "./SupabaseSyncProvider";

const BUCKET = "continuity-photos";
const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function resolveCreds(): { url: string; anonKey: string } | null {
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

async function getStorageClient(url: string, anonKey: string): Promise<SupabaseClient> {
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

function extensionFor(blob: Blob): string {
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/webp") return "webp";
  return "jpg";
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
      if (!originalRec || !displayRec || !thumbRec) {
        throw new Error("This device no longer has the local image data for this photo — nothing to upload.");
      }

      const [originalPath, displayPath, thumbPath] = await Promise.all([
        uploadOne(client, photo.productionId, photo.id, "original", originalRec.blob),
        uploadOne(client, photo.productionId, photo.id, "display", displayRec.blob),
        uploadOne(client, photo.productionId, photo.id, "thumb", thumbRec.blob),
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
    await db.photoBlobs.put({ key: blobKeyFor(photo, variant), photoId: photo.id, variant, blob: data });
    return data;
  } catch {
    return undefined;
  }
}
