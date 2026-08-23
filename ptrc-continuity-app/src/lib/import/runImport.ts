import { db } from "@/db/schema";
import { createScene, findSceneByNumber, scheduleSceneOnDay, toggleScenePropAssociation, updateScene } from "@/db/repositories/scenes";
import { createShootDay, listShootDays } from "@/db/repositories/shootDays";
import { findOrCreateProp } from "@/db/repositories/props";
import type { BuiltRow } from "./validate";
import type { IntExt, DayNight } from "@/types";

function normalizeIntExt(raw?: string): IntExt | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toUpperCase();
  if (v.includes("INT") && v.includes("EXT")) return "INT/EXT";
  if (v.startsWith("INT")) return "INT";
  if (v.startsWith("EXT")) return "EXT";
  return undefined;
}

function normalizeDayNight(raw?: string): DayNight | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toUpperCase();
  if (v.startsWith("N")) return "NIGHT";
  if (v.startsWith("DAWN")) return "DAWN";
  if (v.startsWith("DUSK")) return "DUSK";
  if (v.startsWith("D")) return "DAY";
  return undefined;
}

function splitList(raw?: string): string[] {
  return (raw ?? "")
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ImportReport {
  scenesCreated: number;
  scenesUpdated: number;
  shootDaysCreated: number;
  skipped: { rowIndex: number; errors: string[] }[];
}

export async function runScheduleImport(productionId: string, rows: BuiltRow[]): Promise<ImportReport> {
  const report: ImportReport = { scenesCreated: 0, scenesUpdated: 0, shootDaysCreated: 0, skipped: [] };
  const validRows = rows.filter((r) => r.errors.length === 0);
  const skipped = rows.filter((r) => r.errors.length > 0);
  report.skipped = skipped.map((r) => ({ rowIndex: r.rowIndex, errors: r.errors }));

  const existingDays = await listShootDays(productionId);
  const dayByNumber = new Map(existingDays.map((d) => [d.dayNumber, d]));

  for (const row of validRows) {
    const dayNumber = Number(row.values.shootDay);
    let day = dayByNumber.get(dayNumber);
    if (!day) {
      day = await createShootDay(productionId, dayNumber, row.values.shootDate!, row.values.unit);
      dayByNumber.set(dayNumber, day);
      report.shootDaysCreated++;
    }

    const sceneNumber = row.values.sceneNumber!.trim();
    let scene = await findSceneByNumber(productionId, sceneNumber);
    const fields = {
      description: row.values.description || scene?.description || "",
      scenePart: row.values.scenePart,
      scriptDay: row.values.scriptDay,
      intExt: normalizeIntExt(row.values.intExt),
      dayNight: normalizeDayNight(row.values.dayNight),
      location: row.values.location,
      setName: row.values.setName,
      castJson: splitList(row.values.cast),
      backgroundJson: row.values.background,
      vehiclesJson: row.values.vehicles,
      sfxJson: row.values.sfx,
      vfxJson: row.values.vfx,
      notes: row.values.notes,
    };

    if (scene) {
      await updateScene(scene.id, fields);
      report.scenesUpdated++;
    } else {
      scene = await createScene(productionId, { sceneNumber, ...fields });
      report.scenesCreated++;
    }

    for (const propName of splitList(row.values.props)) {
      const prop = await findOrCreateProp(productionId, propName);
      if (!scene.propIds.includes(prop.id)) await toggleScenePropAssociation(scene.id, prop.id);
    }

    const alreadyScheduled = await db.sceneScheduleEntries
      .where({ sceneId: scene.id })
      .filter((e) => e.shootDayId === day.id && !e.deletedAt)
      .first();
    if (!alreadyScheduled) {
      await scheduleSceneOnDay(scene.id, day.id, row.values.unit);
    }
  }

  return report;
}
