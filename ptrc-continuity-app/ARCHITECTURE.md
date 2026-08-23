# Continuity Photo App — Architecture

Prepared per the pre-build checklist. Read this before touching the code — the offline model in particular drives almost every other decision below.

## 1. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router), TypeScript | One codebase for the PWA shell and future API routes; static export works fine since the MVP has no server-rendered pages. |
| Styling | Tailwind CSS | Fast to hit "large touch targets, high contrast, dark mode" without hand-rolling a design system. |
| Offline database | IndexedDB via Dexie.js | Dexie gives typed tables, indexes, and transactions over raw IndexedDB — this **is** the app's real database, not a cache in front of one. |
| Photo blobs | IndexedDB (Blob storage) via Dexie, keyed by photo UUID | Avoids the filesystem-access limitations of mobile Safari; Dexie handles Blobs natively. |
| PWA shell | Custom service worker (Workbox-style cache strategies) + Web App Manifest | Installable on iOS/Android/Windows/macOS; app shell + static assets precached, runtime caching for anything else. |
| State/UI | React Context + small Zustand-style stores (camera context, sync context) | Enough for the MVP; avoids pulling in Redux for a mostly-local-state app. |
| Sync backend (deferred, not wired yet) | Supabase (Postgres + Auth + Storage + Realtime) | Matches the brief: Postgres gives relational integrity + RLS for production-scoped access; Storage holds the photo cloud copies; Realtime pushes changes to other crew phones without a bespoke websocket server. SQL migrations are included now so wiring it up later is a config change, not a rebuild. |
| Schedule import parsing | `papaparse` (CSV) + `xlsx` (Excel) | Both run entirely client-side — no server round trip needed to preview an import. |
| Export | `jszip` + `file-saver` / Web Share API | Client-side ZIP building for batch export; Share API on mobile, download fallback elsewhere. |

**Deviation from the brief:** the brief proposes Supabase for the initial build too. This pass ships the **local-first half only** (per your decision) — Dexie is the live database, and a `SyncProvider` interface stands in the place Supabase calls will go. This was chosen over provisioning Supabase now because (a) this sandbox can't host a live backend with a persistent URL for your phone to reach, and (b) it means you get something to actually test on set today instead of waiting on cloud account setup. The schema, RLS policies, and migrations are written now against that eventual Supabase target so the swap is additive.

## 2. Database schema

Implemented today as Dexie tables (client-side); the SQL in `supabase/migrations/0001_init.sql` mirrors it 1:1 for when sync is wired up. All primary keys are client-generated UUIDv4 — **never server-assigned** — because two phones must be able to create records independently offline (spec §42).

Every syncable table carries: `id (uuid, pk)`, `production_id (uuid, fk)`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete), `rev` (integer, incremented on every local write, used for conflict detection), `dirty` (bool — has local changes not yet pushed), `synced_at`.

