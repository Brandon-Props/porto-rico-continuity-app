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
  }
}

export const db = new ContinuityDB();
