"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listShootDays, createShootDay } from "@/db/repositories/shootDays";
import { listScenes, listScenesForShootDay, scheduleSceneOnDay, moveSceneToShootDay } from "@/db/repositories/scenes";
import type { ShootDay } from "@/types";

export default function SchedulePage() {
  const productionId = getActiveProductionId() ?? "";
  const days = useLiveQuery(() => listShootDays(productionId), [productionId]);
  const [addingDay, setAddingDay] = useState(false);

  return (
    <div className="flex flex-col">
      <TopBar title="Shooting Schedule" right={<span className="text-xs text-[var(--text-muted)]">{days?.length ?? 0} days</span>} />

      <div className="flex flex-col gap-4 px-4 py-4">
        {days?.map((day) => (
          <ShootDaySection key={day.id} day={day} allDays={days} />
        ))}
        {days?.length === 0 && !addingDay && (
          <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">
            No shoot days yet. Add one below, or use Import Schedule from the More menu for a full CSV/XLSX import.
          </p>
        )}
      </div>

      <div className="px-4 pb-8">
        {!addingDay ? (
          <Button variant="secondary" fullWidth onClick={() => setAddingDay(true)}>
            + Add Shoot Day
          </Button>
        ) : (
          <NewShootDayForm productionId={productionId} onDone={() => setAddingDay(false)} />
        )}
      </div>
    </div>
  );
}

function ShootDaySection({ day, allDays }: { day: ShootDay; allDays: ShootDay[] }) {
  const router = useRouter();
  const scenes = useLiveQuery(() => listScenesForShootDay(day.id), [day.id]);
  const allScenes = useLiveQuery(() => listScenes(day.productionId), [day.productionId]);
  const [addScenePicker, setAddScenePicker] = useState(false);
  const [movePickerFor, setMovePickerFor] = useState<string | null>(null);

  const unscheduled = (allScenes ?? []).filter((s) => !scenes?.some((sc) => sc.id === s.id));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-base font-black text-[var(--text)]">Shoot Day {day.dayNumber}</div>
          <div className="text-xs text-[var(--text-muted)]">{formatDate(day.shootDate)}{day.unitLabel ? ` · ${day.unitLabel}` : ""}</div>
        </div>
        <button onClick={() => setAddScenePicker(true)} className="text-xs font-semibold text-[var(--accent)]">+ Add Scene</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {scenes?.map((scene) => (
          <div key={scene.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2">
            <button onClick={() => router.push(`/scenes/${scene.id}`)} className="min-w-0 flex-1 text-left">
              <div className="font-bold text-[var(--text)]">{scene.sceneNumber} <span className="font-normal text-[var(--text-muted)]">— {scene.description}</span></div>
            </button>
            <StatusPill status={scene.status} />
            <button onClick={() => setMovePickerFor(scene.id)} className="ml-2 text-xs text-[var(--text-muted)]">Move ▾</button>
          </div>
        ))}
        {scenes?.length === 0 && <p className="text-xs text-[var(--text-muted)]">No scenes scheduled.</p>}
      </div>

      <PickerSheet
        open={addScenePicker}
        title={`Add Scene to Shoot Day ${day.dayNumber}`}
        items={unscheduled.map((s) => ({ id: s.id, label: s.sceneNumber, sublabel: s.description }))}
        onSelect={(id) => scheduleSceneOnDay(id, day.id)}
        onClose={() => setAddScenePicker(false)}
      />

      <PickerSheet
        open={!!movePickerFor}
        title="Move Scene to Another Day"
        items={allDays.filter((d) => d.id !== day.id).map((d) => ({ id: d.id, label: `Shoot Day ${d.dayNumber}`, sublabel: formatDate(d.shootDate) }))}
        onSelect={(newDayId) => movePickerFor && moveSceneToShootDay(movePickerFor, newDayId)}
        onClose={() => setMovePickerFor(null)}
      />
    </div>
  );
}

function NewShootDayForm({ productionId, onDone }: { productionId: string; onDone: () => void }) {
  const [dayNumber, setDayNumber] = useState("");
  const [date, setDate] = useState("");
  const [unit, setUnit] = useState("");

  const submit = async () => {
    if (!dayNumber.trim() || !date) return;
    await createShootDay(productionId, Number(dayNumber), date, unit.trim() || undefined);
    onDone();
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <input value={dayNumber} onChange={(e) => setDayNumber(e.target.value)} inputMode="numeric" placeholder="Day number, e.g. 27" className="tap-target rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none" />
      <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="tap-target rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none" />
      <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (optional), e.g. Main Unit" className="tap-target rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none" />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button fullWidth onClick={submit} disabled={!dayNumber.trim() || !date}>Add Day</Button>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
