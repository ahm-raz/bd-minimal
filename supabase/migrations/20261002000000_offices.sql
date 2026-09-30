-- =====================================================================
-- M14 (docs/11-offices.md section 3): offices. Every row belongs to one office.
--   - offices, platform_admins, pending_members
--   - office_id on every business table, backfilled to office #1 ("My office")
--   - per-office uniqueness: one founder per office, list names, stage and outcome keys
--   - rows can't point at rows in another office (office_refs trigger)
--   - default settings for a new office in one function
-- The office boundary in RLS and the security definer functions is M15 (next migration).
-- =====================================================================

-- ---------- Offices ----------------------------------------------------
create type public.office_status as enum ('active', 'suspended');

create table public.offices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 80),
  timezone     text not null default 'Asia/Karachi',
  status       public.office_status not null default 'active',
  seat_limit   int check (seat_limit is null or seat_limit >= 1),
  suspended_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger offices_updated_at before update on public.offices
  for each row execute function public.set_updated_at();
alter table public.offices enable row level security;

-- The caller's office. Null when signed out. (M15 also requires an active member and office.)
-- (plpgsql so it can be created before profiles.office_id exists; M15 replaces it)
create or replace function public.current_office_id() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  return (select office_id from public.profiles where id = auth.uid());
end $$;

create table public.platform_admins (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins a join public.profiles p on p.id = a.user_id
    where a.user_id = auth.uid() and p.is_active
  );
$$;

-- ---------- office_id on every business table ---------------------------
do $$
declare
  first_office uuid;
  t text;
  business_tables text[] := array[
    'profiles', 'niches', 'channels', 'lead_sources', 'lost_reasons', 'activity_types', 'outcomes', 'stages',
    'campaigns', 'targets', 'leads', 'contacts', 'activities', 'opportunities', 'opportunity_stage_events',
    'lead_owner_events', 'feed_events', 'task_templates', 'tasks', 'social_accounts', 'content_pillars',
    'posting_schedules', 'posts', 'post_comments', 'post_status_events', 'meetings', 'notifications',
    'notification_prefs', 'google_connections', 'calendar_cleanup', 'lead_import_batches'];
  -- default settings rows: on a fresh install (no team yet) they're removed and created per office instead
  default_lists text[] := array['activity_types', 'niches', 'channels', 'lead_sources', 'lost_reasons',
                                'outcomes', 'stages', 'content_pillars'];
begin
  -- every public table must be classified, so a new table can't be missed
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname <> all (business_tables || array['offices', 'platform_admins'])
  ) then
    raise exception 'A public table is not classified for offices';
  end if;

  if exists (select 1 from public.profiles) then
    insert into public.offices (name, timezone) values ('My office', 'Asia/Karachi') returning id into first_office;
    insert into public.platform_admins (user_id) select id from public.profiles where role = 'founder';
  else
    foreach t in array default_lists loop
      execute format('delete from public.%I', t);
    end loop;
  end if;

  foreach t in array business_tables loop
    execute format('alter table public.%I add column office_id uuid references public.offices (id)', t);
    if first_office is not null then
      execute format('alter table public.%I disable trigger user', t);
      execute format('update public.%I set office_id = %L', t, first_office);
      execute format('alter table public.%I enable trigger user', t);
    end if;
    execute format('alter table public.%I alter column office_id set not null', t);
    execute format('alter table public.%I alter column office_id set default public.current_office_id()', t);
    execute format('create index %I on public.%I (office_id)', t || '_office_idx', t);
  end loop;
end $$;

alter table public.platform_admins
  add constraint platform_admins_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------- Per-office uniqueness --------------------------------------
drop index public.profiles_single_founder;
create unique index profiles_single_founder on public.profiles (office_id) where role = 'founder';

alter table public.niches          drop constraint niches_name_key,          add constraint niches_name_key          unique (office_id, name);
alter table public.channels        drop constraint channels_name_key,        add constraint channels_name_key        unique (office_id, name);
alter table public.lead_sources    drop constraint lead_sources_name_key,    add constraint lead_sources_name_key    unique (office_id, name);
alter table public.lost_reasons    drop constraint lost_reasons_name_key,    add constraint lost_reasons_name_key    unique (office_id, name);
alter table public.activity_types  drop constraint activity_types_name_key,  add constraint activity_types_name_key  unique (office_id, name);
alter table public.campaigns       drop constraint campaigns_name_key,       add constraint campaigns_name_key       unique (office_id, name);
alter table public.social_accounts drop constraint social_accounts_name_key, add constraint social_accounts_name_key unique (office_id, name);
alter table public.content_pillars drop constraint content_pillars_name_key, add constraint content_pillars_name_key unique (office_id, name);

