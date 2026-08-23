"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { db } from "@/db/schema";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listScenes } from "@/db/repositories/scenes";
import { listShootDays } from "@/db/repositories/shootDays";
import { listPhotosForProduction, listPhotosForScene } from "@/db/repositories/photos";
import { listProps, photosForProp } from "@/db/repositories/props";
import { exportPhotosAsZip, exportCsv, exportJson } from "@/lib/export/zipExport";

export default function ExportPage() {
  const productionId = getActiveProductionId() ?? "";
  const production = useLiveQuery(() => db.productions.get(productionId), [productionId]);
  const scenes = useLiveQuery(() => listScenes(productionId), [productionId]);
  const shootDays = useLiveQuery(() => listShootDays(productionId), [productionId]);
  const props = useLiveQuery(() => listProps(productionId), [productionId]);

  const [scenePicker, setScenePicker] = useState(false);
  const [dayPicker, setDayPicker] = useState(false);
  const [propPicker, setPropPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!production) return null;

  const runExport = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-8">
      <TopBar title="Export & Backup" back />

      <section className="px-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Photos (ZIP)</h2>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            disabled={busy !== null}
            onClick={() => runExport("all", async () => {
              const photos = await listPhotosForProduction(productionId);
              await exportPhotosAsZip(photos, production, `${production.shortCode}_ALL_PHOTOS`);
            })}
          >
            {busy === "all" ? "Exporting…" : "📦 Export Entire Production"}
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setDayPicker(true)}>📅 Export a Shoot Day…</Button>
          <Button variant="secondary" fullWidth onClick={() => setScenePicker(true)}>▤ Export a Scene…</Button>
          <Button variant="secondary" fullWidth onClick={() => setPropPicker(true)}>🔧 Export by Prop…</Button>
        </div>
      </section>

      <section className="px-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Data</h2>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={() =>
              exportCsv(
                (scenes ?? []).map((s) => ({
                  scene_number: s.sceneNumber,
                  description: s.description,
                  status: s.status,
                  int_ext: s.intExt ?? "",
                  day_night: s.dayNight ?? "",
                  location: s.location ?? "",
                  script_day: s.scriptDay ?? "",
                })),
                `${production.shortCode}_scenes.csv`
              )
            }
          >
            📄 Export Scenes (CSV)
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={async () => {
              const allScenes = scenes ?? [];
              const allDays = shootDays ?? [];
              const allProps = props ?? [];
              exportJson({ production, scenes: allScenes, shootDays: allDays, props: allProps }, `${production.shortCode}_production.json`);
            }}
          >
            🗂 Export Full Production (JSON)
          </Button>
        </div>
      </section>

      <p className="px-4 text-xs text-[var(--text-muted)]">
        Exports run entirely on this device — nothing is uploaded anywhere. PDF continuity reports are planned for a later phase (see ARCHITECTURE.md).
      </p>

      <PickerSheet
        open={dayPicker}
        title="Export Shoot Day"
        items={(shootDays ?? []).map((d) => ({ id: d.id, label: `Shoot Day ${d.dayNumber}` }))}
        onSelect={(id) =>
          runExport(`day-${id}`, async () => {
            const day = shootDays?.find((d) => d.id === id);
            const entries = await db.sceneScheduleEntries.where({ shootDayId: id }).filter((e) => !e.deletedAt).toArray();
            const sceneIds = entries.map((e) => e.sceneId);
            const allPhotos = (await Promise.all(sceneIds.map((sid) => listPhotosForScene(sid)))).flat();
            await exportPhotosAsZip(allPhotos, production, `${production.shortCode}_ShootDay_${day?.dayNumber}`);
          })
        }
        onClose={() => setDayPicker(false)}
      />

      <PickerSheet
        open={scenePicker}
        title="Export Scene"
        items={(scenes ?? []).map((s) => ({ id: s.id, label: s.sceneNumber, sublabel: s.description }))}
        onSelect={(id) =>
          runExport(`scene-${id}`, async () => {
            const scene = scenes?.find((s) => s.id === id);
            const photos = await listPhotosForScene(id);
            await exportPhotosAsZip(photos, production, `${production.shortCode}_Scene_${scene?.sceneNumber}`);
          })
        }
        onClose={() => setScenePicker(false)}
      />

      <PickerSheet
        open={propPicker}
        title="Export by Prop"
        items={(props ?? []).map((p) => ({ id: p.id, label: p.name }))}
        onSelect={(id) =>
          runExport(`prop-${id}`, async () => {
            const prop = props?.find((p) => p.id === id);
            const photos = await photosForProp(productionId, id);
            await exportPhotosAsZip(photos, production, `${production.shortCode}_Prop_${prop?.name}`);
          })
        }
        onClose={() => setPropPicker(false)}
      />
    </div>
  );
}
