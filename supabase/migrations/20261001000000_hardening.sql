-- Hardening after review (docs/03, docs/04, docs/10). Applied migrations are never edited; every fix here
-- replaces a function, adds a guard trigger or recreates a policy.
--
--  1. Import batches: rows, errors and counts are frozen; the creator may only move the status.
--  2. Leads and activities: non-founders can't rewrite who made them, when, or how they are classified;
--     an activity's outcome must fit its category on every update, not only on insert.
--  3. Lead owners must be an active founder or BD; task assignees an active founder, BD or SMM.
--  4. Meetings: gcal_* sync fields are written only through set_meeting_gcal() (owner only) or by triggers.
--  5. Newer policies require an active user (a deactivated user can read nothing).
--  6. An SMM has no Google Calendar.
--  7. Notification routing matches docs/10 section 3; reassignment reads "Zain gave you Smile Dental Austin".
--  8. sync_lead_contacts(): the Edit lead form's contacts are saved in one transaction.
--  9. pipeline_summary() takes an optional niche, like the board.

-- =====================================================================
-- 1. Import batches
-- =====================================================================
-- Moves allowed (all from 'validated'):
--   → failed     by the creator; may record why (errors, error_summary, row counts)
--   → cancelled  by the creator; nothing else changes
--   → imported   only from inside import_lead_batch()
-- A validated batch itself can't be edited, so its rows can never be swapped after checking.
create or replace function public.guard_import_batch_update() returns trigger
language plpgsql as $$
declare
  free text[];
begin
  if public.is_system() then return new; end if;
  if (new.id, new.code, new.created_by, new.created_by_role, new.filename, new.file_sha256, new.default_owner_id,
      new.total_rows, new.warning_count, new.created_at, new.expires_at)
     is distinct from
     (old.id, old.code, old.created_by, old.created_by_role, old.filename, old.file_sha256, old.default_owner_id,
      old.total_rows, old.warning_count, old.created_at, old.expires_at) then
    raise exception 'An import batch can''t be edited';
  end if;
  if old.status <> 'validated' then
    raise exception 'This import is already %', old.status;
  end if;

  if new.status = 'validated' then
    if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
      raise exception 'An import batch can''t be edited';
    end if;
  elsif new.status = 'imported' then
    if current_setting('cao.importing', true) is distinct from old.id::text then
      raise exception 'Use import_lead_batch() to import';
    end if;
    if (to_jsonb(new) - array['status', 'imported_rows', 'imported_at', 'rows'])
       is distinct from (to_jsonb(old) - array['status', 'imported_rows', 'imported_at', 'rows']) then
      raise exception 'An import batch can''t be edited';
    end if;
  elsif new.status in ('failed', 'cancelled') then
    if new.imported_rows <> 0 or new.imported_at is not null then
      raise exception 'A failed or cancelled import has no leads';
    end if;
    new.rows := null;
    free := case when new.status = 'failed'
                 then array['status', 'rows', 'errors', 'error_summary', 'valid_rows', 'invalid_rows', 'duplicate_rows']
                 else array['status', 'rows'] end;
    if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
      raise exception 'An import batch can''t be edited';
    end if;
  else
    raise exception 'Unknown import status';
  end if;
  return new;
end $$;

-- =====================================================================
-- 2. Leads and activities: update guards
-- =====================================================================
-- pg_trigger_depth() > 1: the change comes from another trigger (e.g. the completeness recalculation after
-- a contact changes), which is trusted.
create or replace function public.guard_lead_update() returns trigger
language plpgsql as $$
begin
  if public.is_system() or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.completeness is distinct from old.completeness then
    raise exception 'Completeness is calculated automatically';
  end if;
  if not public.is_founder()
     and (new.created_by, new.created_at, new.import_batch_id)
         is distinct from (old.created_by, old.created_at, old.import_batch_id) then
    raise exception 'Only the founder can change who added a lead, when, or its import';
  end if;
  return new;
end $$;
create trigger leads_guard before update on public.leads
  for each row execute function public.guard_lead_update();

-- The category always follows the activity type; the outcome must fit the category (same rule as insert).
create or replace function public.guard_activity_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cat public.activity_category;
  allowed public.activity_category[];
