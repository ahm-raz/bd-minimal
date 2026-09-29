\set ON_ERROR_STOP 0
\set QUIET 1
\pset format unaligned
\pset footer off
-- Meetings, notifications and Google connections (docs/10 section 5). Run on a fresh database by scripts/db-test.sh.
-- Lines ending in _SHOULD_FAIL are followed by exactly one statement that must raise an ERROR.

insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000f','zain@x.com','{"full_name":"Zain"}'),
 ('00000000-0000-0000-0000-00000000000a','ahmed@x.com','{"full_name":"Ahmed"}'),
 ('00000000-0000-0000-0000-00000000000b','sara@x.com','{"full_name":"Sara"}'),
 ('00000000-0000-0000-0000-00000000000c','hina@x.com','{"full_name":"Hina"}');

create or replace function as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',u)::text, false), null::void $$;
grant execute on function as_user to authenticated;

update profiles set timezone = 'Asia/Karachi';
update profiles set role = 'social' where id = '00000000-0000-0000-0000-00000000000c';

-- Ahmed adds a lead and books a meeting for next week, 10:00 Chicago.
select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into leads (id,owner_id,created_by,company_name,niche_id,channel_id) values
 ('10000000-0000-0000-0000-000000000001',auth.uid(),auth.uid(),'Smile Dental',(select id from niches limit 1),(select id from channels limit 1));
insert into contacts (id,lead_id,first_name,last_name,email,is_primary) values
 ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Sarah','Mitchell','sarah@x.com',true);
select 'BOOK', book_meeting('10000000-0000-0000-0000-000000000001', (select id from activity_types where name='Reply received'),
  ((current_date + 7)::text || ' 10:00')::timestamp at time zone 'America/Chicago', 'America/Chicago', 30, null,
  'https://meet.example/abc', null, '{30,10}', false, true, now(), '11000000-0000-0000-0000-000000000001') is not null;
select 'MEETING', title, status, gcal_state, owner_id = auth.uid(), reminder_minutes from meetings;
select 'NEXT', next_action, next_action_due = current_date + 7 from leads;
select 'ACT', count(*) from activities where outcome_key = 'meeting_booked';

select 'BAD_TZ_SHOULD_FAIL';
update meetings set timezone = 'Mars/Base';
select 'PAST_SHOULD_FAIL';
update meetings set starts_at = now() - interval '3 days';
select 'OWNER_SHOULD_FAIL';
update meetings set owner_id = '00000000-0000-0000-0000-00000000000b';
select 'CANCEL_NO_REASON_SHOULD_FAIL';
update meetings set status = 'cancelled';
update meetings set starts_at = starts_at + interval '1 hour';
select 'AHMED_OWN_NOTIFS', count(*) from notifications;

-- Another BD and the SMM see nothing of it.
select as_user('00000000-0000-0000-0000-00000000000b');
select 'SARA_SEES', count(*) from meetings;
select 'SARA_INSERT_SHOULD_FAIL';
insert into meetings (lead_id,title,starts_at,timezone) values ('10000000-0000-0000-0000-000000000001','x',now()+interval '1 day','UTC');
select as_user('00000000-0000-0000-0000-00000000000c');
select 'HINA_SEES', count(*) from meetings;

-- Founder: booked + rescheduled arrived; cancelling Ahmed's meeting tells Ahmed, not the founder.
select as_user('00000000-0000-0000-0000-00000000000f');
select 'FOUNDER_KINDS', string_agg(kind, ',' order by id) from notifications;
update meetings set status = 'cancelled', status_note = 'Clinic closed that day';
update meetings set status = 'scheduled';
select 'UNDO', status, status_note is null from meetings;
select 'FOUNDER_KINDS_2', string_agg(kind, ',' order by id) from notifications;
insert into tasks (assignee_id,created_by,title,kind,due_date) values
 ('00000000-0000-0000-0000-00000000000a',auth.uid(),'Call 5 dentists','checklist',current_date);
