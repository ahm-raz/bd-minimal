-- =====================================================================
-- Client Acquisition OS — v1 initial schema (Supabase / Postgres 15+)
-- Source of truth for tables, rules, permissions (RLS) and metrics.
-- Spec: docs/02-data-model.md, docs/03-permissions.md, docs/05-metrics.md
-- =====================================================================

-- ---------- Enums ----------------------------------------------------
create type public.user_role         as enum ('founder', 'bd');
create type public.activity_category as enum ('outreach', 'follow_up', 'inbound_reply', 'call', 'meeting', 'proposal', 'other');
create type public.lead_status       as enum ('new', 'contacted', 'replied', 'qualified', 'customer', 'lost', 'nurture', 'not_interested', 'bad_fit');
create type public.lead_priority     as enum ('high', 'medium', 'low');
create type public.email_status      as enum ('unverified', 'valid', 'invalid', 'bounced');
create type public.contract_type     as enum ('one_time', 'monthly');
create type public.campaign_status   as enum ('active', 'paused', 'completed');
create type public.task_kind         as enum ('count', 'checklist', 'lead_fix');
create type public.task_metric       as enum ('leads_added', 'outreach', 'follow_ups', 'replies', 'meetings_booked');
create type public.target_metric     as enum ('leads_added', 'outreach', 'follow_ups', 'replies', 'meetings_booked', 'proposals_sent');

-- ---------- Shared helpers -------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Team -----------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete restrict,
  email            text not null,
  full_name        text not null default '',
  role             public.user_role not null default 'bd',
  primary_niche_id uuid,
  timezone         text not null default 'Asia/Karachi',   -- IANA name, validated in app
  is_active        boolean not null default true,
  deactivated_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index profiles_single_founder on public.profiles (role) where role = 'founder';
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

create or replace function public.is_founder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active and role = 'founder');
$$;

-- True for trusted server contexts (service role key, SQL editor, migrations): no end-user JWT.
create or replace function public.is_system() returns boolean
language sql stable as $$
  select auth.uid() is null;
$$;

-- New auth user -> profile. The very first user becomes Founder; everyone else is a BD.
-- Role is NEVER read from user metadata (users can write their own metadata).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from public.profiles where role = 'founder') then 'bd' else 'founder' end::public.user_role
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-founders may only change their own name and timezone.
create or replace function public.guard_profile_update() returns trigger
language plpgsql as $$
begin
  if not public.is_system() and not public.is_founder() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.primary_niche_id is distinct from old.primary_niche_id
       or new.email is distinct from old.email then
      raise exception 'Only the founder can change role, status, niche or email';
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
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- Settings lists -------------------------------------------
-- Label lists: founder can add, rename, reorder, hide. Never deleted once used.
create table public.niches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.channels (like public.niches including all);
create table public.lead_sources (like public.niches including all);
create table public.lost_reasons (like public.niches including all);

alter table public.profiles
  add constraint profiles_primary_niche_fk foreign key (primary_niche_id) references public.niches (id);

create table public.activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category public.activity_category not null,
  default_channel_id uuid references public.channels (id),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Fixed-meaning lists: keys and flags are set by the system; founder may rename / re-probability.
create table public.outcomes (
  key text primary key,
  label text not null,
  is_reply boolean not null,
  is_positive boolean not null,
  is_meeting boolean not null,
  allowed_categories public.activity_category[] not null,
  sort_order int not null
);

create table public.stages (
  key text primary key,
  label text not null,
  probability numeric(4,3) not null check (probability between 0 and 1),
  is_open boolean not null,
  sort_order int not null
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  niche_id uuid references public.niches (id),
  channel_id uuid references public.channels (id),
  owner_id uuid references public.profiles (id),
  status public.campaign_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  metric public.target_metric not null,
  weekly_value int not null check (weekly_value >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, metric)
);
create trigger targets_updated_at before update on public.targets
  for each row execute function public.set_updated_at();

