-- M11 (docs/10 section 1): meetings with an exact time, duration, time zone and reminders,
-- plus the feed kinds that notifications (next migration) route from.

create type public.meeting_status as enum ('scheduled', 'held', 'no_show', 'cancelled');
create type public.calendar_sync_state as enum ('off', 'pending', 'synced', 'failed', 'removed_in_google');

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  activity_id uuid references public.activities (id) on delete set null,
  held_activity_id uuid references public.activities (id) on delete set null,
  owner_id uuid not null references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  title text not null check (length(trim(title)) between 1 and 200),
  starts_at timestamptz not null,
  duration_min int not null default 30 check (duration_min between 5 and 480),
  timezone text not null,
  location text check (location is null or length(location) <= 300),
  agenda text check (agenda is null or length(agenda) <= 2000),
  reminder_minutes int[] not null default '{30,10}'
    check (cardinality(reminder_minutes) <= 5 and 0 <= all (reminder_minutes) and 40320 >= all (reminder_minutes)),
  invite_contact boolean not null default false,
  add_to_calendar boolean not null default true,
  status public.meeting_status not null default 'scheduled',
  status_note text check (status_note is null or length(status_note) <= 500),
  -- Google Calendar sync (docs/10 section 2), written by the owner's own session
  sync_version int not null default 1,
  gcal_event_id text,
  gcal_calendar_id text,
  gcal_synced_version int not null default 0,
  gcal_state public.calendar_sync_state not null default 'off',
  gcal_error text check (gcal_error is null or length(gcal_error) <= 500),
  gcal_attempts int not null default 0,
  gcal_next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cancel_needs_reason check (status <> 'cancelled' or coalesce(trim(status_note), '') <> '')
);
create index meetings_owner_upcoming_idx on public.meetings (owner_id, starts_at) where status = 'scheduled';
create index meetings_lead_idx on public.meetings (lead_id, starts_at desc);
create index meetings_sync_idx on public.meetings (owner_id) where gcal_state = 'pending';
create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

-- Does this user have an active Google connection with auto-add on?
create or replace function public.calendar_active_for(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.google_connections g where g.user_id = p_user and g.status = 'active' and g.auto_add);
$$;

-- Guard: owner follows the lead, time bounds, status moves, sync bookkeeping.
create or replace function public.guard_meeting_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  system boolean := public.is_system() or pg_trigger_depth() > 1;
  relevant boolean;
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Pick a time zone from the list.';
  end if;

  if tg_op = 'INSERT' then
    select owner_id into new.owner_id from public.leads where id = new.lead_id;
    if not system and (new.starts_at < now() - interval '1 day' or new.starts_at > now() + interval '1 year') then
      raise exception 'Pick a meeting time from yesterday to a year ahead.';
    end if;
    if new.status <> 'scheduled' and not system then
      raise exception 'A new meeting starts as scheduled.';
    end if;
    relevant := true;
  else
    if not system then
      if new.lead_id is distinct from old.lead_id or new.created_by is distinct from old.created_by
         or new.activity_id is distinct from old.activity_id or new.owner_id is distinct from old.owner_id then
        raise exception 'That can''t be changed on a meeting.';
      end if;
      if new.starts_at is distinct from old.starts_at
         and (new.starts_at < now() - interval '1 day' or new.starts_at > now() + interval '1 year') then
        raise exception 'Pick a meeting time from yesterday to a year ahead.';
      end if;
      if new.status is distinct from old.status and old.status <> 'scheduled' and new.status <> 'scheduled' then
        raise exception 'Undo the meeting''s status first.';
      end if;
    end if;
    if new.status = 'scheduled' and old.status <> 'scheduled' then
      new.status_note := null;
    end if;
    relevant := (new.title, new.starts_at, new.duration_min, new.timezone, new.location, new.agenda,
                 new.reminder_minutes, new.status, new.invite_contact, new.add_to_calendar, new.owner_id, new.contact_id)
                is distinct from
                (old.title, old.starts_at, old.duration_min, old.timezone, old.location, old.agenda,
                 old.reminder_minutes, old.status, old.invite_contact, old.add_to_calendar, old.owner_id, old.contact_id);
    if relevant then
      new.sync_version := old.sync_version + 1;
    end if;
  end if;

  if relevant then
    if public.calendar_active_for(new.owner_id) and (new.add_to_calendar or new.gcal_event_id is not null) then
      new.gcal_state := 'pending';
      new.gcal_attempts := 0;
      new.gcal_next_retry_at := null;
      new.gcal_error := null;
    elsif new.gcal_event_id is null then
      new.gcal_state := 'off';
    end if;
  end if;
  return new;
end $$;
create trigger meetings_guard before insert or update on public.meetings
  for each row execute function public.guard_meeting_write();