-- Stage and outcome keys: same keys in every office, primary key per office. References carry the office,
-- so an opportunity or activity can only use its own office's stages and outcomes.
alter table public.opportunities            drop constraint opportunities_stage_key_fkey;
alter table public.opportunity_stage_events drop constraint opportunity_stage_events_from_stage_fkey;
alter table public.opportunity_stage_events drop constraint opportunity_stage_events_to_stage_fkey;
alter table public.activities               drop constraint activities_outcome_key_fkey;
alter table public.stages   drop constraint stages_pkey,   add primary key (office_id, key);
alter table public.outcomes drop constraint outcomes_pkey, add primary key (office_id, key);
alter table public.opportunities
  add constraint opportunities_stage_key_fkey foreign key (office_id, stage_key) references public.stages (office_id, key);
alter table public.opportunity_stage_events
  add constraint opportunity_stage_events_from_stage_fkey foreign key (office_id, from_stage) references public.stages (office_id, key),
  add constraint opportunity_stage_events_to_stage_fkey foreign key (office_id, to_stage) references public.stages (office_id, key);
alter table public.activities
  add constraint activities_outcome_key_fkey foreign key (office_id, outcome_key) references public.outcomes (office_id, key);

-- ---------- Rows stay inside their office --------------------------------
-- One generic BEFORE INSERT OR UPDATE trigger per table. Arguments: 'column:table:refcolumn:type' for every
-- single-column foreign key to another business table. It
--   1. fills office_id from the first parent found when it's empty (rows written without a signed-in user),
--   2. refuses a row whose parents are in another office,
--   3. refuses changing a row's office.
-- It reads parents as the table owner, so RLS can't hide a parent from the check.
create or replace function public.office_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  spec text;
  part text[];
  val text;
  parent_office uuid;
begin
  if tg_op = 'UPDATE' and new.office_id is distinct from old.office_id then
    raise exception 'A row can''t move to another office' using errcode = '42501';
  end if;
  foreach spec in array coalesce(tg_argv, array[]::text[]) loop
    part := string_to_array(spec, ':');
    val := to_jsonb(new) ->> part[1];
    continue when val is null;
    continue when tg_op = 'UPDATE' and val is not distinct from (to_jsonb(old) ->> part[1]) and new.office_id is not null;
    execute format('select office_id from public.%I where %I = $1::%s', part[2], part[3], part[4])
      into parent_office using val;
    continue when parent_office is null;     -- a missing parent is the foreign key's job
    if new.office_id is null then
      new.office_id := parent_office;
    elsif parent_office <> new.office_id then
      raise exception 'Rows must stay inside one office (%.%)', tg_table_name, part[1] using errcode = '42501';
    end if;
  end loop;
  if new.office_id is null then
    raise exception 'office_id is required on %', tg_table_name using errcode = '23502';
  end if;
  return new;
end $$;

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl,
           string_agg(format('%s:%s:%s:%s', a.attname, pc.relname, fa.attname, format_type(a.atttypid, a.atttypmod)),
                      ',' order by a.attnum) as specs
    from pg_constraint c
    join pg_class tc on tc.oid = c.conrelid
    join pg_namespace n on n.oid = tc.relnamespace
    join pg_class pc on pc.oid = c.confrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
      and pc.relname not in ('offices')
      and exists (select 1 from pg_attribute x where x.attrelid = c.confrelid and x.attname = 'office_id')
      and exists (select 1 from pg_attribute x where x.attrelid = c.conrelid and x.attname = 'office_id')
    group by c.conrelid
  loop
    -- quoted list of arguments for CREATE TRIGGER
    execute format('create trigger %I before insert or update on %s for each row execute function public.office_refs(%s)',
      'zz_office_refs', r.tbl,
      (select string_agg(quote_literal(s), ', ') from unnest(string_to_array(r.specs, ',')) s));
  end loop;
end $$;

-- Tables without such a foreign key (settings lists) still need an office and can't move.
do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_attribute x where x.attrelid = c.oid and x.attname = 'office_id')
      and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'zz_office_refs')
  loop
    execute format('create trigger zz_office_refs before insert or update on public.%I for each row execute function public.office_refs()', t);
  end loop;
end $$;

