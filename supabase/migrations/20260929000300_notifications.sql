-- M11 (docs/10 section 3): "What happened" notifications, one row per recipient, routed from feed_events.
-- "What's upcoming" is computed by the app and never stored.

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  kind_group text not null check (kind_group in ('meetings', 'deals', 'leads', 'tasks', 'social')),
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  title text not null,
  link text,
  actor_id uuid references public.profiles (id) on delete set null,
  feed_event_id bigint references public.feed_events (id) on delete set null,
  lead_id uuid references public.leads (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete cascade,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, dedupe_key)
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

-- Per-group settings. A missing row means the default: in app on, browser alerts off.
create table public.notification_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind_group text not null check (kind_group in ('meetings', 'deals', 'leads', 'tasks', 'social')),
  in_app boolean not null default true,
  browser boolean not null default false,
  primary key (user_id, kind_group)
);

-- Default meeting reminders for the Log activity form (minutes before).
alter table public.profiles add column meeting_reminders int[] not null default '{30,10}'
  check (cardinality(meeting_reminders) <= 5 and 0 <= all (meeting_reminders) and 40320 >= all (meeting_reminders));

create or replace function public.notification_group(p_kind text) returns text
language sql immutable as $$
  select case
    when p_kind like 'meeting_%' then 'meetings'
    when p_kind in ('stage_changed', 'opportunity_won', 'opportunity_lost') then 'deals'
    when p_kind in ('lead_reassigned', 'lead_flagged', 'activity_logged', 'lead_created') then 'leads'
    when p_kind in ('task_assigned', 'task_completed') then 'tasks'
    else 'social'
  end;
$$;

-- Who hears about a feed event (docs/10 section 3, routing table). The actor never does.
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
    when 'task_completed', 'post_submitted', 'meeting_held', 'meeting_no_show', 'post_published' then
      recipients := array[founder];
      if new.kind = 'post_submitted' then prio := 'high'; end if;
    when 'stage_changed', 'meeting_booked', 'meeting_rescheduled', 'meeting_cancelled', 'post_comment' then
      recipients := array[founder, new.subject_user_id];
    when 'opportunity_won', 'opportunity_lost' then
      recipients := array[founder, new.subject_user_id]; prio := 'high';
    when 'changes_requested', 'post_approved', 'post_assigned' then
      recipients := array[new.subject_user_id];
      if new.kind = 'changes_requested' then prio := 'high'; end if;
    when 'post_missed' then
      recipients := array[founder, new.subject_user_id]; prio := 'high';
    else
      return null;   -- lead_created: feed only
  end case;

  select coalesce(nullif(p.full_name, ''), p.email) into who
  from public.profiles p where p.id = coalesce(new.actor_id, new.subject_user_id);
  link := case
    when new.lead_id is not null then '/leads/' || new.lead_id
    when new.post_id is not null then '/content?post=' || new.post_id
    when new.task_id is not null then '/tasks'
  end;

  foreach r in array recipients loop
    continue when r is null or r is not distinct from new.actor_id;
    continue when not exists (select 1 from public.profiles where id = r and is_active);
    continue when exists (select 1 from public.notification_prefs np
                          where np.user_id = r and np.kind_group = grp and not np.in_app);
    insert into public.notifications (recipient_id, kind, kind_group, priority, title, link, actor_id, feed_event_id,
                                      lead_id, opportunity_id, task_id, post_id, meeting_id, dedupe_key)
    values (r, new.kind, grp, prio, coalesce(who, 'Someone') || ' ' || new.summary, link, new.actor_id, new.id,
            new.lead_id, new.opportunity_id, new.task_id, new.post_id, new.meeting_id, 'feed:' || new.id)
    on conflict (recipient_id, dedupe_key) do nothing;
  end loop;
  return null;
end $$;
create trigger feed_events_route after insert on public.feed_events
  for each row execute function public.route_feed_event();

-- Users may only mark their own items read (or unread); nothing else changes.
create or replace function public.guard_notification_update() returns trigger
language plpgsql as $$
begin
  if not public.is_system() and (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Only the read state of a notification can change';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications
  for each row execute function public.guard_notification_update();

-- Housekeeping, run lazily by the owner: read items after 90 days, everything after 180 days.
create or replace function public.prune_my_notifications() returns int
language sql security invoker set search_path = public as $$
  with d as (
    delete from public.notifications
     where recipient_id = auth.uid()
       and ((read_at is not null and created_at < now() - interval '90 days') or created_at < now() - interval '180 days')
    returning 1
  )
  select count(*)::int from d;
$$;

alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and public.is_active_user());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());
revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notification_prefs_own on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke execute on function public.route_feed_event() from public, anon, authenticated;
revoke execute on function public.prune_my_notifications() from public, anon;
grant execute on function public.prune_my_notifications() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
