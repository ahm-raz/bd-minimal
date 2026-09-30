\set ON_ERROR_STOP 0
\set QUIET 1
\pset format unaligned
\pset footer off
-- Hardening (migration 20261001000000_hardening.sql). Run on a fresh database by scripts/db-test.sh.
-- Lines ending in _SHOULD_FAIL are followed by exactly one statement that must raise an ERROR.

insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000f','zain@x.com','{"full_name":"Zain"}'),
 ('00000000-0000-0000-0000-00000000000a','ahmed@x.com','{"full_name":"Ahmed"}'),
 ('00000000-0000-0000-0000-00000000000b','sara@x.com','{"full_name":"Sara"}'),
 ('00000000-0000-0000-0000-00000000000c','hina@x.com','{"full_name":"Hina"}');

create or replace function as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',u)::text, false), null::void $$;
grant execute on function as_user to authenticated;
update profiles set timezone = 'Asia/Karachi', can_import_leads = true where id = '00000000-0000-0000-0000-00000000000a';
update profiles set role = 'social' where id = '00000000-0000-0000-0000-00000000000c';

-- ---------- 1. Import batches: a validated batch can't be edited ----------
select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into lead_import_batches (id,filename,file_sha256,status,total_rows,valid_rows,rows) values
 ('20000000-0000-0000-0000-000000000001','a.csv',repeat('a',64),'validated',1,1,'[{"row":2,"company_name":"Checked"}]'),
 ('20000000-0000-0000-0000-000000000002','b.csv',repeat('b',64),'validated',1,1,'[{"row":2,"company_name":"Checked"}]');
select 'SWAP_ROWS_SHOULD_FAIL';
update lead_import_batches set rows = '[{"row":2,"company_name":"Unchecked"}]' where id = '20000000-0000-0000-0000-000000000001';
select 'COUNTS_SHOULD_FAIL';
update lead_import_batches set valid_rows = 500 where id = '20000000-0000-0000-0000-000000000001';
select 'ERRORS_SHOULD_FAIL';
update lead_import_batches set errors = '[{"row":1}]' where id = '20000000-0000-0000-0000-000000000001';
-- Failing may record why (the app's duplicate check does this).
update lead_import_batches set status = 'failed', errors = '[{"row":2,"message":"dup"}]', invalid_rows = 1, valid_rows = 0,
  duplicate_rows = 1, error_summary = '1 problem' where id = '20000000-0000-0000-0000-000000000001';
select 'FAILED', status, rows is null, invalid_rows from lead_import_batches where id = '20000000-0000-0000-0000-000000000001';
select 'CANCEL_WITH_EDIT_SHOULD_FAIL';
update lead_import_batches set status = 'cancelled', valid_rows = 0 where id = '20000000-0000-0000-0000-000000000002';
update lead_import_batches set status = 'cancelled' where id = '20000000-0000-0000-0000-000000000002';
select 'CANCELLED', status, rows is null from lead_import_batches where id = '20000000-0000-0000-0000-000000000002';

-- ---------- 2. Leads and activities: frozen columns ----------
insert into leads (id,owner_id,created_by,company_name,website,niche_id,channel_id) values
 ('10000000-0000-0000-0000-000000000001',auth.uid(),auth.uid(),'Smile Dental','https://smile.com',
  (select id from niches where name='Dental'),(select id from channels where name='LinkedIn'));
insert into contacts (id,lead_id,first_name,email,is_primary) values
 ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Sarah','sarah@smile.com',true);
update leads set pain_point = 'Missed calls', city = 'Austin', state_region = 'TX' where id = '10000000-0000-0000-0000-000000000001';
select 'LEAD_COMP', completeness from leads where id = '10000000-0000-0000-0000-000000000001';
select 'COMPLETENESS_SHOULD_FAIL';
update leads set completeness = 100 where id = '10000000-0000-0000-0000-000000000001';
select 'CREATED_BY_SHOULD_FAIL';
update leads set created_by = '00000000-0000-0000-0000-00000000000f' where id = '10000000-0000-0000-0000-000000000001';
select 'CREATED_AT_SHOULD_FAIL';
update leads set created_at = now() - interval '30 days' where id = '10000000-0000-0000-0000-000000000001';
select 'IMPORT_MARK_SHOULD_FAIL';
update leads set import_batch_id = '20000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000001';

select 'ACT', log_activity('10000000-0000-0000-0000-000000000001',(select id from activity_types where name='Cold email'),
  'no_response', now(), null, null, 'hi', null, null, true) is not null;
-- The 24-hour edit: notes, outcome and time.
update activities set notes = 'edited', outcome_key = 'bounced', occurred_at = now() - interval '1 hour';
select 'ACT_EDIT', notes, outcome_key, category from activities;
select 'BAD_OUTCOME_SHOULD_FAIL';
update activities set outcome_key = 'interested';
select 'ACT_USER_SHOULD_FAIL';
update activities set user_id = '00000000-0000-0000-0000-00000000000b';
select 'ACT_TYPE_SHOULD_FAIL';
update activities set activity_type_id = (select id from activity_types where name='Phone call');
select 'ACT_CATEGORY_SHOULD_FAIL';
update activities set category = 'follow_up';

-- ---------- 3. Lead owners and task assignees ----------
select as_user('00000000-0000-0000-0000-00000000000f');
-- The founder may change the type; the category follows it and the outcome must still fit.
update activities set activity_type_id = (select id from activity_types where name='Phone call');
select 'ACT_TYPE_FOUNDER', category from activities;
select 'FOUNDER_CATEGORY_SHOULD_FAIL';
update activities set category = 'follow_up';
select 'FOUNDER_TYPE_OUTCOME_SHOULD_FAIL';
update activities set activity_type_id = (select id from activity_types where name='Reply received');

select 'SMM_OWNER_SHOULD_FAIL';
update leads set owner_id = '00000000-0000-0000-0000-00000000000c';
select 'SMM_NEW_LEAD_SHOULD_FAIL';
insert into leads (owner_id,created_by,company_name,niche_id,channel_id) values
 ('00000000-0000-0000-0000-00000000000c',auth.uid(),'X',(select id from niches limit 1),(select id from channels limit 1));
insert into tasks (assignee_id,created_by,title,kind,due_date) values
 ('00000000-0000-0000-0000-00000000000c',auth.uid(),'Design 5 carousel templates','checklist',current_date),
 ('00000000-0000-0000-0000-00000000000b',auth.uid(),'Call 5 dentists','checklist',current_date);
select 'SMM_TASK', count(*) from tasks where assignee_id = '00000000-0000-0000-0000-00000000000c';

-- ---------- 4. Meetings: calendar fields are server-only ----------
select as_user('00000000-0000-0000-0000-00000000000a');
select 'BOOK', book_meeting('10000000-0000-0000-0000-000000000001', (select id from activity_types where name='Reply received'),
  now() + interval '7 days', 'America/Chicago') is not null;
insert into meetings (id,lead_id,title,starts_at,timezone,gcal_event_id,gcal_state,gcal_synced_version,sync_version) values
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Direct',now()+interval '2 days','UTC',
  'someone-elses-event','synced',9,9);
