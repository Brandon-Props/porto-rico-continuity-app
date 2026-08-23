# PTRC Continuity

Offline-first continuity photo and scene tracking for film production crews. Read
`ARCHITECTURE.md` first — it covers the schema, offline model, and sync design this
README assumes.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 on your phone (same network) or desktop. Install it as a
PWA from the browser's "Add to Home Screen" / install-app prompt to get the full
standalone, offline-capable experience — a plain browser tab also works for testing.

## What works right now

Everything is stored in IndexedDB on the device (via Dexie) — there is no backend
required to use the app. You can create a production, import or hand-enter a
schedule, shoot continuity photos scene/shot/take, annotate them, pin master
continuity, search, and export — all offline, on one device.

## Turning on multi-device sync

1. Create a free project at supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
3. Grab your project URL and `anon` public key from Project Settings → API.
4. Either:
   - Paste them into the app's Settings screen (instant, no redeploy — good for
     testing), or
   - Copy `.env.example` to `.env.local`, fill in the two values, and redeploy
     (permanent, works for every device pointed at that deployment).
5. Reload. The Sync Status screen should now show `LOCAL ONLY` flip to a real
   sync state instead.

Note: the current `SupabaseSyncProvider` (see `src/lib/sync/SupabaseSyncProvider.ts`)
syncs table rows. Uploading the actual photo Blobs to Supabase Storage is the next
piece of wiring — the bucket and RLS policies for it already exist in the migration
(`continuity-photos`, keyed by `production_id/photos/{photoId}/{variant}.jpg`), but
the provider doesn't push bytes yet. Until that's added, photo *metadata* syncs
across devices but the image files themselves stay device-local — plan on adding
that upload step before relying on this for real multi-device photo sharing.

## Deploying

The app is a standard Next.js app — deploys to Vercel with no special configuration
(`vercel deploy`, or connect the repo in the Vercel dashboard). Any Node hosting
that supports Next.js works too.

## Project structure

See `ARCHITECTURE.md` §8 for the annotated folder layout, and §9 for known risks
and things to test before trusting this in production (iOS storage quotas, camera
API fallbacks, and — especially — real two-device conflict scenarios once sync is
wired up).