-- ---------- Leads & contacts -----------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),

  -- company
  company_name text not null check (length(trim(company_name)) > 0),
  website text,
  domain text,                          -- derived from website by trigger
  company_linkedin_url text,
  company_phone text,                   -- E.164
  company_email text,
  sub_niche text,
  company_size text check (company_size in ('1-10', '11-50', '51-200', '201-500', '500+')),
  address text,
  city text,
  state_region text,
  country text not null default 'United States',
  lead_timezone text,                   -- IANA; the prospect's local time
  google_maps_url text,
  google_rating numeric(2,1) check (google_rating between 0 and 5),
  google_review_count int check (google_review_count >= 0),
  upwork_job_url text,

  -- classification
  niche_id uuid not null references public.niches (id),
  channel_id uuid not null references public.channels (id),
  source_id uuid references public.lead_sources (id),
  campaign_id uuid references public.campaigns (id),
  priority public.lead_priority not null default 'medium',
  status public.lead_status not null default 'new',
  pain_point text,
  offer text,
  tags text[] not null default '{}',
  notes text,

  -- follow-up
  next_action text,
  next_action_due date,                 -- a calendar date in the OWNER's timezone

  -- derived
  last_activity_at timestamptz,
  completeness smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_owner_idx on public.leads (owner_id);
create index leads_created_by_idx on public.leads (created_by, created_at);
create index leads_due_idx on public.leads (owner_id, next_action_due);
create index leads_domain_idx on public.leads (domain);
create index leads_company_name_idx on public.leads (lower(company_name));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text,
  job_title text,
  is_decision_maker boolean not null default false,
  is_primary boolean not null default false,
  email text,
  email_status public.email_status not null default 'unverified',
  secondary_email text,
  phone text,                           -- E.164
  mobile_phone text,                    -- E.164
  linkedin_url text,
  other_social_url text,
  preferred_channel_id uuid references public.channels (id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_lead_idx on public.contacts (lead_id);
create unique index contacts_one_primary on public.contacts (lead_id) where is_primary;
create index contacts_email_idx on public.contacts (lower(email));
create index contacts_linkedin_idx on public.contacts (linkedin_url);

create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- domain from website: "https://www.BrightSmile.com/about" -> "brightsmile.com"
create or replace function public.derive_lead_domain() returns trigger
language plpgsql as $$
begin
  if new.website is null or trim(new.website) = '' then
    new.domain := null;
  else
    new.domain := lower(regexp_replace(regexp_replace(trim(new.website), '^[a-zA-Z]+://', ''), '^www\.', '', 'i'));
    new.domain := split_part(split_part(split_part(new.domain, '/', 1), '?', 1), '#', 1);
  end if;
  return new;
end $$;
create trigger leads_domain before insert or update of website on public.leads
  for each row execute function public.derive_lead_domain();

-- Completeness score (0-100): 10 checks x 10 points. See docs/04-business-rules.md
create or replace function public.recompute_lead_completeness(p_lead_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.leads;
  c public.contacts;
  has_dm boolean;
  score int := 0;
begin
  select * into l from public.leads where id = p_lead_id;
  if not found then return; end if;
  select * into c from public.contacts where lead_id = p_lead_id order by is_primary desc, created_at limit 1;
  select exists (select 1 from public.contacts where lead_id = p_lead_id and is_decision_maker) into has_dm;

  if coalesce(l.website, '') <> '' then score := score + 10; end if;
  if coalesce(l.company_linkedin_url, '') <> '' then score := score + 10; end if;
  if coalesce(l.city, '') <> '' and coalesce(l.state_region, '') <> '' then score := score + 10; end if;
  if coalesce(l.pain_point, '') <> '' then score := score + 10; end if;
  if l.source_id is not null then score := score + 10; end if;
  if coalesce(c.job_title, '') <> '' then score := score + 10; end if;
  if coalesce(c.linkedin_url, '') <> '' then score := score + 10; end if;
  if coalesce(c.email, '') <> '' then score := score + 10; end if;
  if coalesce(c.phone, '') <> '' or coalesce(c.mobile_phone, '') <> '' then score := score + 10; end if;
  if has_dm then score := score + 10; end if;

  update public.leads set completeness = score where id = p_lead_id and completeness is distinct from score;
end $$;

create or replace function public.trg_lead_completeness() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_lead_completeness(new.id);
  return null;
end $$;
create trigger leads_completeness after insert or update of website, company_linkedin_url, city, state_region, pain_point, source_id
  on public.leads for each row execute function public.trg_lead_completeness();

create or replace function public.trg_contact_completeness() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_lead_completeness(old.lead_id);
  else
    perform public.recompute_lead_completeness(new.lead_id);
  end if;
  return null;
end $$;
create trigger contacts_completeness after insert or update or delete on public.contacts
  for each row execute function public.trg_contact_completeness();

-- Ownership history
create table public.lead_owner_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  from_owner uuid references public.profiles (id),
  to_owner uuid not null references public.profiles (id),
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);
create index lead_owner_events_lead_idx on public.lead_owner_events (lead_id);

-- ---------- Opportunities --------------------------------------------
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  owner_id uuid not null references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  title text not null,                              -- the offer, e.g. "AI patient intake setup"
  stage_key text not null default 'qualified' references public.stages (key),
  estimated_value numeric(12,2) not null default 0 check (estimated_value >= 0),
  expected_close_date date,
  stage_changed_at timestamptz not null default now(),
  -- won
  won_value numeric(12,2) check (won_value >= 0),
  contract_type public.contract_type,
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  won_at timestamptz,
  contract_ended_at date,
  -- lost
  lost_reason_id uuid references public.lost_reasons (id),
  lost_note text,
  lost_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint won_requires_fields check (stage_key <> 'won' or (won_value is not null and contract_type is not null)),
  constraint lost_requires_reason check (stage_key <> 'lost' or lost_reason_id is not null)
);
create index opportunities_owner_idx on public.opportunities (owner_id, stage_key);
create index opportunities_lead_idx on public.opportunities (lead_id);
create index opportunities_won_idx on public.opportunities (won_at);
create trigger opportunities_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();

