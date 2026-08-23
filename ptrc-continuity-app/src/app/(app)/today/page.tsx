"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/schema";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listShootDays, getMostRecentOrTodayShootDay } from "@/db/repositories/shootDays";
import { listScenesForShootDay } from "@/db/repositories/scenes";
import { useCurrentContext } from "@/hooks/useCurrentContext";
import type { Scene, ShootDay } from "@/types";

export default function TodayPage() {
  const router = useRouter();
  const productionId = getActiveProductionId() ?? "";
  const { updateContext } = useCurrentContext();

  const [dayId, setDayId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const days = useLiveQuery(() => listShootDays(productionId), [productionId]);

  useEffect(() => {
    if (dayId || !productionId) return;
    getMostRecentOrTodayShootDay(productionId).then((d) => d && setDayId(d.id));
  }, [dayId, productionId]);

  const currentDay: ShootDay | undefined = days?.find((d) => d.id === dayId);
  const scenes = useLiveQuery(() => (dayId ? listScenesForShootDay(dayId) : Promise.resolve([] as Scene[])), [dayId]);

  const openScene = (scene: Scene) => {
    updateContext({ sceneId: scene.id, shotId: undefined, takeId: undefined });
    router.push(`/scenes/${scene.id}`);
  };

  const production = useLiveQuery(() => db.productions.get(productionId), [productionId]);

  return (
    <div className="flex flex-col">
      <TopBar title={production?.name ?? "Today"} />

      <div className="flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => setPickerOpen(true)}
          className="tap-target rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-left"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {currentDay ? `Shoot Day ${currentDay.dayNumber}` : "No shoot day"}
          </div>
          <div className="text-base font-bold text-[var(--text)]">
            {currentDay ? formatDate(currentDay.shootDate) : "Import a schedule to begin"} ▾
          </div>
        </button>
        <Link
          href="/schedule"
          className="tap-target rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]"
        >
          Full Schedule
        </Link>
      </div>

      <div className="px-4 pt-5">
        <Button size="xl" fullWidth onClick={() => router.push("/camera")}>
          📷 TAKE CONTINUITY PHOTO
        </Button>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-5 pb-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Scenes {currentDay ? `— Shoot Day ${currentDay.dayNumber}` : ""}
        </h2>
        {scenes === undefined && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
        {scenes?.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">
            No scenes scheduled for this day yet. Import or edit the schedule to add some.
          </p>
        )}
        {scenes?.map((scene) => (
          <button
            key={scene.id}
            onClick={() => openScene(scene)}
            className="tap-target flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left"
          >
            <div className="min-w-0">
              <div className="text-xl font-black text-[var(--text)]">{scene.sceneNumber}</div>
              <div className="truncate text-sm text-[var(--text-muted)]">{scene.description}</div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {[scene.intExt, scene.dayNight, scene.location].filter(Boolean).join(" · ")}
              </div>
            </div>
            <StatusPill status={scene.status} />
          </button>
        ))}
      </div>

      <PickerSheet
        open={pickerOpen}
        title="Switch Shoot Day"
        selectedId={dayId ?? undefined}
        items={(days ?? []).map((d) => ({
          id: d.id,
          label: `Shoot Day ${d.dayNumber}`,
          sublabel: `${formatDate(d.shootDate)}${d.unitLabel ? ` · ${d.unitLabel}` : ""}`,
        }))}
        onSelect={setDayId}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
