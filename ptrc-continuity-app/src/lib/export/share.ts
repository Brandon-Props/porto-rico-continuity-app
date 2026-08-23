import { saveAs } from "file-saver";

/**
 * Never assume the browser can write straight into the Photos library (spec §28):
 * prefer the Web Share API where it can share files, otherwise fall back to a
 * plain download.
 */
export async function sharePhotoBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }
  saveAs(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  saveAs(blob, filename);
}
