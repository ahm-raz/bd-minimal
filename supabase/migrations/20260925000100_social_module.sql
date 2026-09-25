-- =====================================================================
-- M10: Social media module, part 2 (docs/09-social-media.md)
-- Social media manager role (`social`), content scheduling, review flow, social metrics.
-- The init migration is never edited; functions it defines are replaced here with create or replace.
-- =====================================================================

-- ---------- Role helper ----------------------------------------------
create or replace function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

-- Only founders and BDs create sales records. Every other lead, contact, activity and opportunity
-- policy already requires lead ownership (can_access_lead / owner_id = auth.uid()), which an SMM never has.
drop policy leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_active_user()
              and public.current_user_role() in ('founder', 'bd')
              and created_by = auth.uid()
              and (owner_id = auth.uid() or public.is_founder()));

drop policy opportunities_insert on public.opportunities;
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check (public.current_user_role() in ('founder', 'bd')
              and public.can_access_lead(lead_id) and created_by = auth.uid()
              and owner_id = (select l.owner_id from public.leads l where l.id = lead_id));

-- ---------- Enums ------------------------------------------------------
create type public.social_platform as enum ('linkedin_page', 'linkedin_profile', 'instagram', 'facebook', 'x', 'tiktok', 'youtube', 'other');
create type public.post_format as enum ('text', 'image', 'carousel', 'video', 'reel', 'story', 'article', 'poll');
create type public.post_status as enum ('idea', 'planned', 'drafting', 'in_review', 'changes_requested', 'approved', 'posted', 'missed', 'cancelled');
create type public.post_comment_kind as enum ('comment', 'change_request', 'approval', 'status_note');

-- ---------- Tables -----------------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  platform public.social_platform not null,
  profile_url text,
  audience_timezone text not null default 'America/New_York',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.content_pillars (like public.niches including all);

create table public.posting_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts (id),
  assignee_id uuid not null references public.profiles (id),
  weekdays smallint[] not null check (array_length(weekdays, 1) >= 1 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  local_time time not null,
  timezone text not null,
  pillar_id uuid references public.content_pillars (id),
  default_format public.post_format not null default 'text',
  needs_approval boolean not null default true,
  draft_lead_hours int not null default 24 check (draft_lead_hours between 0 and 336),
  starts_on date not null default current_date,
  ends_on date,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts (id),
  assignee_id uuid not null references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  schedule_id uuid references public.posting_schedules (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  brief text,
  pillar_id uuid references public.content_pillars (id),
  format public.post_format not null default 'text',
  campaign_id uuid references public.campaigns (id),
  scheduled_at timestamptz,
  timezone text,
  draft_due_at timestamptz,
  needs_approval boolean not null default true,
  status public.post_status not null default 'planned',
  caption text,
  hashtags text,
  first_comment text,
  cta_link text,
  media_links text[] not null default '{}',
  posted_at timestamptz,
  post_url text,
  impressions int check (impressions >= 0),
  reactions int check (reactions >= 0),
  comments_count int check (comments_count >= 0),
  shares int check (shares >= 0),
  clicks int check (clicks >= 0),
  results_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_needs_time check (scheduled_at is not null or status in ('idea', 'cancelled')),
  constraint posted_needs_url check (status <> 'posted' or (post_url is not null and posted_at is not null))
);
create unique index posts_schedule_slot on public.posts (schedule_id, scheduled_at) where schedule_id is not null;
create index posts_scheduled_idx on public.posts (scheduled_at);
create index posts_assignee_idx on public.posts (assignee_id, scheduled_at);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid references public.profiles (id),
  kind public.post_comment_kind not null default 'comment',
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

create table public.post_status_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  from_status public.post_status,
  to_status public.post_status not null,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);
create index post_status_events_post_idx on public.post_status_events (post_id, changed_at);

-- Feed: link to posts and the new event kinds
alter table public.feed_events add column post_id uuid references public.posts (id) on delete cascade;
alter table public.feed_events drop constraint feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check check (kind in (
  'lead_created', 'activity_logged', 'stage_changed', 'opportunity_won', 'opportunity_lost', 'task_completed',
  'lead_flagged', 'lead_reassigned',
  'post_submitted', 'post_approved', 'changes_requested', 'post_published', 'post_missed'));

