"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { PhotoAnnotationEditor } from "@/components/PhotoAnnotationEditor";
import { usePhotoBlobUrl } from "@/hooks/usePhotoBlobUrl";
import { useAnnotationBlobUrl } from "@/hooks/useAnnotationBlobUrl";
import {
  getPhoto,
  getPhotoBlob,
  listPhotosForScene,
  softDeletePhoto,
  toggleFlag,
  togglePin,
  updatePhotoMetadata,
} from "@/db/repositories/photos";
import { saveAnnotation, listAnnotations } from "@/db/repositories/annotations";
import { getScene } from "@/db/repositories/scenes";
import { getShot } from "@/db/repositories/shots";
import { getTake } from "@/db/repositories/takes";
import { listNotes, addNote } from "@/db/repositories/notes";
import { listProps, listCharacters } from "@/db/repositories/props";
import { listMembers } from "@/db/repositories/productions";
import { db } from "@/db/schema";
import { buildPhotoFilename } from "@/lib/export/filename";
import { sharePhotoBlob, downloadBlob } from "@/lib/export/share";
import { getCurrentUser } from "@/lib/currentUser";
import { PHOTO_FLAGS, DEFAULT_PHOTO_CATEGORIES } from "@/types";
import { clsx } from "clsx";

export default function PhotoViewerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const photoId = params.id;

  const [annotating, setAnnotating] = useState(false);
  const [comparePicker, setComparePicker] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<"side" | "overlay">("side");
  const [opacity, setOpacity] = useState(0.5);
  const [noteText, setNoteText] = useState("");
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [propPicker, setPropPicker] = useState(false);
  const [characterPicker, setCharacterPicker] = useState(false);

  const photo = useLiveQuery(() => getPhoto(photoId), [photoId]);
  const displayUrl = usePhotoBlobUrl(photo?.displayBlobKey);
  const scene = useLiveQuery(() => (photo ? getScene(photo.sceneId) : undefined), [photo?.sceneId]);
  const shot = useLiveQuery(() => (photo?.shotId ? getShot(photo.shotId) : undefined), [photo?.shotId]);
  const take = useLiveQuery(() => (photo?.takeId ? getTake(photo.takeId) : undefined), [photo?.takeId]);
  const production = useLiveQuery(() => (scene ? db.productions.get(scene.productionId) : undefined), [scene?.productionId]);
  const siblings = useLiveQuery(() => (photo ? listPhotosForScene(photo.sceneId) : Promise.resolve([])), [photo?.sceneId]);
  const notes = useLiveQuery(() => listNotes("photo", photoId), [photoId]);
  const annotations = useLiveQuery(() => listAnnotations(photoId), [photoId]);
  const allProps = useLiveQuery(() => (scene ? listProps(scene.productionId) : Promise.resolve([])), [scene?.productionId]);
  const allCharacters = useLiveQuery(() => (scene ? listCharacters(scene.productionId) : Promise.resolve([])), [scene?.productionId]);
  const members = useLiveQuery(() => (scene ? listMembers(scene.productionId) : Promise.resolve([])), [scene?.productionId]);

  const comparePhoto = useLiveQuery(() => (compareId ? getPhoto(compareId) : undefined), [compareId]);
  const compareUrl = usePhotoBlobUrl(comparePhoto?.displayBlobKey);

  const index = useMemo(() => siblings?.findIndex((p) => p.id === photoId) ?? -1, [siblings, photoId]);
  const goTo = (i: number) => {
    if (!siblings || i < 0 || i >= siblings.length) return;
    router.replace(`/photo/${siblings[i].id}`);
  };

  if (!photo || !scene) {
    return <div className="flex h-dvh items-center justify-center text-[var(--text-muted)]">Loading photo…</div>;
  }

  const handleSaveAnnotation = async (blob: Blob) => {
    await saveAnnotation(photo.id, photo.productionId, blob);
    setAnnotating(false);
  };

  const handleShare = async () => {
    const blob = await getPhotoBlob(photo.originalBlobKey);
    if (!blob || !production) return;
    const filename = buildPhotoFilename(production, scene, shot, take, photo, index >= 0 ? index : 0);
    await sharePhotoBlob(blob, filename);
  };

  const handleDownload = async () => {
    const blob = await getPhotoBlob(photo.originalBlobKey);
    if (!blob || !production) return;
    downloadBlob(blob, buildPhotoFilename(production, scene, shot, take, photo, index >= 0 ? index : 0));
  };

  const handleDelete = async () => {
    if (!window.confirm("Move this photo to Trash? An admin can restore or permanently delete it later.")) return;
    await softDeletePhoto(photo.id);
    router.back();
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote(photo.productionId, "photo", photo.id, noteText.trim());
    setNoteText("");
  };

  return (
    <div className="flex flex-col">
      <TopBar
        title={`Scene ${scene.sceneNumber}${shot ? ` · ${shot.name}` : ""}${take ? ` · T${take.takeNumber}` : ""}`}
        back
        right={
          <button onClick={() => togglePin(photo.id)} className="tap-target text-xl" aria-label="Pin">
            {photo.pinned ? "★" : "☆"}
          </button>
        }
      />

      <div className="relative flex items-center justify-center bg-black" style={{ minHeight: "45vh" }}>
        {displayUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt="" className="max-h-[60vh] w-full object-contain" />
        )}
        {siblings && siblings.length > 1 && (
          <>
            <button onClick={() => goTo(index - 1)} disabled={index <= 0} className="tap-target absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-2 py-3 text-white disabled:opacity-30">‹</button>
            <button onClick={() => goTo(index + 1)} disabled={index >= siblings.length - 1} className="tap-target absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-2 py-3 text-white disabled:opacity-30">›</button>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 px-3 pt-3 text-xs">
        <MetaField label="Category" value={photo.category} onClick={() => setCategoryPicker(true)} />
        <MetaField label="Photographer" value={resolvePhotographerName(photo.takenBy, members)} />
        <MetaField label="Taken" value={new Date(photo.takenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} />
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pt-3">
        {PHOTO_FLAGS.map((f) => (
          <button
            key={f}
            onClick={() => toggleFlag(photo.id, f)}
            className={clsx(
              "tap-target rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase",
              photo.flags.includes(f) ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] text-[var(--text-muted)]"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 pt-4">
        <Button variant="secondary" onClick={() => setAnnotating(true)}>✎ Annotate</Button>
        <Button variant="secondary" onClick={() => setComparePicker(true)}>⇄ Compare</Button>
        <Button variant="secondary" onClick={handleShare}>⤴ Share</Button>
        <Button variant="secondary" onClick={handleDownload}>⬇ Download</Button>
      </div>

      {annotations && annotations.length > 0 && (
        <div className="flex flex-col gap-1 px-3 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Annotated Versions</h3>
          <div className="flex gap-2 overflow-x-auto">
            {annotations.map((a) => (
              <AnnotationThumb key={a.id} blobKey={a.layerBlobKey} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 px-3 pt-4">
        <div>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Props</h3>
          <div className="flex flex-wrap gap-1.5">
            {(allProps ?? []).filter((p) => photo.propIds.includes(p.id)).map((p) => (
              <Tag key={p.id} label={p.name} onRemove={() => updatePhotoMetadata(photo.id, { propIds: photo.propIds.filter((id) => id !== p.id) })} />
            ))}
            <button onClick={() => setPropPicker(true)} className="tap-target rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]">+ Prop</button>
          </div>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Characters</h3>
          <div className="flex flex-wrap gap-1.5">
            {(allCharacters ?? []).filter((c) => photo.characterIds.includes(c.id)).map((c) => (
              <Tag key={c.id} label={c.name} onRemove={() => updatePhotoMetadata(photo.id, { characterIds: photo.characterIds.filter((id) => id !== c.id) })} />
            ))}
            <button onClick={() => setCharacterPicker(true)} className="tap-target rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]">+ Character</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3 py-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Notes</h3>
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
            placeholder="Add a note about this photo…"
            className="tap-target flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--text)] outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
          />
          <Button onClick={handleAddNote} disabled={!noteText.trim()}>Add</Button>
        </div>
      </div>

      <div className="px-3 pb-8">
        <Button variant="danger" fullWidth onClick={handleDelete}>🗑 Move to Trash</Button>
      </div>

      {annotating && displayUrl && (
        <PhotoAnnotationEditor imageUrl={displayUrl} onSave={handleSaveAnnotation} onClose={() => setAnnotating(false)} />
      )}

      <PickerSheet
        open={categoryPicker}
        title="Photo Category"
        selectedId={photo.category}
        items={DEFAULT_PHOTO_CATEGORIES.map((c) => ({ id: c, label: c }))}
        onSelect={(id) => updatePhotoMetadata(photo.id, { category: id })}
        onClose={() => setCategoryPicker(false)}
      />

      <PickerSheet
        open={propPicker}
        title="Link Prop"
        items={(allProps ?? []).filter((p) => !photo.propIds.includes(p.id)).map((p) => ({ id: p.id, label: p.name }))}
        onSelect={(id) => updatePhotoMetadata(photo.id, { propIds: [...photo.propIds, id] })}
        onClose={() => setPropPicker(false)}
      />

      <PickerSheet
        open={characterPicker}
        title="Link Character"
        items={(allCharacters ?? []).filter((c) => !photo.characterIds.includes(c.id)).map((c) => ({ id: c.id, label: c.name }))}
        onSelect={(id) => updatePhotoMetadata(photo.id, { characterIds: [...photo.characterIds, id] })}
        onClose={() => setCharacterPicker(false)}
        onCreateNew={async (label) => {
          const { findOrCreateCharacter } = await import("@/db/repositories/props");
          const character = await findOrCreateCharacter(photo.productionId, label);
          await updatePhotoMetadata(photo.id, { characterIds: [...photo.characterIds, character.id] });
        }}
        createLabel="Add character"
      />

      <PickerSheet
        open={comparePicker}
        title="Compare With"
        items={(siblings ?? []).filter((p) => p.id !== photo.id).map((p) => ({
          id: p.id,
          label: `${p.category} — ${new Date(p.takenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
        }))}
        onSelect={(id) => setCompareId(id)}
        onClose={() => setComparePicker(false)}
      />

      {compareId && compareUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between p-3 text-white">
            <button onClick={() => setCompareId(null)} className="tap-target">Close</button>
            <div className="flex gap-1 text-xs">
              <button onClick={() => setCompareMode("side")} className={clsx("rounded-full px-3 py-1", compareMode === "side" && "bg-[var(--accent)] text-black")}>Side by Side</button>
              <button onClick={() => setCompareMode("overlay")} className={clsx("rounded-full px-3 py-1", compareMode === "overlay" && "bg-[var(--accent)] text-black")}>Overlay</button>
            </div>
          </div>
          {compareMode === "side" ? (
            <div className="flex flex-1 gap-1 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={displayUrl} alt="Current" className="h-full w-1/2 object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={compareUrl} alt="Compare" className="h-full w-1/2 object-contain" />
            </div>
          ) : (
            <div className="relative flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={displayUrl} alt="Current" className="absolute inset-0 h-full w-full object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={compareUrl} alt="Compare" className="absolute inset-0 h-full w-full object-contain" style={{ opacity }} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="absolute bottom-4 left-4 right-4"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function resolvePhotographerName(userId: string, members: { userId: string; displayName: string }[] | undefined): string {
  if (userId === "unknown") return "—";
  const me = getCurrentUser();
  if (me?.id === userId) return me.displayName;
  const member = members?.find((m) => m.userId === userId);
  return member?.displayName ?? "Unknown";
}

function MetaField({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className="tap-target rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-left">
      <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="truncate font-semibold text-[var(--text)]">{value}</div>
    </Comp>
  );
}

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text)]">
      {label}
      <button onClick={onRemove} className="text-[var(--text-muted)]">×</button>
    </span>
  );
}

function AnnotationThumb({ blobKey }: { blobKey: string }) {
  const url = useAnnotationBlobUrl(blobKey);
  if (!url) return <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-[var(--border)]" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Annotation" className="h-20 w-20 shrink-0 rounded-lg border border-[var(--border)] object-cover" />;
}
