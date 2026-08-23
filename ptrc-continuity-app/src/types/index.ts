// Shared domain types. These mirror the Dexie table shapes 1:1 (see db/schema.ts)
// and the Postgres migration in supabase/migrations, so the eventual sync layer
// has nothing to translate.

export type Role =
  | "admin"
  | "prop_master"
  | "asst_prop_master"
  | "continuity"
  | "crew"
  | "read_only";

export type SceneStatus =
  | "not_shot"
  | "scheduled"
  | "in_progress"
  | "partially_shot"
  | "completed"
  | "pickup_required"
  | "reshoot"
  | "hold";

export const SCENE_STATUSES: SceneStatus[] = [
  "not_shot",
  "scheduled",
  "in_progress",
  "partially_shot",
  "completed",
  "pickup_required",
  "reshoot",
  "hold",
];

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = {
  not_shot: "Not Shot",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  partially_shot: "Partially Shot",
  completed: "Completed",
  pickup_required: "Pickup Required",
  reshoot: "Reshoot",
  hold: "Hold",
};

export const DEFAULT_PHOTO_CATEGORIES = [
  "Master Continuity",
  "Props",
  "Actor",
  "Costume",
  "Hair",
  "Makeup",
  "Set Dressing",
  "Hand Position",
  "Prop Position",
  "Food",
  "Drinks",
  "Documents",
  "Vehicle",
  "Damage",
  "Blood",
  "Dirt",
  "Special Effects",
  "Reset Reference",
  "Before Take",
  "After Take",
  "Reference",
  "Other",
] as const;

export type PhotoFlag =
  | "master"
  | "reset"
  | "important"
  | "prop"
  | "position"
  | "damage"
  | "match"
  | "pickup";

export const PHOTO_FLAGS: PhotoFlag[] = [
  "master",
  "reset",
  "important",
  "prop",
  "position",
  "damage",
  "match",
  "pickup",
];

export type NoteScope = "scene" | "shot" | "take" | "photo";

interface SyncableFields {
  id: string;
  productionId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  deletedAt?: string | null;
  rev: number;
  dirty: boolean;
  syncedAt?: string | null;
}

export interface LocalUser {
  id: string;
  displayName: string;
  email?: string;
  color: string; // for avatar / attribution chips
  createdAt: string;
}

export interface Production extends Omit<SyncableFields, "productionId"> {
  name: string;
  shortCode: string;
  status: "active" | "wrapped" | "archived";
  settingsJson?: Record<string, unknown>;
}

export interface ProductionMember extends SyncableFields {
  userId: string;
  displayName: string;
  role: Role;
  permissionsJson?: Partial<Record<PermissionKey, boolean>>;
  invitedAt?: string;
  joinedAt?: string;
}

export type PermissionKey =
  | "capturePhoto"
  | "editMetadata"
  | "addNotes"
  | "createShotsTakes"
  | "editSchedule"
  | "manageCrew"
  | "deleteProduction"
  | "permanentlyDelete"
  | "exportData";

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Partial<Record<PermissionKey, boolean>>> = {
  admin: {
    capturePhoto: true,
    editMetadata: true,
    addNotes: true,
    createShotsTakes: true,
    editSchedule: true,
    manageCrew: true,
    deleteProduction: true,
    permanentlyDelete: true,
    exportData: true,
  },
  prop_master: {
    capturePhoto: true,
    editMetadata: true,
    addNotes: true,
    createShotsTakes: true,
    editSchedule: true,
    manageCrew: false,
    deleteProduction: false,
    permanentlyDelete: false,
    exportData: true,
  },
  asst_prop_master: {
    capturePhoto: true,
    editMetadata: true,
    addNotes: true,
    createShotsTakes: true,
    editSchedule: false,
    manageCrew: false,
    deleteProduction: false,
    permanentlyDelete: false,
    exportData: false,
  },
  continuity: {
    capturePhoto: true,
    editMetadata: true,
    addNotes: true,
    createShotsTakes: true,
    editSchedule: false,
    manageCrew: false,
    deleteProduction: false,
    permanentlyDelete: false,
    exportData: true,
  },
  crew: {
    capturePhoto: true,
    editMetadata: false,
    addNotes: true,
    createShotsTakes: false,
    editSchedule: false,
    manageCrew: false,
    deleteProduction: false,
    permanentlyDelete: false,
    exportData: false,
  },
  read_only: {
    capturePhoto: false,
    editMetadata: false,
    addNotes: false,
    createShotsTakes: false,
    editSchedule: false,
    manageCrew: false,
    deleteProduction: false,
    permanentlyDelete: false,
    exportData: false,
  },
};

