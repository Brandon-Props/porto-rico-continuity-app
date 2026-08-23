"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const TABS = [
  { href: "/today", label: "TODAY", icon: "☀" },
  { href: "/scenes", label: "SCENES", icon: "▤" },
  { href: "/camera", label: "CAMERA", icon: "◉", raised: true },
  { href: "/search", label: "SEARCH", icon: "⌕" },
  { href: "/more", label: "MORE", icon: "⋯" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-bottom sticky bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-lg items-end justify-between px-2 pt-1.5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          if ("raised" in tab && tab.raised) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-label={tab.label}
                className="relative -mt-6 flex flex-col items-center gap-1"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-3xl text-[var(--accent-contrast)] shadow-lg">
                  {tab.icon}
                </span>
                <span className="text-[10px] font-bold tracking-wide text-[var(--accent)]">{tab.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "tap-target flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-1",
                active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              )}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-bold tracking-wide">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