-- Feed: meeting events + link column + the other new kinds routed by notifications.
alter table public.feed_events add column meeting_id uuid references public.meetings (id) on delete cascade;
alter table public.feed_events drop constraint feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check check (kind in (
  'lead_created', 'activity_logged', 'stage_changed', 'opportunity_won', 'opportunity_lost', 'task_completed',
  'lead_flagged', 'lead_reassigned',
  'post_submitted', 'post_approved', 'changes_requested', 'post_published', 'post_missed',
  'meeting_booked', 'meeting_rescheduled', 'meeting_cancelled', 'meeting_held', 'meeting_no_show',
  'task_assigned', 'post_assigned', 'post_comment'));

-- "Tue 6 Oct, 10:00 AM Chicago": the meeting's own local time.
create or replace function public.meeting_when(p_at timestamptz, p_tz text) returns text
language sql stable as $$
  select trim(to_char(p_at at time zone p_tz, 'Dy FMDD Mon, FMHH12:MI AM')) || ' '
         || replace(regexp_replace(p_tz, '^.*/', ''), '_', ' ');
$$;

create or replace function public.trg_meeting_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cname text;
  kind text;
  summary text;
begin
  select company_name into cname from public.leads where id = new.lead_id;
  if tg_op = 'INSERT' then
    kind := 'meeting_booked';
    summary := 'booked a meeting with ' || cname || ' for ' || public.meeting_when(new.starts_at, new.timezone);
  elsif new.status is distinct from old.status then
    if new.status = 'cancelled' then
      kind := 'meeting_cancelled';
      summary := 'cancelled the meeting with ' || cname || ': ' || new.status_note;
    elsif new.status = 'held' then
      kind := 'meeting_held';
      summary := 'held the meeting with ' || cname;
    elsif new.status = 'no_show' then
      kind := 'meeting_no_show';
      summary := 'marked a no-show for the meeting with ' || cname;
    end if;
  elsif new.starts_at is distinct from old.starts_at and new.status = 'scheduled' then
    kind := 'meeting_rescheduled';
    summary := 'moved the meeting with ' || cname || ' to ' || public.meeting_when(new.starts_at, new.timezone);
  end if;
  if kind is not null then
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, meeting_id, summary)
    values (kind, coalesce(auth.uid(), new.created_by), new.owner_id, new.lead_id, new.opportunity_id, new.id, summary);
  end if;
  return null;
end $$;
create trigger meetings_after after insert or update on public.meetings
  for each row execute function public.trg_meeting_after();

-- A deleted meeting (e.g. its lead was deleted) leaves its calendar event for the owner to remove.
create or replace function public.trg_meeting_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.gcal_event_id is not null then
    insert into public.calendar_cleanup (user_id, gcal_event_id, calendar_id)
    values (old.owner_id, old.gcal_event_id, coalesce(old.gcal_calendar_id, 'primary'));
  end if;
  return old;
end $$;
create trigger meetings_before_delete before delete on public.meetings
  for each row execute function public.trg_meeting_before_delete();

-- Reassignment: future meetings follow the lead; the old owner's event is queued for removal.
create or replace function public.trg_lead_owner_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    insert into public.lead_owner_events (lead_id, from_owner, to_owner, changed_by)
    values (new.id, old.owner_id, new.owner_id, auth.uid());
    -- open opportunities follow the lead
    update public.opportunities o set owner_id = new.owner_id
    from public.stages s
    where o.lead_id = new.id and s.key = o.stage_key and s.is_open;
    -- future scheduled meetings follow the lead
    insert into public.calendar_cleanup (user_id, gcal_event_id, calendar_id)
    select old.owner_id, m.gcal_event_id, coalesce(m.gcal_calendar_id, 'primary')
    from public.meetings m
    where m.lead_id = new.id and m.status = 'scheduled' and m.starts_at > now() and m.gcal_event_id is not null;
    update public.meetings m
       set owner_id = new.owner_id, gcal_event_id = null, gcal_calendar_id = null, gcal_synced_version = 0
     where m.lead_id = new.id and m.status = 'scheduled' and m.starts_at > now();
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, summary)
    values ('lead_reassigned', auth.uid(), new.owner_id, new.id, 'reassigned lead ' || new.company_name);
  end if;
  return null;
end $$;

