"use client";

// Applies data pulled from Supabase (see pullProductionData in
// SupabaseSyncProvider.ts) into the local Dexie database. This is what makes a
// second device joining a production actually see the schedule/scenes/photos
// someone else already created — plain push-only sync never brings anything
// down, it only sends what THIS device makes.

import { db } from "@/db/schema";
import { pullProductionData } from "./SupabaseSyncProvider";
import { nowIso } from "@/db/repositories/helpers";

type DexieTableName =
  | "productions"
  | "productionMembers"
  | "shootDays"
  | "scenes"
  | "sceneScheduleEntries"
  | "shots"
  | "takes"
  | "photos"
  | "photoAnnotations"
  | "continuityNotes"
  | "props"
  | "characters";

// entity key (from ENTITY_TO_TABLE / enqueueSync calls) -> Dexie table property
const ENTITY_TO_DEXIE_TABLE: Record<string, DexieTableName> = {
  productions: "productions",
  production_members: "productionMembers",
  shoot_days: "shootDays",
  scenes: "scenes",
  scene_schedule_entries: "sceneScheduleEntries",
  shots: "shots",
  takes: "takes",
  photos: "photos",
  photo_annotations: "photoAnnotations",
  continuity_notes: "continuityNotes",
  props: "props",
  characters: "characters",
};

interface HydrateResult {
  applied: number;
  skippedNewerLocal: number;
  tableCounts: Record<string, number>;
}

/**
 * Pulls every row for a production from Supabase and merges it into Dexie.
 * Last-write-wins by `updatedAt`: a remote row only overwrites a local one that
 * doesn't exist yet or is older. A local row that's newer (or still `dirty`,
 * i.e. not pushed yet) is left alone — it'll go up on the next drain() instead
 * of being clobbered by what we just pulled.
 */
export async function hydrateProductionFromCloud(
  url: string,
  anonKey: string,
  productionId: string,
  sinceIso?: string
): Promise<HydrateResult> {
  const remoteByEntity = await pullProductionData(url, anonKey, productionId, sinceIso);
  let applied = 0;
  let skippedNewerLocal = 0;
  const tableCounts: Record<string, number> = {};

  for (const [entity, dexieTable] of Object.entries(ENTITY_TO_DEXIE_TABLE)) {
    const remoteRows = remoteByEntity[entity] ?? [];
    tableCounts[entity] = remoteRows.length;
    if (remoteRows.length === 0) continue;

    // Cast: every synced table's rows share id/updatedAt/dirty at minimum,
    // which is all this generic merge touches — the rest passes through as-is.
    const table = db[dexieTable] as unknown as {
      get(id: string): Promise<{ id: string; updatedAt: string; dirty?: boolean } | undefined>;
      put(row: unknown): Promise<string>;
    };

    for (const remote of remoteRows as Array<Record<string, unknown> & { id: string; updatedAt: string }>) {
      const local = await table.get(remote.id);
      if (local && local.dirty) {
        // Not pushed yet — don't let a pull stomp on a change still in flight.
        skippedNewerLocal++;
        continue;
      }
      if (local && new Date(local.updatedAt).getTime() >= new Date(remote.updatedAt).getTime()) {
        skippedNewerLocal++;
        continue;
      }
      // originalBlobKey/displayBlobKey/thumbBlobKey are LOCAL_ONLY_FIELDS
      // (caseTransform.ts) — they never leave this device and never come back
      // from Postgres, so a photo row pulled down from another device arrives
      // with none of them. Without a value here, every photo viewer
      // (usePhotoBlobUrl/PhotoThumb) has nothing to even look up. Derive them
      // the exact same deterministic way capturePhoto() originally created
      // them (`${photoId}_original` etc.) so the lookup key lines up whether
      // this device captured the photo or pulled it from someone else — the
      // actual image bytes then arrive lazily via getPhotoBlob()'s Storage
      // fallback (src/lib/sync/blobSync.ts) the first time something tries
      // to display it.
      const photoKeyFields =
        entity === "photos"
          ? {
              originalBlobKey: `${remote.id}_original`,
              displayBlobKey: `${remote.id}_display`,
              thumbBlobKey: `${remote.id}_thumb`,
            }
          : {};
      await table.put({ ...remote, ...photoKeyFields, dirty: false, syncedAt: nowIso() });
      applied++;
    }
  }

  return { applied, skippedNewerLocal, tableCounts };
}
