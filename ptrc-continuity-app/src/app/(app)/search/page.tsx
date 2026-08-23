"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { PhotoThumb } from "@/components/PhotoThumb";
import { PickerSheet } from "@/components/ui/PickerSheet";
import { getActiveProductionId } from "@/db/repositories/productions";
import { listPhotosForProduction } from "@/db/repositories/photos";
import { listScenes } from "@/db/repositories/scenes";
import { listProps, listCharacters } from "@/db/repositories/props";
import { clsx } from "clsx";

export default function SearchPage() {
  const router = useRouter();
  const productionId = getActiveProductionId() ?? "";

  const [query, setQuery] = useState("");
  const [propId, setPropId] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [propPicker, setPropPicker] = useState(false);
  const [charPicker, setCharPicker] = useState(false);

  // NOTE: at very large scale (spec §56, 20k+ photos) this in-memory filter should move
  // to indexed Dexie queries per facet; for the MVP's expected working-set size (a single
  // production's photos, cached and paginated by scene) a linear scan stays fast enough.
  const photos = useLiveQuery(() => listPhotosForProduction(productionId), [productionId]);
  const scenes = useLiveQuery(() => listScenes(productionId), [productionId]);
  const props = useLiveQuery(() => listProps(productionId), [productionId]);
  const characters = useLiveQuery(() => listCharacters(productionId), [productionId]);

  const sceneById = useMemo(() => new Map((scenes ?? []).map((s) => [s.id, s])), [scenes]);

  const results = useMemo(() => {
    if (!photos) return [];
    const q = query.trim().toLowerCase();
    return photos.filter((p) => {
      if (pinnedOnly && !p.pinned) return false;
      if (propId && !p.propIds.includes(propId)) return false;
      if (characterId && !p.characterIds.includes(characterId)) return false;
      if (!q) return true;
      const scene = sceneById.get(p.sceneId);
      const haystack = [
        scene?.sceneNumber,
        scene?.description,
        scene?.location,
        p.category,
        p.notes,
        p.directionAngle,
        ...(p.flags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [photos, query, propId, characterId, pinnedOnly, sceneById]);

  return (
    <div className="flex flex-col">
      <TopBar title="Search" />

      <div className="flex flex-col gap-2 px-4 pt-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Scene, prop, keyword…"
          className="tap-target w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--text)] outline-none"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip label={propId ? props?.find((p) => p.id === propId)?.name ?? "Prop" : "Any Prop"} active={!!propId} onClick={() => setPropPicker(true)} onClear={propId ? () => setPropId(null) : undefined} />
          <Chip label={characterId ? characters?.find((c) => c.id === characterId)?.name ?? "Character" : "Any Character"} active={!!characterId} onClick={() => setCharPicker(true)} onClear={characterId ? () => setCharacterId(null) : undefined} />
          <Chip label="Pinned Only" active={pinnedOnly} onClick={() => setPinnedOnly((v) => !v)} />
        </div>
      </div>

      <div className="px-4 pt-2 text-xs text-[var(--text-muted)]">{results.length} result{results.length === 1 ? "" : "s"}</div>

      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {results.map((p) => {
          const scene = sceneById.get(p.sceneId);
          return (
            <button key={p.id} onClick={() => router.push(`/photo/${p.id}`)} className="flex flex-col items-center gap-1">
              <PhotoThumb photo={p} size="lg" />
              <span className="text-[10px] text-[var(--text-muted)]">Scene {scene?.sceneNumber}</span>
            </button>
          );
        })}
      </div>

      {results.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No photos match yet.</p>
      )}

      <PickerSheet open={propPicker} title="Filter by Prop" items={(props ?? []).map((p) => ({ id: p.id, label: p.name }))} onSelect={setPropId} onClose={() => setPropPicker(false)} />
      <PickerSheet open={charPicker} title="Filter by Character" items={(characters ?? []).map((c) => ({ id: c.id, label: c.name }))} onSelect={setCharacterId} onClose={() => setCharPicker(false)} />
    </div>
  );
}

function Chip({ label, active, onClick, onClear }: { label: string; active: boolean; onClick: () => void; onClear?: () => void }) {
  return (
    <span
      className={clsx(
        "tap-target flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold",
        active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] text-[var(--text-muted)]"
      )}
    >
      <button onClick={onClick}>{label}</button>
      {onClear && (
        <button onClick={onClear} className="opacity-80">
          ×
        </button>
      )}
    </span>
  );
}
