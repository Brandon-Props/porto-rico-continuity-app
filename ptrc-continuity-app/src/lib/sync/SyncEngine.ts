"use client";

import { db } from "@/db/schema";
import { getActiveSyncProvider } from "./index";

export type SyncState = "offline" | "local-only" | "syncing" | "synced" | "error";

export interface SyncSnapshot {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  currentIndex?: number;
  totalInBatch?: number;
}

type Listener = (snapshot: SyncSnapshot) => void;

class SyncEngineImpl {
  private listeners = new Set<Listener>();
  private draining = false;
  private online = typeof navigator !== "undefined" ? navigator.onLine : true;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.online = true;
        this.drain();
      });
      window.addEventListener("offline", () => {
        this.online = false;
        this.notify();
      });
      // Any local write enqueues a sync_operations row — poll lightly so the badge
      // stays current without every repository function needing to know about sync.
      setInterval(() => this.drain(), 4000);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.emitCurrent();
    return () => this.listeners.delete(listener);
  }

  private async emitCurrent() {
    const [pendingCount, failedCount] = await Promise.all([
      db.syncOperations.where("status").anyOf("pending", "syncing").count(),
      db.syncOperations.where("status").equals("failed").count(),
    ]);
    const provider = getActiveSyncProvider();
    let state: SyncState;
    if (!this.online) state = "offline";
    else if (!provider.isConfigured()) state = "local-only";
    else if (failedCount > 0) state = "error";
    else if (pendingCount > 0) state = "syncing";
    else state = "synced";
    this.notify({ state, pendingCount, failedCount });
  }

  private notify(snapshot?: SyncSnapshot) {
    if (snapshot) {
      this.listeners.forEach((l) => l(snapshot));
    } else {
      this.emitCurrent();
    }
  }

  async drain() {
    if (this.draining || !this.online) {
      this.emitCurrent();
      return;
    }
    const provider = getActiveSyncProvider();
    if (!provider.isConfigured()) {
      this.emitCurrent();
      return;
    }
    this.draining = true;
    try {
      // A row can be left stuck at "syncing" forever if the app was closed,
      // crashed, or lost its connection mid-request — the timeout added to
      // SupabaseSyncProvider.push() only rescues a request that's still
      // actually running; it can't help one whose whole page was torn down
      // mid-flight, since there's no live promise left to time out. Any
      // "syncing" row found at the START of a fresh drain() can't legitimately
      // still be in flight from this same session (the `draining` guard above
      // prevents two drains overlapping), so it's always safe to treat it as
      // abandoned and hand it back to the normal pending queue below.
      const orphaned = await db.syncOperations.where("status").equals("syncing").toArray();
      if (orphaned.length > 0) {
        await Promise.all(orphaned.map((op) => db.syncOperations.update(op.id, { status: "pending" })));
      }

      const pending = await db.syncOperations.where("status").equals("pending").sortBy("createdAt");
      for (let i = 0; i < pending.length; i++) {
        const op = pending[i];
        await db.syncOperations.update(op.id, { status: "syncing" });
        this.notify({
          state: "syncing",
          pendingCount: pending.length - i,
          failedCount: 0,
          currentIndex: i + 1,
          totalInBatch: pending.length,
        });
        const result = await provider.push(op);
        if (result.success) {
          await db.syncOperations.update(op.id, { status: "done" });
        } else {
          await db.syncOperations.update(op.id, {
            status: "failed",
            attemptCount: op.attemptCount + 1,
            lastError: result.error,
          });
        }
      }

      // Row sync above only ever moved metadata — the actual photo image
      // still needs a separate trip to Supabase Storage (see
      // src/lib/sync/blobSync.ts). Runs on this same 4-second cadence so a
      // captured photo's picture reaches the cloud without any extra action.
      await provider.uploadPendingBlobs?.();
    } finally {
      this.draining = false;
      this.emitCurrent();
    }
  }

  async retryFailed() {
    const failed = await db.syncOperations.where("status").equals("failed").toArray();
    await Promise.all(failed.map((op) => db.syncOperations.update(op.id, { status: "pending" })));
    this.drain();
  }

  async retryOne(opId: string) {
    await db.syncOperations.update(opId, { status: "pending" });
    this.drain();
  }
}

export const syncEngine = new SyncEngineImpl();
