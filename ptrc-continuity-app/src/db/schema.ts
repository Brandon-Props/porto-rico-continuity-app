import Dexie, { type EntityTable } from "dexie";
import type {
  ActivityLogEntry,
  Character,
  ContinuityNote,
  DeletedItem,
  LocalUser,
  Photo,
  PhotoAnnotation,
  Production,
  ProductionMember,
  Prop,
  Scene,
  SceneScheduleEntry,
  ShootDay,
  Shot,
  SyncOperation,
  Take,
} from "@/types";

export interface PhotoBlobRecord {
  key: string; // `${photoId}_original` | `_display` | `_thumb`
  photoId: string;
  variant: "original" | "display" | "thumb";
  blob: Blob;
}

export interface AnnotationBlobRecord {
  key: string;
  annotationId: string;
  blob: Blob;
}

/** One row per photo whose image still needs uploading to Supabase Storage
 *  (see src/lib/sync/blobSync.ts) — separate from syncOperations because a
 *  blob upload isn't a row-level Postgres write, it's a Storage API call, and
 *  large binaries deserve their own retry/status tracking rather than sharing
 *  a queue with small JSON row pushes. */
export interface BlobUploadRecord {
  photoId: string;
  status: "pending" | "syncing" | "done" | "failed";
  attemptCount: number;
  lastError?: string;
  createdAt: string;
}

export class ContinuityDB extends Dexie {
  localUsers!: EntityTable<LocalUser, "id">;
  productions!: EntityTable<Production, "id">;
  productionMembers!: EntityTable<ProductionMember, "id">;
  shootDays!: EntityTable<ShootDay, "id">;
  scenes!: EntityTable<Scene, "id">;
  sceneScheduleEntries!: EntityTable<SceneScheduleEntry, "id">;
  shots!: EntityTable<Shot, "id">;
  takes!: EntityTable<Take, "id">;
  photos!: EntityTable<Photo, "id">;
  photoAnnotations!: EntityTable<PhotoAnnotation, "id">;
  continuityNotes!: EntityTable<ContinuityNote, "id">;
  props!: EntityTable<Prop, "id">;
  characters!: EntityTable<Character, "id">;
  syncOperations!: EntityTable<SyncOperation, "id">;
  activityLog!: EntityTable<ActivityLogEntry, "id">;
  deletedItems!: EntityTable<DeletedItem, "id">;
  photoBlobs!: EntityTable<PhotoBlobRecord, "key">;
  annotationBlobs!: EntityTable<AnnotationBlobRecord, "key">;
  blobUploads!: EntityTable<BlobUploadRecord, "photoId">;

  constructor() {
    super("ptrc-continuity");

    this.version(1).stores({
      localUsers: "id",
      productions: "id, status, deletedAt",
      productionMembers: "id, productionId, userId, [productionId+userId]",
      shootDays: "id, productionId, dayNumber, shootDate, deletedAt",
      scenes:
        "id, productionId, sceneNumber, status, deletedAt, [productionId+sceneNumber], *propIds, *characterIds",
      sceneScheduleEntries: "id, sceneId, shootDayId, [shootDayId+orderIndex], deletedAt",
      shots: "id, sceneId, [sceneId+orderIndex], deletedAt",
      takes: "id, shotId, [shotId+takeNumber], deletedAt",
      photos:
        "id, productionId, sceneId, shotId, takeId, category, pinned, takenAt, deletedAt, [sceneId+takenAt], *propIds, *characterIds, *flags",
      photoAnnotations: "id, photoId, deletedAt",
      continuityNotes: "id, scopeType, scopeId, [scopeType+scopeId], createdAt, deletedAt",
      props: "id, productionId, name, deletedAt",
      characters: "id, productionId, name, deletedAt",
      syncOperations: "id, status, entityTable, createdAt",
      activityLog: "id, productionId, entityTable, entityId, createdAt",
      deletedItems: "id, entityTable, entityId, deletedAt",
      photoBlobs: "key, photoId, variant",
      annotationBlobs: "key, annotationId",
    });

    // New table only — Dexie carries every unchanged store over automatically,
    // so existing installs upgrade in place without losing anything.
    this.version(2).stores({
      blobUploads: "photoId, status, createdAt",
    });
  }
}

export const db = new ContinuityDB();
