import type { SyncOperation } from "@/types";

/**
 * The seam between the local-first app and a real backend. Everything in the app
 * writes to Dexie and enqueues a SyncOperation; this interface is the only thing
 * that needs an implementation once a backend exists (see SupabaseSyncProvider.ts
 * and supabase/migrations/0001_init.sql for the wiring this is built against).
 */
export interface SyncProvider {
  readonly name: string;
  /** Whether this provider has real credentials/config and can attempt network calls. */
  isConfigured(): boolean;
  /** Push one queued operation. Must be idempotent — retried pushes must not duplicate data. */
  push(op: SyncOperation): Promise<{ success: boolean; error?: string }>;
  /** Upload any photo images still waiting to reach cloud storage (see
   *  src/lib/sync/blobSync.ts). Optional — a provider with no blob storage of
   *  its own (or the offline no-op provider) simply omits this. */
  uploadPendingBlobs?(): Promise<void>;
}
