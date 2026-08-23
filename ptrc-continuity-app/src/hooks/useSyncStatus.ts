"use client";

import { useEffect, useState } from "react";
import { syncEngine, type SyncSnapshot } from "@/lib/sync/SyncEngine";

export function useSyncStatus(): SyncSnapshot {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>({ state: "local-only", pendingCount: 0, failedCount: 0 });

  useEffect(() => {
    return syncEngine.subscribe(setSnapshot);
  }, []);

  return snapshot;
}