create table public.opportunity_stage_events (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  from_stage text references public.stages (key),
  to_stage text not null references public.stages (key),
  owner_id uuid not null references public.profiles (id),   -- opp owner at the time (metric attribution)
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);
create index stage_events_idx on public.opportunity_stage_events (to_stage, changed_at);
create index stage_events_opp_idx on public.opportunity_stage_events (opportunity_id);

-- ---------- Activities -----------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  user_id uuid not null default auth.uid() references public.profiles (id),
  activity_type_id uuid not null references public.activity_types (id),
  category public.activity_category not null,       -- copied from type at insert; history stays stable
  channel_id uuid references public.channels (id),
  campaign_id uuid references public.campaigns (id),
  outcome_key text not null default 'no_response' references public.outcomes (key),
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create index activities_user_idx on public.activities (user_id, occurred_at);
create index activities_lead_idx on public.activities (lead_id, occurred_at desc);

-- ---------- Tasks ----------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  assignee_id uuid not null references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  title text not null,
  kind public.task_kind not null check (kind in ('count', 'checklist')),
  metric public.task_metric,
  target_count int check (target_count > 0),
  filter_niche_id uuid references public.niches (id),
  filter_campaign_id uuid references public.campaigns (id),
  note text,
  starts_on date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint template_count_fields check (kind <> 'count' or (metric is not null and target_count is not null))
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.task_templates (id) on delete set null,
  assignee_id uuid not null references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  title text not null,
  kind public.task_kind not null,
  metric public.task_metric,
  target_count int check (target_count > 0),
  filter_niche_id uuid references public.niches (id),
  filter_campaign_id uuid references public.campaigns (id),
  due_date date not null,                           -- calendar date in the ASSIGNEE's timezone
  lead_id uuid references public.leads (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint task_count_fields check (kind <> 'count' or (metric is not null and target_count is not null)),
  constraint lead_fix_needs_lead check (kind <> 'lead_fix' or lead_id is not null)
);
create unique index tasks_template_day on public.tasks (template_id, due_date) where template_id is not null;
create index tasks_assignee_idx on public.tasks (assignee_id, due_date);

