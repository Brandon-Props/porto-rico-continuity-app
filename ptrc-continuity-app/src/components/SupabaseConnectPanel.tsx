"use client";

// A brand-new device has no production open yet, and Settings (where this
// used to be the only place to paste Supabase credentials) lives inside the
// (app) route group, which AppGuard only lets you into once a production is
// already active — a chicken-and-egg problem that forced Brandon to create a
// throwaway production just to reach Settings, connect Supabase, delete the
// throwaway, and only then actually join the real one. This panel is the same
// "paste your Supabase URL + anon key" UI as Settings, but usable from /join
// (and anywhere else pre-production) so that workaround is never needed again.
//
// Longer term, the real fix is for NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_ANON_KEY to be set as actual Vercel environment
// variables — then every device, including a brand new one, is connected
// automatically from its very first screen and never sees this panel at all.
// This panel is the fallback for whenever that hasn't happened yet.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getSupabaseOverride, setSupabaseOverride, clearSupabaseOverride, getActiveSyncProvider } from "@/lib/sync";

/** Catches the two mistakes that are easy to make copying these values in a
 *  hurry on a phone keyboard: pasting them into the swapped boxes, or pasting
 *  a URL that already has extra path on the end (a doubled trailing slash, or
 *  a whole extra "/rest/v1"-style segment) — either one produces a working-
 *  looking Save button followed by a cryptic "Invalid path specified in
 *  request URL" the moment the app actually tries to use it. */
function checkFormat(url: string, key: string): string | null {
  if (!url || !key) return null;
  if (/^eyJ/.test(url)) return "That URL box looks like it has the anon key in it — check the two boxes aren't swapped.";
  if (/^https?:\/\//i.test(key)) return "That key box looks like it has the project URL in it — check the two boxes aren't swapped.";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    return 'The URL should look exactly like "https://xxxxxxxx.supabase.co" — nothing extra before or after it.';
  }
  return null;
}

export function SupabaseConnectPanel({ onConnected }: { onConnected?: () => void }) {
  const existingOverride = getSupabaseOverride();
  const [url, setUrl] = useState(existingOverride?.url ?? "");
  const [key, setKey] = useState(existingOverride?.anonKey ?? "");
  const provider = getActiveSyncProvider();
  const trimmedUrlPreview = url.trim().replace(/\/+$/, "");
  const formatWarning = checkFormat(trimmedUrlPreview, key.trim());

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--text-muted)]">
        Currently: <span className="font-semibold text-[var(--text)]">{provider.isConfigured() ? "connected" : "not connected — local only"}</span>.
        Paste your Supabase project URL and anon key below. Whoever set up the production has these already — ask
        them, or find them in your own Settings screen&apos;s Cloud Sync section on a device that&apos;s already connected.
      </p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://xxxx.supabase.co"
        autoCapitalize="none"
        autoCorrect="off"
        className="tap-target rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-sm text-[var(--text)] outline-none"
      />
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="anon public key"
        autoCapitalize="none"
        autoCorrect="off"
        className="tap-target rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-sm text-[var(--text)] outline-none"
      />
      {formatWarning && (
        <p className="text-xs font-semibold text-amber-500">⚠ {formatWarning}</p>
      )}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            clearSupabaseOverride();
            setUrl("");
            setKey("");
            window.location.reload();
          }}
        >
          Clear
        </Button>
        <Button
          fullWidth
          onClick={() => {
            // Trim whitespace and any trailing slash(es) — a pasted URL like
            // "https://xxxx.supabase.co/" (or with the slash doubled by an
            // autocomplete) makes every request path underneath it malformed,
            // surfacing as a cryptic "Invalid path specified in request URL"
            // error from Supabase's Auth API instead of anything obviously
            // about the URL itself.
            const trimmedUrl = url.trim().replace(/\/+$/, "");
            const trimmedKey = key.trim();
            if (!trimmedUrl || !trimmedKey) return;
            setSupabaseOverride(trimmedUrl, trimmedKey);
            onConnected?.();
            window.location.reload();
          }}
        >
          Save & Connect
        </Button>
      </div>
    </div>
  );
}
