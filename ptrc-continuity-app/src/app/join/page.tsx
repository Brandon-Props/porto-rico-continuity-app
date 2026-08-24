"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/currentUser";
import { joinProductionWithCode } from "@/lib/sync/joinProduction";
import { getActiveSyncProvider } from "@/lib/sync";
import { SupabaseConnectPanel } from "@/components/SupabaseConnectPanel";

export default function JoinProductionPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Joining needs real Supabase credentials, but a brand-new device has no
  // production open yet to reach Settings from (that's the (app) route group,
  // gated by AppGuard on having an active production). Show the same connect
  // panel right here instead, so there's no need to create a throwaway
  // production just to unlock Settings.
  const configured = getActiveSyncProvider().isConfigured();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [router, user]);

  const handleJoin = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setStatus("Checking code…");
    try {
      setStatus("Joining and pulling the schedule…");
      const result = await joinProductionWithCode(code);
      setStatus(`Joined "${result.productionName}" — ${result.scenesFound} scenes pulled down.`);
      router.replace("/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col gap-5 bg-[var(--bg)] px-5 py-8">
      <div>
        <h1 className="text-2xl font-black text-[var(--text)]">Join a Production</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Ask whoever set up the production for their invite code — it&apos;s in their Settings screen under Cloud Sync.
        </p>
      </div>

      {!configured ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-[var(--text)]">First, connect this device to the cloud:</p>
          <SupabaseConnectPanel />
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. 7K2QXM"
            maxLength={6}
            className="tap-target w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-center text-2xl font-black uppercase tracking-[0.3em] text-[var(--text)] outline-none"
          />
          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
          {status && !error && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
          <Button fullWidth disabled={!code.trim() || busy} onClick={handleJoin}>
            {busy ? "Joining…" : "Join Production"}
          </Button>
          <p className="text-center text-xs text-[var(--text-muted)]">
            Needs an internet connection once, to fetch the schedule. Everything after that works offline.
          </p>
        </div>
      )}

      <Button variant="ghost" onClick={() => router.replace("/productions")}>
        Back
      </Button>
    </div>
  );
}
