"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { db } from "@/db/schema";
import { syncEngine } from "@/lib/sync/SyncEngine";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { getActiveSyncProvider } from "@/lib/sync";
import { SYNC_PROVIDER_BUILD } from "@/lib/sync/SupabaseSyncProvider";

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
