"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { PhotoThumb } from "@/components/PhotoThumb";
import { getScene, setSceneStatus, toggleScenePropAssociation } from "@/db/repositories/scenes";
import { createShot, listShots } from "@/db/repositories/shots";
import { listTakes } from "@/db/repositories/takes";
import { listPhotosForScene, listPinnedForScene } from "@/db/repositories/photos";
import { addNote, listNotes } from "@/db/repositories/notes";
import { createProp, listProps } from "@/db/repositories/props";
import { db } from "@/db/schema";
import { useCurrentContext } from "@/hooks/useCurrentContext";
import { SCENE_STATUSES, SCENE_STATUS_LABEL, type SceneStatus } from "@/types";

type ViewMode = "shots" | "timeline";

export default function SceneDetailPage() {
  const params = useParams<{ id: string }>();
  const sceneId = params.id;
  const router = useRouter();
  const { updateContext } = useCurrentContext();

  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [propPickerOpen, setPropPickerOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [view, setView] = useState<ViewMode>("shots");

  const scene = useLiveQuery(() => getScene(sceneId), [sceneId]);
  const shots = useLiveQuery(() => listShots(sceneId), [sceneId]);
  const pinned = useLiveQuery(() => listPinnedForScene(sceneId), [sceneId]);
  const allPhotos = useLiveQuery(() => listPhotosForScene(sceneId), [sceneId]);
  const notes = useLiveQuery(() => listNotes("scene", sceneId), [sceneId]);
  const allProps = useLiveQuery(() => (scene ? listProps(scene.productionId) : Promise.resolve([])), [scene?.productionId]);

  const shotsWithCounts = useMemo(() => {
    return (shots ?? []).map((shot) => ({
      shot,
      count: allPhotos?.filter((p) => p.shotId === shot.id).length ?? 0,
    }));
  }, [shots, allPhotos]);

  const sceneProps = useMemo(() => allProps?.filter((p) => scene?.propIds.includes(p.id)) ?? [], [allProps, scene]);
  const unsortedPhotos = useMemo(() => allPhotos?.filter((p) => !p.shotId) ?? [], [allPhotos]);

  if (!scene) {
    return (
      <div className="flex h-dvh items-center justify-center text-[var(--text-muted)]">Loading scene…</div>
    );
  }

  const goToCamera = async (shotId?: string) => {
    // The fastest path (spec §9) assumes a shot already exists to point the camera at.
    // If this scene has none yet, start it with a MASTER shot rather than leaving the
    // photo shot-less and invisible in the By Shot gallery.
    let targetShotId = shotId;
    if (!targetShotId && (shots?.length ?? 0) === 0) {
      const master = await createShot(scene.id, "MASTER");
      targetShotId = master.id;
    }
    updateContext({ sceneId: scene.id, shotId: targetShotId, takeId: undefined });
    router.push("/camera");
  };

  const handleNewShot = async () => {
    const name = window.prompt("New shot name (e.g. MASTER, A, INSERT LETTER):");
    if (!name?.trim()) return;
    const shot = await createShot(scene.id, name.trim());
    goToCamera(shot.id);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote(scene.productionId, "scene", scene.id, noteText.trim());
    setNoteText("");
  };

  return (
    <div className="flex flex-col pb-6">
      <TopBar title={`Scene ${scene.sceneNumber}`} back />

      <div className="flex flex-col gap-1 px-4 pt-3">
        <div className="text-base text-[var(--text)]">{scene.description}</div>
        <div className="text-xs text-[var(--text-muted)]">
          {[scene.intExt, scene.dayNight, scene.location, scene.scriptDay && `Script Day ${scene.scriptDay}`].filter(Boolean).join(" · ")}
        </div>
        <button onClick={() => setStatusPickerOpen(true)} className="tap-target mt-2 w-fit">
          <StatusPill status={scene.status} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 pt-4">
        <Button size="xl" onClick={() => goToCamera(shots?.[0]?.id)}>
          📷 TAKE PHOTO
        </Button>
        <Button size="xl" variant="secondary" onClick={handleNewShot}>
          + NEW SHOT
        </Button>
      </div>

      {pinned && pinned.length > 0 && (
        <section className="px-4 pt-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">★ Master Continuity</h2>
          <div className="flex gap-2 overflow-x-auto">
            {pinned.map((p) => (
              <PhotoThumb key={p.id} photo={p} size="lg" onClick={() => router.push(`/photo/${p.id}`)} />
            ))}
          </div>
        </section>
      )}

      <section className="px-4 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Shots</h2>
          <div className="flex gap-1 text-xs">
            <ViewToggleButton active={view === "shots"} label="By Shot" onClick={() => setView("shots")} />
            <ViewToggleButton active={view === "timeline"} label="Timeline" onClick={() => setView("timeline")} />
          </div>
        </div>

        {view === "shots" ? (
          <div className="flex flex-col gap-3">
            {shotsWithCounts.map(({ shot, count }) => (
              <ShotRow key={shot.id} sceneId={scene.id} shotId={shot.id} name={shot.name} count={count} onCamera={() => goToCamera(shot.id)} onOpenPhoto={(id) => router.push(`/photo/${id}`)} />
            ))}
            {shotsWithCounts.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No shots yet — add one above.</p>
            )}
            {unsortedPhotos.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="mb-2 text-sm font-bold text-[var(--text)]">Unsorted (no shot) <span className="text-xs font-normal text-[var(--text-muted)]">{unsortedPhotos.length} photos</span></div>
                <div className="flex gap-2 overflow-x-auto">
                  {unsortedPhotos.map((p) => (
                    <PhotoThumb key={p.id} photo={p} size="sm" onClick={() => router.push(`/photo/${p.id}`)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Timeline photos={allPhotos ?? []} onOpen={(id) => router.push(`/photo/${id}`)} />
        )}
      </section>

      <section className="px-4 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Props</h2>
          <button className="text-xs font-semibold text-[var(--accent)]" onClick={() => setPropPickerOpen(true)}>
            + Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {sceneProps.map((p) => (
            <span key={p.id} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)]">
              {p.name}
            </span>
          ))}
          {sceneProps.length === 0 && <p className="text-sm text-[var(--text-muted)]">No props linked yet.</p>}
        </div>
      </section>

      <section className="px-4 pt-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Continuity Notes</h2>
        <div className="flex flex-col gap-2">
          {notes?.map((n) => (
            <div key={n.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
              <div className="text-xs font-semibold text-[var(--text-muted)]">
                {new Date(n.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — {n.authorName}
              </div>
              <div className="text-[var(--text)]">{n.body}</div>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note…"
              className="tap-target flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--text)] outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
            />
            <Button onClick={handleAddNote} disabled={!noteText.trim()}>
              Add
            </Button>
          </div>
        </div>
      </section>

      <PickerSheet
        open={statusPickerOpen}
        title="Scene Status"
        selectedId={scene.status}
        items={SCENE_STATUSES.map((s) => ({ id: s, label: SCENE_STATUS_LABEL[s] }))}
        onSelect={(id) => setSceneStatus(scene.id, id as SceneStatus)}
        onClose={() => setStatusPickerOpen(false)}
      />

      <PickerSheet
        open={propPickerOpen}
        title="Add Prop to Scene"
        items={(allProps ?? []).filter((p) => !scene.propIds.includes(p.id)).map((p) => ({ id: p.id, label: p.name }))}
        onSelect={(id) => toggleScenePropAssociation(scene.id, id)}
        onClose={() => setPropPickerOpen(false)}
        onCreateNew={async (label) => {
          const prop = await createProp(scene.productionId, label);
          await toggleScenePropAssociation(scene.id, prop.id);
        }}
        createLabel="Add prop"
      />
    </div>
  );
}

function ViewToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`tap-target rounded-full border px-3 py-1 font-semibold ${
        active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] text-[var(--text-muted)]"
      }`}
    >
      {label}
    </button>
  );
}

function ShotRow({
  shotId,
  name,
  count,
  onCamera,
  onOpenPhoto,
}: {
  sceneId: string;
  shotId: string;
  name: string;
  count: number;
  onCamera: () => void;
  onOpenPhoto: (id: string) => void;
}) {
  const photos = useLiveQuery(() => db.photos.where({ shotId }).filter((p) => !p.deletedAt).toArray(), [shotId]);
  const takes = useLiveQuery(() => listTakes(shotId), [shotId]);
  const lockedTake = takes?.find((t) => t.continuityLock);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className="text-base font-bold text-[var(--text)]">{name}</span>
          <span className="ml-2 text-xs text-[var(--text-muted)]">{count} photos · {takes?.length ?? 0} takes</span>
          {lockedTake && <span className="ml-2 rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">★ TAKE {lockedTake.takeNumber} CONTINUITY</span>}
        </div>
        <button onClick={onCamera} className="tap-target rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-contrast)]">
          📷
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {photos?.slice(0, 12).map((p) => (
          <PhotoThumb key={p.id} photo={p} size="sm" onClick={() => onOpenPhoto(p.id)} />
        ))}
        {(photos?.length ?? 0) === 0 && <p className="text-xs text-[var(--text-muted)]">No photos yet.</p>}
      </div>
    </div>
  );
}

function Timeline({ photos, onOpen }: { photos: import("@/types").Photo[]; onOpen: (id: string) => void }) {
  const sorted = [...photos].sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((p) => (
        <button key={p.id} onClick={() => onOpen(p.id)} className="tap-target flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-left">
          <PhotoThumb photo={p} size="sm" />
          <div className="text-sm">
            <div className="font-semibold text-[var(--text)]">
              {new Date(p.takenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </div>
            <div className="text-xs text-[var(--text-muted)]">{p.category}</div>
          </div>
        </button>
      ))}
      {sorted.length === 0 && <p className="text-sm text-[var(--text-muted)]">No photos yet.</p>}
    </div>
  );
}