```
users                  id, email, display_name, avatar_url, created_at
productions            id, name, short_code, status, settings_json, created_at, created_by
production_members     id, production_id, user_id, role, permissions_json, invited_at, joined_at
  role enum: admin | prop_master | asst_prop_master | continuity | crew | read_only

shoot_days             id, production_id, day_number, shoot_date, unit_label, notes
scenes                 id, production_id, scene_number, scene_part, description, script_day,
                       int_ext, day_night, location, set_name, status, cast_json, notes
  status enum: not_shot | scheduled | in_progress | partially_shot | completed |
               pickup_required | reshoot | hold

scene_schedule_entries id, scene_id, shoot_day_id, unit, order_index, dropped_bool
  -- decouples "scene" (permanent record) from "which shoot day it's scheduled on"
  -- so moving a scene to another day (spec §33) never breaks its photo history

shots                  id, scene_id, name, camera_label, order_index, notes
  -- camera_label: A CAM / B CAM / C CAM / UNIT (spec §51) — distinct from shot name

takes                  id, shot_id, take_number, print_flag, circle_flag, ng_flag,
                       continuity_lock_flag, notes

photos                 id, take_id (nullable), scene_id, shot_id (nullable),
                       original_blob_key, display_blob_key, thumb_blob_key,
                       category, camera_device_label, taken_by, taken_at,
                       pinned_bool, flags_json (master/reset/important/prop/position/damage/match/pickup),
                       continuity_status, direction_angle, notes,
                       references_photo_id (nullable, self-fk — spec §55)

photo_annotations      id, photo_id, layer_blob_key, tool_type, created_by, created_at
  -- annotations render as a derivative layer; original photo blob is never touched (spec §17)

continuity_notes       id, scope_type (scene|shot|take|photo), scope_id, body, author_id, created_at

props                  id, production_id, name, category, notes
scene_props            id, scene_id, prop_id
photo_props            id, photo_id, prop_id
characters             id, production_id, name
actors                 id, production_id, character_id, actor_name
photo_characters       id, photo_id, character_id

sync_operations        id, entity_table, entity_id, op (create|update|delete), payload_json,
                       attempt_count, last_error, status (pending|syncing|done|failed), created_at
activity_log           id, production_id, actor_id, action, entity_table, entity_id, detail_json, created_at
deleted_items          id, entity_table, entity_id, deleted_by, deleted_at, restorable_bool
```

### Entity relationships (text ERD)

```
productions 1───* production_members *───1 users
productions 1───* shoot_days
productions 1───* scenes 1───* scene_schedule_entries *───1 shoot_days
scenes 1───* shots 1───* takes 1───* photos
scenes 1───* scene_props *───1 props
photos *───1 takes (nullable — a photo can be scene-level, e.g. a location establishing shot)
photos *───* props (via photo_props)      photos *───* characters (via photo_characters)
photos 1───* photo_annotations
photos 0..1 ──references──> photos        (continuity match relationship, spec §55)
(scene|shot|take|photo) 1───* continuity_notes   (polymorphic via scope_type/scope_id)
every table  ──writes──>  activity_log
every mutation while offline ──enqueues──> sync_operations
```

## 3. Offline-first architecture

Dexie/IndexedDB is not a cache — it is where every screen actually reads from. The app never blocks on a network call to render. Flow for any user action (take a photo, add a note, create a shot):

1. Write directly to the relevant Dexie table with a fresh UUID, `dirty: true`, `rev` incremented.
2. Enqueue a row in `sync_operations` describing the change.
3. Re-render from Dexie (a `useLiveQuery` hook keeps every screen reactive to local writes — no manual refresh).
4. If a `SyncProvider` is connected and online, the queue drains in the background; if not, the row just waits.

The service worker precaches the app shell (JS/CSS/fonts/icons) with a cache-first strategy, so the app **launches** with no network at all — this is what makes "open the app in airplane mode" work, not just "the data happens to be cached."

## 4. Synchronization strategy (design now, activates when a SyncProvider is wired)

- Every table above syncs independently and additively — photos are never overwritten, only added, matching spec §25.
- `sync_operations` is processed FIFO per entity, oldest first, with exponential backoff on failure; a failed row surfaces in the Sync Queue screen with a manual **RETRY SYNC** action (spec §57) — the user is never asked to redo the underlying work.
- Idempotency: every operation is keyed by the record's UUID, so a retried push is a Postgres `UPSERT ... ON CONFLICT (id) DO UPDATE WHERE rev < excluded.rev` — replaying a queued op twice cannot create a duplicate (spec §59).
- Realtime (Supabase Realtime, later) pushes remote changes down; the client merges them into Dexie the same way it merges its own writes.

## 5. Conflict resolution

- Field-level, not record-level, where practical: two crew members editing different fields on the same scene (one changes status, another adds a note) merge cleanly since notes are their own table and status is a single column with a `rev` guard.
- True conflicts (same field, both offline, both changed) are detected when a push's `rev` doesn't match the server's current `rev`. The server keeps **both** versions: the incoming write is accepted as a new row in a `conflict_versions` shadow table (not in this MVP's Dexie schema yet, but present in the migration) and the record is flagged `has_conflict = true`. An admin resolves it from a **SYNC CONFLICT** screen by picking a version; nothing is silently dropped.
- Photos never conflict by design — they're append-only and keyed by their own UUID.