-- Assignees may only tick completion on checklist / lead-fix tasks.
-- pg_trigger_depth() > 1 means the update comes from another trigger (automatic count-task completion).
create or replace function public.guard_task_update() returns trigger
language plpgsql as $$
begin
  if not public.is_system() and not public.is_founder() and pg_trigger_depth() <= 1 then
    if new.kind = 'count' then
      raise exception 'Count tasks complete automatically';
    end if;
    if (to_jsonb(new) - 'completed_at') is distinct from (to_jsonb(old) - 'completed_at') then
      raise exception 'Only completion can be changed by the assignee';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_guard before update on public.tasks
  for each row execute function public.guard_task_update();

-- ---------- Activity feed --------------------------------------------
create table public.feed_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lead_created', 'activity_logged', 'stage_changed', 'opportunity_won',
                                     'opportunity_lost', 'task_completed', 'lead_flagged', 'lead_reassigned')),
  actor_id uuid references public.profiles (id),
  subject_user_id uuid references public.profiles (id),   -- whose work this is
  lead_id uuid references public.leads (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  summary text not null,
  created_at timestamptz not null default now()
);
create index feed_events_created_idx on public.feed_events (created_at desc);
create index feed_events_subject_idx on public.feed_events (subject_user_id, created_at desc);

-- =====================================================================
-- Business-rule triggers
-- =====================================================================

-- Local calendar date of a timestamp for a user.
create or replace function public.user_local_date(p_user uuid, p_ts timestamptz) returns date
language sql stable security definer set search_path = public as $$
  select (p_ts at time zone coalesce((select timezone from public.profiles where id = p_user), 'UTC'))::date;
$$;

-- Progress of one count task (see docs/05-metrics.md for definitions).
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

-- Mark count tasks complete the moment they reach target (and post to the feed).
create or replace function public.check_count_tasks(p_user uuid, p_ts timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
  d date := public.user_local_date(p_user, p_ts);
begin
  for t in
    select * from public.tasks
    where assignee_id = p_user and kind = 'count' and completed_at is null and due_date = d
  loop
    if public.count_task_progress(t.assignee_id, t.metric, t.due_date, t.filter_niche_id, t.filter_campaign_id) >= t.target_count then
      update public.tasks set completed_at = now() where id = t.id;
      insert into public.feed_events (kind, actor_id, subject_user_id, task_id, summary)
      values ('task_completed', p_user, p_user, t.id, 'completed task "' || t.title || '"');
    end if;
  end loop;
end $$;

-- Leads: feed + ownership history + count tasks
create or replace function public.trg_lead_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lead_owner_events (lead_id, from_owner, to_owner, changed_by)
  values (new.id, null, new.owner_id, new.created_by);
  insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, summary)
  values ('lead_created', new.created_by, new.owner_id, new.id,
          'added lead ' || new.company_name || coalesce(' (' || nullif(concat_ws(', ', new.city, new.state_region), '') || ')', ''));
  perform public.check_count_tasks(new.created_by, new.created_at);
  return null;
end $$;
create trigger leads_after_insert after insert on public.leads
  for each row execute function public.trg_lead_after_insert();

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
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, summary)
    values ('lead_reassigned', auth.uid(), new.owner_id, new.id, 'reassigned lead ' || new.company_name);
  end if;
  return null;
end $$;
create trigger leads_owner_change after update of owner_id on public.leads
  for each row execute function public.trg_lead_owner_change();

-- Activities: fill defaults before insert
create or replace function public.trg_activity_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cat public.activity_category;
  allowed public.activity_category[];
begin
  select category into cat from public.activity_types where id = new.activity_type_id;
  new.category := cat;
  select allowed_categories into allowed from public.outcomes where key = new.outcome_key;
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
end $$;
create trigger activities_before_insert before insert on public.activities
  for each row execute function public.trg_activity_before_insert();

-- Activities: automatic lead status, last activity, feed, count tasks
create or replace function public.trg_activity_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.leads;
  o public.outcomes;
  new_status public.lead_status;
  type_name text;
