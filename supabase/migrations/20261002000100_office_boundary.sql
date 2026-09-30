-- =====================================================================
-- M15 (docs/11-offices.md section 4): the office boundary.
--
-- How it works:
--   1. Every business table gets one RESTRICTIVE policy: a row is visible and writable only when its
--      office_id is the caller's office. Restrictive policies are ANDed with the existing ones, so every
--      rule in docs/03 now also stops at the office wall.
--   2. The postgres role bypasses RLS, so security definer functions owned by it would skip that wall.
--      They are re-owned by office_definer, a NOLOGIN role that does NOT bypass RLS: the restrictive
--      policy applies inside them too. office_definer gets one permissive policy per table, so inside
--      those functions only the office wall applies (as before, they do their own role checks).
--   3. Only a short, reviewed list of functions stays owned by postgres (they read the caller's own
--      profile, or are the platform admin's). supabase/tests/07_offices_test.sql fails if that list grows.
--   4. Trusted server contexts (migrations, SQL editor, the service-role key: no signed-in user and not
--      the anon role) still see every office, as before.
-- =====================================================================

-- ---------- Who the caller is --------------------------------------------
-- The caller's office, only while they're an active member of an active office. Null otherwise, so a
-- deactivated user or a suspended office reads nothing.
create or replace function public.current_office_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.office_id from public.profiles p join public.offices o on o.id = p.office_id
  where p.id = auth.uid() and p.is_active and o.status = 'active';
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_office_id() is not null;
$$;

create or replace function public.is_founder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'founder' and office_id = public.current_office_id());
$$;

create or replace function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and office_id = public.current_office_id();
$$;

create or replace function public.can_import_leads() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and office_id = public.current_office_id()
      and (role = 'founder' or (role = 'bd' and can_import_leads))
  );
$$;

-- For sign-in and the app shell: why a signed-in user can't read anything (docs/11 section 5).
create or replace function public.my_account_state() returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'signed_out'
    when p.id is null then 'no_profile'
    when not p.is_active then 'deactivated'
    when o.status <> 'active' then 'suspended'
    else 'active' end
  from (select 1) one
  left join public.profiles p on p.id = auth.uid()
  left join public.offices o on o.id = p.office_id;
$$;
grant execute on function public.my_account_state() to authenticated;

-- No signed-in user and not an anonymous API call: migrations, SQL editor, service-role key and the
-- triggers they fire. These see every office, as before.
create or replace function public.is_trusted_context() returns boolean
language sql stable as $$
  select auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated');
$$;

-- ---------- The office_definer role ----------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'office_definer') then
    create role office_definer nologin nobypassrls;
  end if;
end $$;
grant authenticated to office_definer;   -- auth schema, auth.uid() and the API grants
grant office_definer to postgres;        -- so migrations can own and replace its functions
grant usage, create on schema public to office_definer;
grant select, insert, update, delete on all tables in schema public to office_definer;
grant usage, select, update on all sequences in schema public to office_definer;
grant execute on all functions in schema public to office_definer;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to office_definer;
alter default privileges for role postgres in schema public grant usage, select, update on sequences to office_definer;
alter default privileges for role postgres in schema public grant execute on functions to office_definer;

