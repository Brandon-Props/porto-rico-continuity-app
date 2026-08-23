"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { useTheme, useProductionMode } from "@/components/AppProviders";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listCategories, addCustomCategory } from "@/db/repositories/categories";
import { DEFAULT_PHOTO_CATEGORIES } from "@/types";
import { getSupabaseOverride, setSupabaseOverride, clearSupabaseOverride, getActiveSyncProvider } from "@/lib/sync";

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
