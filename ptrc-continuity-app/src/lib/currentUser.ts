"use client";

// No backend auth is wired up yet (see ARCHITECTURE.md §9 risks). Until Supabase Auth
// is connected, "who is using this device" is a local profile the crew member sets once,
// stored outside Dexie so it's readable synchronously before the DB is even open.

import type { LocalUser } from "@/types";
import { db } from "@/db/schema";

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
  // Mirror into IndexedDB too — belt and suspenders against the specific
  // failure mode of "localStorage got cleared but IndexedDB (productions,
  // scenes, photos) didn't," which iOS's storage-eviction behavior can
  // produce (see tryRecoverCurrentUserFromDb). Fire-and-forget: this must
  // never block or throw into a caller that assumes setCurrentUser is sync.
  db.localUsers.put(user).catch(() => {});
  return user;
}

export function signOutLocalUser() {
  cached = null;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Recovery path for a device that wakes up looking logged-out (the Login
 * screen) even though it was already set up. localStorage and IndexedDB are
 * technically separate storage areas — a partial eviction (localStorage
 * cleared, IndexedDB intact) shows up as this exact symptom: db.productions
 * still has "Porto Rico" and everything in it, but getCurrentUser() reads
 * null because ptrc.currentUser is gone. Rather than making someone notice
 * and re-enter their name (which creates a *second*, unrelated local user
 * id — harmless for solo use, but confusing), silently restore the most
 * recently used profile from Dexie if one exists. If IndexedDB was wiped
 * too, this legitimately finds nothing and the normal Login screen is still
 * exactly right.
 */
export async function tryRecoverCurrentUserFromDb(): Promise<LocalUser | null> {
  if (getCurrentUser()) return getCurrentUser();
  try {
    const all = await db.localUsers.toArray();
    if (all.length === 0) return null;
    const mostRecent = all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    cached = mostRecent;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mostRecent));
    return mostRecent;
  } catch {
    return null;
  }
}
