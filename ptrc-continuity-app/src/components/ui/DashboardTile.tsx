"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { clsx } from "clsx";

export function DashboardTile({
  href,
  icon,
  label,
  sublabel,
  emphasis,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  sublabel?: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border p-5 text-center transition-transform active:scale-[0.97]",
        emphasis
          ? "bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent shadow-lg"
          : "bg-[var(--surface)] text-[var(--text)] border-[var(--border)]"
      )}
    >
      <div className="text-3xl">{icon}</div>
      <div className="text-lg font-bold leading-tight">{label}</div>
      {sublabel && <div className={clsx("text-xs", emphasis ? "opacity-90" : "text-[var(--text-muted)]")}>{sublabel}</div>}
    </Link>
  );
}
