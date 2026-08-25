import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SyncOperation } from "@/types";
import type { SyncProvider } from "./SyncProvider";
import { toSnakeCase, toCamelCase } from "./caseTransform";
import { uploadPendingBlobs as uploadPendingBlobsImpl } from "./blobSync";
import { uploadPendingAnnotationBlobs as uploadPendingAnnotationBlobsImpl } from "./annotationBlobSync";

// Bumped by hand on every change to this file's push() logic. The error text
// this file produces looks identical across several recent fixes (same
// describeError/uid/jwt suffix shape), which made it impossible to tell from
// a screenshot alone whether a device was actually running new code or a
// stale cached bundle. src/app/(app)/sync/page.tsx displays this — if it
// doesn't match the value in this exact file, that device has not picked up
// the latest deploy yet, full stop, no need to interpret error text at all.
export const SYNC_PROVIDER_BUILD = "annotation-sync-v5";

/** A stuck network request previously had no way to give up, freezing that
 *  queue item on "syncing" forever and blocking everything behind it — no
 *  error, no retry, just a permanently spinning Sync Status screen. This
 *  guarantees push() always settles one way or the other. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

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
  const session = sessionData.session;
  // getSession() is supposed to auto-refresh a stale token on its own, but that
  // relies on a timer that a backgrounded/installed PWA doesn't reliably keep
  // running — a session created hours ago can come back here looking "present"
  // while its access token has actually already expired. Treat anything expired
  // or about to expire as not good enough, rather than trusting user?.id alone.
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const stillFresh = Boolean(session?.user?.id) && expiresAtMs > Date.now() + 30_000;
  if (stillFresh) return session!.user!.id;

  if (session?.user?.id) {
    // Same device identity, the token just needs renewing — refresh it instead
    // of signing in as a brand new anonymous user, which would silently orphan
    // this device's existing membership rows under an id nothing points to anymore.
    try {
      const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
      if (!refreshError && refreshed.session?.user?.id) {
        return refreshed.session.user.id;
      }
    } catch {
      /* fall through to a fresh sign-in below */
    }
  }

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
  // Column names deliberately don't match any real table column (see the
  // 0007 migration note) — join_production_by_code()'s RETURNS TABLE columns
  // used to be named production_id/role/etc., identical to real columns the
  // function's own INSERT touches, which made Postgres unable to tell the
  // two apart ("column reference production_id is ambiguous") the very first
  // time this function actually ran, despite it type-checking and deploying
  // fine — plpgsql doesn't catch that kind of collision until execution.
  return {
    productionId: row.joined_production_id as string,
    productionName: row.joined_production_name as string,
    memberId: row.joined_member_id as string,
    role: row.joined_role as string,
  };
}

/** Decisive test for the productions-insert mystery: everything we can check
 *  from the client (session exists, correct project, role=authenticated,
 *  sub present, token not expired, header explicitly forced) says the write
 *  should be allowed — yet it isn't. This calls a SQL-editor-defined function
 *  (see supabase/migrations/0004_debug_whoami.sql) that does nothing but ask
 *  Postgres to evaluate auth.uid() for real, in the exact same request context
 *  a table write would use, with no table or RLS policy involved at all. If
 *  this comes back null, the problem is server-side auth propagation, not
 *  anything in this app. If it comes back with a real id, the problem is
 *  specific to the productions table/policy itself. */
export async function debugWhoAmI(
  url: string,
  anonKey: string
): Promise<{ uid: string | null; roleName: string | null; error?: string }> {
  try {
    await ensureAnonymousSession(url, anonKey);
    const client = await getAuthedClient(url, anonKey);
    const { data, error } = await client.rpc("debug_whoami");
    if (error) return { uid: null, roleName: null, error: describeError(error) };
    const row = Array.isArray(data) ? data[0] : data;
    return { uid: row?.uid ?? null, roleName: row?.role_name ?? null };
  } catch (err) {
    return { uid: null, roleName: null, error: describeError(err) };
  }
}

/** Fetches every row belonging to a production from every synced table, keyed
 *  by the same entity names used elsewhere (enqueueSync, ENTITY_TO_TABLE) so the
 *  caller (see src/lib/sync/hydrate.ts) can merge each list into its Dexie
 *  table. This is the half of sync that never existed before — without it, a
 *  device joining an existing production only ever sees what IT creates.
 *
 *  `sinceIso`, when given, adds `updated_at > sinceIso` to every table's
 *  query — used by AppGuard's background polling so a device that's been
 *  sitting open doesn't re-download the entire production (236 scenes, every
 *  photo, ...) every ~25 seconds just to check for one new photo. Omit it
 *  for a full pull (cold app start, or the Sync screen's manual "Get Latest"
 *  button, which deliberately always does a full pull for peace of mind). */
