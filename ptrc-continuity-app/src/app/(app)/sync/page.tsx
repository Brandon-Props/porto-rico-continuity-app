"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { clsx } from "clsx";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { db } from "@/db/schema";
import { syncEngine } from "@/lib/sync/SyncEngine";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { getActiveSyncProvider, getSupabaseOverride } from "@/lib/sync";
import { SYNC_PROVIDER_BUILD } from "@/lib/sync/SupabaseSyncProvider";
import { getActiveProductionId } from "@/db/repositories/productions";
import { hydrateProductionFromCloud } from "@/lib/sync/hydrate";
import { queueMissingBlobUploads } from "@/lib/sync/blobSync";

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const STATE_COPY: Record<string, { title: string; body: string }> = {
  offline: { title: "OFFLINE", body: "No connection right now. Everything you do is saved locally and will sync automatically once you're back online." },
  "local-only": { title: "LOCAL ONLY", body: "No sync backend is connected yet for this production. Your work is safe on this device — connect Supabase in Settings once you're ready for multi-device sync." },
  syncing: { title: "SYNCING", body: "Sending queued changes to the server." },
  synced: { title: "✓ SYNCED", body: "Everything on this device has reached the server." },
  error: { title: "SYNC ERROR", body: "Some items failed to sync. Your local copies are safe — retry when ready." },
};

export default function SyncQueuePage() {
  const status = useSyncStatus();
  const provider = getActiveSyncProvider();
  const pending = useLiveQuery(() => db.syncOperations.where("status").anyOf("pending", "syncing").reverse().sortBy("createdAt"), []);
  const failed = useLiveQuery(() => db.syncOperations.where("status").equals("failed").reverse().sortBy("createdAt"), []);
  const copy = STATE_COPY[status.state];

  // The two lists above are about METADATA (which scene, notes, etc.) —
  // they say nothing about whether a photo's actual IMAGE has reached the
  // cloud. That upload runs separately (see blobSync.ts) and, until now, had
  // no visibility anywhere: a photo could sit forever failing to upload its
  // picture with zero indication on this screen, while everything else
  // correctly said "✓ SYNCED". This surfaces that missing half.
  const photoUploads = useLiveQuery(async () => {
    const items = await db.blobUploads.where("status").notEqual("done").toArray();
    return Promise.all(
      items.map(async (item) => {
        const photo = await db.photos.get(item.photoId);
        const scene = photo ? await db.scenes.get(photo.sceneId) : undefined;
        return {
          ...item,
          sceneLabel: scene ? `Scene ${scene.sceneNumber}` : "Unknown scene",
          category: photo?.category ?? null,
        };
      })
    );
  }, []);

  // Everything above is about PUSH — what this device still needs to send up.
  // There was no visible way to ask "has anyone ELSE added anything I don't
  // have yet" — the app only checked that automatically on a cold start, so a
  // crew member's new photo could sit fully synced in the cloud for hours
  // before this device happened to notice. This button asks right now.
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);

  const handleGetLatest = async () => {
    const productionId = getActiveProductionId();
    const override = getSupabaseOverride();
    const url = ENV_URL ?? override?.url;
    const anonKey = ENV_KEY ?? override?.anonKey;
    if (!productionId || !url || !anonKey) {
      setPullResult("Not connected to the cloud yet.");
      return;
    }
    setPulling(true);
    setPullResult(null);
    try {
      const result = await hydrateProductionFromCloud(url, anonKey, productionId);
      await queueMissingBlobUploads();
      setPullResult(result.applied > 0 ? `Got ${result.applied} new or updated item${result.applied === 1 ? "" : "s"}.` : "Already up to date — nothing new.");
    } catch (err) {
      setPullResult(err instanceof Error ? err.message : String(err));
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="flex flex-col">
      <TopBar title="Sync Status" />

      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
          <div className="text-2xl font-black text-[var(--text)]">{copy.title}</div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{copy.body}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Backend: {provider.isConfigured() ? provider.name : "not connected"}</p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">Sync code build: {SYNC_PROVIDER_BUILD}</p>
        </div>
      </div>

      {provider.isConfigured() && (
        <div className="px-4 pt-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="font-bold text-[var(--text)]">Other People&apos;s Photos & Changes</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              This device checks for new stuff from the rest of the crew automatically every so often while the app is
              open. Tap this to check right now instead of waiting.
            </p>
            <Button fullWidth className="mt-2" onClick={handleGetLatest} disabled={pulling}>
              {pulling ? "Checking…" : "Get Latest From Cloud"}
            </Button>
            {pullResult && <p className="mt-2 text-sm text-[var(--text-muted)]">{pullResult}</p>}
          </div>
        </div>
      )}

      {photoUploads && photoUploads.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Photo Images Still Uploading ({photoUploads.length})
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            These are the actual pictures from this device still trying to reach the cloud — until each one
            finishes, other devices won&apos;t be able to see it, even though the scene/note info for it already
            has.
          </p>
          {photoUploads.slice(0, 50).map((item) => (
            <div
              key={item.photoId}
              className={clsx(
                "rounded-xl border p-3 text-sm",
                item.status === "failed" ? "border-[var(--danger)]/40 bg-[var(--danger)]/10" : "border-[var(--border)] bg-[var(--surface)]"
              )}
            >
              <div className="font-semibold text-[var(--text)]">
                {item.sceneLabel}
                {item.category ? ` · ${item.category}` : ""}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {item.status === "failed"
                  ? `Failed after ${item.attemptCount} attempt${item.attemptCount === 1 ? "" : "s"}: ${item.lastError ?? "Unknown error"}`
                  : item.status === "syncing"
                    ? "Uploading now…"
                    : "Waiting to upload…"}
              </div>
            </div>
          ))}
        </div>
      )}

      {failed && failed.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--danger)]">Failed ({failed.length})</h2>
            <Button size="md" variant="secondary" onClick={() => syncEngine.retryFailed()}>Retry All</Button>
          </div>
          {failed.map((op) => (
            <div key={op.id} className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-3 text-sm">
              <div className="font-semibold text-[var(--text)]">{op.entityTable} · {op.op}</div>
              <div className="text-xs text-[var(--text-muted)]">{op.lastError}</div>
              <button onClick={() => syncEngine.retryOne(op.id)} className="mt-1 text-xs font-bold text-[var(--accent)]">RETRY SYNC</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 px-4 py-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Pending ({pending?.length ?? 0})</h2>
        {pending?.slice(0, 50).map((op) => (
          <div key={op.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
            <span className="text-[var(--text)]">{op.entityTable} · {op.op}</span>
            <span className="text-xs text-[var(--text-muted)]">{new Date(op.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </div>
        ))}
        {pending?.length === 0 && <p className="text-sm text-[var(--text-muted)]">Nothing waiting to sync.</p>}
      </div>
    </div>
  );
}
