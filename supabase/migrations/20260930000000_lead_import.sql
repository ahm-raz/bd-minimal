-- M12: CSV lead import (docs/04 section 10, docs/07 section 3a).
-- Founder always; a BD only when the founder turns on profiles.can_import_leads. Every import is a batch:
-- validated in the app, stored here, then written by import_lead_batch() in ONE transaction, so a failure
-- at any row leaves the database exactly as it was. Imported leads carry import_batch_id and the source
-- "CSV import", and don't count toward "Leads added" (owner's decision).

-- ---------- Permission ------------------------------------------------
alter table public.profiles add column can_import_leads boolean not null default false;

create or replace function public.guard_profile_update() returns trigger
language plpgsql as $$
begin
  if not public.is_system() and not public.is_founder() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.primary_niche_id is distinct from old.primary_niche_id
       or new.email is distinct from old.email
       or new.can_import_leads is distinct from old.can_import_leads then
      raise exception 'Only the founder can change role, status, niche, email or import permission';
    end if;
  end if;
  if new.role is distinct from old.role and old.role = 'founder' then
    raise exception 'The founder role cannot be removed';
  end if;
  if new.is_active = false and old.is_active = true then
    if old.role = 'founder' then
      raise exception 'The founder cannot be deactivated';
    end if;
    new.deactivated_at := now();
  elsif new.is_active = true then
    new.deactivated_at := null;
  end if;
  return new;
end $$;

-- Checked on every step, so revoking takes effect at once.
create or replace function public.can_import_leads() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and (role = 'founder' or (role = 'bd' and can_import_leads))
  );
$$;

-- ---------- Batches: audit log and staging ------------------------------
create sequence public.lead_import_seq;

create table public.lead_import_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    default 'IMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.lead_import_seq')::text, 5, '0'),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_by_role public.user_role not null,
  filename text not null check (length(filename) between 1 and 255),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  default_owner_id uuid references public.profiles (id),
  status text not null check (status in ('validated', 'imported', 'failed', 'cancelled')),
  total_rows int not null default 0 check (total_rows >= 0),
  valid_rows int not null default 0 check (valid_rows >= 0),
  invalid_rows int not null default 0 check (invalid_rows >= 0),
  duplicate_rows int not null default 0 check (duplicate_rows >= 0),
  warning_count int not null default 0 check (warning_count >= 0),
  imported_rows int not null default 0 check (imported_rows >= 0),
  errors jsonb not null default '[]',
  error_summary text,
  rows jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  imported_at timestamptz,
  check (status <> 'validated' or rows is not null),
  check (jsonb_array_length(errors) <= 200),
  check (rows is null or jsonb_array_length(rows) <= 2000)
);
create index lead_import_batches_created on public.lead_import_batches (created_by, created_at desc);
create index lead_import_batches_file on public.lead_import_batches (file_sha256) where status = 'imported';
grant usage on sequence public.lead_import_seq to authenticated;

-- Rate limit: 10 uploads per person per 10 minutes. The role is recorded from the profile, not trusted.
create or replace function public.guard_import_batch_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.lead_import_batches
      where created_by = new.created_by and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many imports. Wait a few minutes and try again.';
  end if;
  new.created_by_role := (select role from public.profiles where id = new.created_by);
  new.imported_rows := 0;
  new.imported_at := null;
  new.created_at := now();
  new.expires_at := now() + interval '30 minutes';
  return new;
end $$;
create trigger lead_import_batches_insert before insert on public.lead_import_batches
  for each row execute function public.guard_import_batch_insert();

-- Only these moves, and nothing else changes: validated → failed or cancelled (the owner), and
-- validated → imported (only from inside import_lead_batch).
create or replace function public.guard_import_batch_update() returns trigger
language plpgsql as $$
begin
  if public.is_system() then return new; end if;
  if (new.id, new.code, new.created_by, new.created_by_role, new.filename, new.file_sha256, new.default_owner_id,
      new.total_rows, new.valid_rows, new.created_at, new.expires_at)
     is distinct from
     (old.id, old.code, old.created_by, old.created_by_role, old.filename, old.file_sha256, old.default_owner_id,
      old.total_rows, old.valid_rows, old.created_at, old.expires_at) then
    raise exception 'An import batch can''t be edited';
  end if;
  if old.status <> 'validated' then
    raise exception 'This import is already %', old.status;
  end if;
  if new.status = 'imported' then
    if current_setting('cao.importing', true) is distinct from old.id::text then
      raise exception 'Use import_lead_batch() to import';
    end if;
  elsif new.status in ('failed', 'cancelled') then
    if new.imported_rows <> 0 or new.imported_at is not null then
      raise exception 'A failed or cancelled import has no leads';
    end if;
    new.rows := null;
  elsif new.status <> 'validated' then
    raise exception 'Unknown import status';
  end if;
  return new;
