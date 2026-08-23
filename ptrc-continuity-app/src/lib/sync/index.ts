import { NoopSyncProvider } from "./NoopSyncProvider";
import { SupabaseSyncProvider } from "./SupabaseSyncProvider";
import type { SyncProvider } from "./SyncProvider";

const ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const LOCAL_URL_KEY = "ptrc.supabaseUrl";
const LOCAL_ANON_KEY = "ptrc.supabaseAnonKey";

/** Settings screen lets you paste credentials without a redeploy; env vars still win if set. */
export function getSupabaseOverride(): { url: string; anonKey: string } | null {
  if (typeof window === "undefined") return null;
  const url = window.localStorage.getItem(LOCAL_URL_KEY);
  const anonKey = window.localStorage.getItem(LOCAL_ANON_KEY);
  return url && anonKey ? { url, anonKey } : null;
}

export function setSupabaseOverride(url: string, anonKey: string) {
  window.localStorage.setItem(LOCAL_URL_KEY, url);
  window.localStorage.setItem(LOCAL_ANON_KEY, anonKey);
}

export function clearSupabaseOverride() {
  window.localStorage.removeItem(LOCAL_URL_KEY);
  window.localStorage.removeItem(LOCAL_ANON_KEY);
}

/**
 * Pick the sync backend at runtime. Set the two env vars (redeploy) for a permanent
 * config, or paste them into Settings for a quick local test — nothing else changes.
 */
export function getActiveSyncProvider(): SyncProvider {
  const override = getSupabaseOverride();
  const url = ENV_URL ?? override?.url;
  const anonKey = ENV_KEY ?? override?.anonKey;
  if (url && anonKey) {
    return new SupabaseSyncProvider(url, anonKey);
  }
  return new NoopSyncProvider();
}
