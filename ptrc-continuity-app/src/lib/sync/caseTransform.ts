// Dexie (client) records are camelCase; every Postgres table in
// supabase/migrations is snake_case. Nothing converted between the two before —
// pushes were silently failing with "column does not exist" errors. This is the
// single seam both push() and pull() go through so they can't drift apart again.

/** camelCase -> snake_case, for exactly one level of keys (jsonb column *values*
 *  keep whatever casing the app already stores inside them — Postgres doesn't
 *  care, and the app reads its own jsonb blobs back out, not Postgres'). */
export function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/** Fields that exist on the local Dexie record but have no column in Postgres —
 *  sync bookkeeping only. Sending these would make PostgREST reject the whole
 *  upsert with "column ... does not exist". `blobsPending` is stamped onto a
 *  photo's create payload (src/db/repositories/photos.ts) as a local marker
 *  that its blob still needs uploading to Storage — there's no Storage upload
 *  wired up yet (see build notes), and no `blobs_pending` column on the
 *  `photos` table for it to land in either way, so every photo create was
 *  failing sync with PGRST204 "Could not find the 'blobs_pending' column". */
export const LOCAL_ONLY_FIELDS: ReadonlySet<string> = new Set(["dirty", "syncedAt", "blobsPending"]);

export function toSnakeCase(
  obj: Record<string, unknown>,
  omit: ReadonlySet<string> = LOCAL_ONLY_FIELDS
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (omit.has(key)) continue;
    out[camelToSnakeKey(key)] = value;
  }
  return out;
}

export function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[snakeToCamelKey(key)] = value;
  }
  return out;
}
