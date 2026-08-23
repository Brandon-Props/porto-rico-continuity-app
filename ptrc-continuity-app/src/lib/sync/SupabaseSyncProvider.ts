import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SyncOperation } from "@/types";
import type { SyncProvider } from "./SyncProvider";

// Table names line up 1:1 with supabase/migrations/0001_init.sql.
const ENTITY_TO_TABLE: Record<string, string> = {
  productions: "productions",
  production_members: "production_members",
  shoot_days: "shoot_days",
  scenes: "scenes",
  scene_schedule_entries: "scene_schedule_entries",
  shots: "shots",
  takes: "takes",
  photos: "photos",
  photo_annotations: "photo_annotations",
  continuity_notes: "continuity_notes",
  props: "props",
  characters: "characters",
};

/**
 * Fill in once you have a Supabase project: set NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, then flip the provider in lib/sync/index.ts.
 * Photo blob upload (to Supabase Storage) is intentionally left as a follow-up —
 * this handles the row-level sync; storage upload hooks into the same push() call
 * once a bucket exists (see ARCHITECTURE.md §6 for the intended path layout).
 */
export class SupabaseSyncProvider implements SyncProvider {
  readonly name = "supabase";
  private client: SupabaseClient | null = null;

  constructor(private url?: string, private anonKey?: string) {}

  isConfigured(): boolean {
    return Boolean(this.url && this.anonKey);
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      if (!this.url || !this.anonKey) throw new Error("Supabase not configured");
      this.client = createClient(this.url, this.anonKey);
    }
    return this.client;
  }

  async push(op: SyncOperation): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: "Supabase not configured" };
    const table = ENTITY_TO_TABLE[op.entityTable];
    if (!table) return { success: false, error: `No table mapping for ${op.entityTable}` };

    try {
      const supabase = this.getClient();
      if (op.op === "delete") {
        const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", op.entityId);
        if (error) throw error;
      } else {
        // Idempotent upsert keyed by the client-generated UUID — retries never duplicate (spec §59).
        const { error } = await supabase.from(table).upsert(op.payload as Record<string, unknown>, { onConflict: "id" });
        if (error) throw error;
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