begin
  select * into l from public.leads where id = new.lead_id;
  select * into o from public.outcomes where key = new.outcome_key;
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
end $$;
create trigger activities_after_insert after insert on public.activities
  for each row execute function public.trg_activity_after_insert();

-- Opportunities: stage bookkeeping before write
create or replace function public.trg_opportunity_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.stage_key is distinct from old.stage_key then
    new.stage_changed_at := now();
    if new.stage_key = 'won' then
      new.won_at := coalesce(new.won_at, now());
      new.lost_at := null; new.lost_reason_id := null; new.lost_note := null;
    elsif new.stage_key = 'lost' then
      new.lost_at := coalesce(new.lost_at, now());
      new.won_at := null; new.won_value := null; new.contract_type := null; new.monthly_amount := 0;
    else
      new.won_at := null; new.lost_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger opportunities_before before insert or update on public.opportunities
  for each row execute function public.trg_opportunity_before();

-- Opportunities: history, lead status, feed
create or replace function public.trg_opportunity_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.leads;
  stage_label text;
  open_left int;
begin
  if tg_op = 'UPDATE' and new.stage_key is not distinct from old.stage_key then
    return null;
  end if;

  select * into l from public.leads where id = new.lead_id;
  select label into stage_label from public.stages where key = new.stage_key;

  insert into public.opportunity_stage_events (opportunity_id, from_stage, to_stage, owner_id, changed_by)
  values (new.id, case when tg_op = 'UPDATE' then old.stage_key end, new.stage_key, new.owner_id, auth.uid());

  select count(*) into open_left from public.opportunities o join public.stages s on s.key = o.stage_key
  where o.lead_id = new.lead_id and s.is_open;

  if new.stage_key = 'won' then
    update public.leads set status = 'customer' where id = new.lead_id;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('opportunity_won', auth.uid(), new.owner_id, new.lead_id, new.id,
            'won ' || l.company_name || ' for $' || to_char(new.won_value, 'FM999,999,990'));
  elsif new.stage_key = 'lost' then
    if open_left = 0 and l.status <> 'customer' then
      update public.leads set status = 'lost' where id = new.lead_id;
    end if;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('opportunity_lost', auth.uid(), new.owner_id, new.lead_id, new.id, 'lost ' || l.company_name);
  else
    if l.status <> 'customer' then
      update public.leads set status = 'qualified' where id = new.lead_id;
    end if;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('stage_changed', auth.uid(), new.owner_id, new.lead_id, new.id,
            case when tg_op = 'INSERT' then 'created opportunity for ' || l.company_name
                 else 'moved ' || l.company_name || ' to ' || stage_label end
            || case when new.estimated_value > 0 then ' ($' || to_char(new.estimated_value, 'FM999,999,990') || ')' else '' end);
  end if;
  return null;
end $$;
create trigger opportunities_after after insert or update of stage_key on public.opportunities
  for each row execute function public.trg_opportunity_after();

-- Tasks: feed for manual completion and lead flags
create or replace function public.trg_task_feed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cname text;
begin
  if tg_op = 'INSERT' and new.kind = 'lead_fix' then
    select company_name into cname from public.leads where id = new.lead_id;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, task_id, summary)
    values ('lead_flagged', new.created_by, new.assignee_id, new.lead_id, new.id, 'flagged lead ' || cname);
  elsif tg_op = 'UPDATE' and new.kind <> 'count' and old.completed_at is null and new.completed_at is not null then
    insert into public.feed_events (kind, actor_id, subject_user_id, task_id, lead_id, summary)
    values ('task_completed', coalesce(auth.uid(), new.assignee_id), new.assignee_id, new.id, new.lead_id,
            'completed task "' || new.title || '"');
  end if;
  return null;
end $$;
create trigger tasks_feed after insert or update of completed_at on public.tasks
  for each row execute function public.trg_task_feed();

-- =====================================================================
-- RPCs used by the app
-- =====================================================================

