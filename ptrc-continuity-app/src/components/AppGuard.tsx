"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getActiveProductionId } from "@/db/repositories/productions";
import { getActiveSyncProvider, getSupabaseOverride } from "@/lib/sync";
import { reconcileCloudIdentity } from "@/lib/sync/identity";
import { hydrateProductionFromCloud } from "@/lib/sync/hydrate";
import { queueMissingBlobUploads, resetStuckBlobUploads } from "@/lib/sync/blobSync";
import { queueMissingAnnotationBlobUploads, resetStuckAnnotationBlobUploads } from "@/lib/sync/annotationBlobSync";

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Cold-open, the poll interval, and a visibility-change can all land close
// together — without this, two overlapping pulls could both be mid-flight
// against the same Dexie tables at once for no benefit.
let pullInFlight = false;

/** Fire-and-forget: claim this device's own membership under its real cloud
 *  identity, then pull anything other devices have added since last time. Runs
 *  quietly in the background — offline or not-yet-configured are both fine,
 *  the UI never waits on this.
 *
 *  Deliberately always a FULL pull, not an incremental "only what changed
 *  since last time" one — an earlier version of this function tried that,
 *  filtering by each row's `updated_at`. That broke silently for exactly the
 *  case that matters most here: a photo captured with a weak signal on set
 *  sits queued for a while with an `updated_at` stamped at CAPTURE time, not
 *  at the moment it actually reaches Supabase. By the time it finally pushes,
 *  another device's incremental cursor may have already moved past that
 *  timestamp — so that photo would never satisfy "newer than my cursor" and
 *  would stay invisible on that device until a full reload. Full pulls avoid
 *  that trap entirely at the cost of a slightly heavier request; correctness
 *  matters a lot more here than shaving payload size. */
function backgroundCloudSync(productionId: string) {
  if (!getActiveSyncProvider().isConfigured() || pullInFlight) return;
  const override = getSupabaseOverride();
  const url = ENV_URL ?? override?.url;
  const anonKey = ENV_KEY ?? override?.anonKey;
  if (!url || !anonKey) return;

  pullInFlight = true;
  reconcileCloudIdentity(url, anonKey, productionId)
    .then(() => hydrateProductionFromCloud(url, anonKey, productionId))
    .then(() => queueMissingBlobUploads())
    .then(() => queueMissingAnnotationBlobUploads())
    .catch(() => {
      /* offline or not-yet-reachable — the sync badge on /sync reflects real state */
    })
    .finally(() => {
      pullInFlight = false;
    });
}

// How often to check for other crew members' new photos/scenes while the app
// is sitting open. Cold-open alone (the original behavior) meant a photo
// someone else took could be fully synced and sitting in the cloud for hours
// before this device happened to notice. A full pull every 45s is still a
// small, infrequent request — nowhere near heavy enough to explain the earlier
// sluggishness on its own; that was the 25s cadence plus overlapping pulls,
// both addressed above.
const BACKGROUND_PULL_INTERVAL_MS = 45_000;

export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [productionId, setProductionId] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    const pid = getActiveProductionId();
    if (!pid) {
      router.replace("/productions");
      return;
    }
    setProductionId(pid);
    setReady(true);
    // Purely local (no network needed) — do this before backgroundCloudSync
    // so anything orphaned mid-upload by a previous close/reload gets
    // requeued right away instead of sitting stuck indefinitely.
    resetStuckBlobUploads()
      .then(() => resetStuckAnnotationBlobUploads())
      .finally(() => backgroundCloudSync(pid));
  }, [router]);

  useEffect(() => {
    if (!productionId) return;
    // Poll lightly while the tab/app is actually visible, and also pull the
    // instant it becomes visible again after being backgrounded — covers
    // both "left it open on the Today screen all afternoon" and "switched
    // away to texts and came right back."
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") backgroundCloudSync(productionId);
    }, BACKGROUND_PULL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") backgroundCloudSync(productionId);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [productionId]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
