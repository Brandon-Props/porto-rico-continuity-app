"use client";

// No backend auth is wired up yet (see ARCHITECTURE.md §9 risks). Until Supabase Auth
// is connected, "who is using this device" is a local profile the crew member sets once,
// stored outside Dexie so it's readable synchronously before the DB is even open.

import type { LocalUser } from "@/types";

const STORAGE_KEY = "ptrc.currentUser";
const AVATAR_COLORS = ["#f5a623", "#4caf7d", "#5b8def", "#e05d5d", "#b07de0", "#3fb6c9"];

let cached: LocalUser | null | undefined;

export function getCurrentUser(): LocalUser | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as LocalUser) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function setCurrentUser(displayName: string, email?: string): LocalUser {
  const existing = getCurrentUser();
  const user: LocalUser = existing
    ? { ...existing, displayName, email }
    : {
        id: crypto.randomUUID(),
        displayName,
        email,
        color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        createdAt: new Date().toISOString(),
      };
  cached = user;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  return user;
}

export function signOutLocalUser() {
  cached = null;
  window.localStorage.removeItem(STORAGE_KEY);
}
