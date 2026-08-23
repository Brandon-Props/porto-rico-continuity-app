"use client";

// Client-side image resizing so the app never stores three full-resolution copies.
// See ARCHITECTURE.md §6 — original / display (~1600px) / thumb (~300px).

async function resizeBlob(source: Blob, maxEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality
    );
  });
}

export interface PhotoVariants {
  original: Blob;
  display: Blob;
  thumb: Blob;
}

export async function buildPhotoVariants(original: Blob): Promise<PhotoVariants> {
  const [display, thumb] = await Promise.all([
    resizeBlob(original, 1600, 0.85),
    resizeBlob(original, 320, 0.75),
  ]);
  return { original, display, thumb };
}
