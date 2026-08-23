import { clsx } from "clsx";
import { SCENE_STATUS_LABEL, type SceneStatus } from "@/types";

// Each pair is tuned for contrast in both themes: darker/saturated text on a light
// tint for light mode, lighter text on a darker tint for dark mode (via the `dark:`
// variant wired up in globals.css).
const COLORS: Record<SceneStatus, string> = {
  not_shot: "bg-slate-500/15 text-slate-700 border-slate-500/40 dark:text-slate-300",
  scheduled: "bg-blue-500/15 text-blue-700 border-blue-500/40 dark:text-blue-300",
  in_progress: "bg-amber-500/15 text-amber-800 border-amber-500/40 dark:text-amber-300",
  partially_shot: "bg-amber-500/15 text-amber-800 border-amber-500/40 dark:text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-800 border-emerald-500/40 dark:text-emerald-300",
  pickup_required: "bg-orange-500/15 text-orange-800 border-orange-500/40 dark:text-orange-300",
  reshoot: "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-300",
  hold: "bg-purple-500/15 text-purple-700 border-purple-500/40 dark:text-purple-300",
};

export function StatusPill({ status }: { status: SceneStatus }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", COLORS[status])}>
      {SCENE_STATUS_LABEL[status]}
    </span>
  );
}
