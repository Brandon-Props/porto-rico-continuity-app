"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getActiveProductionId } from "@/db/repositories/productions";
import { getActiveSyncProvider, getSupabaseOverride } from "@/lib/sync";
import { reconcileCloudIdentity } from "@/lib/sync/identity";
import { hydrateProductionFromCloud } from "@/lib/sync/hydrate";

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
    .catch(() => {
      /* offline or not-yet-reachable — the sync badge on /sync reflects real state */
    });
}

export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    const productionId = getActiveProductionId();
    if (!productionId) {
      router.replace("/productions");
      return;
    }
    setReady(true);
    backgroundCloudSync(productionId);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