-- Log an activity and set the lead's next action in one step.
create or replace function public.log_activity(
  p_lead_id uuid,
  p_activity_type_id uuid,
  p_outcome_key text,
  p_occurred_at timestamptz default now(),
  p_contact_id uuid default null,
  p_opportunity_id uuid default null,
  p_notes text default null,
  p_next_action text default null,
  p_next_action_due date default null,
  p_clear_next_action boolean default false
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  new_id uuid;
begin
  insert into public.activities (lead_id, activity_type_id, outcome_key, occurred_at, contact_id, opportunity_id, notes)
  values (p_lead_id, p_activity_type_id, p_outcome_key, p_occurred_at, p_contact_id, p_opportunity_id, p_notes)
  returning id into new_id;

  if p_clear_next_action then
    update public.leads set next_action = null, next_action_due = null where id = p_lead_id;
  elsif p_next_action_due is not null then
    update public.leads set next_action = p_next_action, next_action_due = p_next_action_due where id = p_lead_id;
  end if;
  return new_id;
end $$;

-- Create a day's instances of recurring tasks (weekdays only). Safe to call repeatedly.
create or replace function public.ensure_recurring_tasks(p_user uuid, p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not (p_user = auth.uid() or public.is_founder() or public.is_system()) then
    raise exception 'Not allowed';
  end if;
  if extract(isodow from p_day) > 5 then
    return 0;
  end if;
  insert into public.tasks (template_id, assignee_id, created_by, title, kind, metric, target_count,
                            filter_niche_id, filter_campaign_id, due_date, note)
  select t.id, t.assignee_id, t.created_by, t.title, t.kind, t.metric, t.target_count,
         t.filter_niche_id, t.filter_campaign_id, p_day, t.note
  from public.task_templates t
  join public.profiles p on p.id = t.assignee_id and p.is_active
  where t.assignee_id = p_user and t.is_active and t.starts_on <= p_day
  on conflict (template_id, due_date) where template_id is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Tasks with live progress and derived status.
create or replace function public.tasks_with_progress(p_from date, p_to date, p_assignee uuid default null)
returns table (
  id uuid, assignee_id uuid, created_by uuid, title text, kind public.task_kind, metric public.task_metric,
  target_count int, progress int, due_date date, lead_id uuid, opportunity_id uuid, note text,
  completed_at timestamptz, status text, completed_on_time boolean, is_recurring boolean
)
language sql stable security invoker set search_path = public as $$
  select t.id, t.assignee_id, t.created_by, t.title, t.kind, t.metric, t.target_count,
         case when t.kind = 'count'
              then public.count_task_progress(t.assignee_id, t.metric, t.due_date, t.filter_niche_id, t.filter_campaign_id)
         end as progress,
         t.due_date, t.lead_id, t.opportunity_id, t.note, t.completed_at,
         case when t.completed_at is not null then 'done'
              when t.due_date < (now() at time zone p.timezone)::date then 'overdue'
              else 'open' end as status,
         case when t.completed_at is null then null
              else (t.completed_at at time zone p.timezone)::date <= t.due_date end as completed_on_time,
         t.template_id is not null as is_recurring
  from public.tasks t
  join public.profiles p on p.id = t.assignee_id
  where t.due_date between p_from and p_to
    and (p_assignee is null or t.assignee_id = p_assignee)
  order by t.due_date, t.created_at;
$$;

-- ---------- Metrics (security invoker: RLS decides what each caller can see) ----------

-- One row per team member for a time range [p_from, p_to).
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
    and (p.is_active or lds.user_id is not null or acts.user_id is not null or won.user_id is not null)
  order by p.role, p.full_name;
$$;

-- Same numbers split by niche, channel or campaign.
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

-- Daily grid for the consistency view. p_tz = the VIEWER's timezone.
create or replace function public.metrics_daily(p_from date, p_to date, p_tz text, p_user uuid default null)
returns table (day date, user_id uuid, leads_added int, outreach int, follow_ups int, replies int, meetings_booked int)
language sql stable security invoker set search_path = public as $$
  with days as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  people as (
    select id from public.profiles
    where (p_user is null or id = p_user) and is_active and (id = auth.uid() or public.is_founder())
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

-- Current pipeline snapshot by stage.
create or replace function public.pipeline_summary(p_user uuid default null, p_stuck_days int default 14)
returns table (stage_key text, stage_label text, sort_order int, opp_count int, total_value numeric,
               weighted_value numeric, stuck_count int)
language sql stable security invoker set search_path = public as $$
  select s.key, s.label, s.sort_order,
         count(o.id)::int,
         coalesce(sum(case when s.key = 'won' then o.won_value else o.estimated_value end), 0),
         round(coalesce(sum(o.estimated_value * s.probability) filter (where s.is_open), 0), 2),
         (count(o.id) filter (where s.is_open and o.stage_changed_at < now() - make_interval(days => p_stuck_days)))::int
  from public.stages s
  left join public.opportunities o on o.stage_key = s.key and (p_user is null or o.owner_id = p_user)
  group by s.key, s.label, s.sort_order
  order by s.sort_order;
$$;

-- Recurring revenue currently active (monthly contracts not ended).
create or replace function public.active_mrr(p_user uuid default null) returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(monthly_amount), 0) from public.opportunities
  where stage_key = 'won' and contract_type = 'monthly'
    and (contract_ended_at is null or contract_ended_at > current_date)
    and (p_user is null or owner_id = p_user);
$$;

-- Internal helpers are not callable from the app.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.check_count_tasks(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.recompute_lead_completeness(uuid) from public, anon, authenticated;
revoke execute on function public.user_local_date(uuid, timestamptz) from public, anon, authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.niches enable row level security;
alter table public.channels enable row level security;
alter table public.lead_sources enable row level security;
alter table public.lost_reasons enable row level security;
alter table public.activity_types enable row level security;
alter table public.outcomes enable row level security;
alter table public.stages enable row level security;
alter table public.campaigns enable row level security;
alter table public.targets enable row level security;
alter table public.leads enable row level security;
alter table public.contacts enable row level security;
alter table public.lead_owner_events enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_stage_events enable row level security;
alter table public.activities enable row level security;
alter table public.task_templates enable row level security;
alter table public.tasks enable row level security;
alter table public.feed_events enable row level security;

-- Can the current user work on this lead?
create or replace function public.can_access_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.leads l
    where l.id = p_lead_id and (l.owner_id = auth.uid() or public.is_founder())
  );
$$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (public.is_active_user());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_founder()) with check (id = auth.uid() or public.is_founder());

-- label lists + activity types + campaigns: everyone reads, founder writes, nobody deletes
do $$
declare t text;
begin
  foreach t in array array['niches', 'channels', 'lead_sources', 'lost_reasons', 'activity_types', 'campaigns'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_active_user())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_founder())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_founder()) with check (public.is_founder())', t);
  end loop;