-- ---------- Guard bypass for trusted functions ------------------------
-- ensure_post_slots, mark_missed_posts and the schedule trigger write posts on behalf of the system.
-- They set a transaction-local flag that the guard honours; it is not reachable through the API.
create or replace function public.post_guard_bypassed() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.post_guard_bypass', true), '') = 'on';
$$;

-- ---------- Post rules (docs/09 section 3) ----------------------------
create or replace function public.guard_post_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  founder boolean := public.is_founder();
  trusted boolean := public.is_system() or public.post_guard_bypassed();
  lead_hours int;
  ok boolean;
  s_old public.post_status;
  s_new public.post_status;
begin
  -- Derived fields
  if tg_op = 'INSERT' then
    if new.timezone is null then
      select audience_timezone into new.timezone from public.social_accounts where id = new.account_id;
    end if;
    if new.draft_due_at is null and new.scheduled_at is not null then
      select draft_lead_hours into lead_hours from public.posting_schedules where id = new.schedule_id;
      new.draft_due_at := new.scheduled_at - make_interval(hours => coalesce(lead_hours, 24));
    end if;
  else
    new.updated_at := now();
    if new.scheduled_at is distinct from old.scheduled_at and new.draft_due_at is not distinct from old.draft_due_at then
      if old.scheduled_at is not null and old.draft_due_at is not null and new.scheduled_at is not null then
        new.draft_due_at := old.draft_due_at + (new.scheduled_at - old.scheduled_at);
      elsif new.scheduled_at is not null then
        new.draft_due_at := new.scheduled_at - interval '24 hours';
      end if;
    end if;
    if (new.impressions, new.reactions, new.comments_count, new.shares, new.clicks)
       is distinct from (old.impressions, old.reactions, old.comments_count, old.shares, old.clicks) then
      new.results_recorded_at := now();
    end if;
  end if;

  if new.status = 'posted' then
    new.posted_at := coalesce(new.posted_at, now());
    if new.post_url is null or new.post_url !~* '^https?://[^\s/]+\.[^\s]+$' then
      raise exception 'Add the live post link to mark it as posted.';
    end if;
  end if;

  if trusted then
    return new;
  end if;

  -- Creating posts: the founder, or an SMM suggesting an idea for themself
  if tg_op = 'INSERT' then
    if founder then
      return new;
    end if;
    if public.current_user_role() = 'social' and new.assignee_id = me and new.status = 'idea' and new.created_by = me then
      return new;
    end if;
    raise exception 'Only the founder can create posts. Suggest an idea instead.';
  end if;

  -- Brief fields: founder only (an SMM may still shape their own idea)
  if not founder and not (old.status = 'idea' and old.created_by = me) then
    if new.account_id is distinct from old.account_id
       or new.assignee_id is distinct from old.assignee_id
       or new.scheduled_at is distinct from old.scheduled_at
       or new.needs_approval is distinct from old.needs_approval
       or new.brief is distinct from old.brief
       or new.title is distinct from old.title
       or new.pillar_id is distinct from old.pillar_id
       or new.format is distinct from old.format
       or new.campaign_id is distinct from old.campaign_id
       or new.timezone is distinct from old.timezone
       or new.draft_due_at is distinct from old.draft_due_at
       or new.schedule_id is distinct from old.schedule_id then
      raise exception 'Only the founder can change the account, assignee, time, brief or title of a post.';
    end if;
  end if;
  if not founder and (new.assignee_id is distinct from old.assignee_id or new.created_by is distinct from old.created_by) then
    raise exception 'Only the founder can reassign a post.';
  end if;

  -- Editing the caption of an approved post sends it back for review
  if not founder and old.status = 'approved' and new.status = 'approved' and old.needs_approval
     and new.caption is distinct from old.caption then
    new.status := 'in_review';
    insert into public.post_comments (post_id, author_id, kind, body)
    values (new.id, me, 'status_note', 'Caption changed after approval, so the post went back for review.');
  end if;

  s_old := old.status;
  s_new := new.status;
  if s_new is distinct from s_old then
    ok := case
      when s_new = 'cancelled' then founder and s_old <> 'cancelled'
      when s_old = 'idea' and s_new = 'planned' then founder and new.scheduled_at is not null
      when s_old = 'planned' and s_new = 'drafting' then true
      when s_old = 'drafting' and s_new = 'in_review' then true
      when s_old = 'changes_requested' and s_new in ('drafting', 'in_review') then true
      when s_old = 'in_review' and s_new in ('approved', 'changes_requested') then founder
      when s_old = 'approved' and s_new = 'posted' then true
      when s_old = 'drafting' and s_new = 'posted' then not new.needs_approval
      when s_old = 'missed' and s_new = 'posted' then true
      when s_old = 'approved' and s_new = 'in_review' then true
      else false
    end;
    -- The assignee can't review their own post; only the founder approves or requests changes.
    if s_old = 'in_review' and s_new in ('approved', 'changes_requested') and not founder then
      ok := false;
    end if;
    if not ok then
      raise exception 'A post can''t move from % to % here.', replace(s_old::text, '_', ' '), replace(s_new::text, '_', ' ');
    end if;

    if s_new = 'in_review' and coalesce(trim(new.caption), '') = ''
       and not (new.format in ('image', 'carousel', 'video', 'reel', 'story') and cardinality(new.media_links) > 0) then
      raise exception 'Write the caption (or add the media links) before submitting for review.';
    end if;
    if s_new = 'changes_requested' and not exists (
      select 1 from public.post_comments c
      where c.post_id = new.id and c.kind = 'change_request'
        and c.created_at >= coalesce((select max(e.changed_at) from public.post_status_events e
                                      where e.post_id = new.id and e.to_status = 'in_review'), '-infinity')) then
      raise exception 'Say what needs to change before requesting changes.';
    end if;
    if s_new = 'posted' and (new.posted_at < now() - interval '24 hours' or new.posted_at > now() + interval '5 minutes') then
      raise exception 'Posted time can be up to 24 hours ago, not earlier and not in the future.';
    end if;
  end if;
  return new;