select 'INSERT_GCAL', gcal_event_id is null, gcal_state, gcal_synced_version, sync_version
  from meetings where id = '70000000-0000-0000-0000-000000000001';
reset role; delete from meetings where id = '70000000-0000-0000-0000-000000000001'; set role authenticated;
select 'EVENT_ID_SHOULD_FAIL';
update meetings set gcal_event_id = 'evt-x';
select 'SYNCED_SHOULD_FAIL';
update meetings set gcal_state = 'synced';
select 'SYNC_VERSION_SHOULD_FAIL';
update meetings set sync_version = 99;
-- Retry and Disconnect only reset: allowed.
update meetings set gcal_state = 'pending', gcal_attempts = 0, gcal_error = null, gcal_next_retry_at = null;
update meetings set gcal_state = 'off';
select 'RESET', gcal_state from meetings;
select 'OWNER_SET', set_meeting_gcal(id, sync_version, '{"gcal_event_id":"evt1","gcal_calendar_id":"primary","gcal_state":"synced","gcal_synced_version":1}') from meetings;
select 'STALE_SET', set_meeting_gcal(id, sync_version - 1, '{"gcal_state":"failed"}') from meetings;
select 'SYNCED', gcal_event_id, gcal_state, gcal_synced_version = sync_version from meetings;
select 'BAD_KEY_SHOULD_FAIL';
select set_meeting_gcal(id, sync_version, '{"title":"x"}') from meetings;
select as_user('00000000-0000-0000-0000-00000000000f');
select 'FOUNDER_SET', set_meeting_gcal(id, sync_version, '{"gcal_event_id":"evt-founder"}') from meetings;
select 'FOUNDER_EVENT_SHOULD_FAIL';
update meetings set gcal_event_id = 'evt-founder';
select 'STILL', gcal_event_id from meetings;

-- ---------- 5 and 6. Deactivated users and SMM calendars ----------
select as_user('00000000-0000-0000-0000-00000000000c');
select 'SMM_CALENDAR_SHOULD_FAIL';
select save_google_connection('hina@gmail.com', '{email}', 'v1:iv:tag:ct');
select as_user('00000000-0000-0000-0000-00000000000b');
insert into notification_prefs (user_id, kind_group, in_app) values (auth.uid(), 'deals', false);
select save_google_connection('sara@gmail.com', '{email}', 'v1:iv:tag:ct');
select as_user('00000000-0000-0000-0000-00000000000f');
update profiles set is_active = false where id = '00000000-0000-0000-0000-00000000000b';
select 'INACTIVE_TASK_SHOULD_FAIL';
insert into tasks (assignee_id,created_by,title,kind,due_date) values
 ('00000000-0000-0000-0000-00000000000b',auth.uid(),'x','checklist',current_date);
select 'INACTIVE_OWNER_SHOULD_FAIL';
update leads set owner_id = '00000000-0000-0000-0000-00000000000b';
select as_user('00000000-0000-0000-0000-00000000000b');
select 'DEACT_READS', (select count(*) from notification_prefs), (select count(*) from google_connections),
  (select count(*) from calendar_cleanup);