end $$;
create trigger lead_import_batches_update before update on public.lead_import_batches
  for each row execute function public.guard_import_batch_update();

-- One feed line per import, not one per lead.
create or replace function public.trg_import_batch_feed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'imported' and old.status is distinct from 'imported' then
    insert into public.feed_events (kind, actor_id, subject_user_id, summary)
    values ('leads_imported', new.created_by, new.created_by,
            'imported ' || new.imported_rows || ' lead' || case when new.imported_rows = 1 then '' else 's' end
            || ' from ' || new.filename || ' (' || new.code || ')');
  end if;
  return null;
end $$;
create trigger lead_import_batches_feed after update on public.lead_import_batches
  for each row execute function public.trg_import_batch_feed();

alter table public.lead_import_batches enable row level security;
create policy import_batches_select on public.lead_import_batches for select to authenticated
  using (created_by = auth.uid() or public.is_founder());
create policy import_batches_insert on public.lead_import_batches for insert to authenticated
  with check (created_by = auth.uid() and public.can_import_leads() and status in ('validated', 'failed'));
create policy import_batches_update on public.lead_import_batches for update to authenticated
  using (created_by = auth.uid() and public.can_import_leads())
  with check (created_by = auth.uid());

-- ---------- Leads: the marker ----------------------------------------
alter table public.leads add column import_batch_id uuid references public.lead_import_batches (id) on delete set null;
create index leads_import_batch on public.leads (import_batch_id) where import_batch_id is not null;

-- Hidden from the Add lead form (is_active false); only imports set it.
insert into public.lead_sources (name, sort_order, is_active) values ('CSV import', 999, false)
on conflict (name) do nothing;

-- Imported leads: ownership history yes; no per-lead feed line and no count-task credit.
create or replace function public.trg_lead_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lead_owner_events (lead_id, from_owner, to_owner, changed_by)
  values (new.id, null, new.owner_id, new.created_by);
  if new.import_batch_id is null then
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, summary)
    values ('lead_created', new.created_by, new.owner_id, new.id,
            'added lead ' || new.company_name || coalesce(' (' || nullif(concat_ws(', ', new.city, new.state_region), '') || ')', ''));
    perform public.check_count_tasks(new.created_by, new.created_at);
  end if;
  return null;
end $$;

-- ---------- Duplicates against existing leads ---------------------------
-- Same rule as the Add lead check (docs/04 section 1): same owner and the same website domain, company
-- name, or contact email / LinkedIn. Invoker rights: a BD only ever compares with their own leads.
create or replace function public.import_conflicts(p_batch uuid)
returns table (row_number int, reason text)
language sql stable security invoker set search_path = public as $$
  with x as (
    select r.* from public.lead_import_batches b,
      jsonb_to_recordset(coalesce(b.rows, '[]')) as r("row" int, owner_id uuid, domain text, company_name text, contact jsonb)
    where b.id = p_batch
  ), hits as (
    select x."row", 1 as rank, 'same website as ' || l.company_name as reason
    from x join public.leads l on l.owner_id = x.owner_id and l.domain = x.domain
    where x.domain is not null
    union all
    select x."row", 2, 'same company name as an existing lead'
    from x join public.leads l on l.owner_id = x.owner_id and lower(l.company_name) = lower(x.company_name)
    union all
    select x."row", 3, 'same contact email as ' || l.company_name
    from x join public.leads l on l.owner_id = x.owner_id
    join public.contacts c on c.lead_id = l.id and lower(c.email) = lower(x.contact ->> 'email')
    where x.contact ->> 'email' is not null
    union all
    select x."row", 4, 'same contact LinkedIn as ' || l.company_name
    from x join public.leads l on l.owner_id = x.owner_id
    join public.contacts c on c.lead_id = l.id and c.linkedin_url = x.contact ->> 'linkedin_url'
    where x.contact ->> 'linkedin_url' is not null
  )
  select distinct on (hits."row") hits."row", hits.reason from hits order by hits."row", hits.rank;
