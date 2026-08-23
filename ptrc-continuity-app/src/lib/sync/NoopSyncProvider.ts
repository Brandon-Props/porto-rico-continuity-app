import type { SyncProvider } from "./SyncProvider";

/**
 * Current default provider: no backend is configured yet. It deliberately does NOT
 * pretend to sync — items stay honestly "pending" so the Sync Queue screen never lies
 * about whether a photo has left the device. Swap this for SupabaseSyncProvider once
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are set (see lib/sync/index.ts).
 */
export class NoopSyncProvider implements SyncProvider {
  readonly name = "none";

  isConfigured(): boolean {
    return false;
  }

  async push(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: "No sync backend configured yet." };
  }
}