end $$;

-- outcomes / stages: everyone reads; founder may rename (and set stage probability)
create policy outcomes_select on public.outcomes for select to authenticated using (public.is_active_user());
create policy outcomes_update on public.outcomes for update to authenticated using (public.is_founder()) with check (public.is_founder());
create policy stages_select on public.stages for select to authenticated using (public.is_active_user());
create policy stages_update on public.stages for update to authenticated using (public.is_founder()) with check (public.is_founder());
revoke insert, update, delete on public.outcomes from authenticated;
grant update (label) on public.outcomes to authenticated;
revoke insert, update, delete on public.stages from authenticated;
grant update (label, probability) on public.stages to authenticated;

-- targets
create policy targets_select on public.targets for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_founder()));
create policy targets_write on public.targets for all to authenticated
  using (public.is_founder()) with check (public.is_founder());

-- leads
create policy leads_select on public.leads for select to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_founder()));
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_active_user() and created_by = auth.uid() and (owner_id = auth.uid() or public.is_founder()));
create policy leads_update on public.leads for update to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_founder()))
  with check (owner_id = auth.uid() or public.is_founder());
create policy leads_delete on public.leads for delete to authenticated using (public.is_founder());

-- contacts
create policy contacts_all on public.contacts for all to authenticated
  using (public.can_access_lead(lead_id)) with check (public.can_access_lead(lead_id));