$$;

-- ---------- The import: all rows or none --------------------------------
-- Invoker rights, so every insert passes the same RLS as Add lead (a BD can only create their own leads).
create or replace function public.import_lead_batch(p_batch uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare
  b public.lead_import_batches;
  r record;
  src uuid;
  new_id uuid;
  n int := 0;
  conflict record;
  owner uuid;
begin
  if not public.can_import_leads() then
    raise exception 'You don''t have permission to import leads' using errcode = '42501';
  end if;
  select * into b from public.lead_import_batches where id = p_batch for update;
  if not found or b.created_by <> auth.uid() then
    raise exception 'Import not found';
  end if;
  if b.status <> 'validated' then
    raise exception 'This import is already %', b.status;
  end if;
  if b.expires_at < now() then
    raise exception 'This preview has expired. Upload the file again.';
  end if;

  -- Serialise imports per owner, then re-check duplicates against what exists now.
  for owner in
    select distinct (e ->> 'owner_id')::uuid from jsonb_array_elements(b.rows) e order by 1
  loop
    perform pg_advisory_xact_lock(hashtext('lead-import:' || owner::text));
  end loop;
  select * into conflict from public.import_conflicts(p_batch) limit 1;
  if found then
    raise exception 'Row %: %. No leads were added.', conflict.row_number, conflict.reason;
  end if;

  select id into src from public.lead_sources where name = 'CSV import';

  for r in
    select * from jsonb_to_recordset(b.rows) as x(
      owner_id uuid, niche_id uuid, channel_id uuid, campaign_id uuid, priority public.lead_priority,
      company_name text, website text, company_phone text, company_email text, company_linkedin_url text,
      address text, city text, state_region text, country text, lead_timezone text, sub_niche text,
      company_size text, notes text, pain_point text, offer text, tags text[], contact jsonb)
  loop
    insert into public.leads (
      owner_id, created_by, niche_id, channel_id, campaign_id, source_id, priority, company_name, website,
      company_phone, company_email, company_linkedin_url, address, city, state_region, country, lead_timezone,
      sub_niche, company_size, notes, pain_point, offer, tags, import_batch_id)
    values (
      r.owner_id, auth.uid(), r.niche_id, r.channel_id, r.campaign_id, src, coalesce(r.priority, 'medium'),
      r.company_name, r.website, r.company_phone, r.company_email, r.company_linkedin_url, r.address, r.city,
      r.state_region, coalesce(r.country, 'United States'), r.lead_timezone, r.sub_niche, r.company_size,
      r.notes, r.pain_point, r.offer, coalesce(r.tags, '{}'), p_batch)
    returning id into new_id;
    if jsonb_typeof(r.contact) = 'object' then
      insert into public.contacts (lead_id, first_name, last_name, job_title, email, phone, mobile_phone,
                                   linkedin_url, is_primary)
      values (new_id, r.contact ->> 'first_name', r.contact ->> 'last_name', r.contact ->> 'job_title',
              r.contact ->> 'email', r.contact ->> 'phone', r.contact ->> 'mobile_phone',
              r.contact ->> 'linkedin_url', true);
    end if;
    n := n + 1;
  end loop;

  perform set_config('cao.importing', p_batch::text, true);
  update public.lead_import_batches
     set status = 'imported', imported_rows = n, imported_at = now(), rows = null
   where id = p_batch;
  perform set_config('cao.importing', '', true);
  return n;
end $$;

-- ---------- Feed and notifications ----------------------------------------
alter table public.feed_events drop constraint feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check check (kind in (
  'lead_created', 'activity_logged', 'stage_changed', 'opportunity_won', 'opportunity_lost', 'task_completed',
  'lead_flagged', 'lead_reassigned',
  'post_submitted', 'post_approved', 'changes_requested', 'post_published', 'post_missed',
  'meeting_booked', 'meeting_rescheduled', 'meeting_cancelled', 'meeting_held', 'meeting_no_show',
  'task_assigned', 'post_assigned', 'post_comment', 'leads_imported'));

create or replace function public.notification_group(p_kind text) returns text
language sql immutable as $$
  select case
    when p_kind like 'meeting_%' then 'meetings'
    when p_kind in ('stage_changed', 'opportunity_won', 'opportunity_lost') then 'deals'
    when p_kind in ('lead_reassigned', 'lead_flagged', 'activity_logged', 'lead_created', 'leads_imported') then 'leads'
    when p_kind in ('task_assigned', 'task_completed') then 'tasks'
    else 'social'
  end;
$$;

-- The founder hears about a BD's import.
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
    when 'task_completed', 'leads_imported', 'post_submitted', 'meeting_held', 'meeting_no_show', 'post_published' then
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
    when new.kind = 'leads_imported' then '/leads/import'
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

-- ---------- "Leads added" leaves imports out (docs/05) -------------------
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
      and l.import_batch_id is null
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
    from public.leads where created_at >= p_from and created_at < p_to and import_batch_id is null
    group by created_by
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
      and import_batch_id is null
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

create or replace function public.metrics_by_dimension(
  p_from timestamptz, p_to timestamptz, p_dimension text, p_user uuid default null
)
returns table (
  dimension_id uuid, dimension_name text, leads_added int, outreach int, replies int, positive_replies int,
  meetings_booked int, proposals_sent int, won_count int, won_revenue numeric
)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_dimension not in ('niche', 'channel', 'campaign') then
    raise exception 'dimension must be niche, channel or campaign';
  end if;
  return query
  with lds as (
    select case p_dimension when 'niche' then l.niche_id when 'channel' then l.channel_id else l.campaign_id end as dim,
           count(*) as n
    from public.leads l
    where l.created_at >= p_from and l.created_at < p_to and (p_user is null or l.created_by = p_user)
      and l.import_batch_id is null
    group by 1
  ), acts as (
    select case p_dimension when 'niche' then l.niche_id when 'channel' then a.channel_id else a.campaign_id end as dim,
           count(*) filter (where a.category = 'outreach') as outreach,
           count(*) filter (where o.is_reply) as replies,
           count(*) filter (where o.is_positive) as positive_replies,
           count(*) filter (where o.is_meeting) as meetings_booked
    from public.activities a
    join public.leads l on l.id = a.lead_id
    join public.outcomes o on o.key = a.outcome_key
    where a.occurred_at >= p_from and a.occurred_at < p_to and (p_user is null or a.user_id = p_user)
    group by 1
  ), stg as (
    select case p_dimension when 'niche' then l.niche_id when 'channel' then l.channel_id else l.campaign_id end as dim,
           count(distinct e.opportunity_id) as proposals
    from public.opportunity_stage_events e
    join public.opportunities op on op.id = e.opportunity_id
    join public.leads l on l.id = op.lead_id
    where e.to_stage = 'proposal_sent' and e.changed_at >= p_from and e.changed_at < p_to
      and (p_user is null or e.owner_id = p_user)
    group by 1
  ), won as (
    select case p_dimension when 'niche' then l.niche_id when 'channel' then l.channel_id else l.campaign_id end as dim,
           count(*) as n, sum(op.won_value) as revenue
    from public.opportunities op join public.leads l on l.id = op.lead_id
    where op.stage_key = 'won' and op.won_at >= p_from and op.won_at < p_to
      and (p_user is null or op.owner_id = p_user)
    group by 1
  ), dims as (
    select n.id, n.name, n.sort_order from public.niches n where p_dimension = 'niche'
    union all select c.id, c.name, c.sort_order from public.channels c where p_dimension = 'channel'
    union all select k.id, k.name, 0 from public.campaigns k where p_dimension = 'campaign'
  )
  select d.id, d.name,
         coalesce(lds.n, 0)::int, coalesce(acts.outreach, 0)::int, coalesce(acts.replies, 0)::int,
         coalesce(acts.positive_replies, 0)::int, coalesce(acts.meetings_booked, 0)::int,
         coalesce(stg.proposals, 0)::int, coalesce(won.n, 0)::int, coalesce(won.revenue, 0)
  from dims d
  left join lds on lds.dim = d.id
  left join acts on acts.dim = d.id
  left join stg on stg.dim = d.id
  left join won on won.dim = d.id
  order by d.sort_order, d.name;
end $$;
