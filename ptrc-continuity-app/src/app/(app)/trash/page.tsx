"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { PhotoThumb } from "@/components/PhotoThumb";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listTrash, restorePhoto, permanentlyDeletePhoto } from "@/db/repositories/photos";

export default function TrashPage() {
  const productionId = getActiveProductionId() ?? "";
  const trashed = useLiveQuery(() => listTrash(productionId), [productionId]);

  return (
    <div className="flex flex-col">
      <TopBar title="Trash" back />
      <p className="px-4 pt-3 text-xs text-[var(--text-muted)]">
        Deleted photos land here first — nothing is gone until it&apos;s permanently removed. Restoring is one tap; permanent deletion is admin-only (see spec §39).
      </p>
      <div className="flex flex-col gap-2 px-4 py-4">
        {trashed?.map(({ item, photo }) => (
          <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <PhotoThumb photo={photo} size="sm" />
            <div className="flex-1 text-xs text-[var(--text-muted)]">
              <div className="font-semibold text-[var(--text)]">{photo.category}</div>
              Deleted by {item.deletedByName} · {new Date(item.deletedAt).toLocaleString()}
            </div>
            <div className="flex flex-col gap-1">
              <Button size="md" onClick={() => restorePhoto(photo.id)}>Restore</Button>
              <Button
                size="md"
                variant="danger"
                onClick={() => {
                  if (window.confirm("Permanently delete this photo? This cannot be undone.")) permanentlyDeletePhoto(photo.id);
                }}
              >
                Delete Forever
              </Button>
            </div>
          </div>
        ))}
        {trashed?.length === 0 && <p className="text-sm text-[var(--text-muted)]">Trash is empty.</p>}
      </div>
    </div>
  );
}
