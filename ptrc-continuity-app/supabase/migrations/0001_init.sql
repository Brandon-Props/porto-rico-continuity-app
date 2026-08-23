-- PTRC Continuity — initial schema
-- Mirrors src/db/schema.ts (Dexie) 1:1 so the SyncProvider swap in
-- src/lib/sync/index.ts is a config change, not a rebuild. See ARCHITECTURE.md.
--
-- Run with: supabase db push   (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- Helper: current authenticated user's id, for RLS policies below.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function current_app_user_id() returns uuid
  language sql stable
as $$
  select auth.uid()
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Core tables
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists productions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null,
  status text not null default 'active' check (status in ('active', 'wrapped', 'archived')),
  settings_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

create table if not exists production_members (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  role text not null check (role in ('admin', 'prop_master', 'asst_prop_master', 'continuity', 'crew', 'read_only')),
  permissions_json jsonb,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1,
  unique (production_id, user_id)
);

create table if not exists shoot_days (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  day_number integer not null,
  shoot_date date not null,
  unit_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1,
  unique (production_id, day_number)
);

create table if not exists scenes (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  scene_number text not null, -- "36", "24A", "12A-1", "101PT" — text, never assume integer
  scene_part text,
  description text not null default '',
  script_day text,
  int_ext text check (int_ext in ('INT', 'EXT', 'INT/EXT')),
  day_night text check (day_night in ('DAY', 'NIGHT', 'DUSK', 'DAWN')),
  location text,
  set_name text,
  status text not null default 'not_shot' check (status in
    ('not_shot','scheduled','in_progress','partially_shot','completed','pickup_required','reshoot','hold')),
  cast_json jsonb,
  background_json text,
  vehicles_json text,
  sfx_json text,
  vfx_json text,
  notes text,
  prop_ids uuid[] not null default '{}',
  character_ids uuid[] not null default '{}',
  actual_shoot_day_id uuid references shoot_days(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1,
  unique (production_id, scene_number)
);

create table if not exists scene_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  scene_id uuid not null references scenes(id) on delete cascade,
  shoot_day_id uuid not null references shoot_days(id) on delete cascade,
  unit text,
  order_index integer not null default 0,
  dropped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

create table if not exists shots (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  scene_id uuid not null references scenes(id) on delete cascade,
  name text not null,
  camera_label text,
  order_index integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

create table if not exists takes (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  shot_id uuid not null references shots(id) on delete cascade,
  take_number integer not null,
  print_flag boolean not null default false,
  circle_flag boolean not null default false,
  ng_flag boolean not null default false,
  continuity_lock boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  scene_id uuid not null references scenes(id) on delete cascade,
  shot_id uuid references shots(id),
  take_id uuid references takes(id),
  original_storage_path text, -- Supabase Storage: production/{id}/photos/{photoId}/original.jpg
  display_storage_path text,
  thumb_storage_path text,
  category text not null default 'Other',
  camera_device_label text,
  taken_by uuid,
  taken_at timestamptz not null default now(),
  pinned boolean not null default false,
  flags text[] not null default '{}',
  continuity_status text,
  direction_angle text,
  notes text,
  references_photo_id uuid references photos(id),
  prop_ids uuid[] not null default '{}',
  character_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

create table if not exists photo_annotations (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  layer_storage_path text,
  tool_type text check (tool_type in ('arrow','circle','rectangle','freehand','text')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

create table if not exists continuity_notes (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  scope_type text not null check (scope_type in ('scene','shot','take','photo')),
  scope_id uuid not null,
  body text not null,
  author_id uuid,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

create table if not exists props (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  name text not null,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  name text not null,
  actor_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  rev integer not null default 1
);

-- Conflict shadow table (ARCHITECTURE.md §5): a losing concurrent write lands here
-- instead of being dropped, and an admin resolves it from the Sync Conflicts screen.
create table if not exists conflict_versions (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  conflicting_payload jsonb not null,
  submitted_by uuid,
  submitted_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid,
  resolved_at timestamptz
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  actor_id uuid,
  actor_name text,
  action text not null,
  entity_table text not null,
  entity_id uuid not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists deleted_items (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  deleted_by uuid,
  deleted_by_name text,
  deleted_at timestamptz not null default now(),
  restorable boolean not null default true,
  snapshot_json jsonb not null
);

-- ─────────────────────────────────────────────────────────────────────────
-- Indexes for the query patterns the app actually uses
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists idx_scenes_production on scenes(production_id) where deleted_at is null;
create index if not exists idx_photos_scene on photos(scene_id) where deleted_at is null;
create index if not exists idx_photos_shot on photos(shot_id) where deleted_at is null;
create index if not exists idx_photos_take on photos(take_id) where deleted_at is null;
create index if not exists idx_photos_props on photos using gin(prop_ids);
create index if not exists idx_photos_characters on photos using gin(character_ids);
create index if not exists idx_schedule_entries_day on scene_schedule_entries(shoot_day_id) where deleted_at is null;
create index if not exists idx_notes_scope on continuity_notes(scope_type, scope_id) where deleted_at is null;
create index if not exists idx_activity_production on activity_log(production_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security: a user only ever sees productions they're a member of
-- (spec §43). Enable RLS everywhere and gate through production_members.
-- ─────────────────────────────────────────────────────────────────────────
alter table productions enable row level security;
alter table production_members enable row level security;
alter table shoot_days enable row level security;
alter table scenes enable row level security;
alter table scene_schedule_entries enable row level security;
alter table shots enable row level security;
alter table takes enable row level security;
alter table photos enable row level security;
alter table photo_annotations enable row level security;
alter table continuity_notes enable row level security;
alter table props enable row level security;
alter table characters enable row level security;
alter table activity_log enable row level security;

create or replace function is_member_of(p_production_id uuid) returns boolean
  language sql stable security definer
as $$
  select exists (
    select 1 from production_members
    where production_id = p_production_id
      and user_id = current_app_user_id()
      and deleted_at is null
  )
$$;

create policy "members can read their productions" on productions
  for select using (is_member_of(id));
create policy "members can update their productions" on productions
  for update using (is_member_of(id));
create policy "authenticated users can create productions" on productions
  for insert with check (auth.uid() is not null);

create policy "members can read membership rows" on production_members
  for select using (is_member_of(production_id));
create policy "admins manage membership" on production_members
  for all using (
    exists (
      select 1 from production_members m
      where m.production_id = production_members.production_id
        and m.user_id = current_app_user_id()
        and m.role = 'admin'
    )
  );

-- Every production-scoped table follows the same read/write-if-member shape.
do $$
declare
  t text;
begin
  foreach t in array array[
    'shoot_days','scenes','scene_schedule_entries','shots','takes',
    'photos','photo_annotations','continuity_notes','props','characters','activity_log'
  ]
  loop
    execute format(
      'create policy "members can read %1$s" on %1$s for select using (is_member_of(production_id));',
      t
    );
    execute format(
      'create policy "members can write %1$s" on %1$s for insert with check (is_member_of(production_id));',
      t
    );
    execute format(
      'create policy "members can update %1$s" on %1$s for update using (is_member_of(production_id));',
      t
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Storage: private bucket for photo blobs, mirrored per production/photo id
-- (see ARCHITECTURE.md §6 for the path layout). Never expose photos publicly (spec §43).
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('continuity-photos', 'continuity-photos', false)
on conflict (id) do nothing;

create policy "members can read their production's photos"
  on storage.objects for select
  using (
    bucket_id = 'continuity-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  );

create policy "members can upload to their production's folder"
  on storage.objects for insert
  with check (
    bucket_id = 'continuity-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  );