begin
  if not public.is_system() and not public.is_founder() and pg_trigger_depth() <= 1
     and (new.user_id, new.lead_id, new.activity_type_id, new.category, new.channel_id, new.campaign_id, new.created_at)
         is distinct from
         (old.user_id, old.lead_id, old.activity_type_id, old.category, old.channel_id, old.campaign_id, old.created_at) then
    raise exception 'Only the notes, outcome and time of an activity can be changed';
  end if;
  if new.activity_type_id is distinct from old.activity_type_id then
    select category into cat from public.activity_types where id = new.activity_type_id;
    new.category := cat;
  elsif new.category is distinct from old.category and not public.is_system() then
    raise exception 'The category follows the activity type';
  end if;
  if new.outcome_key is distinct from old.outcome_key or new.category is distinct from old.category then
    select allowed_categories into allowed from public.outcomes where key = new.outcome_key;
    if not (new.category = any (allowed)) then
      raise exception 'Outcome % is not allowed for % activities', new.outcome_key, new.category;
    end if;
  end if;
  return new;
end $$;
create trigger activities_guard before update on public.activities
  for each row execute function public.guard_activity_update();
revoke execute on function public.guard_activity_update() from public, anon, authenticated;

-- =====================================================================
-- 3. Who can own a lead or receive a task
-- =====================================================================
-- Leads: an active founder or BD (an SMM owning a lead could read it, docs/03).
-- Tasks and task templates: an active founder, BD or SMM (SMMs get tasks, docs/09).
-- Checked only when the column is set or changed, so old rows of a deactivated member stay editable.
create or replace function public.guard_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  r public.user_role;
  active boolean;
begin
  if public.is_system() then return new; end if;
  if tg_table_name = 'leads' then
    target := new.owner_id;
    if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then return new; end if;
  else
    target := new.assignee_id;
    if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then return new; end if;
  end if;
  select p.role, p.is_active into r, active from public.profiles p where p.id = target;
  if not coalesce(active, false) then
    raise exception 'Pick an active team member';
  end if;
  if tg_table_name = 'leads' and r not in ('founder', 'bd') then
    raise exception 'Leads can only belong to the founder or a BD';
  end if;
  return new;
end $$;
create trigger leads_owner_guard before insert or update of owner_id on public.leads
  for each row execute function public.guard_assignee();
create trigger tasks_assignee_guard before insert or update of assignee_id on public.tasks
  for each row execute function public.guard_assignee();
create trigger task_templates_assignee_guard before insert or update of assignee_id on public.task_templates
  for each row execute function public.guard_assignee();
revoke execute on function public.guard_assignee() from public, anon, authenticated;

-- =====================================================================
-- 4. Meetings: calendar sync fields are server-only (docs/10 section 1)
-- =====================================================================
-- Direct writes may only reset the sync (Retry, Add again, Disconnect): state to pending or off, and clear
-- the event, error, attempts and retry time. Results from Google (event id, calendar, synced version, failed
-- state) go through set_meeting_gcal(), which only the meeting's owner can call. Runs before meetings_guard
-- (triggers fire in name order), so it sees what the caller sent.
create or replace function public.guard_meeting_gcal() returns trigger
language plpgsql as $$
begin
  if public.is_system() or pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sync_version := 1;
    new.gcal_event_id := null;
    new.gcal_calendar_id := null;
    new.gcal_synced_version := 0;
    new.gcal_state := 'off';
    new.gcal_error := null;
    new.gcal_attempts := 0;
    new.gcal_next_retry_at := null;
    return new;
  end if;
  if current_setting('cao.gcal_sync', true) is not distinct from new.id::text then
    return new;
  end if;
  if new.sync_version is distinct from old.sync_version
     or new.gcal_synced_version is distinct from old.gcal_synced_version
     or (new.gcal_event_id is distinct from old.gcal_event_id and new.gcal_event_id is not null)
     or (new.gcal_calendar_id is distinct from old.gcal_calendar_id and new.gcal_calendar_id is not null)
     or (new.gcal_state is distinct from old.gcal_state and new.gcal_state not in ('pending', 'off'))
     or (new.gcal_attempts is distinct from old.gcal_attempts and new.gcal_attempts <> 0)
     or (new.gcal_error is distinct from old.gcal_error and new.gcal_error is not null)
     or (new.gcal_next_retry_at is distinct from old.gcal_next_retry_at and new.gcal_next_retry_at is not null) then
    raise exception 'Calendar sync fields are set by the server';
  end if;
  return new;
end $$;
create trigger meetings_gcal_guard before insert or update on public.meetings
  for each row execute function public.guard_meeting_gcal();

