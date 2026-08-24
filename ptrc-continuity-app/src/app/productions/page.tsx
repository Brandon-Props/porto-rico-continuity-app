"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/schema";
import { Button } from "@/components/ui/Button";
import { createProduction, setActiveProductionId, removeProductionLocally } from "@/db/repositories/productions";
import { getCurrentUser } from "@/lib/currentUser";

export default function ProductionsPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const user = getCurrentUser();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [router, user]);

  const productions = useLiveQuery(() => db.productions.filter((p) => !p.deletedAt).toArray(), []);

  // Tap-to-confirm inline instead of window.confirm() — a native confirm()
  // dialog is unreliable inside an installed iOS home-screen web app (it can
  // silently auto-dismiss as "cancelled" without ever showing), which looked
  // exactly like "I tap delete and the production just stays there."
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setActiveProductionId(id);
    router.replace("/today");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    const production = await createProduction(name.trim(), code.trim() || name.trim().slice(0, 4));
    setActiveProductionId(production.id);
    router.replace("/today");
  };

  const handleRemove = async (id: string) => {
    await removeProductionLocally(id);
    setConfirmingId(null);
  };

  return (
    <div className="flex min-h-dvh flex-col gap-5 bg-[var(--bg)] px-5 py-8">
      <div>
        <h1 className="text-2xl font-black text-[var(--text)]">Your Productions</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Signed in as {user?.displayName ?? "…"}</p>
      </div>

      <div className="flex flex-col gap-3">
        {productions === undefined && <p className="text-[var(--text-muted)]">Loading…</p>}
        {productions?.length === 0 && !creating && (
          <p className="text-sm text-[var(--text-muted)]">No productions yet — create one below.</p>
        )}
        {productions?.map((p) =>
          confirmingId === p.id ? (
            <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-[var(--danger)]/50 bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--text)]">
                Remove <span className="font-bold">{p.name}</span> ({p.shortCode}) from this device&apos;s list?
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                This only affects this device — if it&apos;s a real shared production, nothing is deleted from the
                cloud, and you can get it back anytime with its invite code.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setConfirmingId(null)}>Cancel</Button>
                <Button fullWidth variant="secondary" onClick={() => handleRemove(p.id)}>Remove From This Device</Button>
              </div>
            </div>
          ) : (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] pr-2"
            >
              <button
                onClick={() => handleSelect(p.id)}
                className="tap-target flex flex-1 items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <div className="text-lg font-bold text-[var(--text)]">{p.name}</div>
                  <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{p.shortCode} · {p.status}</div>
                </div>
                <span className="text-[var(--text-muted)]">→</span>
              </button>
              <button
                onClick={() => setConfirmingId(p.id)}
                aria-label={`Remove ${p.name} from this device`}
                className="tap-target rounded-xl px-3 py-2 text-lg text-[var(--text-muted)]"
              >
                🗑
              </button>
            </div>
          )
        )}
      </div>

      {!creating ? (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" fullWidth onClick={() => setCreating(true)}>
            + New Production
          </Button>
          <Button variant="ghost" fullWidth onClick={() => router.push("/join")}>
            Join with Invite Code
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production name, e.g. Puerto Rico 1898"
            className="tap-target w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Short code, e.g. PR1898"
            className="tap-target w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base uppercase text-[var(--text)] outline-none"
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button fullWidth onClick={handleCreate} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