-- activities: log on accessible leads; edit own; only founder deletes
create policy activities_select on public.activities for select to authenticated using (public.can_access_lead(lead_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_lead(lead_id));
create policy activities_update on public.activities for update to authenticated
  using (public.can_access_lead(lead_id) and (user_id = auth.uid() or public.is_founder()))
  with check (public.can_access_lead(lead_id));
create policy activities_delete on public.activities for delete to authenticated using (public.is_founder());

-- opportunities
create policy opportunities_select on public.opportunities for select to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_founder()));
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check (public.can_access_lead(lead_id) and created_by = auth.uid()
              and owner_id = (select l.owner_id from public.leads l where l.id = lead_id));
create policy opportunities_update on public.opportunities for update to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_founder()))
  with check (owner_id = auth.uid() or public.is_founder());
create policy opportunities_delete on public.opportunities for delete to authenticated using (public.is_founder());

-- history tables: read-only, written by triggers
create policy lead_owner_events_select on public.lead_owner_events for select to authenticated
  using (public.can_access_lead(lead_id));
create policy stage_events_select on public.opportunity_stage_events for select to authenticated
  using (public.is_active_user() and (owner_id = auth.uid() or public.is_founder()));

-- tasks
create policy task_templates_founder on public.task_templates for all to authenticated
  using (public.is_founder()) with check (public.is_founder());
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_active_user() and (assignee_id = auth.uid() or public.is_founder()));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_founder());
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_active_user() and (assignee_id = auth.uid() or public.is_founder()))
  with check (assignee_id = auth.uid() or public.is_founder());
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_founder());

-- feed: founder only
create policy feed_select on public.feed_events for select to authenticated using (public.is_founder());

-- Realtime for the live feed (the publication only exists on Supabase)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.feed_events;
  end if;
end $$;

-- =====================================================================
-- Default configuration (production data, not demo data)
-- =====================================================================
insert into public.niches (name, sort_order) values
  ('AI SaaS', 1), ('Dental', 2), ('Law', 3), ('Agency Partnerships', 4);

insert into public.channels (name, sort_order) values
  ('LinkedIn', 1), ('Email', 2), ('Upwork', 3), ('Phone', 4), ('Referral', 5);

insert into public.lead_sources (name, sort_order) values
  ('Manual research', 1), ('LinkedIn Sales Navigator', 2), ('Apollo', 3), ('Google Maps', 4),
  ('Upwork job post', 5), ('Referral', 6), ('Inbound', 7), ('Other', 8);

insert into public.lost_reasons (name, sort_order) values
  ('Price', 1), ('Went with someone else', 2), ('No response', 3), ('Not a fit', 4), ('Timing', 5), ('Other', 6);

insert into public.activity_types (name, category, default_channel_id, sort_order)
select v.name, v.category::public.activity_category, c.id, v.sort_order
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
left join public.channels c on c.name = v.channel;

insert into public.outcomes (key, label, is_reply, is_positive, is_meeting, allowed_categories, sort_order) values
  ('no_response',    'No response',             false, false, false, '{outreach,follow_up,call,proposal,other}', 1),
  ('bounced',        'Bounced / wrong contact', false, false, false, '{outreach,follow_up,call}', 2),
  ('interested',     'Interested',              true,  true,  false, '{inbound_reply,call,meeting,proposal,other}', 3),
  ('not_now',        'Not now',                 true,  false, false, '{inbound_reply,call,meeting,proposal,other}', 4),
  ('not_interested', 'Not interested',          true,  false, false, '{inbound_reply,call,meeting,proposal,other}', 5),
  ('meeting_booked', 'Meeting booked',          true,  true,  true,  '{inbound_reply,call,other}', 6),
  ('done',           'Done',                    false, false, false, '{meeting,proposal,other}', 7);

insert into public.stages (key, label, probability, is_open, sort_order) values
  ('qualified',     'Qualified',     0.20, true,  1),
  ('meeting_done',  'Meeting done',  0.40, true,  2),
  ('proposal_sent', 'Proposal sent', 0.60, true,  3),
  ('negotiation',   'Negotiation',   0.75, true,  4),
  ('won',           'Won',           1.00, false, 5),
  ('lost',          'Lost',          0.00, false, 6);
