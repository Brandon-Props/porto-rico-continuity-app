import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SyncOperation } from "@/types";
import type { SyncProvider } from "./SyncProvider";
import { toSnakeCase, toCamelCase } from "./caseTransform";

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

// One client per (url, key) pair for the life of the tab — supabase-js persists
// the auth session (including the anonymous one, see ensureAnonymousSession) to
// localStorage itself, so a fresh instance still picks up an existing session.
let cachedClient: SupabaseClient | null = null;
let cachedFingerprint: string | null = null;

function getClient(url: string, anonKey: string): SupabaseClient {
  const fingerprint = `${url}|${anonKey}`;
  if (!cachedClient || cachedFingerprint !== fingerprint) {
    cachedClient = createClient(url, anonKey);
    cachedFingerprint = fingerprint;
  }
  return cachedClient;
}

/**
 * There is no email/password login in this app (see src/lib/currentUser.ts —
 * "who's using this device" is just a local name). But Postgres row security
 * (supabase/migrations) is keyed off `auth.uid()`, so every device still needs
 * *some* real, stable Supabase Auth identity for `is_member_of()` to check
 * against. An anonymous session is that identity: invisible to the crew member,
 * but a real auth.uid() from Supabase's perspective.
 *
 * Requires "Allow anonymous sign-ins" turned on in the Supabase project's
 * Authentication settings — off by default on a new project.
 */
// Several parts of the app (background sync on load, the queue drain, Settings)
// can all call ensureAnonymousSession within the same instant before any of them
// has a session yet. Without sharing one in-flight sign-in, each caller saw "no
// session" and called signInAnonymously() independently — creating a separate
// throwaway anonymous auth.users row per caller instead of one identity for the
// device, and leaving it up to timing which session actually ended up persisted.
let inFlightAnonSignIn: Promise<string> | null = null;

export async function ensureAnonymousSession(url: string, anonKey: string): Promise<string> {
  const client = getClient(url, anonKey);
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user?.id) return sessionData.session.user.id;

  if (!inFlightAnonSignIn) {
    inFlightAnonSignIn = client.auth
      .signInAnonymously()
      .then(({ data, error }) => {
        if (error || !data.user) {
          throw new Error(
            error?.message ??
              "Could not start a Supabase session. In your Supabase project, go to Authentication → Sign In / Providers and turn on \"Allow anonymous sign-ins\"."
          );
        }
        return data.user.id;
      })
      .finally(() => {
        inFlightAnonSignIn = null;
      });
  }
  return inFlightAnonSignIn;
}

// The confirmed puzzle: a real, valid anonymous session exists (proven — its uid
// shows up in auth.users AND in the failed-push diagnostic above), yet a
// trivial `auth.uid() is not null` check still fails server-side. The only
// thing that reconciles both facts is that the actual REST request isn't
// carrying that session's JWT as its Authorization header — supabase-js is
// supposed to keep a client's ambient header in sync with its current session
// automatically, but apparently isn't doing so reliably here (most likely
// because more than one client/module instance ends up in play — see the
// getClient cache above and the race this file already works around once).
// Rather than depend on that ambient behavior, stamp the access token onto
// the request explicitly every time, so it cannot be stale or missing.
let authedClientCache: { token: string; client: SupabaseClient } | null = null;

async function getAuthedClient(url: string, anonKey: string): Promise<SupabaseClient> {
  const base = getClient(url, anonKey);
  const { data } = await base.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return base; // caller already ran ensureAnonymousSession; let it fail naturally if truly no session
  if (authedClientCache?.token === token) return authedClientCache.client;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  authedClientCache = { token, client };
  return client;
}

export interface JoinedProduction {
  productionId: string;
  productionName: string;
  memberId: string;
  role: string;
}

/** Calls the join_production_by_code(...) function from
 *  supabase/migrations/0002_invites_and_auth.sql — it validates the code and
 *  creates the crew member's membership row server-side (bypassing RLS via
 *  SECURITY DEFINER), so is_member_of() passes immediately, before this device
 *  has pushed or pulled anything. */