export async function pullProductionData(
  url: string,
  anonKey: string,
  productionId: string,
  sinceIso?: string
): Promise<Record<string, Record<string, unknown>[]>> {
  await ensureAnonymousSession(url, anonKey);
  const client = await getAuthedClient(url, anonKey);
  const results: Record<string, Record<string, unknown>[]> = {};

  for (const [entity, table] of Object.entries(ENTITY_TO_TABLE)) {
    const filterColumn = table === "productions" ? "id" : "production_id";
    let query = client.from(table).select("*").eq(filterColumn, productionId).is("deleted_at", null);
    if (sinceIso) query = query.gt("updated_at", sinceIso);
    const { data, error } = await query;
    results[entity] = error ? [] : (data ?? []).map((row) => toCamelCase(row as Record<string, unknown>));
  }
  return results;
}

/** Fetches just the invite code for a production this device already knows
 *  about (used by the Settings screen so an admin can hand it to crew).
 *  Returns the real error instead of quietly collapsing every failure into
 *  the same generic "not available yet" — otherwise a genuinely broken case
 *  (RLS blocking the read, the row never having synced up at all, the
 *  invite_code column somehow still null) looks identical to the normal
 *  "just hasn't synced yet" case, with no way to tell them apart. */
export async function fetchInviteCode(
  url: string,
  anonKey: string,
  productionId: string
): Promise<{ code: string | null; error?: string }> {
  try {
    await ensureAnonymousSession(url, anonKey);
    const client = await getAuthedClient(url, anonKey);
    const { data, error } = await client.from("productions").select("invite_code").eq("id", productionId).maybeSingle();
    if (error) return { code: null, error: describeError(error) };
    if (!data) {
      return {
        code: null,
        error: `No "productions" row visible for id ${productionId} — either it hasn't synced up yet, or this device can't see it under the current membership.`,
      };
    }
    const code = (data as { invite_code: string | null }).invite_code;
    if (!code) return { code: null, error: "Row found, but its invite_code column is empty." };
    return { code };
  } catch (err) {
    return { code: null, error: describeError(err) };
  }
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
      // A hung fetch (bad signal, dropped connection mid-request) previously
      // had no way to give up — drain() awaits push() one item at a time, so
      // a single stuck request froze this item on "syncing" forever and
      // blocked every queued item behind it too, with no error ever shown.
      // Racing the whole attempt against a timeout guarantees it always
      // resolves one way or the other.
      await withTimeout(
        (async () => {
          await ensureAnonymousSession(this.url!, this.anonKey!);
          const supabase = await getAuthedClient(this.url!, this.anonKey!);
          if (op.op === "delete") {
            const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", op.entityId);
            if (error) throw error;
          } else if (op.op === "create") {
            // Root cause of every single "· create — 42501" error we've been
            // chasing: a bare upsert(..., {onConflict:"id"}) becomes, in
            // Postgres, "INSERT ... ON CONFLICT (id) DO UPDATE" — and
            // Postgres's row-level security requires the UPDATE policy to be
            // satisfiable for that statement shape even when no row actually
            // exists to conflict with yet. Every production-scoped table's
            // update policy requires already being a member of the
            // production — impossible for a brand new row nobody is a member
            // of yet. A plain insert only ever needs the INSERT policy — no
            // conflict-resolution mode to second-guess. If this exact row
            // already made it through on an earlier attempt, Postgres
            // reports a duplicate-key error (23505); treat that as success
            // rather than a real failure, since the row is already there
            // either way.
            const payload = toSnakeCase(op.payload as Record<string, unknown>);
            const { error } = await supabase.from(table).insert(payload);
            if (error && (error as { code?: string }).code !== "23505") throw error;
          } else {
            // A genuine update to a row the caller is already a member of —
            // the update policy's is_member_of(production_id) check is
            // appropriate here, unlike on a first-time create.
            const payload = toSnakeCase(op.payload as Record<string, unknown>);
            const { error } = await supabase.from(table).update(payload).eq("id", op.entityId);
            if (error) throw error;
          }
        })(),
        20000,
        "Sync request"
      );
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

  /** Delegates to blobSync.ts — kept as a thin method here so SyncEngine.drain()
   *  can call it through the same SyncProvider interface every other push goes
   *  through, without needing to know Supabase Storage is involved at all. */
  async uploadPendingBlobs(): Promise<void> {
    if (!this.url || !this.anonKey) return;
    await uploadPendingBlobsImpl(this.url, this.anonKey);
    await uploadPendingAnnotationBlobsImpl(this.url, this.anonKey);
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
