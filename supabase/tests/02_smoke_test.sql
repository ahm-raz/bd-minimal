\set ON_ERROR_STOP 0
\set QUIET 1
\pset format unaligned
\pset footer off
-- users
-- M16: the office and its reservations come first (docs/11 section 5)
do $$ begin
  perform setup_first_office('Test office', 'Asia/Karachi', 'zain@x.com');
  insert into pending_members (email, office_id, role)
  select e, (select id from offices), 'bd' from unnest(array['ahmed@x.com', 'sara@x.com', 'hina@x.com']) e;
end $$;
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000f','zain@x.com','{"full_name":"Zain"}'),
 ('00000000-0000-0000-0000-00000000000a','ahmed@x.com','{"full_name":"Ahmed","role":"founder"}'),
 ('00000000-0000-0000-0000-00000000000b','sara@x.com','{"full_name":"Sara"}');
select 'ROLES', string_agg(full_name||':'||role, ', ' order by full_name) from profiles;

create or replace function as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',u)::text, false), null::void $$;
grant execute on function as_user to authenticated;

-- founder sets up template for Ahmed: 3 leads/day
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
insert into task_templates (assignee_id,title,kind,metric,target_count,starts_on)
 values ('00000000-0000-0000-0000-00000000000a','Add 3 dental leads','count','leads_added',3,'2026-09-01');
insert into targets (user_id,metric,weekly_value) values ('00000000-0000-0000-0000-00000000000a','leads_added',112);
update profiles set timezone='Asia/Karachi', primary_niche_id=(select id from niches where name='Dental') where id='00000000-0000-0000-0000-00000000000a';
reset role;

-- Ahmed
select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select 'ENSURE', ensure_recurring_tasks('00000000-0000-0000-0000-00000000000a', (now() at time zone 'Asia/Karachi')::date);
select 'ENSURE_AGAIN', ensure_recurring_tasks('00000000-0000-0000-0000-00000000000a', (now() at time zone 'Asia/Karachi')::date);
select 'ENSURE_OTHER_USER_SHOULD_FAIL'; select ensure_recurring_tasks('00000000-0000-0000-0000-00000000000b', current_date);
update profiles set role='founder' where id=auth.uid();  -- should fail
update profiles set timezone='America/Chicago' where id=auth.uid(); select 'TZ', timezone from profiles where id=auth.uid();
update profiles set timezone='Asia/Karachi' where id=auth.uid();

insert into leads (id,owner_id,company_name,website,niche_id,channel_id,city,state_region,source_id)
select ('10000000-0000-0000-0000-00000000000'||i)::uuid, auth.uid(), 'Clinic '||i, 'https://www.Clinic'||i||'.com/about?x=1',
  (select id from niches where name='Dental'),(select id from channels where name='LinkedIn'),'Austin','TX',
  (select id from lead_sources where name='Google Maps') from generate_series(1,3) i;
insert into contacts (lead_id,first_name,job_title,is_primary,is_decision_maker,email,linkedin_url,phone)
 values ('10000000-0000-0000-0000-000000000001','Dr Patel','Owner',true,true,'p@c1.com','https://www.linkedin.com/in/patel','+15125550100');
select 'LEAD1', domain, completeness, status from leads where id='10000000-0000-0000-0000-000000000001';
select 'LEAD2', domain, completeness from leads where id='10000000-0000-0000-0000-000000000002';
select 'TASKS', title, progress, target_count, status from tasks_with_progress(current_date-1, current_date+1);
select 'BD_FEED_ROWS', count(*) from feed_events;

-- activities
select 'ACT1', log_activity('10000000-0000-0000-0000-000000000001',(select id from activity_types where name='LinkedIn message'),'no_response', now(), null,null,'hi','Send follow-up', current_date+2) is not null;
select 'STATUS_AFTER_OUTREACH', status, next_action, next_action_due=current_date+2 from leads where id='10000000-0000-0000-0000-000000000001';
select 'BAD_COMBO_SHOULD_FAIL'; select log_activity('10000000-0000-0000-0000-000000000001',(select id from activity_types where name='Cold email'),'interested');
select 'ACT2', log_activity('10000000-0000-0000-0000-000000000001',(select id from activity_types where name='Reply received'),'meeting_booked') is not null;
select 'STATUS_AFTER_REPLY', status from leads where id='10000000-0000-0000-0000-000000000001';
select 'ACT_CHANNEL', c.name from activities a join channels c on c.id=a.channel_id order by a.created_at limit 1;

-- opportunity
insert into opportunities (id,lead_id,owner_id,title,estimated_value) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',auth.uid(),'AI intake',3500);
select 'STATUS_AFTER_OPP', status from leads where id='10000000-0000-0000-0000-000000000001';
update opportunities set stage_key='meeting_done' where id='20000000-0000-0000-0000-000000000001';
update opportunities set stage_key='proposal_sent' where id='20000000-0000-0000-0000-000000000001';
select 'WON_WITHOUT_FIELDS_SHOULD_FAIL'; update opportunities set stage_key='won' where id='20000000-0000-0000-0000-000000000001';
update opportunities set stage_key='won', won_value=3500, contract_type='monthly', monthly_amount=300 where id='20000000-0000-0000-0000-000000000001';
select 'OPP', stage_key, won_at is not null from opportunities;
select 'LEAD_STATUS_WON', status from leads where id='10000000-0000-0000-0000-000000000001';
select 'STAGE_EVENTS', string_agg(coalesce(from_stage,'-')||'>'||to_stage, ' ' order by id) from opportunity_stage_events;

