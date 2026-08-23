import type { Photo, Production, Scene, Shot, Take } from "@/types";

function sanitize(part: string): string {
  return part
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 20);
}

/** Builds e.g. PR1898_SC036_B_T04_PROP_REVOLVER_001.jpg (spec §30). */
export function buildPhotoFilename(
  production: Production,
  scene: Scene,
  shot: Shot | undefined,
  take: Take | undefined,
  photo: Photo,
  index: number
): string {
  const parts = [
    sanitize(production.shortCode),
    `SC${sanitize(scene.sceneNumber)}`,
    shot ? sanitize(shot.name) : undefined,
    take ? `T${String(take.takeNumber).padStart(2, "0")}` : undefined,
    sanitize(photo.category).slice(0, 12),
    String(index + 1).padStart(3, "0"),
  ].filter(Boolean);
  return `${parts.join("_")}.jpg`;
}

/** Folder path used by batch export (spec §29): Production/ShootDay_027/Scene_036/Shot_B/Take_04/ */
export function buildExportFolder(
  production: Production,
  shootDayNumber: number | undefined,
  scene: Scene,
  shot?: Shot,
  take?: Take
): string {
  const parts = [
    sanitize(production.shortCode),
    shootDayNumber !== undefined ? `ShootDay_${String(shootDayNumber).padStart(3, "0")}` : undefined,
    `Scene_${sanitize(scene.sceneNumber)}`,
    shot ? `Shot_${sanitize(shot.name)}` : undefined,
    take ? `Take_${String(take.takeNumber).padStart(2, "0")}` : undefined,
  ].filter(Boolean);
  return parts.join("/");
}
