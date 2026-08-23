"use client";

import { useEffect, useState } from "react";
import { getPhotoBlob } from "@/db/repositories/photos";

/** Loads a stored Blob (thumb/display/original) and hands back an object URL, revoking it on cleanup. */
export function usePhotoBlobUrl(key: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    setUrl(undefined);
    if (!key) return;

    getPhotoBlob(key).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return url;
}