-- ---------- Default settings for an office ------------------------------
-- The defaults from docs/02 section 3 (used to be inserted once by the first migration).
create or replace function public.seed_office_defaults(p_office uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.niches (office_id, name, sort_order) values
    (p_office, 'AI SaaS', 1), (p_office, 'Dental', 2), (p_office, 'Law', 3), (p_office, 'Agency Partnerships', 4);

  insert into public.channels (office_id, name, sort_order) values
    (p_office, 'LinkedIn', 1), (p_office, 'Email', 2), (p_office, 'Upwork', 3), (p_office, 'Phone', 4), (p_office, 'Referral', 5);

  insert into public.lead_sources (office_id, name, sort_order, is_active) values
    (p_office, 'Manual research', 1, true), (p_office, 'LinkedIn Sales Navigator', 2, true), (p_office, 'Apollo', 3, true),
    (p_office, 'Google Maps', 4, true), (p_office, 'Upwork job post', 5, true), (p_office, 'Referral', 6, true),
    (p_office, 'Inbound', 7, true), (p_office, 'Other', 8, true),
    (p_office, 'CSV import', 999, false);

  insert into public.lost_reasons (office_id, name, sort_order) values
    (p_office, 'Price', 1), (p_office, 'Went with someone else', 2), (p_office, 'No response', 3),
    (p_office, 'Not a fit', 4), (p_office, 'Timing', 5), (p_office, 'Other', 6);

  insert into public.activity_types (office_id, name, category, default_channel_id, sort_order)
  select p_office, v.name, v.category::public.activity_category, c.id, v.sort_order
  from (values
    ('LinkedIn connection request', 'outreach', 'LinkedIn', 1),
    ('LinkedIn message', 'outreach', 'LinkedIn', 2),
    ('Cold email', 'outreach', 'Email', 3),
    ('Upwork proposal', 'outreach', 'Upwork', 4),
    ('LinkedIn follow-up', 'follow_up', 'LinkedIn', 5),
    ('Email follow-up', 'follow_up', 'Email', 6),
    ('Upwork follow-up', 'follow_up', 'Upwork', 7),
    ('Reply received', 'inbound_reply', null, 8),
    ('Phone call', 'call', 'Phone', 9),
    ('Meeting held', 'meeting', null, 10),
    ('Proposal sent', 'proposal', null, 11),
    ('Other', 'other', null, 12)
  ) as v(name, category, channel, sort_order)
  left join public.channels c on c.name = v.channel and c.office_id = p_office;

  insert into public.outcomes (office_id, key, label, is_reply, is_positive, is_meeting, allowed_categories, sort_order) values
    (p_office, 'no_response',    'No response',             false, false, false, '{outreach,follow_up,call,proposal,other}', 1),
    (p_office, 'bounced',        'Bounced / wrong contact', false, false, false, '{outreach,follow_up,call}', 2),
    (p_office, 'interested',     'Interested',              true,  true,  false, '{inbound_reply,call,meeting,proposal,other}', 3),
    (p_office, 'not_now',        'Not now',                 true,  false, false, '{inbound_reply,call,meeting,proposal,other}', 4),
    (p_office, 'not_interested', 'Not interested',          true,  false, false, '{inbound_reply,call,meeting,proposal,other}', 5),
    (p_office, 'meeting_booked', 'Meeting booked',          true,  true,  true,  '{inbound_reply,call,other}', 6),
    (p_office, 'done',           'Done',                    false, false, false, '{meeting,proposal,other}', 7);

  insert into public.stages (office_id, key, label, probability, is_open, sort_order) values
    (p_office, 'qualified',     'Qualified',     0.20, true,  1),
    (p_office, 'meeting_done',  'Meeting done',  0.40, true,  2),
    (p_office, 'proposal_sent', 'Proposal sent', 0.60, true,  3),
    (p_office, 'negotiation',   'Negotiation',   0.75, true,  4),
    (p_office, 'won',           'Won',           1.00, false, 5),
    (p_office, 'lost',          'Lost',          0.00, false, 6);

  insert into public.content_pillars (office_id, name, sort_order) values
    (p_office, 'Case study', 1), (p_office, 'Tip or how-to', 2), (p_office, 'Behind the scenes', 3),
    (p_office, 'Offer', 4), (p_office, 'Industry news', 5), (p_office, 'Client result', 6);
end $$;
revoke all on function public.seed_office_defaults(uuid) from public, anon, authenticated;

-- ---------- Joining an office: pending_members --------------------------
-- A reservation made before the auth user exists: which office and role the new person joins
-- (docs/11 section 5). The sign-up trigger reads it and deletes it. No reservation, no profile.
create table public.pending_members (
  email      text primary key check (email = lower(email)),
  office_id  uuid not null default public.current_office_id() references public.offices (id) on delete cascade,
  role       public.user_role not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.pending_members enable row level security;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pm public.pending_members;
begin
  delete from public.pending_members where email = lower(new.email) returning * into pm;
  if pm.email is null then
    raise exception 'No office is waiting for %', new.email using errcode = '42501';
  end if;
  insert into public.profiles (id, email, full_name, role, office_id, timezone)
  select new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), pm.role, o.id, o.timezone
  from public.offices o where o.id = pm.office_id;
  return new;
end $$;

-- ---------- Creating offices -------------------------------------------
-- Platform admin: office + default settings + the founder's reservation. The server action then creates
-- the founder's auth user with the admin client (docs/11 section 6).
create or replace function public.create_office(p_name text, p_timezone text, p_seat_limit int, p_founder_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  office uuid;
begin
  if not public.is_platform_admin() and not public.is_system() then
    raise exception 'Only a platform admin can create offices' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where lower(email) = lower(trim(p_founder_email))) then
    raise exception 'This email already has an account' using errcode = '23505';
  end if;
  insert into public.offices (name, timezone, seat_limit) values (trim(p_name), p_timezone, p_seat_limit)
  returning id into office;
  perform public.seed_office_defaults(office);
  insert into public.pending_members (email, office_id, role, created_by)
  values (lower(trim(p_founder_email)), office, 'founder', auth.uid());
  return office;
end $$;
revoke all on function public.create_office(text, text, int, text) from public, anon;
grant execute on function public.create_office(text, text, int, text) to authenticated;

-- First install only (/setup): the first office, its founder's reservation. The founder becomes a platform
-- admin when their profile appears (trigger below). Refuses once any office exists.
create or replace function public.setup_first_office(p_name text, p_timezone text, p_founder_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  office uuid;
begin
  if exists (select 1 from public.offices) then
    raise exception 'Setup is already done' using errcode = '42501';
  end if;
  insert into public.offices (name, timezone) values (trim(p_name), p_timezone) returning id into office;
  perform public.seed_office_defaults(office);
  insert into public.pending_members (email, office_id, role) values (lower(trim(p_founder_email)), office, 'founder');
  return office;
end $$;
revoke all on function public.setup_first_office(text, text, text) from public, anon, authenticated;

create or replace function public.trg_first_founder_is_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'founder' and (select count(*) from public.offices) = 1 and not exists (select 1 from public.platform_admins) then
    insert into public.platform_admins (user_id) values (new.id);
  end if;
  return null;
end $$;
create trigger profiles_first_admin after insert on public.profiles
  for each row execute function public.trg_first_founder_is_admin();

-- ---------- Policies for the new tables ----------------------------------
create policy offices_select on public.offices for select to authenticated
  using (id = public.current_office_id() or public.is_platform_admin());
-- The founder renames their office and sets its default time zone; status and seats are the platform admin's.
create policy offices_update on public.offices for update to authenticated
  using ((id = public.current_office_id() and public.is_founder()) or public.is_platform_admin())
  with check ((id = public.current_office_id() and public.is_founder()) or public.is_platform_admin());

create or replace function public.guard_office_update() returns trigger
language plpgsql as $$
begin
  if not public.is_system() and not public.is_platform_admin()
     and (new.status is distinct from old.status or new.seat_limit is distinct from old.seat_limit) then
    raise exception 'Only a platform admin can change an office''s status or seats' using errcode = '42501';
  end if;
  if new.status = 'suspended' and old.status = 'active' then
    new.suspended_at := now();
  elsif new.status = 'active' then
    new.suspended_at := null;
  end if;
  return new;
end $$;
create trigger offices_guard before update on public.offices
  for each row execute function public.guard_office_update();

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create policy pending_members_select on public.pending_members for select to authenticated
  using (office_id = public.current_office_id() and public.is_founder());
create policy pending_members_insert on public.pending_members for insert to authenticated
  with check (office_id = public.current_office_id() and public.is_founder() and role in ('bd', 'social'));
create policy pending_members_delete on public.pending_members for delete to authenticated
  using (office_id = public.current_office_id() and public.is_founder());

grant select, update on public.offices to authenticated;
grant select on public.platform_admins to authenticated;
grant select, insert, delete on public.pending_members to authenticated;