export interface ShootDay extends SyncableFields {
  dayNumber: number;
  shootDate: string; // ISO date
  unitLabel?: string;
  notes?: string;
}

export type IntExt = "INT" | "EXT" | "INT/EXT";
export type DayNight = "DAY" | "NIGHT" | "DUSK" | "DAWN";

export interface Scene extends SyncableFields {
  sceneNumber: string; // "36", "24A", "12A-1", "101PT" — never assume integer
  scenePart?: string;
  description: string;
  scriptDay?: string;
  intExt?: IntExt;
  dayNight?: DayNight;
  location?: string;
  setName?: string;
  status: SceneStatus;
  castJson?: string[];
  backgroundJson?: string;
  vehiclesJson?: string;
  sfxJson?: string;
  vfxJson?: string;
  notes?: string;
  propIds: string[];
  characterIds: string[];
  actualShootDayId?: string | null;
}

export interface SceneScheduleEntry extends SyncableFields {
  sceneId: string;
  shootDayId: string;
  unit?: string;
  orderIndex: number;
  dropped: boolean;
}

export interface Shot extends SyncableFields {
  sceneId: string;
  name: string; // MASTER, A, B, INSERT LETTER, ...
  cameraLabel?: string; // A CAM / B CAM / C CAM / UNIT
  orderIndex: number;
  notes?: string;
}

export interface Take extends SyncableFields {
  shotId: string;
  takeNumber: number;
  printFlag: boolean;
  circleFlag: boolean;
  ngFlag: boolean;
  continuityLock: boolean;
  notes?: string;
}

export interface Photo extends SyncableFields {
  takeId?: string | null;
  sceneId: string;
  shotId?: string | null;
  originalBlobKey: string;
  displayBlobKey: string;
  thumbBlobKey: string;
  category: string;
  cameraDeviceLabel?: string; // A CAM / B CAM / phone label
  takenBy: string;
  takenAt: string;
  pinned: boolean;
  flags: PhotoFlag[];
  continuityStatus?: string;
  directionAngle?: string;
  notes?: string;
  referencesPhotoId?: string | null;
  propIds: string[];
  characterIds: string[];
}

export interface PhotoAnnotation extends SyncableFields {
  photoId: string;
  layerBlobKey: string;
  toolType: "arrow" | "circle" | "rectangle" | "freehand" | "text";
}

export interface ContinuityNote extends SyncableFields {
  scopeType: NoteScope;
  scopeId: string;
  body: string;
  authorId: string;
  authorName: string;
}

export interface Prop extends SyncableFields {
  name: string;
  category?: string;
  notes?: string;
}

export interface Character extends SyncableFields {
  name: string;
  actorName?: string;
}

export interface SyncOperation {
  id: string;
  entityTable: string;
  entityId: string;
  op: "create" | "update" | "delete";
  payload: unknown;
  attemptCount: number;
  lastError?: string;
  status: "pending" | "syncing" | "done" | "failed";
  createdAt: string;
}

export interface ActivityLogEntry {
  id: string;
  productionId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityTable: string;
  entityId: string;
  detail?: string;
  createdAt: string;
}

export interface DeletedItem {
  id: string;
  entityTable: string;
  entityId: string;
  deletedBy: string;
  deletedByName: string;
  deletedAt: string;
  restorable: boolean;
  snapshotJson: string; // full record JSON so restore is a plain re-insert
}
