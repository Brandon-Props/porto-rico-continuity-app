"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listActivity } from "@/db/repositories/activity";

export default function ActivityPage() {
  const productionId = getActiveProductionId() ?? "";
  const entries = useLiveQuery(() => listActivity(productionId, 300), [productionId]);

  return (
    <div className="flex flex-col">
      <TopBar title="Activity History" back />
      <div className="flex flex-col gap-2 px-4 py-4">
        {entries?.map((e) => (
          <div key={e.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            <div className="text-xs text-[var(--text-muted)]">{new Date(e.createdAt).toLocaleString()}</div>
            <div className="text-[var(--text)]">
              <span className="font-semibold">{e.actorName}</span> {e.action}
            </div>
          </div>
        ))}
        {entries?.length === 0 && <p className="text-sm text-[var(--text-muted)]">No activity yet.</p>}
      </div>
    </div>
  );
}
