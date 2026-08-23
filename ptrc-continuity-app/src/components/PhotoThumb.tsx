"use client";

import { usePhotoBlobUrl } from "@/hooks/usePhotoBlobUrl";
import type { Photo } from "@/types";
import { clsx } from "clsx";

export function PhotoThumb({
  photo,
  onClick,
  size = "md",
}: {
  photo: Photo;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const url = usePhotoBlobUrl(photo.thumbBlobKey);
  const dims = size === "sm" ? "h-20 w-20" : size === "lg" ? "h-40 w-40" : "h-28 w-28";

  return (
    <button
      onClick={onClick}
      className={clsx(dims, "relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]")}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-[var(--border)]" />
      )}
      {photo.pinned && (
        <span className="absolute left-1 top-1 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-contrast)]">
          ★
        </span>
      )}
      {photo.dirty && (
        <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-amber-400" title="Pending sync" />
      )}
    </button>
  );
}
