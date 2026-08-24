-- PTRC Continuity — allow photo blob uploads to actually succeed
--
-- src/lib/sync/blobSync.ts uploads each photo variant with { upsert: true }.
-- Supabase Storage implements that as "INSERT ... ON CONFLICT (bucket_id,
-- name) DO UPDATE" on storage.objects — the exact same statement shape that
-- caused every single row-level "create" to fail with 42501 earlier (see the
-- productions/production_members INSERT-policy fix in this migration
-- history): Postgres requires the UPDATE policy to be satisfiable for that
-- statement shape even when no row actually conflicts yet. 0001_init.sql only
-- ever gave storage.objects a SELECT policy and an INSERT policy — with no
-- UPDATE policy at all, this same failure would have hit every photo upload,
-- not just retries, the very first time a device tried to upload one.
--
-- Caught here before shipping the photo-upload feature rather than after a
-- device hit it.

create policy "members can update their production's photos"
  on storage.objects for update
  using (
    bucket_id = 'continuity-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'continuity-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  );
