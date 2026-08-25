"use client";

// WHY THIS FILE EXISTS: photoBlobs used to store a native Blob object
// directly in IndexedDB (Dexie). That works fine in Chrome/Android, but iOS
// Safari has a long-standing bug where a Blob written to IndexedDB can come
// back with 0 bytes later — most commonly after the app has been closed and
// reopened, or after the OS reclaims some memory. The row still "exists," so
// nothing on this device notices anything wrong; it's only visible once
// something tries to actually use the bytes, e.g. uploading it to Supabase
// Storage, which then fails every single retry with an opaque error like
// "No content provided" — because it's genuinely being asked to upload an
// empty file, forever, with no way to recover those particular bytes.
//
// The fix: store the raw bytes as an ArrayBuffer instead of a Blob.
// ArrayBuffers round-trip through IndexedDB reliably on iOS Safari in a way
// Blobs historically have not. A Blob is reconstructed on read via
// `fromStoredRecord`, so every call site keeps working with ordinary Blobs.
//
// This does NOT recover photos that were already corrupted before this fix
// shipped — if the local bytes are already gone, there's nothing left to
// convert. It only prevents this from happening to photos captured or synced
// from here on.

export interface StoredBlobFields {
  buffer?: ArrayBuffer;
  mimeType?: string;
  /** @deprecated legacy field from before this fix — some existing records on
   *  a device may still have this instead of `buffer`. Only ever read, never
   *  written, going forward. */
  blob?: Blob;
}

export async function toStoredBlob(blob: Blob): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const buffer = await blob.arrayBuffer();
  return { buffer, mimeType: blob.type || "image/jpeg" };
}

/** Reconstructs a usable Blob from a Dexie record, however it happened to be stored. */
export function fromStoredRecord(rec: StoredBlobFields | undefined): Blob | undefined {
  if (!rec) return undefined;
  if (rec.buffer) return new Blob([rec.buffer], { type: rec.mimeType || "image/jpeg" });
  return rec.blob;
}
