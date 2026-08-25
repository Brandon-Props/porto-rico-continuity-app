"use client";

import { useEffect, useState } from "react";
import { getPhotoBlob } from "@/db/repositories/photos";

export type PhotoBlobState = "loading" | "loaded" | "missing";

/** Loads a stored Blob (thumb/display/original) and hands back an object URL, revoking it on cleanup. */
export function usePhotoBlobUrl(key: string | undefined): string | undefined {
  return usePhotoBlobUrlWithState(key).url;
}

/**
 * Same as usePhotoBlobUrl, but also reports WHY there's no image yet — a
 * plain `undefined` url used to mean "still loading" and "this photo's image
 * is never coming" identically, both rendered as an eternal pulsing gray box
 * with no way to tell them apart. "missing" means getPhotoBlob() came back
 * empty: not cached locally AND not fetchable from cloud storage (most often
 * because the originating device's upload never actually finished).
 */
export function usePhotoBlobUrlWithState(key: string | undefined): { url: string | undefined; state: PhotoBlobState } {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [state, setState] = useState<PhotoBlobState>("loading");

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    setUrl(undefined);
    setState("loading");
    if (!key) return;

    getPhotoBlob(key).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setState("missing");
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      setState("loaded");
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return { url, state };
}