-- Record a Google sync result on the caller's own meeting, only if the meeting hasn't changed since it was
-- read (p_sync_version). Keys missing from p_fields are left as they are. Returns false when nothing changed.
create or replace function public.set_meeting_gcal(p_meeting uuid, p_sync_version int, p_fields jsonb)
returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  n int;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fields) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_fields) k
    where k not in ('gcal_event_id', 'gcal_calendar_id', 'gcal_state', 'gcal_synced_version', 'gcal_attempts',
                    'gcal_error', 'gcal_next_retry_at')) then
    raise exception 'Only calendar sync fields can be set';
  end if;
  perform set_config('cao.gcal_sync', p_meeting::text, true);
  update public.meetings m set
    gcal_event_id = case when p_fields ? 'gcal_event_id' then p_fields ->> 'gcal_event_id' else m.gcal_event_id end,
    gcal_calendar_id = case when p_fields ? 'gcal_calendar_id' then p_fields ->> 'gcal_calendar_id' else m.gcal_calendar_id end,
    gcal_state = case when p_fields ? 'gcal_state' then (p_fields ->> 'gcal_state')::public.calendar_sync_state else m.gcal_state end,
    gcal_synced_version = case when p_fields ? 'gcal_synced_version'
                               then least((p_fields ->> 'gcal_synced_version')::int, m.sync_version) else m.gcal_synced_version end,
    gcal_attempts = case when p_fields ? 'gcal_attempts' then greatest((p_fields ->> 'gcal_attempts')::int, 0) else m.gcal_attempts end,
    gcal_error = case when p_fields ? 'gcal_error' then left(p_fields ->> 'gcal_error', 500) else m.gcal_error end,
    gcal_next_retry_at = case when p_fields ? 'gcal_next_retry_at' then (p_fields ->> 'gcal_next_retry_at')::timestamptz
                              else m.gcal_next_retry_at end
  where m.id = p_meeting and m.owner_id = auth.uid() and m.sync_version = p_sync_version;
  get diagnostics n = row_count;
  perform set_config('cao.gcal_sync', '', true);
  return n > 0;
end $$;
revoke execute on function public.set_meeting_gcal(uuid, int, jsonb) from public, anon;
grant execute on function public.set_meeting_gcal(uuid, int, jsonb) to authenticated;

-- =====================================================================
-- 5. Deactivated users read nothing (docs/03 section 2)
-- =====================================================================
drop policy import_batches_select on public.lead_import_batches;
create policy import_batches_select on public.lead_import_batches for select to authenticated
  using (public.is_active_user() and (created_by = auth.uid() or public.is_founder()));

drop policy google_connections_own_select on public.google_connections;
create policy google_connections_own_select on public.google_connections for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());
drop policy google_connections_own_update on public.google_connections;
create policy google_connections_own_update on public.google_connections for update to authenticated
  using (user_id = auth.uid() and public.is_active_user()) with check (user_id = auth.uid());
drop policy google_connections_own_delete on public.google_connections;
create policy google_connections_own_delete on public.google_connections for delete to authenticated
  using (user_id = auth.uid() and public.is_active_user());

drop policy calendar_cleanup_own_select on public.calendar_cleanup;
create policy calendar_cleanup_own_select on public.calendar_cleanup for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());
drop policy calendar_cleanup_own_delete on public.calendar_cleanup;
create policy calendar_cleanup_own_delete on public.calendar_cleanup for delete to authenticated
  using (user_id = auth.uid() and public.is_active_user());

drop policy notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs for all to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

drop policy notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid() and public.is_active_user()) with check (recipient_id = auth.uid());
drop policy notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (recipient_id = auth.uid() and public.is_active_user());

