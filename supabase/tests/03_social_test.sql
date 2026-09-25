\set ON_ERROR_STOP 0
\set QUIET 1
\pset format unaligned
\pset footer off
-- Social media module (docs/09 section 7). Run on a fresh database by scripts/db-test.sh.
-- Lines ending in _SHOULD_FAIL are followed by exactly one statement that must raise an ERROR.

insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000f','zain@x.com','{"full_name":"Zain"}'),
 ('00000000-0000-0000-0000-00000000000a','ahmed@x.com','{"full_name":"Ahmed"}'),
 ('00000000-0000-0000-0000-00000000000c','hina@x.com','{"full_name":"Hina"}');

create or replace function as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',u)::text, false), null::void $$;
create or replace function as_system() returns void language sql as $$
  select set_config('request.jwt.claims', '', false), null::void $$;
grant execute on function as_user to authenticated;
grant execute on function as_system to authenticated;

-- Founder makes Hina a social media manager and sets up an account and a sales lead.
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
update profiles set role='social', timezone='Asia/Karachi' where id='00000000-0000-0000-0000-00000000000c';
select 'ROLES', string_agg(full_name||':'||role, ', ' order by full_name) from profiles;
insert into social_accounts (id,name,platform,audience_timezone) values
 ('30000000-0000-0000-0000-000000000001','BlueBugs LinkedIn page','linkedin_page','America/New_York');
insert into leads (id,owner_id,created_by,company_name,niche_id,channel_id) values
 ('10000000-0000-0000-0000-000000000001',auth.uid(),auth.uid(),'Clinic 1',(select id from niches limit 1),(select id from channels limit 1));
insert into opportunities (id,lead_id,owner_id,title,estimated_value) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',auth.uid(),'AI intake',1000);
select 'PILLARS', count(*) from content_pillars;
reset role;

-- Hina: no sales data
select as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select 'HINA_ROLE', current_user_role();
select 'HINA_SEES_LEADS', count(*) from leads;
select 'HINA_SEES_OPPS', count(*) from opportunities;
select 'HINA_LEAD_INSERT_SHOULD_FAIL';
insert into leads (owner_id,created_by,company_name,niche_id,channel_id) values (auth.uid(),auth.uid(),'Mine',(select id from niches limit 1),(select id from channels limit 1));
select 'HINA_OPP_INSERT_SHOULD_FAIL';
insert into opportunities (lead_id,owner_id,title) values ('10000000-0000-0000-0000-000000000001',auth.uid(),'x');
select 'HINA_ACTIVITY_SHOULD_FAIL'; select log_activity('10000000-0000-0000-0000-000000000001',(select id from activity_types where name='Cold email'),'no_response');
select 'HINA_SEES_ACCOUNTS', count(*) from social_accounts;
reset role;

-- Schedules: DST-correct slots (New York, 9:00 AM on Saturdays and Mondays)
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
insert into posting_schedules (id,account_id,assignee_id,weekdays,local_time,timezone,starts_on) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','{6,1}','09:00','America/New_York','2026-10-01');
select 'SLOTS_NOV', ensure_post_slots('2026-10-30','2026-11-03');
select 'SLOTS_NOV_AGAIN', ensure_post_slots('2026-10-30','2026-11-03');
select 'DST_NOV', string_agg(to_char(scheduled_at at time zone 'UTC','YYYY-MM-DD HH24:MI'), ' ' order by scheduled_at)
  from posts where schedule_id='40000000-0000-0000-0000-000000000001' and scheduled_at < '2027-01-01';
select 'SLOT_TITLE', title, status, needs_approval, to_char(draft_due_at at time zone 'UTC','YYYY-MM-DD HH24:MI')
  from posts where schedule_id='40000000-0000-0000-0000-000000000001' order by scheduled_at limit 1;
select 'RANGE_TOO_LONG_SHOULD_FAIL'; select ensure_post_slots('2027-01-01','2027-04-01');
reset role;
select as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select 'SLOTS_MAR_BY_HINA', ensure_post_slots('2027-03-12','2027-03-16');
select 'DST_MAR', string_agg(to_char(scheduled_at at time zone 'UTC','YYYY-MM-DD HH24:MI'), ' ' order by scheduled_at)
  from posts where schedule_id='40000000-0000-0000-0000-000000000001' and scheduled_at > '2027-01-01';