-- ---------- Policies: the office wall on every business table --------------
do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'office_id' and not a.attisdropped)
      and c.relname <> 'pending_members'
  loop
    execute format($p$
      create policy office_boundary on public.%I as restrictive for all to public
        using (office_id = (select public.current_office_id()) or (select public.is_trusted_context()))
        with check (office_id = (select public.current_office_id()) or (select public.is_trusted_context()))
    $p$, t);
    execute format('create policy office_definer_all on public.%I for all to office_definer using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- "The founder" is the row's office founder; stage and outcome joins match the office -------
-- (the deployed definitions with only those lines changed)
CREATE OR REPLACE FUNCTION public.route_feed_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select id into founder from public.profiles where role = 'founder' and is_active and office_id = new.office_id limit 1;

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
    continue when not exists (select 1 from public.profiles where id = r and is_active and office_id = new.office_id);
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
end $function$;

CREATE OR REPLACE FUNCTION public.trg_activity_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cat public.activity_category;
  allowed public.activity_category[];
begin
  select category into cat from public.activity_types where id = new.activity_type_id;
  new.category := cat;
  select allowed_categories into allowed from public.outcomes where key = new.outcome_key and office_id = new.office_id;
  if not (cat = any (allowed)) then
    raise exception 'Outcome % is not allowed for % activities', new.outcome_key, cat;
  end if;
  if new.channel_id is null then
    select coalesce(t.default_channel_id, l.channel_id) into new.channel_id
    from public.leads l, public.activity_types t
    where l.id = new.lead_id and t.id = new.activity_type_id;
  end if;
  if new.campaign_id is null then
    select campaign_id into new.campaign_id from public.leads where id = new.lead_id;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_activity_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select allowed_categories into allowed from public.outcomes where key = new.outcome_key and office_id = new.office_id;
    if not (new.category = any (allowed)) then
      raise exception 'Outcome % is not allowed for % activities', new.outcome_key, new.category;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_activity_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l public.leads;
  o public.outcomes;
  new_status public.lead_status;
  type_name text;
begin
  select * into l from public.leads where id = new.lead_id;
  select * into o from public.outcomes where key = new.outcome_key and office_id = new.office_id;
  select name into type_name from public.activity_types where id = new.activity_type_id;
  new_status := l.status;

  -- statuses the system never overrides
  if l.status not in ('qualified', 'customer', 'lost', 'bad_fit') then
    if new.outcome_key = 'not_interested' then
      new_status := 'not_interested';
    elsif o.is_reply then
      new_status := 'replied';
    elsif l.status = 'new' and new.category <> 'inbound_reply' then
      new_status := 'contacted';
    end if;
  end if;

  update public.leads
     set status = new_status,
         last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
   where id = new.lead_id;

  insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
  values ('activity_logged', new.user_id, l.owner_id, new.lead_id, new.opportunity_id,
          'logged ' || type_name || ' (' || o.label || ') with ' || l.company_name);

  perform public.check_count_tasks(new.user_id, new.occurred_at);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_opportunity_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l public.leads;
  stage_label text;
  open_left int;
  has_won boolean;
begin
  if tg_op = 'UPDATE' and new.stage_key is not distinct from old.stage_key then
    return null;
  end if;

  select * into l from public.leads where id = new.lead_id;
  select label into stage_label from public.stages where key = new.stage_key and office_id = new.office_id;

  insert into public.opportunity_stage_events (opportunity_id, from_stage, to_stage, owner_id, changed_by)
  values (new.id, case when tg_op = 'UPDATE' then old.stage_key end, new.stage_key, new.owner_id, auth.uid());

  select count(*) into open_left from public.opportunities o join public.stages s on s.key = o.stage_key and s.office_id = o.office_id
  where o.lead_id = new.lead_id and s.is_open;
  select exists (select 1 from public.opportunities where lead_id = new.lead_id and stage_key = 'won') into has_won;

  if new.stage_key = 'won' then
    update public.leads set status = 'customer' where id = new.lead_id;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('opportunity_won', auth.uid(), new.owner_id, new.lead_id, new.id,
            'won ' || l.company_name || ' for $' || to_char(new.won_value, 'FM999,999,990'));
  elsif new.stage_key = 'lost' then
    if has_won then
      update public.leads set status = 'customer' where id = new.lead_id and status <> 'customer';
    elsif open_left = 0 then
      update public.leads set status = 'lost' where id = new.lead_id;
    end if;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('opportunity_lost', auth.uid(), new.owner_id, new.lead_id, new.id, 'lost ' || l.company_name);
  else
    update public.leads set status = case when has_won then 'customer' else 'qualified' end::public.lead_status
    where id = new.lead_id;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('stage_changed', auth.uid(), new.owner_id, new.lead_id, new.id,
            case when tg_op = 'INSERT' then 'created opportunity for ' || l.company_name
                 else 'moved ' || l.company_name || ' to ' || stage_label end
            || case when new.estimated_value > 0 then ' ($' || to_char(new.estimated_value, 'FM999,999,990') || ')' else '' end);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_lead_owner_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.owner_id is distinct from old.owner_id then
    insert into public.lead_owner_events (lead_id, from_owner, to_owner, changed_by)
    values (new.id, old.owner_id, new.owner_id, auth.uid());
    -- open opportunities follow the lead
    update public.opportunities o set owner_id = new.owner_id
    from public.stages s
    where o.lead_id = new.id and s.key = o.stage_key and s.office_id = o.office_id and s.is_open;
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
end $function$;

CREATE OR REPLACE FUNCTION public.count_task_progress(p_assignee uuid, p_metric task_metric, p_day date, p_niche uuid, p_campaign uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    join public.outcomes o on o.key = a.outcome_key and o.office_id = a.office_id
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
end $function$;

CREATE OR REPLACE FUNCTION public.metrics_by_dimension(p_from timestamp with time zone, p_to timestamp with time zone, p_dimension text, p_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(dimension_id uuid, dimension_name text, leads_added integer, outreach integer, replies integer, positive_replies integer, meetings_booked integer, proposals_sent integer, won_count integer, won_revenue numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    join public.outcomes o on o.key = a.outcome_key and o.office_id = a.office_id
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
end $function$;

CREATE OR REPLACE FUNCTION public.metrics_scoreboard(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(user_id uuid, leads_added integer, outreach integer, follow_ups integer, replies integer, positive_replies integer, meetings_booked integer, meetings_done integer, proposals_sent integer, won_count integer, won_revenue numeric, new_mrr numeric, avg_completeness numeric, flagged_leads integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with acts as (
    select a.user_id,
           count(*) filter (where a.category = 'outreach') as outreach,
           count(*) filter (where a.category = 'follow_up') as follow_ups,
           count(*) filter (where o.is_reply) as replies,
           count(*) filter (where o.is_positive) as positive_replies,
           count(*) filter (where o.is_meeting) as meetings_booked
    from public.activities a join public.outcomes o on o.key = a.outcome_key and o.office_id = a.office_id
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
$function$;

CREATE OR REPLACE FUNCTION public.metrics_daily(p_from date, p_to date, p_tz text, p_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(day date, user_id uuid, leads_added integer, outreach integer, follow_ups integer, replies integer, meetings_booked integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    from public.activities a join public.outcomes o on o.key = a.outcome_key and o.office_id = a.office_id
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
$function$;

-- ---------- Security definer functions run inside the office wall ----------
-- Everything except this reviewed list is re-owned by office_definer. Keep the list in sync with
-- supabase/tests/07_offices_test.sql.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname not in (
        'current_office_id', 'is_active_user', 'is_founder', 'current_user_role', 'can_import_leads',
        'my_account_state', 'is_platform_admin', 'handle_new_user', 'office_refs', 'seed_office_defaults',
        'create_office', 'setup_first_office', 'trg_first_founder_is_admin')
  loop
    execute format('alter function %s owner to office_definer', f.sig);
  end loop;
end $$;