export async function joinProductionByCode(
  url: string,
  anonKey: string,
  code: string,
  displayName: string
): Promise<JoinedProduction> {
  await ensureAnonymousSession(url, anonKey);
  const client = await getAuthedClient(url, anonKey);
  const { data, error } = await client.rpc("join_production_by_code", {
    p_code: code.trim(),
    p_display_name: displayName,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("That invite code didn't match a production.");
  return {
    productionId: row.production_id as string,
    productionName: row.production_name as string,
    memberId: row.member_id as string,
    role: row.role as string,
  };
}

/** Fetches every row belonging to a production from every synced table, keyed
 *  by the same entity names used elsewhere (enqueueSync, ENTITY_TO_TABLE) so the
 *  caller (see src/lib/sync/hydrate.ts) can merge each list into its Dexie
 *  table. This is the half of sync that never existed before — without it, a
 *  device joining an existing production only ever sees what IT creates. */
export async function pullProductionData(
  url: string,
  anonKey: string,
  productionId: string
): Promise<Record<string, Record<string, unknown>[]>> {
  await ensureAnonymousSession(url, anonKey);
  const client = await getAuthedClient(url, anonKey);
  const results: Record<string, Record<string, unknown>[]> = {};

  for (const [entity, table] of Object.entries(ENTITY_TO_TABLE)) {
    const filterColumn = table === "productions" ? "id" : "production_id";
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq(filterColumn, productionId)
      .is("deleted_at", null);
    results[entity] = error ? [] : (data ?? []).map((row) => toCamelCase(row as Record<string, unknown>));
  }
  return results;
}

/** Fetches just the invite code for a production this device already knows
 *  about (used by the Settings screen so an admin can hand it to crew). */
export async function fetchInviteCode(
  url: string,
  anonKey: string,
  productionId: string
): Promise<string | null> {
  await ensureAnonymousSession(url, anonKey);
  const client = await getAuthedClient(url, anonKey);
  const { data, error } = await client.from("productions").select("invite_code").eq("id", productionId).maybeSingle();
  if (error || !data) return null;
  return (data as { invite_code: string | null }).invite_code;
}

/**
 * Fill in once you have a Supabase project: set NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, then flip the provider in lib/sync/index.ts.
 * Photo blob upload (to Supabase Storage) is intentionally left as a follow-up —
 * this handles the row-level sync; storage upload hooks into the same push() call
 * once a bucket exists (see ARCHITECTURE.md §6 for the intended path layout).
 */
export class SupabaseSyncProvider implements SyncProvider {
  readonly name = "supabase";

  constructor(private url?: string, private anonKey?: string) {}

  isConfigured(): boolean {
    return Boolean(this.url && this.anonKey);
  }

  async push(op: SyncOperation): Promise<{ success: boolean; error?: string }> {
    if (!this.url || !this.anonKey) return { success: false, error: "Supabase not configured" };
    const table = ENTITY_TO_TABLE[op.entityTable];
    if (!table) return { success: false, error: `No table mapping for ${op.entityTable}` };

    try {
      await ensureAnonymousSession(this.url, this.anonKey);
      const supabase = await getAuthedClient(this.url, this.anonKey);
      if (op.op === "delete") {
        const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", op.entityId);
        if (error) throw error;
      } else {
        // Idempotent upsert keyed by the client-generated UUID — retries never
        // duplicate data (spec §59). Dexie's camelCase record has to become the
        // snake_case row Postgres actually has columns for first.
        const payload = toSnakeCase(op.payload as Record<string, unknown>);
        const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
        if (error) throw error;
      }
      return { success: true };
    } catch (err) {
      // Prove, at the exact moment of the failing request, whether this device
      // actually has a session and which user it is — rather than continuing to
      // guess from outside the app while a plain "auth.uid() is not null" check
      // keeps failing for reasons that aren't visible from the Supabase dashboard.
      let uid = "NONE";
      let jwtInfo = "";
      try {
        const { data: sessionCheck } = await getClient(this.url, this.anonKey).auth.getSession();
        uid = sessionCheck.session?.user?.id ?? "NONE";
        const token = sessionCheck.session?.access_token;
        // The uid above only proves the app THINKS it's signed in. Decoding the
        // actual JWT the request just sent shows what Postgres itself saw: is
        // there really a `sub` claim, is `role` really "authenticated", and —
        // most likely culprit for a session that's been sitting around since
        // yesterday — has it quietly expired without a fresh one replacing it.
        if (token) {
          const claims = decodeJwtPayload(token);
          if (claims) {
            const role = String(claims.role ?? "?");
            const sub = String(claims.sub ?? "?");
            const expNum = typeof claims.exp === "number" ? claims.exp : null;
            const expStr = expNum ? new Date(expNum * 1000).toISOString() : "?";
            const expired = expNum !== null && expNum * 1000 < Date.now();
            jwtInfo = ` [jwt role=${role} sub=${sub} exp=${expStr}${expired ? " EXPIRED" : ""}]`;
          } else {
            jwtInfo = " [jwt: could not decode]";
          }
        } else {
          jwtInfo = " [jwt: no access_token on session]";
        }
      } catch {
        uid = "unknown";
      }
      return { success: false, error: `${describeError(err)} (signed in as: ${uid})${jwtInfo}` };
    }
  }
}

/** Pulls the payload (claims) out of a JWT without verifying its signature —
 *  this only ever runs on our own already-issued session token, purely to show
 *  what's actually inside it (role / sub / expiry) when a request using it
 *  still gets rejected. Not for trust decisions, just for on-screen diagnosis. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Supabase's own errors (PostgrestError, AuthError) aren't always real Error
 *  instances, so `String(err)` was collapsing them to the useless "[object
 *  Object]" seen in the Sync screen. Pull the actual message (and any
 *  Postgres hint/code) out no matter what shape the thrown value is. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const parts = [obj.message, obj.hint, obj.code].filter((v) => typeof v === "string" && v.length > 0);
    if (parts.length > 0) return parts.join(" — ");
    try {
      return JSON.stringify(obj);
    } catch {
      /* fall through */
    }
  }
  return String(err);
}