-- Book a meeting: log the "Meeting booked" activity, add the meeting and set the next action, in one step.
create or replace function public.book_meeting(
  p_lead_id uuid,
  p_activity_type_id uuid,
  p_starts_at timestamptz,
  p_timezone text,
  p_duration_min int default 30,
  p_title text default null,
  p_location text default null,
  p_agenda text default null,
  p_reminder_minutes int[] default '{30,10}',
  p_invite_contact boolean default false,
  p_add_to_calendar boolean default true,
  p_occurred_at timestamptz default now(),
  p_contact_id uuid default null,
  p_opportunity_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  act_id uuid;
  meeting_id uuid;
  cname text;
  who text;
  owner_tz text;
begin
  select l.company_name, p.timezone into cname, owner_tz
  from public.leads l join public.profiles p on p.id = l.owner_id where l.id = p_lead_id;
  if cname is null then
    raise exception 'That lead doesn''t exist or isn''t yours.';
  end if;
  select nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') into who from public.contacts c where c.id = p_contact_id;

  act_id := public.log_activity(p_lead_id, p_activity_type_id, 'meeting_booked', p_occurred_at, p_contact_id,
                                p_opportunity_id, p_notes, 'Meeting with ' || coalesce(who, cname),
                                (p_starts_at at time zone owner_tz)::date, false);

  insert into public.meetings (lead_id, opportunity_id, contact_id, activity_id, title, starts_at, duration_min, timezone,
                               location, agenda, reminder_minutes, invite_contact, add_to_calendar)
  values (p_lead_id, p_opportunity_id, p_contact_id, act_id,
          coalesce(nullif(trim(p_title), ''), 'Meeting with ' || coalesce(who || ' (' || cname || ')', cname)),
          p_starts_at, p_duration_min, p_timezone, nullif(trim(p_location), ''), nullif(trim(p_agenda), ''),
          coalesce(p_reminder_minutes, '{}'), p_invite_contact, p_add_to_calendar)
  returning id into meeting_id;
  return meeting_id;
end $$;

-- A new or renewed Google connection picks up the caller's future meetings.
create or replace function public.save_google_connection(p_email text, p_scopes text[], p_token_enc text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Sign in first';
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

-- Tasks: "task_assigned" for new one-off tasks and for tasks moved to someone else.
create or replace function public.trg_task_feed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cname text;
begin
  if tg_op = 'INSERT' and new.kind = 'lead_fix' then
    select company_name into cname from public.leads where id = new.lead_id;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, task_id, summary)
    values ('lead_flagged', new.created_by, new.assignee_id, new.lead_id, new.id, 'flagged lead ' || cname);
  elsif tg_op = 'INSERT' and new.template_id is null and new.created_by is distinct from new.assignee_id then
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, task_id, summary)
    values ('task_assigned', new.created_by, new.assignee_id, new.lead_id, new.id, 'assigned task "' || new.title || '"');
  elsif tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, task_id, summary)
    values ('task_assigned', coalesce(auth.uid(), new.created_by), new.assignee_id, new.lead_id, new.id,
            'assigned task "' || new.title || '"');
  elsif tg_op = 'UPDATE' and new.kind <> 'count' and old.completed_at is null and new.completed_at is not null then
    insert into public.feed_events (kind, actor_id, subject_user_id, task_id, lead_id, summary)
    values ('task_completed', coalesce(auth.uid(), new.assignee_id), new.assignee_id, new.id, new.lead_id,
            'completed task "' || new.title || '"');
  end if;
  return null;
end $$;
drop trigger tasks_feed on public.tasks;
create trigger tasks_feed after insert or update of completed_at, assignee_id on public.tasks
  for each row execute function public.trg_task_feed();

-- Posts: "post_assigned" when the founder gives a one-off post to someone (schedule slots don't count).
create or replace function public.trg_post_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.schedule_id is null and new.assignee_id is distinct from new.created_by)
     or (tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id) then
    insert into public.feed_events (kind, actor_id, subject_user_id, post_id, summary)
    values ('post_assigned', coalesce(auth.uid(), new.created_by), new.assignee_id, new.id,
            'assigned post ''' || new.title || '''');
  end if;
  return null;
end $$;
create trigger posts_assigned after insert or update of assignee_id on public.posts
  for each row execute function public.trg_post_assigned();

-- Post comments: "post_comment" for plain comments (change requests and approvals have their own events).
create or replace function public.trg_post_comment_feed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.posts;
begin
  if new.kind = 'comment' then
    select * into p from public.posts where id = new.post_id;
    insert into public.feed_events (kind, actor_id, subject_user_id, post_id, summary)
    values ('post_comment', new.author_id, p.assignee_id, p.id, 'commented on ''' || p.title || '''');
  end if;
  return null;
end $$;
create trigger post_comments_feed after insert on public.post_comments
  for each row execute function public.trg_post_comment_feed();

-- RLS: same access as the lead; the founder deletes, everyone else cancels.
alter table public.meetings enable row level security;
create policy meetings_select on public.meetings for select to authenticated using (public.can_access_lead(lead_id));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.can_access_lead(lead_id) and created_by = auth.uid());
create policy meetings_update on public.meetings for update to authenticated
  using (public.can_access_lead(lead_id)) with check (public.can_access_lead(lead_id));
create policy meetings_delete on public.meetings for delete to authenticated using (public.is_founder());

revoke execute on function public.guard_meeting_write() from public, anon, authenticated;
revoke execute on function public.trg_meeting_after() from public, anon, authenticated;
revoke execute on function public.trg_meeting_before_delete() from public, anon, authenticated;
revoke execute on function public.trg_post_assigned() from public, anon, authenticated;
revoke execute on function public.trg_post_comment_feed() from public, anon, authenticated;
revoke execute on function public.calendar_active_for(uuid) from public, anon, authenticated;
revoke execute on function public.book_meeting(uuid, uuid, timestamptz, text, int, text, text, text, int[], boolean, boolean, timestamptz, uuid, uuid, text) from public, anon;
grant execute on function public.book_meeting(uuid, uuid, timestamptz, text, int, text, text, text, int[], boolean, boolean, timestamptz, uuid, uuid, text) to authenticated;
