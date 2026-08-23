"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/schema";
import { Button } from "@/components/ui/Button";
import { createProduction, setActiveProductionId } from "@/db/repositories/productions";
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
        {productions?.map((p) => (
          <button
            key={p.id}
            onClick={() => handleSelect(p.id)}
            className="tap-target flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-left"
          >
            <div>
              <div className="text-lg font-bold text-[var(--text)]">{p.name}</div>
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{p.shortCode} · {p.status}</div>
            </div>
            <span className="text-[var(--text-muted)]">→</span>
          </button>
        ))}
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
