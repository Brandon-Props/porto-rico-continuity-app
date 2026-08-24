"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { useTheme, useProductionMode } from "@/components/AppProviders";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listCategories, addCustomCategory } from "@/db/repositories/categories";
import { DEFAULT_PHOTO_CATEGORIES } from "@/types";
import { getSupabaseOverride, setSupabaseOverride, clearSupabaseOverride, getActiveSyncProvider } from "@/lib/sync";
import { fetchInviteCode, debugWhoAmI } from "@/lib/sync/SupabaseSyncProvider";
import { reconcileCloudIdentity, ensureOwnAdminMembershipSynced } from "@/lib/sync/identity";
import { syncEngine } from "@/lib/sync/SyncEngine";

export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const { enabled, setEnabled } = useProductionMode();
  const productionId = getActiveProductionId() ?? "";
  const categories = useLiveQuery(() => listCategories(productionId), [productionId]);
  const [newCategory, setNewCategory] = useState("");

  const existingOverride = getSupabaseOverride();
  const [supabaseUrl, setSupabaseUrl] = useState(existingOverride?.url ?? "");
  const [supabaseKey, setSupabaseKey] = useState(existingOverride?.anonKey ?? "");
  const provider = getActiveSyncProvider();

  const [inviteCode, setInviteCode] = useState<string | null | "loading">(null);
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null);
  const [whoAmI, setWhoAmI] = useState<string | null>(null);

  const loadInviteCode = () => {
    if (!provider.isConfigured() || !productionId) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? existingOverride?.url;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? existingOverride?.anonKey;
    if (!url || !anonKey) return;
    setInviteCode("loading");
    setInviteCodeError(null);
    ensureOwnAdminMembershipSynced(url, anonKey, productionId)
      .then(() => syncEngine.drain())
      .then(() => reconcileCloudIdentity(url, anonKey, productionId))
      .then(() => fetchInviteCode(url, anonKey, productionId))
      .then((result) => {
        setInviteCode(result.code);
        setInviteCodeError(result.error ?? null);
      })
      .catch((err) => {
        setInviteCode(null);
        setInviteCodeError(err instanceof Error ? err.message : String(err));
      });
  };

  useEffect(() => {
    loadInviteCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionId, provider.isConfigured()]);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <TopBar title="Settings" />

      <section className="px-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Appearance</h2>
        <div className="flex gap-2">
          {(["light", "dark", "system"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`tap-target flex-1 rounded-xl border py-2.5 text-sm font-semibold capitalize ${
                mode === m ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] text-[var(--text)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="px-4">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <div className="font-bold text-[var(--text)]">Production Mode</div>
            <div className="text-xs text-[var(--text-muted)]">Fewer prompts, larger controls, camera stays fastest.</div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`tap-target h-8 w-14 rounded-full transition-colors ${enabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
          >
            <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${enabled ? "translate-x-7" : "translate-x-1"}`} />
          </button>
        </div>
      </section>

      <section className="px-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Custom Photo Categories</h2>
        <div className="flex flex-wrap gap-1.5">
          {categories?.filter((c) => !(DEFAULT_PHOTO_CATEGORIES as readonly string[]).includes(c)).map((c) => (
            <span key={c} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text)]">{c}</span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Add a category…"
            className="tap-target flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--text)] outline-none"
          />
          <Button
            onClick={async () => {
              if (!newCategory.trim()) return;
              await addCustomCategory(productionId, newCategory.trim());
              setNewCategory("");
            }}
          >
            Add
          </Button>
        </div>
      </section>

      <section className="px-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Cloud Sync (Supabase)</h2>
        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">
            Currently: <span className="font-semibold text-[var(--text)]">{provider.isConfigured() ? "connected" : "not connected — local only"}</span>.
            Paste your Supabase project URL and anon key here to test sync without a redeploy (see ARCHITECTURE.md for creating a project).
          </p>
          <input
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
            className="tap-target rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-sm text-[var(--text)] outline-none"
          />
          <input
            value={supabaseKey}
            onChange={(e) => setSupabaseKey(e.target.value)}
            placeholder="anon public key"
            className="tap-target rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-sm text-[var(--text)] outline-none"
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { clearSupabaseOverride(); setSupabaseUrl(""); setSupabaseKey(""); window.location.reload(); }}>
              Clear
            </Button>
            <Button
              fullWidth
              onClick={() => {
                if (!supabaseUrl.trim() || !supabaseKey.trim()) return;
                setSupabaseOverride(supabaseUrl.trim(), supabaseKey.trim());
                window.location.reload();
              }}
            >
              Save & Connect
            </Button>
          </div>

          {provider.isConfigured() && (
            <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Invite Code — share this with your crew
                </div>
                <button className="text-xs font-semibold text-[var(--accent)]" onClick={loadInviteCode}>
                  Refresh
                </button>
              </div>
              {inviteCode === "loading" && <div className="mt-1 text-sm text-[var(--text-muted)]">Fetching…</div>}
              {inviteCode === null && (
                <div className="mt-1 text-sm text-[var(--text-muted)]">
                  {inviteCodeError ?? "Not available yet — needs at least one successful sync."}
                </div>
              )}
              {inviteCode && inviteCode !== "loading" && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-2xl font-black tracking-[0.3em] text-[var(--text)]">{inviteCode}</span>
                  <button
                    className="text-xs font-semibold text-[var(--accent)]"
                    onClick={() => navigator.clipboard?.writeText(inviteCode)}
                  >
                    Copy
                  </button>
                </div>
              )}
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Crew members open the app, tap Login → Join with Invite Code, and enter this. They&apos;ll need
                internet once to pull the schedule down; everything after that works offline like normal.
              </p>
            </div>
          )}

          {provider.isConfigured() && (
            <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Debug: Check Auth
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Asks the database directly what it thinks your sign-in id is, with nothing else involved.
              </p>
              <Button
                fullWidth
                variant="secondary"
                onClick={async () => {
                  setWhoAmI("Checking…");
                  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? existingOverride?.url;
                  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? existingOverride?.anonKey;
                  if (!url || !anonKey) {
                    setWhoAmI("Not configured");
                    return;
                  }
                  const result = await debugWhoAmI(url, anonKey);
                  if (result.error) {
                    setWhoAmI(`Error: ${result.error}`);
                  } else {
                    setWhoAmI(`uid=${result.uid ?? "NULL"} role=${result.roleName ?? "NULL"}`);
                  }
                }}
              >
                Check Auth
              </Button>
              {whoAmI && (
                <div className="mt-2 break-all rounded-lg bg-[var(--surface)] p-2 text-xs text-[var(--text)]">{whoAmI}</div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="px-4">
        <div className="flex flex-col gap-2">
          <Link href="/trash" className="tap-target rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text)]">🗑 Trash</Link>
          <Link href="/activity" className="tap-target rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text)]">📜 Activity History</Link>
        </div>
      </section>
    </div>
  );
}
