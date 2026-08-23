"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { TopBar } from "@/components/TopBar";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { getActiveProductionId } from "@/db/repositories/productions";
import { createScene, listScenes } from "@/db/repositories/scenes";
import { useCurrentContext } from "@/hooks/useCurrentContext";
import { SCENE_STATUSES, SCENE_STATUS_LABEL, type Scene, type SceneStatus } from "@/types";
import { clsx } from "clsx";

export default function ScenesPage() {
  const router = useRouter();
  const productionId = getActiveProductionId() ?? "";
  const { updateContext } = useCurrentContext();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SceneStatus | "all">("all");
  const [creating, setCreating] = useState(false);

  const scenes = useLiveQuery(() => listScenes(productionId), [productionId]);

  const filtered = useMemo(() => {
    if (!scenes) return [];
    return scenes.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return s.sceneNumber.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.location?.toLowerCase().includes(q);
    });
  }, [scenes, query, statusFilter]);

  const openScene = (scene: Scene) => {
    updateContext({ sceneId: scene.id, shotId: undefined, takeId: undefined });
    router.push(`/scenes/${scene.id}`);
  };

  return (
    <div className="flex flex-col">
      <TopBar title="Scenes" right={<span className="text-xs text-[var(--text-muted)]">{scenes?.length ?? 0} total</span>} />

      <div className="flex flex-col gap-2 px-4 pt-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search scene, description, location…"
          className="tap-target w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--text)] outline-none"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip label="All" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          {SCENE_STATUSES.map((s) => (
            <FilterChip key={s} label={SCENE_STATUS_LABEL[s]} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 py-4">
        {filtered.map((scene) => (
          <button
            key={scene.id}
            onClick={() => openScene(scene)}
            className="tap-target flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left"
          >
            <div className="min-w-0">
              <div className="text-xl font-black text-[var(--text)]">{scene.sceneNumber}</div>
              <div className="truncate text-sm text-[var(--text-muted)]">{scene.description}</div>
            </div>
            <StatusPill status={scene.status} />
          </button>
        ))}
        {filtered.length === 0 && scenes !== undefined && (
          <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text-muted)]">
            No scenes match. Try clearing filters, or add one below.
          </p>
        )}
      </div>

      <div className="px-4 pb-6">
        {!creating ? (
          <Button variant="secondary" fullWidth onClick={() => setCreating(true)}>
            + Add Scene Manually
          </Button>
        ) : (
          <NewSceneForm
            productionId={productionId}
            onDone={(scene) => {
              setCreating(false);
              if (scene) openScene(scene);
            }}
          />
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "tap-target shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold",
        active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] text-[var(--text-muted)]"
      )}
    >
      {label}
    </button>
  );
}

function NewSceneForm({ productionId, onDone }: { productionId: string; onDone: (scene: Scene | null) => void }) {
  const [sceneNumber, setSceneNumber] = useState("");
  const [description, setDescription] = useState("");

  const submit = async () => {
    if (!sceneNumber.trim()) return;
    const scene = await createScene(productionId, { sceneNumber: sceneNumber.trim(), description: description.trim() || "Untitled scene" });
    onDone(scene);
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <input
        autoFocus
        value={sceneNumber}
        onChange={(e) => setSceneNumber(e.target.value)}
        placeholder="Scene number, e.g. 36 or 24A"
        className="tap-target w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        className="tap-target w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none"
      />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button fullWidth onClick={submit} disabled={!sceneNumber.trim()}>
          Add Scene
        </Button>
      </div>
    </div>
  );
}
