"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { PhotoThumb } from "@/components/PhotoThumb";
import { useCameraStream, MIN_ZOOM } from "@/hooks/useCameraStream";
import { useCurrentContext } from "@/hooks/useCurrentContext";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listScenes, createScene } from "@/db/repositories/scenes";
import { listShots, createShot } from "@/db/repositories/shots";
import { createTake, listTakes, getLatestTake } from "@/db/repositories/takes";
import { capturePhoto, listPhotosForTake, togglePin, updatePhotoMetadata } from "@/db/repositories/photos";
import { listCategories, addCustomCategory } from "@/db/repositories/categories";
import { addNote } from "@/db/repositories/notes";

export default function CameraPage() {
  const router = useRouter();
  const productionId = getActiveProductionId() ?? "";
  const { context, updateContext } = useCurrentContext();
  const { videoRef, supported, capture, flip, zoom, setZoom } = useCameraStream();

  const [scenePicker, setScenePicker] = useState(false);
  const [shotPicker, setShotPicker] = useState(false);
  const [takePicker, setTakePicker] = useState(false);
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  // Two-finger pinch to zoom the live preview. There's no built-in browser
  // gesture for this on a <video> element, so it's tracked by hand: remember
  // the finger spread and the zoom level at the moment a second finger
  // touches down, then scale from there as the fingers move.
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  const touchDistance = (touches: React.TouchList): number => {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { startDistance: touchDistance(e.touches), startZoom: zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const distance = touchDistance(e.touches);
      const ratio = distance / pinchRef.current.startDistance;
      setZoom(pinchRef.current.startZoom * ratio);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  const scenes = useLiveQuery(() => listScenes(productionId), [productionId]);
  const scene = scenes?.find((s) => s.id === context.sceneId) ?? scenes?.[0];

  const shots = useLiveQuery(() => (scene ? listShots(scene.id) : Promise.resolve([])), [scene?.id]);
  const shot = shots?.find((s) => s.id === context.shotId) ?? shots?.[0];

  const takes = useLiveQuery(() => (shot ? listTakes(shot.id) : Promise.resolve([])), [shot?.id]);
  const take = takes?.find((t) => t.id === context.takeId) ?? takes?.[takes.length - 1];

  const categories = useLiveQuery(() => listCategories(productionId), [productionId]);
  const category = context.category ?? "Master Continuity";

  const sessionPhotos = useLiveQuery(() => (take ? listPhotosForTake(take.id) : Promise.resolve([])), [take?.id]);

  // Keep the working context pointed at whatever actually resolved (first scene/shot/take on cold start).
  useEffect(() => {
    if (scene && scene.id !== context.sceneId) updateContext({ sceneId: scene.id });
  }, [scene, context.sceneId, updateContext]);
  useEffect(() => {
    if (shot && shot.id !== context.shotId) updateContext({ shotId: shot.id, takeId: undefined });
  }, [shot, context.shotId, updateContext]);
  useEffect(() => {
    if (take && take.id !== context.takeId) updateContext({ takeId: take.id });
  }, [take, context.takeId, updateContext]);

  const handleCapture = async () => {
    if (!scene || busy) return;
    setBusy(true);
    try {
      let blob: Blob;
      if (supported) {
        blob = await capture();
      } else {
        return; // fallback input handles capture in that branch
      }
      await capturePhoto(blob, {
        sceneId: scene.id,
        shotId: shot?.id,
        takeId: take?.id,
        category,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch (err) {
      console.error(err);
      alert("Couldn't capture that photo — try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleFallbackFile = async (file: File | undefined) => {
    if (!file || !scene) return;
    setBusy(true);
    try {
      await capturePhoto(file, { sceneId: scene.id, shotId: shot?.id, takeId: take?.id, category });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } finally {
      setBusy(false);
    }
  };

  // Existing photos from the phone's camera roll — a reference photo texted
  // over, something shot on a "real" camera and airdropped in, etc. Goes
  // through the exact same capturePhoto() pipeline as a fresh shot (same
  // scene/shot/take tagging, same local-first save, same upload queue), the
  // only difference is where the bytes came from.
  const handleGalleryFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !scene) return;
    setBusy(true);
    try {
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) {
        setImportProgress(list.length > 1 ? `Importing ${i + 1} of ${list.length}…` : "Importing…");
        await capturePhoto(list[i], { sceneId: scene.id, shotId: shot?.id, takeId: take?.id, category });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } finally {
      setImportProgress(null);
      setBusy(false);
    }
  };

  const handleNextTake = async () => {
    if (!shot) return;
    const newTake = await createTake(shot.id);
    updateContext({ takeId: newTake.id });
  };

  const handleNewShot = async (name: string) => {
    if (!scene) return;
    const newShot = await createShot(scene.id, name);
    updateContext({ shotId: newShot.id, takeId: undefined });
  };

  const handleMasterContinuity = async () => {
    const latest = sessionPhotos?.[0];
    if (!latest) {
      updateContext({ category: "Master Continuity" });
      return;
    }
    await updatePhotoMetadata(latest.id, { category: "Master Continuity" });
    await togglePin(latest.id);
  };

  const handlePinLast = async () => {
    const latest = sessionPhotos?.[0];
    if (latest) await togglePin(latest.id);
  };

  const handleAddNote = async () => {
    if (!scene) return;
    const text = window.prompt("Note for this take:");
    if (text?.trim()) await addNote(scene.productionId, "take", take?.id ?? scene.id, text.trim());
  };

  const sceneItems = useMemo(
    () => (scenes ?? []).map((s) => ({ id: s.id, label: s.sceneNumber, sublabel: s.description })),
    [scenes]
  );

  if (!scene) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[var(--text-muted)]">No scenes yet. Add one to start shooting continuity.</p>
        <Button onClick={() => router.push("/scenes")}>Go to Scenes</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <TopBar title="Camera" />

      {/* Quick Scene Switcher — spec §34 */}
      <div className="flex gap-2 overflow-x-auto px-3 pt-2 pb-1">
        <QuickChip label="SCENE" value={scene.sceneNumber} onClick={() => setScenePicker(true)} />
        <QuickChip label="SHOT" value={shot?.name ?? "—"} onClick={() => setShotPicker(true)} />
        <QuickChip label="TAKE" value={take ? String(take.takeNumber) : "—"} onClick={() => setTakePicker(true)} />
        <QuickChip label="CATEGORY" value={category} onClick={() => setCategoryPicker(true)} />
      </div>

      <div
        className="relative mx-3 mt-2 aspect-square touch-none overflow-hidden rounded-2xl bg-black"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {supported ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
            playsInline
            muted
            autoPlay
          />
        ) : (
          <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 text-white">
            <span className="text-5xl">📷</span>
            <span className="text-sm">Tap to choose or take a photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFallbackFile(e.target.files?.[0])}
            />
          </label>
        )}

        {saved && (
          <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-emerald-600/90 px-4 py-1.5 text-sm font-bold text-white">
            ✓ SAVED LOCALLY
          </div>
        )}

        {importProgress && (
          <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/70 px-4 py-1.5 text-sm font-bold text-white">
            {importProgress}
          </div>
        )}

        {supported && zoom > MIN_ZOOM + 0.01 && (
          <div className="absolute bottom-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-xs font-bold text-white">
            {zoom.toFixed(1)}×
          </div>
        )}

        {supported && (
          <button
            onClick={flip}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-lg text-white"
            aria-label="Flip camera"
          >
            ⟲
          </button>
        )}
      </div>

      {supported && (
        <div className="relative flex items-center justify-center py-4">
          <label
            className="tap-target absolute left-6 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xl text-[var(--text)]"
            aria-label="Add photo from gallery"
          >
            🖼
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleGalleryFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={handleCapture}
            disabled={busy}
            aria-label="Capture photo"
            className="tap-target flex h-20 w-20 items-center justify-center rounded-full border-4 border-[var(--accent)] bg-[var(--surface)] disabled:opacity-50"
          >
            <span className="h-14 w-14 rounded-full bg-[var(--accent)]" />
          </button>
        </div>
      )}

      {sessionPhotos && sessionPhotos.length > 0 && (
        <div className="flex flex-col gap-1 px-3 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {shot?.name} · Take {take?.takeNumber} — {sessionPhotos.length} photo{sessionPhotos.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2 overflow-x-auto">
            {sessionPhotos.map((p) => (
              <PhotoThumb key={p.id} photo={p} size="sm" onClick={() => router.push(`/photo/${p.id}`)} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 px-3 pb-6">
        <Button variant="secondary" onClick={handleNextTake}>⏭ NEXT TAKE</Button>
        <Button
          variant="secondary"
          onClick={() => {
            const name = window.prompt("New shot name:");
            if (name?.trim()) handleNewShot(name.trim());
          }}
        >
          🎬 NEW SHOT
        </Button>
        <Button variant="secondary" onClick={handleMasterContinuity}>★ MASTER CONTINUITY</Button>
        <Button variant="secondary" onClick={handlePinLast}>📌 PIN LAST PHOTO</Button>
        <Button variant="secondary" className="col-span-2" onClick={handleAddNote}>📝 ADD NOTE</Button>
      </div>

      <PickerSheet
        open={scenePicker}
        title="Select Scene"
        selectedId={scene.id}
        items={sceneItems}
        onSelect={(id) => updateContext({ sceneId: id, shotId: undefined, takeId: undefined })}
        onClose={() => setScenePicker(false)}
        onCreateNew={async (label) => {
          const created = await createScene(productionId, { sceneNumber: label, description: "" });
          updateContext({ sceneId: created.id, shotId: undefined, takeId: undefined });
        }}
        createLabel="Create scene"
      />

      <PickerSheet
        open={shotPicker}
        title="Select Shot"
        selectedId={shot?.id}
        items={(shots ?? []).map((s) => ({ id: s.id, label: s.name }))}
        onSelect={(id) => updateContext({ shotId: id, takeId: undefined })}
        onClose={() => setShotPicker(false)}
        onCreateNew={(label) => handleNewShot(label)}
        createLabel="Create shot"
      />

      <PickerSheet
        open={takePicker}
        title="Select Take"
        selectedId={take?.id}
        items={(takes ?? []).map((t) => ({
          id: t.id,
          label: `Take ${t.takeNumber}`,
          sublabel: [t.printFlag && "PRINT", t.circleFlag && "CIRCLE", t.ngFlag && "NG", t.continuityLock && "★ CONTINUITY"].filter(Boolean).join(" · "),
        }))}
        onSelect={(id) => updateContext({ takeId: id })}
        onClose={() => setTakePicker(false)}
        onCreateNew={async () => {
          if (!shot) return;
          const latest = await getLatestTake(shot.id);
          const newTake = await createTake(shot.id, (latest?.takeNumber ?? 0) + 1);
          updateContext({ takeId: newTake.id });
        }}
        createLabel="New take"
      />

      <PickerSheet
        open={categoryPicker}
        title="Photo Category"
        selectedId={category}
        items={(categories ?? []).map((c) => ({ id: c, label: c }))}
        onSelect={(id) => updateContext({ category: id })}
        onClose={() => setCategoryPicker(false)}
        onCreateNew={async (label) => {
          await addCustomCategory(productionId, label);
          updateContext({ category: label });
        }}
        createLabel="Create category"
      />
    </div>
  );
}

function QuickChip({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tap-target flex shrink-0 flex-col items-start rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5"
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      <span className="text-sm font-bold text-[var(--text)]">{value} ▾</span>
    </button>
  );
}