with u as (update notifications set read_at = now() returning 1) select 'DEACT_MARK', count(*) from u;
with d as (delete from notifications returning 1) select 'DEACT_DELETE', count(*) from d;
reset role;
select 'SARA_NOTIFS_KEPT', count(*) from notifications where recipient_id = '00000000-0000-0000-0000-00000000000b' and read_at is null;
select 'SARA_ROWS_KEPT', (select count(*) from notification_prefs where user_id = '00000000-0000-0000-0000-00000000000b'),
  (select count(*) from google_connections where user_id = '00000000-0000-0000-0000-00000000000b');
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
update profiles set is_active = true where id = '00000000-0000-0000-0000-00000000000b';

-- ---------- 7. Notification routing ----------
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000f');
-- The founder books on Ahmed's lead: the founder is the actor, and Ahmed isn't in the routing table for bookings.
select 'FOUNDER_BOOK', book_meeting('10000000-0000-0000-0000-000000000001', (select id from activity_types where name='Reply received'),
  now() + interval '8 days', 'America/Chicago') is not null;
insert into social_accounts (id,name,platform,audience_timezone) values
 ('30000000-0000-0000-0000-000000000001','Page','linkedin_page','America/New_York');
insert into posts (id,account_id,assignee_id,title,scheduled_at) values
 ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Case study',now()+interval '2 days');
insert into post_comments (post_id,author_id,kind,body) values ('60000000-0000-0000-0000-000000000001',auth.uid(),'comment','Use the new logo');
select as_user('00000000-0000-0000-0000-00000000000c');
insert into post_comments (post_id,author_id,kind,body) values ('60000000-0000-0000-0000-000000000001',auth.uid(),'comment','Done');
reset role;
insert into feed_events (kind, actor_id, subject_user_id, post_id, summary) values
 ('post_published','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','60000000-0000-0000-0000-000000000001','published x');
insert into feed_events (kind, actor_id, subject_user_id, lead_id, summary) values
 ('meeting_held','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','held x'),
 ('meeting_no_show','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','no-show x');
select 'FOUNDER_KINDS', string_agg(kind, ',' order by id) from notifications where recipient_id = '00000000-0000-0000-0000-00000000000f';
select 'AHMED_BOOKED', count(*) from notifications where recipient_id = '00000000-0000-0000-0000-00000000000a' and kind = 'meeting_booked';
select 'HINA_COMMENTS', count(*) from notifications where recipient_id = '00000000-0000-0000-0000-00000000000c' and kind = 'post_comment';
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000f');
update leads set owner_id = '00000000-0000-0000-0000-00000000000b';
reset role;
select 'REASSIGN_TITLES', string_agg(title, ' | ' order by title) from notifications where kind = 'lead_reassigned';

-- ---------- 8. sync_lead_contacts ----------
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000f');
insert into contacts (id,lead_id,first_name,is_primary) values
 ('11000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Old',false);
select sync_lead_contacts('10000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('id','11000000-0000-0000-0000-000000000001','first_name','Sarah','email','sarah@smile.com','is_primary',false),
  jsonb_build_object('first_name','Tom','job_title','Owner','is_decision_maker',true,'is_primary',true)));
select 'CONTACTS', string_agg(first_name || ':' || is_primary, ',' order by first_name) from contacts;
select 'TWO_PRIMARY_SHOULD_FAIL';
select sync_lead_contacts('10000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('first_name','A','is_primary',true), jsonb_build_object('first_name','B','is_primary',true)));
select 'BAD_CONTACT_SHOULD_FAIL';
select sync_lead_contacts('10000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('first_name','Keeps rest','is_primary',true), jsonb_build_object('first_name',' ')));
select 'CONTACTS_AFTER_FAIL', count(*) from contacts;
select as_user('00000000-0000-0000-0000-00000000000a');
select 'NOT_OWNER_SHOULD_FAIL';
select sync_lead_contacts('10000000-0000-0000-0000-000000000001', '[{"first_name":"X","is_primary":true}]');

-- ---------- 9. pipeline_summary by niche ----------
select as_user('00000000-0000-0000-0000-00000000000f');
insert into leads (id,owner_id,created_by,company_name,niche_id,channel_id) values
 ('10000000-0000-0000-0000-000000000002',auth.uid(),auth.uid(),'Law Co',(select id from niches where name='Law'),(select id from channels limit 1));
insert into opportunities (lead_id,owner_id,created_by,title,estimated_value) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b',auth.uid(),'Dental deal',1000),
 ('10000000-0000-0000-0000-000000000002',auth.uid(),auth.uid(),'Law deal',5000);
select 'PIPE_ALL', sum(opp_count), sum(total_value) from pipeline_summary();
select 'PIPE_DENTAL', sum(opp_count), sum(total_value) from pipeline_summary(p_niche => (select id from niches where name='Dental'));
select 'PIPE_LAW_ME', sum(opp_count) from pipeline_summary(auth.uid(), 14, (select id from niches where name='Law'));
reset role;
