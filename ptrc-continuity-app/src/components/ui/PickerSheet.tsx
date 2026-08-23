"use client";

import { useMemo, useState } from "react";
import { Button } from "./Button";

export interface PickerItem {
  id: string;
  label: string;
  sublabel?: string;
}

export function PickerSheet({
  open,
  title,
  items,
  onSelect,
  onClose,
  onCreateNew,
  createLabel = "Create new",
  selectedId,
}: {
  open: boolean;
  title: string;
  items: PickerItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
  onCreateNew?: (label: string) => void;
  createLabel?: string;
  selectedId?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.sublabel?.toLowerCase().includes(q));
  }, [items, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="safe-bottom flex max-h-[85vh] flex-col rounded-t-3xl bg-[var(--surface)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--border)]" />
        <h2 className="mb-3 text-lg font-bold text-[var(--text)]">{title}</h2>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="tap-target mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-base text-[var(--text)] outline-none"
        />
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">No matches.</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className={`tap-target flex w-full flex-col items-start rounded-xl border px-4 py-3 text-left ${
                    selectedId === item.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border)] bg-[var(--bg)]"
                  }`}
                >
                  <span className="text-base font-semibold text-[var(--text)]">{item.label}</span>
                  {item.sublabel && <span className="text-xs text-[var(--text-muted)]">{item.sublabel}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {onCreateNew && query.trim() && !filtered.some((i) => i.label.toLowerCase() === query.trim().toLowerCase()) && (
          <Button
            variant="secondary"
            fullWidth
            className="mt-3"
            onClick={() => {
              onCreateNew(query.trim());
              onClose();
            }}
          >
            + {createLabel} &ldquo;{query.trim()}&rdquo;
          </Button>
        )}
        <Button variant="ghost" fullWidth className="mt-2" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
