-- PTRC Continuity — invite codes + anonymous-auth crew join
--
-- Adds what 0001_init.sql deferred: a way for a crew member's device to become
-- a real, RLS-recognized member of a production without any email/password
-- login. Each device signs in anonymously (invisible to the crew member — see
-- ensureAnonymousSession in src/lib/sync/SupabaseSyncProvider.ts) and then
-- "joins" a production by typing in a 6-character code, which this migration's
-- join_production_by_code() function turns into a real production_members row.
--
-- REQUIRED MANUAL STEP: in the Supabase dashboard, go to
-- Authentication -> Sign In / Providers, and turn on "Allow anonymous sign-ins".
-- It's off by default on a new project; without it every sync push/pull in the
-- app will fail with an auth error.
--
-- Run with: paste into the Supabase SQL editor and Run (same as 0001_init.sql).

-- ─────────────────────────────────────────────────────────────────────────
-- Invite codes
-- ─────────────────────────────────────────────────────────────────────────

alter table productions add column if not exists invite_code text;

create or replace function generate_invite_code() returns text
  language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I — easier to read aloud on set
  code text;
  tries int := 0;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from productions where invite_code = code);
    tries := tries + 1;
    if tries > 20 then
      raise exception 'Could not generate a unique invite code — try again';
    end if;
  end loop;
  return code;
end;
$$;

create or replace function set_invite_code() returns trigger
  language plpgsql as $$
begin
  if new.invite_code is null then
    new.invite_code := generate_invite_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_invite_code on productions;
create trigger trg_set_invite_code
  before insert on productions
  for each row execute function set_invite_code();

-- Backfill any productions created before this migration (e.g. yours already).
update productions set invite_code = generate_invite_code() where invite_code is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'productions_invite_code_key'
  ) then
    alter table productions add constraint productions_invite_code_key unique (invite_code);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Self-join RPC — the only way a new production_members row can be created by
-- someone other than an existing admin (see 0001_init.sql's "admins manage
-- membership" policy). SECURITY DEFINER runs this with the table owner's
-- privileges, bypassing RLS *inside this function only* — the code lookup is
-- the gate, not table-level permissions.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function join_production_by_code(p_code text, p_display_name text)
returns table (production_id uuid, production_name text, member_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_production productions%rowtype;
  v_member production_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to join a production';
  end if;

  select * into v_production from productions
    where upper(invite_code) = upper(trim(p_code)) and deleted_at is null;
  if not found then
    raise exception 'Invalid invite code';
  end if;

  insert into production_members (id, production_id, user_id, display_name, role, permissions_json, joined_at)
  values (gen_random_uuid(), v_production.id, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Crew'), 'crew', '{}'::jsonb, now())
  on conflict (production_id, user_id)
  do update set display_name = excluded.display_name, deleted_at = null
  returning * into v_member;

  return query select v_production.id, v_production.name, v_member.id, v_member.role;
end;
$$;

grant execute on function join_production_by_code(text, text) to authenticated, anon;