## 6. Photo storage: local and cloud

On capture: the browser's camera stream is captured to a canvas, which produces three Blobs — **original** (full resolution), **display** (long-edge ~1600px, for the photo viewer), **thumbnail** (~300px, for grid galleries) — all stored in Dexie keyed by `{photoId}_original` / `_display` / `_thumb`. Galleries only ever read the thumbnail blob; the display/original load lazily when a photo is opened. When a SyncProvider is active, the same three variants upload to Supabase Storage under `production/{id}/photos/{photoId}/{variant}.jpg`, and the Dexie blob is retained locally regardless — a synced photo still opens instantly offline.

## 7. Mobile navigation structure

Bottom tab bar (persistent, ≥44px targets): **TODAY · SCENES · CAMERA (center, raised) · SEARCH · MORE**. "More" holds Schedule, Sync Queue, Settings, Crew, Export — the lower-frequency screens — so the four most-used actions never require a second tap to reach. The camera tab always opens with the last-used Scene/Shot/Take pre-selected (spec §35 smart defaults), or Today's first scheduled scene on a cold start.

## 8. Project folder structure

```
ptrc-continuity/
  public/
    manifest.webmanifest
    icons/ (192, 512, maskable)
    sw.js
  src/
    app/                      -- Next.js App Router pages
      today/  scenes/[id]/  camera/  photo/[id]/  search/
      schedule/  schedule/import/  sync/  settings/  crew/  login/
    components/               -- reusable UI (Button, SceneCard, PhotoGrid, QuickSelector, ...)
    db/
      schema.ts               -- Dexie table + index definitions
      db.ts                   -- Dexie instance
      repositories/           -- one file per entity: scenes.ts, photos.ts, shots.ts, takes.ts, notes.ts, props.ts, sync.ts
    lib/
      sync/
        SyncProvider.ts       -- interface
        NoopSyncProvider.ts   -- current no-backend implementation
        SupabaseSyncProvider.ts -- stub, ready to fill in
      import/                 -- CSV/XLSX parsing + column-mapping wizard logic
      camera/                 -- capture + thumbnailing helpers
      export/                 -- ZIP + filename-convention builder
    hooks/                    -- useLiveQuery wrappers, useOnlineStatus, useCurrentContext
    types/                    -- shared TypeScript types mirroring the schema
  supabase/
    migrations/0001_init.sql  -- full Postgres schema + RLS policies, for when you're ready
  ARCHITECTURE.md
```

## 9. Architectural risks

- **IndexedDB storage quota on iOS Safari.** iOS PWAs have historically been stricter about persistent storage than Android/desktop. Mitigation: request `navigator.storage.persist()` on first launch, and keep thumbnails small so a 20,000-photo production stays well under typical quotas; originals are the only large blobs and are the first candidate for a later "archive old originals to cloud, keep local copies of active days only" eviction policy.
- **Camera capture API differences.** `getUserMedia` behaves inconsistently across mobile browsers when installed as a standalone PWA. The capture screen falls back to a native `<input type="file" capture="environment">` picker automatically if `getUserMedia` fails, satisfying spec §58 without extra user action.
- **Conflict UI is the least-tested part of any offline-sync app** because it only shows up under real two-device contention. The shadow-table design is in the migration now, but budget real multi-device testing time before trusting it in production.
- **No real auth yet.** The MVP uses a local device-scoped profile (name you enter once) standing in for Supabase Auth, since there's no backend to authenticate against. Role/permission enforcement (admin vs. read-only, etc.) is modeled in the schema and UI-gated, but isn't security-enforced until Supabase RLS is live — don't treat the MVP as access-controlled between devices.
- **XLSX/CSV column variability.** Real production schedules are never consistently formatted. The import wizard's column-mapping step (not a fixed-header assumption) is what makes this tolerable, but expect to hand-correct mappings per-production.