select 'HINA_SEES_SCHEDULES', count(*) from posting_schedules;
reset role;
select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select 'BD_SLOTS_SHOULD_FAIL'; select ensure_post_slots('2026-10-30','2026-11-03');
select 'BD_SEES_POSTS', count(*) from posts;
reset role;

-- Count task for today (Hina's day): publish 1 post
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
insert into tasks (id,assignee_id,title,kind,metric,target_count,due_date) values
 ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Publish 1 post','count','posts_published',1,(now() at time zone 'Asia/Karachi')::date);
-- P1: tomorrow, needs approval
insert into posts (id,account_id,assignee_id,title,scheduled_at,needs_approval) values
 ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','How AI intake cuts missed calls', now()+interval '1 day', true);
select 'P1', status, timezone, draft_due_at = scheduled_at - interval '24 hours' from posts where id='60000000-0000-0000-0000-000000000001';
reset role;

-- Review loop
select as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select 'HINA_MOVE_TIME_SHOULD_FAIL'; update posts set scheduled_at=scheduled_at+interval '1 hour' where id='60000000-0000-0000-0000-000000000001';
select 'HINA_REASSIGN_SHOULD_FAIL'; update posts set assignee_id='00000000-0000-0000-0000-00000000000a' where id='60000000-0000-0000-0000-000000000001';
select 'HINA_SKIP_TO_REVIEW_SHOULD_FAIL'; update posts set status='in_review' where id='60000000-0000-0000-0000-000000000001';
update posts set status='drafting' where id='60000000-0000-0000-0000-000000000001';
select 'HINA_SUBMIT_EMPTY_SHOULD_FAIL'; update posts set status='in_review' where id='60000000-0000-0000-0000-000000000001';
update posts set caption='Missed calls cost clinics patients. Here is how AI intake answers every one.' where id='60000000-0000-0000-0000-000000000001';
update posts set status='in_review' where id='60000000-0000-0000-0000-000000000001';
select 'HINA_APPROVE_OWN_SHOULD_FAIL'; update posts set status='approved' where id='60000000-0000-0000-0000-000000000001';
select 'HINA_CHANGE_REQUEST_COMMENT_SHOULD_FAIL';
insert into post_comments (post_id,author_id,kind,body) values ('60000000-0000-0000-0000-000000000001',auth.uid(),'change_request','x');
insert into post_comments (post_id,author_id,kind,body) values ('60000000-0000-0000-0000-000000000001',auth.uid(),'comment','Ready when you are');
reset role;
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
select 'CHANGES_WITHOUT_COMMENT_SHOULD_FAIL'; update posts set status='changes_requested' where id='60000000-0000-0000-0000-000000000001';
select request_post_changes('60000000-0000-0000-0000-000000000001','Make the hook shorter');
select 'REQUEST_CHANGES', status, (select count(*) from post_comments where post_id=posts.id and kind='change_request')
  from posts where id='60000000-0000-0000-0000-000000000001';
reset role;
select as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
update posts set caption='Every missed call is a lost patient. AI intake answers them all.', status='in_review' where id='60000000-0000-0000-0000-000000000001';
reset role;
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
update posts set status='approved' where id='60000000-0000-0000-0000-000000000001';
reset role;
select as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
update posts set caption='Every missed call is a lost patient. AI intake answers every one.' where id='60000000-0000-0000-0000-000000000001';
select 'EDIT_AFTER_APPROVAL', status, (select count(*) from post_comments where post_id='60000000-0000-0000-0000-000000000001' and kind='status_note')
  from posts where id='60000000-0000-0000-0000-000000000001';
reset role;
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
update posts set status='approved' where id='60000000-0000-0000-0000-000000000001';
reset role;
select as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select 'TASK_BEFORE', status from tasks_with_progress(current_date-2, current_date+2) where id='50000000-0000-0000-0000-000000000001';
select 'POSTED_NO_URL_SHOULD_FAIL'; update posts set status='posted' where id='60000000-0000-0000-0000-000000000001';
select 'POSTED_TOO_EARLY_SHOULD_FAIL'; update posts set status='posted', post_url='https://www.linkedin.com/feed/update/1', posted_at=now()-interval '2 days' where id='60000000-0000-0000-0000-000000000001';
update posts set status='posted', post_url='https://www.linkedin.com/feed/update/1' where id='60000000-0000-0000-0000-000000000001';
select 'P1_POSTED', status, posted_at is not null from posts where id='60000000-0000-0000-0000-000000000001';
select 'TASK_AFTER', status, progress from tasks_with_progress(current_date-2, current_date+2) where id='50000000-0000-0000-0000-000000000001';
select 'HISTORY', string_agg(coalesce(from_status::text,'-')||'>'||to_status, ' ' order by id)
  from post_status_events where post_id='60000000-0000-0000-0000-000000000001';
select 'HINA_FEED_ROWS', count(*) from feed_events;
reset role;
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
select 'FEED_P1', string_agg(kind||':'||n, ' ' order by kind) from
  (select kind, count(*) n from feed_events where post_id='60000000-0000-0000-0000-000000000001' group by kind) k;
select 'FEED_TEXT', summary from feed_events where post_id='60000000-0000-0000-0000-000000000001' and kind='post_submitted' order by id limit 1;
select 'TASK_FEED', count(*) from feed_events where kind='task_completed' and task_id='50000000-0000-0000-0000-000000000001';

-- Missed, then posted late
insert into posts (id,account_id,assignee_id,title,scheduled_at,needs_approval) values
 ('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Behind the scenes at BlueBugs', now()-interval '3 hours', false);
select 'MARK1', mark_missed_posts();
select 'MARK2', mark_missed_posts();
select 'P2', status from posts where id='60000000-0000-0000-0000-000000000002';
select 'MISSED_FEED', count(*) from feed_events where post_id='60000000-0000-0000-0000-000000000002' and kind='post_missed';
reset role;
select as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
update posts set status='posted', post_url='https://www.linkedin.com/feed/update/2' where id='60000000-0000-0000-0000-000000000002';
select 'P2_LATE', status from posts where id='60000000-0000-0000-0000-000000000002';

-- Ideas
insert into posts (id,account_id,assignee_id,title,status) values
 ('60000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001',auth.uid(),'Client result: 30% more bookings','idea');
select 'HINA_PLANNED_INSERT_SHOULD_FAIL';
insert into posts (account_id,assignee_id,title,scheduled_at) values ('30000000-0000-0000-0000-000000000001',auth.uid(),'x',now()+interval '2 days');
select 'HINA_IDEA_FOR_OTHER_SHOULD_FAIL';
insert into posts (account_id,assignee_id,title,status) values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','x','idea');
select 'HINA_SCHEDULE_IDEA_SHOULD_FAIL'; update posts set status='planned', scheduled_at=now()+interval '2 days' where id='60000000-0000-0000-0000-000000000003';
reset role;
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
update posts set status='planned', scheduled_at=now()+interval '2 days' where id='60000000-0000-0000-0000-000000000003';
select 'IDEA_SCHEDULED', status, draft_due_at = scheduled_at - interval '24 hours' from posts where id='60000000-0000-0000-0000-000000000003';

-- Metrics
select 'SOCIAL', planned, posted, on_time, late, missed, on_time_rate, changes_requested, median_approval_hours is not null
  from social_metrics(now()-interval '1 day', now()+interval '1 day 12 hours') where user_id='00000000-0000-0000-0000-00000000000c';
select 'SOCIAL_BY_ACCOUNT', dimension_name, planned, posted
  from social_metrics_by(now()-interval '1 day', now()+interval '1 day 12 hours', 'account');
select 'SOCIAL_DAILY_POSTED', sum(posted) from social_daily(current_date-1, current_date+1, 'UTC');
select 'SCOREBOARD_NAMES', string_agg(p.full_name, ',' order by p.full_name)
  from metrics_scoreboard(now()-interval '1 day', now()+interval '1 day') s join profiles p on p.id = s.user_id;
select 'DAILY_NO_SMM', count(*) from metrics_daily(current_date, current_date, 'UTC') where user_id='00000000-0000-0000-0000-00000000000c';
reset role;
select as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select 'HINA_SOCIAL_ROWS', count(*) from social_metrics(now()-interval '1 day', now()+interval '2 days');
reset role;
select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select 'BD_SOCIAL_ROWS', count(*) from social_metrics(now()-interval '1 day', now()+interval '2 days');
reset role;

-- Stop the schedule: future planned slots are cancelled
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
update posting_schedules set is_active=false where id='40000000-0000-0000-0000-000000000001';
select 'STOPPED', string_agg(distinct status::text, ',') , count(*) from posts where schedule_id='40000000-0000-0000-0000-000000000001';
reset role;

-- Anonymous callers can't run the housekeeping functions
select as_system(); set role anon;
select 'ANON_MISSED_SHOULD_FAIL'; select mark_missed_posts();
reset role;
