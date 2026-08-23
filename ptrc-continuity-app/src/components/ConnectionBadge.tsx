"use client";

import Link from "next/link";
import { useSyncStatus } from "@/hooks/useSyncStatus";

const CONFIG = {
  offline: { dot: "bg-red-500", label: (p: number) => `OFFLINE${p ? ` — ${p} PENDING` : ""}` },
  "local-only": { dot: "bg-amber-400", label: (p: number) => (p ? `LOCAL — ${p} PENDING` : "LOCAL ONLY") },
  syncing: { dot: "bg-amber-400 animate-pulse", label: (p: number) => `SYNCING — ${p} PENDING` },
  synced: { dot: "bg-emerald-500", label: () => "SYNCED" },
  error: { dot: "bg-red-500", label: (p: number) => `SYNC ERROR — ${p} PENDING` },
} as const;

export function ConnectionBadge({ compact }: { compact?: boolean }) {
  const status = useSyncStatus();
  const cfg = CONFIG[status.state];

  return (
    <Link
      href="/sync"
      className="tap-target inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]"
    >
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      {!compact && <span className="whitespace-nowrap">{cfg.label(status.pendingCount)}</span>}
    </Link>
  );
}