end $$;
create trigger posts_guard before insert or update on public.posts
  for each row execute function public.guard_post_write();

create or replace function public.trg_post_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  late boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.post_status_events (post_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
    return null;
  end if;
  if new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.post_status_events (post_id, from_status, to_status, changed_by)
  values (new.id, old.status, new.status, auth.uid());

  if new.status = 'in_review' then
    insert into public.feed_events (kind, actor_id, subject_user_id, post_id, summary)
    values ('post_submitted', coalesce(auth.uid(), new.assignee_id), new.assignee_id, new.id,
            'submitted ''' || new.title || ''' for review');
  elsif new.status = 'approved' then
    insert into public.feed_events (kind, actor_id, subject_user_id, post_id, summary)
    values ('post_approved', auth.uid(), new.assignee_id, new.id, 'approved ''' || new.title || '''');
  elsif new.status = 'changes_requested' then
    insert into public.feed_events (kind, actor_id, subject_user_id, post_id, summary)
    values ('changes_requested', auth.uid(), new.assignee_id, new.id, 'requested changes on ''' || new.title || '''');
  elsif new.status = 'posted' then
    late := new.posted_at > new.scheduled_at + interval '60 minutes';
    insert into public.feed_events (kind, actor_id, subject_user_id, post_id, summary)
    values ('post_published', coalesce(auth.uid(), new.assignee_id), new.assignee_id, new.id,
            'published ''' || new.title || '''' || case when late then ' (late)' else '' end);
    perform public.check_count_tasks(new.assignee_id, new.posted_at);
  elsif new.status = 'missed' then
    insert into public.feed_events (kind, actor_id, subject_user_id, post_id, summary)
    values ('post_missed', null, new.assignee_id, new.id, 'missed ''' || new.title || '''');
  end if;
  return null;
end $$;
-- No column list: the guard can change status itself (caption edited after approval), which
-- "update of status" would miss.
create trigger posts_after after insert or update on public.posts
  for each row execute function public.trg_post_after();

-- Request changes: the comment and the status move in one transaction (security invoker: RLS applies).
create or replace function public.request_post_changes(p_post uuid, p_body text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Say what needs to change before requesting changes.';
  end if;
  insert into public.post_comments (post_id, author_id, kind, body) values (p_post, auth.uid(), 'change_request', trim(p_body));
  update public.posts set status = 'changes_requested' where id = p_post;
  if not found then
    raise exception 'That post wasn''t found.';
  end if;
end $$;

-- ---------- Recurring slots -------------------------------------------
-- Creates planned posts for active schedules on matching weekdays, at local_time in the schedule's
-- zone (timestamp at time zone handles DST). Idempotent. Only future slots are created, so opening a
-- past week never manufactures missed posts.
create or replace function public.ensure_post_slots(p_from date, p_to date) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  d date;
  ts timestamptz;
  n int := 0;
  k int;
begin
  if not (public.is_founder() or public.is_system() or public.current_user_role() = 'social') then
    raise exception 'Not allowed';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'Use a range of up to 62 days';
  end if;
  perform set_config('app.post_guard_bypass', 'on', true);
  for r in
    select s.*, a.name as account_name, pl.name as pillar_name
    from public.posting_schedules s
    join public.social_accounts a on a.id = s.account_id
    left join public.content_pillars pl on pl.id = s.pillar_id
    join public.profiles p on p.id = s.assignee_id and p.is_active
    where s.is_active and (public.is_founder() or public.is_system() or s.assignee_id = auth.uid())
  loop
    for d in
      select g::date from generate_series(greatest(p_from, r.starts_on), least(p_to, coalesce(r.ends_on, p_to)), interval '1 day') g
    loop
      continue when not (extract(isodow from d)::smallint = any (r.weekdays));
      ts := (d + r.local_time) at time zone r.timezone;
      continue when ts <= now();
      insert into public.posts (account_id, assignee_id, created_by, schedule_id, title, pillar_id, format,
                                scheduled_at, timezone, draft_due_at, needs_approval, status)
      values (r.account_id, r.assignee_id, r.created_by, r.id,
              r.account_name || ' post, ' || coalesce(r.pillar_name, 'Open topic'),
              r.pillar_id, r.default_format, ts, r.timezone,
              ts - make_interval(hours => r.draft_lead_hours), r.needs_approval, 'planned')
      on conflict (schedule_id, scheduled_at) where schedule_id is not null do nothing;
      get diagnostics k = row_count;
      n := n + k;
    end loop;
  end loop;
  perform set_config('app.post_guard_bypass', '', true);
  return n;
end $$;

-- Missed: 2 hours past the scheduled time and not posted, cancelled or an idea. Idempotent;
-- the feed event comes from trg_post_after on the move into missed, so once per post.
create or replace function public.mark_missed_posts() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not (public.is_active_user() or public.is_system()) then
    raise exception 'Not allowed';
  end if;
  perform set_config('app.post_guard_bypass', 'on', true);
  update public.posts set status = 'missed'
  where status in ('planned', 'drafting', 'in_review', 'changes_requested', 'approved')
    and scheduled_at + interval '2 hours' < now();
  get diagnostics n = row_count;
  perform set_config('app.post_guard_bypass', '', true);
  return n;
end $$;

-- Schedule edits change future untouched slots only; stopping cancels future planned slots.
create or replace function public.trg_schedule_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.post_guard_bypass', 'on', true);
  if old.is_active and not new.is_active then
    update public.posts set status = 'cancelled'
    where schedule_id = new.id and status = 'planned' and scheduled_at > now();
  elsif (new.account_id, new.assignee_id, new.weekdays, new.local_time, new.timezone, new.pillar_id,
         new.default_format, new.needs_approval, new.draft_lead_hours, new.starts_on, new.ends_on)
        is distinct from
        (old.account_id, old.assignee_id, old.weekdays, old.local_time, old.timezone, old.pillar_id,
         old.default_format, old.needs_approval, old.draft_lead_hours, old.starts_on, old.ends_on) then
    -- untouched future slots are removed; ensure_post_slots recreates them with the new settings
    delete from public.posts
    where schedule_id = new.id and status = 'planned' and scheduled_at > now()
      and caption is null and cardinality(media_links) = 0;
  end if;
  perform set_config('app.post_guard_bypass', '', true);
  return null;
end $$;
create trigger posting_schedules_after_update after update on public.posting_schedules
  for each row execute function public.trg_schedule_after_update();

-- ---------- Count tasks: posts_published ------------------------------
create or replace function public.count_task_progress(
  p_assignee uuid, p_metric public.task_metric, p_day date, p_niche uuid, p_campaign uuid
) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  tz text := coalesce((select timezone from public.profiles where id = p_assignee), 'UTC');
  n int;
begin
  if not (p_assignee = auth.uid() or public.is_founder() or public.is_system() or pg_trigger_depth() > 0) then
    raise exception 'Not allowed';
  end if;
  if p_metric = 'leads_added' then
    select count(*) into n from public.leads l
    where l.created_by = p_assignee
      and (l.created_at at time zone tz)::date = p_day
      and (p_niche is null or l.niche_id = p_niche)
      and (p_campaign is null or l.campaign_id = p_campaign);
  elsif p_metric = 'posts_published' then
    select count(*) into n from public.posts p
    where p.assignee_id = p_assignee
      and p.status = 'posted'
      and (p.posted_at at time zone tz)::date = p_day
      and (p_campaign is null or p.campaign_id = p_campaign);
  else
    select count(*) into n from public.activities a
    join public.leads l on l.id = a.lead_id
    join public.outcomes o on o.key = a.outcome_key
    where a.user_id = p_assignee
      and (a.occurred_at at time zone tz)::date = p_day
      and (p_niche is null or l.niche_id = p_niche)
      and (p_campaign is null or a.campaign_id = p_campaign)
      and case p_metric
            when 'outreach' then a.category = 'outreach'
            when 'follow_ups' then a.category = 'follow_up'
            when 'replies' then o.is_reply
            when 'meetings_booked' then o.is_meeting
          end;
  end if;
  return n;
end $$;

-- ---------- Sales metrics exclude SMMs --------------------------------
create or replace function public.metrics_scoreboard(p_from timestamptz, p_to timestamptz)
returns table (
  user_id uuid, leads_added int, outreach int, follow_ups int, replies int, positive_replies int,
  meetings_booked int, meetings_done int, proposals_sent int, won_count int, won_revenue numeric,
  new_mrr numeric, avg_completeness numeric, flagged_leads int
)
language sql stable security invoker set search_path = public as $$
  with acts as (
    select a.user_id,
           count(*) filter (where a.category = 'outreach') as outreach,
           count(*) filter (where a.category = 'follow_up') as follow_ups,
           count(*) filter (where o.is_reply) as replies,
           count(*) filter (where o.is_positive) as positive_replies,
           count(*) filter (where o.is_meeting) as meetings_booked
    from public.activities a join public.outcomes o on o.key = a.outcome_key
    where a.occurred_at >= p_from and a.occurred_at < p_to
    group by a.user_id
  ), lds as (
    select created_by as user_id, count(*) as leads_added, round(avg(completeness), 0) as avg_completeness
    from public.leads where created_at >= p_from and created_at < p_to group by created_by
  ), stg as (
    select owner_id as user_id,
           count(distinct opportunity_id) filter (where to_stage = 'meeting_done') as meetings_done,
           count(distinct opportunity_id) filter (where to_stage = 'proposal_sent') as proposals_sent
    from public.opportunity_stage_events
    where changed_at >= p_from and changed_at < p_to group by owner_id
  ), won as (
    select owner_id as user_id, count(*) as won_count, sum(won_value) as won_revenue,
           sum(monthly_amount) filter (where contract_type = 'monthly') as new_mrr
    from public.opportunities
    where stage_key = 'won' and won_at >= p_from and won_at < p_to group by owner_id
  ), flg as (
    select assignee_id as user_id, count(*) as flagged_leads
    from public.tasks where kind = 'lead_fix' and created_at >= p_from and created_at < p_to group by assignee_id
  )
  select p.id,
         coalesce(lds.leads_added, 0)::int, coalesce(acts.outreach, 0)::int, coalesce(acts.follow_ups, 0)::int,
         coalesce(acts.replies, 0)::int, coalesce(acts.positive_replies, 0)::int, coalesce(acts.meetings_booked, 0)::int,
         coalesce(stg.meetings_done, 0)::int, coalesce(stg.proposals_sent, 0)::int,
         coalesce(won.won_count, 0)::int, coalesce(won.won_revenue, 0), coalesce(won.new_mrr, 0),
         lds.avg_completeness, coalesce(flg.flagged_leads, 0)::int
  from public.profiles p
  left join acts on acts.user_id = p.id
  left join lds on lds.user_id = p.id
  left join stg on stg.user_id = p.id
  left join won on won.user_id = p.id
  left join flg on flg.user_id = p.id
  where (p.id = auth.uid() or public.is_founder())
    and p.role <> 'social'
    and (p.is_active or lds.user_id is not null or acts.user_id is not null or won.user_id is not null)
  order by p.role, p.full_name;
$$;

create or replace function public.metrics_daily(p_from date, p_to date, p_tz text, p_user uuid default null)
returns table (day date, user_id uuid, leads_added int, outreach int, follow_ups int, replies int, meetings_booked int)
language sql stable security invoker set search_path = public as $$
  with days as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  people as (
    select id from public.profiles
    where (p_user is null or id = p_user) and is_active and role <> 'social' and (id = auth.uid() or public.is_founder())
  ),
  lds as (
    select (created_at at time zone p_tz)::date as day, created_by as user_id, count(*) as n
    from public.leads
    where created_at >= (p_from::timestamp at time zone p_tz) and created_at < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1, 2
  ), acts as (
    select (a.occurred_at at time zone p_tz)::date as day, a.user_id,
           count(*) filter (where a.category = 'outreach') as outreach,
           count(*) filter (where a.category = 'follow_up') as follow_ups,
           count(*) filter (where o.is_reply) as replies,
           count(*) filter (where o.is_meeting) as meetings
    from public.activities a join public.outcomes o on o.key = a.outcome_key
    where a.occurred_at >= (p_from::timestamp at time zone p_tz) and a.occurred_at < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1, 2
  )
  select d.day, pe.id,
         coalesce(lds.n, 0)::int, coalesce(acts.outreach, 0)::int, coalesce(acts.follow_ups, 0)::int,
         coalesce(acts.replies, 0)::int, coalesce(acts.meetings, 0)::int
  from days d cross join people pe
  left join lds on lds.day = d.day and lds.user_id = pe.id
  left join acts on acts.day = d.day and acts.user_id = pe.id
  order by pe.id, d.day;
$$;

-- ---------- Social metrics (docs/09 section 5) ------------------------
create or replace function public.social_metrics(p_from timestamptz, p_to timestamptz, p_user uuid default null)
returns table (
  user_id uuid, planned int, posted int, on_time int, late int, missed int, on_time_rate numeric,
  changes_requested int, median_approval_hours numeric,
  impressions bigint, reactions bigint, comments bigint, shares bigint, clicks bigint
)
language sql stable security invoker set search_path = public as $$
  with p as (
    select * from public.posts
    where scheduled_at >= p_from and scheduled_at < p_to
      and status not in ('idea', 'cancelled')
      and (p_user is null or assignee_id = p_user)
  ), agg as (
    select assignee_id as user_id,
           count(*) as planned,
           count(*) filter (where status = 'posted') as posted,
           count(*) filter (where status = 'posted' and posted_at <= scheduled_at + interval '60 minutes') as on_time,
           count(*) filter (where status = 'posted' and posted_at > scheduled_at + interval '60 minutes') as late,
           count(*) filter (where status = 'missed') as missed,
           sum(impressions) as impressions, sum(reactions) as reactions, sum(comments_count) as comments,
           sum(shares) as shares, sum(clicks) as clicks
    from p group by assignee_id
  ), cr as (
    select p.assignee_id as user_id, count(*) as n
    from public.post_status_events e join p on p.id = e.post_id
    where e.to_status = 'changes_requested'
    group by p.assignee_id
  ), appr as (
    select p.assignee_id as user_id,
           percentile_cont(0.5) within group (
             order by extract(epoch from (
               (select min(e2.changed_at) from public.post_status_events e2 where e2.post_id = p.id and e2.to_status = 'approved')
               - (select min(e1.changed_at) from public.post_status_events e1 where e1.post_id = p.id and e1.to_status = 'in_review')
             )) / 3600.0) as hours
    from p
    where exists (select 1 from public.post_status_events e where e.post_id = p.id and e.to_status = 'approved')
      and exists (select 1 from public.post_status_events e where e.post_id = p.id and e.to_status = 'in_review')
    group by p.assignee_id
  )
  select pr.id,
         coalesce(agg.planned, 0)::int, coalesce(agg.posted, 0)::int, coalesce(agg.on_time, 0)::int,
         coalesce(agg.late, 0)::int, coalesce(agg.missed, 0)::int,
         case when coalesce(agg.posted, 0) = 0 then null else round(agg.on_time::numeric / agg.posted, 4) end,
         coalesce(cr.n, 0)::int, round(appr.hours::numeric, 1),
         coalesce(agg.impressions, 0), coalesce(agg.reactions, 0), coalesce(agg.comments, 0),
         coalesce(agg.shares, 0), coalesce(agg.clicks, 0)
  from public.profiles pr
  left join agg on agg.user_id = pr.id
  left join cr on cr.user_id = pr.id
  left join appr on appr.user_id = pr.id
  where (pr.id = auth.uid() or public.is_founder())
    and (p_user is null or pr.id = p_user)
    and (agg.user_id is not null or (pr.role = 'social' and pr.is_active))
  order by pr.full_name;
$$;

-- Social numbers split by account or pillar. Average reactions = over posted posts with results recorded.
create or replace function public.social_metrics_by(
  p_from timestamptz, p_to timestamptz, p_dimension text, p_user uuid default null
)
returns table (
  dimension_id uuid, dimension_name text, planned int, posted int, on_time int, missed int,
  impressions bigint, reactions bigint, avg_reactions numeric
)
language sql stable security invoker set search_path = public as $$
  with p as (
    select case p_dimension when 'account' then po.account_id else po.pillar_id end as dim, po.*
    from public.posts po
    where po.scheduled_at >= p_from and po.scheduled_at < p_to
      and po.status not in ('idea', 'cancelled')
      and (p_user is null or po.assignee_id = p_user)
  ), agg as (
    select dim,
           count(*) as planned,
           count(*) filter (where status = 'posted') as posted,
           count(*) filter (where status = 'posted' and posted_at <= scheduled_at + interval '60 minutes') as on_time,
           count(*) filter (where status = 'missed') as missed,
           sum(impressions) as impressions,
           sum(reactions) as reactions,
           avg(reactions) filter (where status = 'posted' and reactions is not null) as avg_reactions
    from p group by dim
  ), dims as (
    select a.id, a.name, a.sort_order, a.is_active from public.social_accounts a where p_dimension = 'account'
    union all
    select c.id, c.name, c.sort_order, c.is_active from public.content_pillars c where p_dimension = 'pillar'
  )
  select d.id, d.name,
         coalesce(agg.planned, 0)::int, coalesce(agg.posted, 0)::int, coalesce(agg.on_time, 0)::int,
         coalesce(agg.missed, 0)::int, coalesce(agg.impressions, 0), coalesce(agg.reactions, 0),
         round(agg.avg_reactions, 1)
  from dims d
  left join agg on agg.dim = d.id
  where d.is_active or agg.dim is not null
  order by d.sort_order, d.name;
$$;

-- Posted-per-day grid (consistency view). p_tz = the VIEWER's time zone.
-- scheduled and missed count by the slot's day; posted counts by the day it went out.
create or replace function public.social_daily(p_from date, p_to date, p_tz text, p_user uuid default null)
returns table (day date, user_id uuid, scheduled int, posted int, missed int)
language sql stable security invoker set search_path = public as $$
  with days as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  people as (
    select id from public.profiles
    where role = 'social' and is_active and (p_user is null or id = p_user) and (id = auth.uid() or public.is_founder())
  ),
  sched as (
    select (scheduled_at at time zone p_tz)::date as day, assignee_id as user_id,
           count(*) as n, count(*) filter (where status = 'missed') as missed
    from public.posts
    where status not in ('idea', 'cancelled')
      and scheduled_at >= (p_from::timestamp at time zone p_tz) and scheduled_at < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1, 2
  ), pub as (
    select (posted_at at time zone p_tz)::date as day, assignee_id as user_id, count(*) as n
    from public.posts
    where status = 'posted'
      and posted_at >= (p_from::timestamp at time zone p_tz) and posted_at < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1, 2
  )
  select d.day, pe.id, coalesce(sched.n, 0)::int, coalesce(pub.n, 0)::int, coalesce(sched.missed, 0)::int
  from days d cross join people pe
  left join sched on sched.day = d.day and sched.user_id = pe.id
  left join pub on pub.day = d.day and pub.user_id = pe.id
  order by pe.id, d.day;
$$;

revoke execute on function public.post_guard_bypassed() from public, anon, authenticated;
revoke execute on function public.guard_post_write() from public, anon, authenticated;
revoke execute on function public.trg_post_after() from public, anon, authenticated;
revoke execute on function public.trg_schedule_after_update() from public, anon, authenticated;
-- is_system() is true for anonymous callers too, so the housekeeping functions are for signed-in users only.
revoke execute on function public.ensure_post_slots(date, date) from public, anon;
revoke execute on function public.mark_missed_posts() from public, anon;
revoke execute on function public.request_post_changes(uuid, text) from public, anon;
grant execute on function public.ensure_post_slots(date, date) to authenticated;
grant execute on function public.mark_missed_posts() to authenticated;
grant execute on function public.request_post_changes(uuid, text) to authenticated;

-- ---------- RLS --------------------------------------------------------
alter table public.social_accounts enable row level security;
alter table public.content_pillars enable row level security;
alter table public.posting_schedules enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_status_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['social_accounts', 'content_pillars'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_active_user())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_founder())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_founder()) with check (public.is_founder())', t);
  end loop;
end $$;

create policy posting_schedules_founder on public.posting_schedules for all to authenticated
  using (public.is_founder()) with check (public.is_founder());
create policy posting_schedules_own on public.posting_schedules for select to authenticated
  using (public.is_active_user() and assignee_id = auth.uid());

create policy posts_select on public.posts for select to authenticated
  using (public.is_active_user() and (public.is_founder() or assignee_id = auth.uid()));
create policy posts_insert on public.posts for insert to authenticated
  with check (public.is_founder()
              or (public.is_active_user() and public.current_user_role() = 'social'
                  and assignee_id = auth.uid() and created_by = auth.uid() and status = 'idea'));
create policy posts_update on public.posts for update to authenticated
  using (public.is_active_user() and (public.is_founder() or assignee_id = auth.uid()))
  with check (public.is_founder() or assignee_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated using (public.is_founder());

create policy post_comments_select on public.post_comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_comments_insert on public.post_comments for insert to authenticated
  with check (author_id = auth.uid()
              and exists (select 1 from public.posts p where p.id = post_id)
              and (kind = 'comment' or (kind in ('change_request', 'approval') and public.is_founder())));

create policy post_status_events_select on public.post_status_events for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

-- ---------- Defaults ---------------------------------------------------
insert into public.content_pillars (name, sort_order) values
  ('Case study', 1), ('Tip or how-to', 2), ('Behind the scenes', 3), ('Offer', 4), ('Industry news', 5), ('Client result', 6);