-- =====================================================================
-- 6. An SMM has no Google Calendar (docs/03 section 2)
-- =====================================================================
create or replace function public.save_google_connection(p_email text, p_scopes text[], p_token_enc text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Sign in first';
  end if;
  if public.current_user_role() not in ('founder', 'bd') then
    raise exception 'Google Calendar isn''t part of your role' using errcode = '42501';
  end if;
  if coalesce(trim(p_email), '') = '' or coalesce(p_token_enc, '') = '' then
    raise exception 'Google didn''t return an account or a token';
  end if;
  insert into public.google_connections (user_id, google_email, scopes, refresh_token_enc, status, last_error, connected_at)
  values (auth.uid(), lower(trim(p_email)), coalesce(p_scopes, '{}'), p_token_enc, 'active', null, now())
  on conflict (user_id) do update
    set google_email = excluded.google_email, scopes = excluded.scopes, refresh_token_enc = excluded.refresh_token_enc,
        status = 'active', last_error = null, connected_at = now();
  update public.meetings
     set gcal_state = 'pending', gcal_attempts = 0, gcal_next_retry_at = null, gcal_error = null
   where owner_id = auth.uid() and status = 'scheduled' and starts_at > now() and add_to_calendar
     and gcal_state in ('off', 'failed');
end $$;

-- =====================================================================
-- 7. Notification routing (docs/10 section 3)
-- =====================================================================
-- Changes from the previous version:
--  - meeting_booked goes to the founder only; post_comment only to the post's SMM.
--  - meeting_held, meeting_no_show and post_published aren't in the routing table: feed only.
--  - Reassignment: the new owner reads "Zain gave you Smile Dental Austin", the old owner
--    "Zain gave Smile Dental Austin to Sara".
-- The founder still hears about a BD's CSV import (docs/04 section 10).
create or replace function public.route_feed_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  founder uuid;
  recipients uuid[] := '{}';
  prio text := 'normal';
  grp text := public.notification_group(new.kind);
  who text;
  link text;
  old_owner uuid;
  company text;
  new_owner_name text;
  title text;
  r uuid;
begin
  select id into founder from public.profiles where role = 'founder' and is_active limit 1;

  case new.kind
    when 'lead_reassigned' then
      select from_owner into old_owner from public.lead_owner_events
       where lead_id = new.lead_id order by changed_at desc, id desc limit 1;
      recipients := array[new.subject_user_id, old_owner];
    when 'lead_flagged' then
      recipients := array[new.subject_user_id]; prio := 'high';
    when 'task_assigned', 'activity_logged' then
      recipients := array[new.subject_user_id];
    when 'task_completed', 'leads_imported', 'post_submitted', 'meeting_booked' then
      recipients := array[founder];
      if new.kind = 'post_submitted' then prio := 'high'; end if;
    when 'stage_changed', 'meeting_rescheduled', 'meeting_cancelled' then
      recipients := array[founder, new.subject_user_id];
    when 'opportunity_won', 'opportunity_lost' then
      recipients := array[founder, new.subject_user_id]; prio := 'high';
    when 'changes_requested', 'post_approved', 'post_assigned', 'post_comment' then
      recipients := array[new.subject_user_id];
      if new.kind = 'changes_requested' then prio := 'high'; end if;
    when 'post_missed' then
      recipients := array[founder, new.subject_user_id]; prio := 'high';
    else
      return null;   -- lead_created, meeting_held, meeting_no_show, post_published: feed only
  end case;

  if new.kind = 'lead_reassigned' then
    select coalesce(nullif(p.full_name, ''), p.email) into who from public.profiles p where p.id = new.actor_id;
    select l.company_name into company from public.leads l where l.id = new.lead_id;
    select coalesce(nullif(p.full_name, ''), p.email) into new_owner_name from public.profiles p where p.id = new.subject_user_id;
  else
    select coalesce(nullif(p.full_name, ''), p.email) into who
    from public.profiles p where p.id = coalesce(new.actor_id, new.subject_user_id);
  end if;
  link := case
    when new.lead_id is not null then '/leads/' || new.lead_id
    when new.post_id is not null then '/content?post=' || new.post_id
    when new.task_id is not null then '/tasks'
    when new.kind = 'leads_imported' then '/leads/import'
  end;

  foreach r in array recipients loop
    continue when r is null or r is not distinct from new.actor_id;
    continue when not exists (select 1 from public.profiles where id = r and is_active);
    continue when exists (select 1 from public.notification_prefs np
                          where np.user_id = r and np.kind_group = grp and not np.in_app);
    if new.kind = 'lead_reassigned' and company is not null then
      title := coalesce(who, 'Someone') || case
        when r = new.subject_user_id then ' gave you ' || company
        else ' gave ' || company || ' to ' || coalesce(new_owner_name, 'someone else') end;
    else
      title := coalesce(who, 'Someone') || ' ' || new.summary;
    end if;
    insert into public.notifications (recipient_id, kind, kind_group, priority, title, link, actor_id, feed_event_id,
                                      lead_id, opportunity_id, task_id, post_id, meeting_id, dedupe_key)
    values (r, new.kind, grp, prio, title, link, new.actor_id, new.id,
            new.lead_id, new.opportunity_id, new.task_id, new.post_id, new.meeting_id, 'feed:' || new.id)
    on conflict (recipient_id, dedupe_key) do nothing;
  end loop;
  return null;
end $$;
revoke execute on function public.route_feed_event() from public, anon, authenticated;

-- =====================================================================
-- 8. Edit lead: contacts in one transaction
-- =====================================================================
-- p_contacts: the form's contacts. With "id": update that contact of this lead; without: add it.
-- Contacts of the lead missing from the list are removed. Invoker rights: RLS decides who may do this.
create or replace function public.sync_lead_contacts(p_lead_id uuid, p_contacts jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  c jsonb;
  keep uuid[];
begin
  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'That lead wasn''t found.';
  end if;
  if jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) = 0 then
    raise exception 'A lead needs at least one contact.';
  end if;
  if jsonb_array_length(p_contacts) > 10 then
    raise exception 'A lead can have up to 10 contacts.';
  end if;
  if (select count(*) from jsonb_array_elements(p_contacts) e where coalesce((e ->> 'is_primary')::boolean, false)) > 1 then
    raise exception 'Only one contact can be primary.';
  end if;

  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into keep
  from jsonb_array_elements(p_contacts) e where nullif(e ->> 'id', '') is not null;

  -- One primary at a time (unique index): clear it first, set it last.
  update public.contacts set is_primary = false where lead_id = p_lead_id and is_primary;
  delete from public.contacts where lead_id = p_lead_id and not (id = any (keep));

  for c in select e from jsonb_array_elements(p_contacts) e
           order by coalesce((e ->> 'is_primary')::boolean, false)
  loop
    if nullif(c ->> 'id', '') is not null then
      update public.contacts set
        first_name = c ->> 'first_name', last_name = c ->> 'last_name', job_title = c ->> 'job_title',
        is_decision_maker = coalesce((c ->> 'is_decision_maker')::boolean, false),
        is_primary = coalesce((c ->> 'is_primary')::boolean, false),
        email = c ->> 'email',
        email_status = coalesce((c ->> 'email_status')::public.email_status, 'unverified'),
        secondary_email = c ->> 'secondary_email', phone = c ->> 'phone', mobile_phone = c ->> 'mobile_phone',
        linkedin_url = c ->> 'linkedin_url', other_social_url = c ->> 'other_social_url',
        preferred_channel_id = (c ->> 'preferred_channel_id')::uuid, notes = c ->> 'notes'
      where id = (c ->> 'id')::uuid and lead_id = p_lead_id;
    else
      insert into public.contacts (lead_id, first_name, last_name, job_title, is_decision_maker, is_primary, email,
                                   email_status, secondary_email, phone, mobile_phone, linkedin_url, other_social_url,
                                   preferred_channel_id, notes)
      values (p_lead_id, c ->> 'first_name', c ->> 'last_name', c ->> 'job_title',
              coalesce((c ->> 'is_decision_maker')::boolean, false), coalesce((c ->> 'is_primary')::boolean, false),
              c ->> 'email', coalesce((c ->> 'email_status')::public.email_status, 'unverified'),
              c ->> 'secondary_email', c ->> 'phone', c ->> 'mobile_phone', c ->> 'linkedin_url',
              c ->> 'other_social_url', (c ->> 'preferred_channel_id')::uuid, c ->> 'notes');
    end if;
  end loop;
end $$;
revoke execute on function public.sync_lead_contacts(uuid, jsonb) from public, anon;
grant execute on function public.sync_lead_contacts(uuid, jsonb) to authenticated;

-- =====================================================================
-- 9. pipeline_summary with an optional niche (the board's niche filter)
-- =====================================================================
-- Same name and parameters as before plus p_niche; calls without it behave exactly as before.
drop function public.pipeline_summary(uuid, int);
create function public.pipeline_summary(p_user uuid default null, p_stuck_days int default 14, p_niche uuid default null)
returns table (stage_key text, stage_label text, sort_order int, opp_count int, total_value numeric,
               weighted_value numeric, stuck_count int)
language sql stable security invoker set search_path = public as $$
  select s.key, s.label, s.sort_order,
         count(o.id)::int,
         coalesce(sum(case when s.key = 'won' then o.won_value else o.estimated_value end), 0),
         round(coalesce(sum(o.estimated_value * s.probability) filter (where s.is_open), 0), 2),
         (count(o.id) filter (where s.is_open and o.stage_changed_at < now() - make_interval(days => p_stuck_days)))::int
  from public.stages s
  left join public.opportunities o
    on o.stage_key = s.key
   and (p_user is null or o.owner_id = p_user)
   and (p_niche is null or exists (select 1 from public.leads l where l.id = o.lead_id and l.niche_id = p_niche))
  group by s.key, s.label, s.sort_order
  order by s.sort_order;
$$;
