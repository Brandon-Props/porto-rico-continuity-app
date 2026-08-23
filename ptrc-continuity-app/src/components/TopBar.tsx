"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ConnectionBadge } from "./ConnectionBadge";

export function TopBar({
  title,
  back,
  right,
}: {
  title: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2 backdrop-blur">
      {back && (
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="tap-target flex items-center justify-center rounded-full text-xl text-[var(--text)]"
        >
          ←
        </button>
      )}
      <h1 className="flex-1 truncate text-lg font-bold text-[var(--text)]">{title}</h1>
      <div className="flex items-center gap-2">
        {right}
        <ConnectionBadge compact />
      </div>
    </header>
  );
}