select as_user('00000000-0000-0000-0000-00000000000a');
select 'AHMED_KINDS', string_agg(kind, ',' order by id) from notifications;
select 'AHMED_TITLE', title from notifications where kind = 'meeting_cancelled';

-- Only the read state changes; nobody inserts; everyone sees only their own.
update notifications set read_at = now();
select 'AHMED_UNREAD', count(*) from notifications where read_at is null;
select 'TITLE_SHOULD_FAIL';
update notifications set title = 'x';
select 'INSERT_NOTIF_SHOULD_FAIL';
insert into notifications (recipient_id,kind,kind_group,title,dedupe_key) values (auth.uid(),'x','leads','x','x');
reset role;
select 'VISIBLE_TO_AHMED', (select count(*) from notifications where recipient_id = '00000000-0000-0000-0000-00000000000a');
select 'DEDUPE', count(*) - count(distinct (recipient_id, dedupe_key)) from notifications;
set role authenticated;

-- Google connection: token saved, never selectable, readable only through my_google_token().
select 'SAVE_CONN', count(*) from (select save_google_connection('ahmed@gmail.com', '{openid,email}', 'v1:iv:tag:ct')) s;
select 'CONN', google_email, status from google_connections;
select 'TOKEN_SHOULD_FAIL';
select refresh_token_enc from google_connections;
select 'MY_TOKEN', refresh_token_enc from my_google_token();
select 'PENDING_AFTER_CONNECT', gcal_state from meetings;
update meetings set gcal_event_id = 'evt1', gcal_state = 'synced';
select 'TEAM_STATUS_BD', count(*) from team_calendar_status();
select as_user('00000000-0000-0000-0000-00000000000b');
select 'SARA_TOKEN', count(*) from my_google_token();
select 'SARA_CONN', count(*) from google_connections;

-- Reassignment: the meeting follows the lead; Ahmed's old event is queued for removal; both owners hear.
insert into notification_prefs (user_id, kind_group, in_app) values (auth.uid(), 'tasks', false);
select as_user('00000000-0000-0000-0000-00000000000f');
select 'TEAM_STATUS', count(*) from team_calendar_status();
update leads set owner_id = '00000000-0000-0000-0000-00000000000b';
select 'MEETING_OWNER', owner_id = '00000000-0000-0000-0000-00000000000b', gcal_event_id is null from meetings;
insert into tasks (assignee_id,created_by,title,kind,due_date) values
 ('00000000-0000-0000-0000-00000000000b',auth.uid(),'Muted task','checklist',current_date);
reset role;
select 'CLEANUP', user_id = '00000000-0000-0000-0000-00000000000a', gcal_event_id from calendar_cleanup;
select 'REASSIGN_TO', string_agg(p.full_name, ',' order by p.full_name) from notifications n join profiles p on p.id = n.recipient_id where n.kind = 'lead_reassigned';
select 'SARA_MUTED_TASKS', count(*) from notifications where recipient_id = '00000000-0000-0000-0000-00000000000b' and kind_group = 'tasks';
select 'TITLE_REASSIGN', title from notifications where kind = 'lead_reassigned' and recipient_id = '00000000-0000-0000-0000-00000000000b';

-- Social: a one-off post and a comment reach the SMM; schedule slots don't.
select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
insert into social_accounts (id,name,platform,audience_timezone) values
 ('30000000-0000-0000-0000-000000000001','Page','linkedin_page','America/New_York');
insert into posts (id,account_id,assignee_id,title,scheduled_at) values
 ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Case study',now()+interval '2 days');
insert into post_comments (post_id,author_id,kind,body) values ('60000000-0000-0000-0000-000000000001',auth.uid(),'comment','Use the new logo');
select as_user('00000000-0000-0000-0000-00000000000c');
select 'HINA_KINDS', string_agg(kind, ',' order by id) from notifications;
select 'HINA_LINK', link from notifications where kind = 'post_comment';

-- Housekeeping only touches the caller's own old items.
select as_user('00000000-0000-0000-0000-00000000000a');
select 'PRUNE', prune_my_notifications();
reset role;
