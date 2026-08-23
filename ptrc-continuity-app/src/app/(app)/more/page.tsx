"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { db } from "@/db/schema";
import { getActiveProductionId } from "@/db/repositories/productions";
import { getCurrentUser, signOutLocalUser } from "@/lib/currentUser";

const ITEMS = [
  { href: "/schedule", icon: "📅", label: "Shooting Schedule", desc: "View and edit the schedule" },
  { href: "/schedule/import", icon: "📥", label: "Import Schedule", desc: "CSV / XLSX import wizard" },
  { href: "/sync", icon: "🔄", label: "Sync Queue", desc: "See what's synced and what's pending" },
  { href: "/crew", icon: "👥", label: "Crew & Roles", desc: "Manage who's on this production" },
  { href: "/export", icon: "⬇️", label: "Export & Backup", desc: "CSV, JSON, and photo exports" },
  { href: "/settings", icon: "⚙️", label: "Settings", desc: "Theme, Production Mode, categories" },
] as const;

export default function MorePage() {
  const router = useRouter();
  const user = getCurrentUser();
  const productionId = getActiveProductionId();
  const production = useLiveQuery(() => (productionId ? db.productions.get(productionId) : undefined), [productionId]);

  return (
    <div className="flex flex-col">
      <TopBar title="More" />

      <div className="px-4 pt-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Production</div>
          <div className="text-lg font-bold text-[var(--text)]">{production?.name ?? "—"}</div>
          <button onClick={() => router.push("/productions")} className="mt-1 text-xs font-semibold text-[var(--accent)]">
            Switch production
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 py-4">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="tap-target flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <span className="text-2xl">{item.icon}</span>
            <div className="flex-1">
              <div className="font-bold text-[var(--text)]">{item.label}</div>
              <div className="text-xs text-[var(--text-muted)]">{item.desc}</div>
            </div>
            <span className="text-[var(--text-muted)]">→</span>
          </Link>
        ))}
      </div>

      <div className="px-4 pb-8">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">
          Signed in as <span className="font-semibold text-[var(--text)]">{user?.displayName}</span>
          <button
            onClick={() => {
              signOutLocalUser();
              router.replace("/login");
            }}
            className="mt-2 block text-xs font-semibold text-[var(--danger)]"
          >
            Sign out of this device
          </button>
        </div>
      </div>
    </div>
  );
}
