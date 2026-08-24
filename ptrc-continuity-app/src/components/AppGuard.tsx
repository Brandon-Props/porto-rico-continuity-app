"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getActiveProductionId } from "@/db/repositories/productions";
import { getActiveSyncProvider, getSupabaseOverride } from "@/lib/sync";
import { reconcileCloudIdentity } from "@/lib/sync/identity";
import { hydrateProductionFromCloud } from "@/lib/sync/hydrate";
import { queueMissingBlobUploads } from "@/lib/sync/blobSync";

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Fire-and-forget: claim this device's own membership under its real cloud
 *  identity, then pull anything other devices have added since last time. Runs
 *  quietly in the background — offline or not-yet-configured are both fine,
 *  the UI never waits on this. */
function backgroundCloudSync(productionId: string) {
  if (!getActiveSyncProvider().isConfigured()) return;
  const override = getSupabaseOverride();
  const url = ENV_URL ?? override?.url;
  const anonKey = ENV_KEY ?? override?.anonKey;
  if (!url || !anonKey) return;
  reconcileCloudIdentity(url, anonKey, productionId)
    .then(() => hydrateProductionFromCloud(url, anonKey, productionId))
    .then(() => queueMissingBlobUploads())
    .catch(() => {
      /* offline or not-yet-reachable — the sync badge on /sync reflects real state */
    });
}

// How often to check for other crew members' new photos/scenes while the app
// is sitting open. Cold-open alone (the original behavior) meant a photo
// someone else took could be fully synced and sitting in the cloud for hours
// before this device happened to notice — confirmed 2026-08-24 when a crew
// member's photos showed up fine on one device but not another that had just
// been left open in the background the whole time.
const BACKGROUND_PULL_INTERVAL_MS = 25_000;

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
    backgroundCloudSync(pid);
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