-- permissions
delete from leads where id='10000000-0000-0000-0000-000000000002'; select 'LEADS_AFTER_BD_DELETE', count(*) from leads;
select 'COUNT_TASK_EDIT_SHOULD_FAIL'; update tasks set completed_at=now() where kind='count';
select 'SCOREBOARD_BD_ROWS', count(*), max(leads_added), max(won_revenue), max(meetings_booked), max(proposals_sent) from metrics_scoreboard(now()-interval '1 day', now()+interval '1 day');
reset role;

-- Sara
select as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select 'SARA_SEES_LEADS', count(*) from leads;
update leads set company_name='hacked' where id='10000000-0000-0000-0000-000000000001';
select 'SARA_INSERT_FOR_AHMED_SHOULD_FAIL';
insert into leads (owner_id,company_name,niche_id,channel_id) values ('00000000-0000-0000-0000-00000000000a','X',(select id from niches limit 1),(select id from channels limit 1));
select 'SARA_ACT_ON_AHMED_SHOULD_FAIL'; select log_activity('10000000-0000-0000-0000-000000000003',(select id from activity_types where name='Cold email'),'no_response');
select 'SARA_CREATE_TASK_SHOULD_FAIL'; insert into tasks (assignee_id,title,kind,due_date) values (auth.uid(),'x','checklist',current_date);
select 'SARA_EDIT_NICHE_SHOULD_FAIL_SILENT'; update niches set name='x'; select count(*) from niches where name='x';
reset role;

-- Founder
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
select 'FOUNDER_SEES_LEADS', count(*) from leads;
select 'FEED', count(*) from feed_events;
select 'FEED_SAMPLE', summary from feed_events order by id;
insert into tasks (assignee_id,title,kind,due_date,lead_id,note) values ('00000000-0000-0000-0000-00000000000a','Fix contact','lead_fix',current_date,'10000000-0000-0000-0000-000000000002','Need owner name');
insert into opportunities (lead_id,owner_id,created_by,title,estimated_value) values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a',auth.uid(),'Website',2000);
update leads set owner_id='00000000-0000-0000-0000-00000000000b' where id='10000000-0000-0000-0000-000000000002';
select 'OPP_FOLLOWED', o.owner_id='00000000-0000-0000-0000-00000000000b' from opportunities o where lead_id='10000000-0000-0000-0000-000000000002';
select 'OWNER_EVENTS', count(*) from lead_owner_events where lead_id='10000000-0000-0000-0000-000000000002';
select 'SCOREBOARD_FOUNDER', string_agg(p.full_name||' leads='||s.leads_added||' out='||s.outreach||' rep='||s.replies||' mtg='||s.meetings_booked||' done='||s.meetings_done||' prop='||s.proposals_sent||' won='||s.won_revenue||' mrr='||s.new_mrr||' comp='||coalesce(s.avg_completeness::text,'-')||' flag='||s.flagged_leads, ' | ')
  from metrics_scoreboard(now()-interval '1 day', now()+interval '1 day') s join profiles p on p.id=s.user_id;
select 'BY_NICHE', string_agg(dimension_name||':'||leads_added||'/'||won_revenue, ' ') from metrics_by_dimension(now()-interval '1 day', now()+interval '1 day','niche');
select 'BY_CAMPAIGN_ROWS', count(*) from metrics_by_dimension(now()-interval '1 day', now()+interval '1 day','campaign');
select 'DAILY', count(*), sum(leads_added) from metrics_daily(current_date-6, current_date, 'Asia/Karachi');
select 'PIPELINE', string_agg(stage_key||':'||opp_count||'/'||total_value||'/'||weighted_value, ' ') from pipeline_summary();
select 'MRR', active_mrr();
select 'RENAME_OUTCOME'; update outcomes set label='Warm reply' where key='interested'; select label from outcomes where key='interested';
select 'CHANGE_FLAG_SHOULD_FAIL'; update outcomes set is_reply=false where key='interested';
update profiles set is_active=false where id='00000000-0000-0000-0000-00000000000b';
select 'DEACT_AT', deactivated_at is not null from profiles where id='00000000-0000-0000-0000-00000000000b';
select 'DEACT_FOUNDER_SHOULD_FAIL'; update profiles set is_active=false where id=auth.uid();
reset role;
select as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select 'DEACTIVATED_SARA_SEES', count(*) from leads; reset role;
-- Ahmed completes lead fix
select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
update tasks set completed_at=now() where kind='lead_fix'; select 'FIX_DONE', count(*) from tasks where kind='lead_fix' and completed_at is not null;
update tasks set title='changed' where kind='lead_fix';
select 'BD_SCOREBOARD_ONLY_SELF', count(*) from metrics_scoreboard(now()-interval '1 day', now()+interval '1 day');
select 'BD_DAILY_ONLY_SELF', count(distinct user_id) from metrics_daily(current_date-6, current_date, 'Asia/Karachi');
reset role;
