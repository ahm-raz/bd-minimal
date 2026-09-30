\set ON_ERROR_STOP 0
\set QUIET 1
\pset format unaligned
\pset footer off
-- Offices (docs/11-offices.md; migrations 20261002000000..0200). Run on a fresh database by scripts/db-test.sh.
-- Lines ending in _SHOULD_FAIL are followed by exactly one statement that must raise an ERROR.
-- Office A: Zain (founder), Ahmed (BD). Office B: Omar (founder), Bilal (BD); 3 seats.
-- The platform owner (owner@z.com) is a separate account in no office (M19).

create or replace function as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',u)::text, false), null::void $$;
grant execute on function as_user to authenticated;

-- Ids the tests aim at another office with (a plain table, outside the office wall).
create table test_ids (k text primary key, v uuid);
grant select on test_ids to authenticated;

-- Rows of other offices this caller can see, over every table that has office_id.
create or replace function foreign_rows() returns bigint language plpgsql as $$
declare t text; n bigint; total bigint := 0;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r'
             and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'office_id')
  loop
    continue when not has_column_privilege(format('public.%I', t), 'office_id', 'SELECT');
    execute format('select count(*) from public.%I where office_id is distinct from public.current_office_id()', t) into n;
    total := total + n;
  end loop;
  return total;
end $$;
grant execute on function foreign_rows to authenticated;

-- ---------- Setup: office A by /setup, office B by the platform admin ----------
select 'SETUP', setup_first_office('Alpha Agency', 'Asia/Karachi', 'zain@x.com') is not null;
select 'SETUP_AGAIN_SHOULD_FAIL'; select setup_first_office('Again', 'Asia/Karachi', 'x@x.com');
insert into pending_members (email, office_id, role) values ('ahmed@x.com', (select id from offices), 'bd');
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000f','zain@x.com','{"full_name":"Zain"}'),
 ('00000000-0000-0000-0000-00000000000a','ahmed@x.com','{"full_name":"Ahmed","role":"founder"}');
select 'A_ROLES', string_agg(full_name||':'||role, ', ' order by full_name) from profiles;
select 'A_ADMIN', count(*) from platform_admins;
insert into test_ids select 'A', id from offices;

-- The owner: reserved with the service-role key, then the account. No profile, no office.
insert into pending_platform_admins (email) values ('owner@z.com');
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000ff','owner@z.com');
select 'OWNER', (select count(*) from platform_admins), (select count(*) from profiles where email = 'owner@z.com');

select 'STRAY_SIGNUP_SHOULD_FAIL';
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000000099','stray@z.com');

select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select 'BD_CREATE_OFFICE_SHOULD_FAIL'; select create_office('Nope', 'UTC', null, 'n@n.com');
reset role;

select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
select 'FOUNDER_CREATE_OFFICE_SHOULD_FAIL'; select create_office('Nope', 'UTC', null, 'n2@n.com');
select 'FOUNDER_IS_ADMIN', is_platform_admin(), my_account_state();
reset role;

select as_user('00000000-0000-0000-0000-0000000000ff'); set role authenticated;
select 'OWNER_STATE', is_platform_admin(), my_account_state();
select 'CREATE_B', create_office('Beta Group', 'Europe/Berlin', 3, 'Omar@Y.com') is not null;
reset role;
insert into test_ids select 'B', id from offices where name = 'Beta Group';
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b0','omar@y.com','{"full_name":"Omar"}');
select 'B_FOUNDER', role, timezone, office_id = (select v from test_ids where k = 'B') from profiles where full_name = 'Omar';
select 'B_DEFAULTS', (select count(*) from stages where office_id = (select v from test_ids where k='B')),
                     (select count(*) from outcomes where office_id = (select v from test_ids where k='B')),
                     (select count(*) from niches where office_id = (select v from test_ids where k='B'));

select as_user('00000000-0000-0000-0000-0000000000b0'); set role authenticated;
insert into pending_members (email, role) values ('bilal@y.com', 'bd');
select 'PENDING_OTHER_OFFICE_SHOULD_FAIL';
insert into pending_members (email, office_id, role) values ('x1@y.com', (select v from test_ids where k='A'), 'bd');
select 'PENDING_FOUNDER_SHOULD_FAIL'; insert into pending_members (email, role) values ('x2@y.com', 'founder');
select 'PENDING_TAKEN_EMAIL_SHOULD_FAIL'; insert into pending_members (email, role) values ('ahmed@x.com', 'bd');
select 'PENDING_OWNER_EMAIL_SHOULD_FAIL'; insert into pending_members (email, role) values ('owner@z.com', 'bd');
reset role;
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b1','bilal@y.com','{"full_name":"Bilal"}');
select 'B_ROLES', string_agg(full_name||':'||role, ', ' order by full_name) from profiles where office_id = (select v from test_ids where k='B');

-- ---------- Work in both offices ----------
select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into leads (id,owner_id,company_name,niche_id,channel_id) values
 ('10000000-0000-0000-0000-00000000000a', auth.uid(), 'Alpha Dental',
  (select id from niches where name='Dental'), (select id from channels where name='LinkedIn'));
insert into contacts (lead_id, first_name, is_primary) values ('10000000-0000-0000-0000-00000000000a', 'Ann', true);
select 'A_ACT', log_activity('10000000-0000-0000-0000-00000000000a', (select id from activity_types where name='Reply received'), 'interested') is not null;
insert into opportunities (id,lead_id,owner_id,title,estimated_value) values
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a',auth.uid(),'Site',1000);
reset role;
insert into test_ids values ('A_LEAD', '10000000-0000-0000-0000-00000000000a'),
  ('A_NICHE', (select id from niches where name='Dental' and office_id = (select v from test_ids where k='A')));

select as_user('00000000-0000-0000-0000-0000000000b1'); set role authenticated;
insert into leads (id,owner_id,company_name,niche_id,channel_id) values
 ('10000000-0000-0000-0000-0000000000b1', auth.uid(), 'Beta Law',
  (select id from niches where name='Law'), (select id from channels where name='Email'));
select 'B_ACT', log_activity('10000000-0000-0000-0000-0000000000b1', (select id from activity_types where name='Cold email'), 'no_response') is not null;
select 'B_STAGES', count(*) from stages;
select 'B_LEAD_OTHER_NICHE_SHOULD_FAIL';
insert into leads (owner_id,company_name,niche_id,channel_id) values
 (auth.uid(), 'Sneaky', (select v from test_ids where k='A_NICHE'), (select id from channels where name='Email'));
select 'B_LOG_ON_A_SHOULD_FAIL';
select log_activity((select v from test_ids where k='A_LEAD'), (select id from activity_types where name='Cold email'), 'no_response');
select 'B_OPP_ON_A_SHOULD_FAIL';
insert into opportunities (lead_id,owner_id,title) values ((select v from test_ids where k='A_LEAD'), auth.uid(), 'x');
reset role;

-- ---------- Isolation: every table, every direction ----------
select as_user('00000000-0000-0000-0000-0000000000b0'); set role authenticated;
select 'B_FOUNDER_FOREIGN', foreign_rows();
select 'B_FOUNDER_SEES', (select count(*) from leads), (select count(*) from profiles), (select count(*) from feed_events) > 0,
                         (select count(*) from offices);
select 'B_SCORE', count(*) from metrics_scoreboard(now() - interval '1 day', now() + interval '1 day');
select 'B_PIPE', coalesce(sum(opp_count), 0) from pipeline_summary();
with u as (update leads set company_name = 'hacked' where id = (select v from test_ids where k='A_LEAD') returning 1)
select 'B_UPDATE_A', count(*) from u;
with d as (delete from leads where id = (select v from test_ids where k='A_LEAD') returning 1)
select 'B_DELETE_A', count(*) from d;
with u as (update offices set name = 'hacked' where id = (select v from test_ids where k='A') returning 1)
select 'B_RENAME_A', count(*) from u;
update offices set name = 'Beta Group Ltd' where id = (select v from test_ids where k='B');
select 'B_RENAMED', name from offices;
select 'B_SEATS_SHOULD_FAIL'; update offices set seat_limit = 50 where id = (select v from test_ids where k='B');
select 'B_REASSIGN_TO_A_SHOULD_FAIL';
update leads set owner_id = '00000000-0000-0000-0000-00000000000a' where id = '10000000-0000-0000-0000-0000000000b1';
select 'B_TASK_FOR_A_SHOULD_FAIL';
insert into tasks (assignee_id,title,kind,due_date) values ('00000000-0000-0000-0000-00000000000a','x','checklist',current_date);
select 'B_SUMMARY_SHOULD_FAIL'; select * from admin_office_summary();
select 'B_MOVE_ROW_SHOULD_FAIL';
update leads set office_id = (select v from test_ids where k='A') where id = '10000000-0000-0000-0000-0000000000b1';
reset role;

select as_user('00000000-0000-0000-0000-0000000000b1'); set role authenticated;
select 'B_BD_FOREIGN', foreign_rows();
reset role;

select as_user('00000000-0000-0000-0000-00000000000f'); set role authenticated;
select 'A_FOUNDER_FOREIGN', foreign_rows();
select 'A_FOUNDER_SEES', (select count(*) from leads), (select count(*) from profiles), (select count(*) from offices);
select 'A_SCORE', count(*) from metrics_scoreboard(now() - interval '1 day', now() + interval '1 day');
select 'A_NOTIFS_FROM_B', count(*) from notifications n join profiles p on p.id = n.actor_id where p.full_name in ('Omar','Bilal');
select 'A_SUMMARY_SHOULD_FAIL'; select * from admin_office_summary();
reset role;

-- The owner sees the office list (counts only) and no office's data.
select as_user('00000000-0000-0000-0000-0000000000ff'); set role authenticated;
select 'OWNER_SEES', (select count(*) from leads), (select count(*) from profiles), (select count(*) from feed_events),
                     (select count(*) from niches), (select count(*) from offices);
select 'SUMMARY', string_agg(name||':'||status||':'||active_members||':'||leads_count||':'||coalesce(seat_limit::text,'-'), ', ') from admin_office_summary();
reset role;

select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select 'A_BD_FOREIGN', foreign_rows();
reset role;

-- ---------- Seats: B has 3 ----------
select as_user('00000000-0000-0000-0000-0000000000b0'); set role authenticated;
insert into pending_members (email, role) values ('cara@y.com', 'bd');
reset role;
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b2','cara@y.com','{"full_name":"Cara"}');
select as_user('00000000-0000-0000-0000-0000000000b0'); set role authenticated;
select 'SEATS_FULL_SHOULD_FAIL'; insert into pending_members (email, role) values ('dan@y.com', 'bd');
update profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000b2';
insert into pending_members (email, role) values ('dan@y.com', 'bd');
reset role;
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b3','dan@y.com','{"full_name":"Dan"}');
select as_user('00000000-0000-0000-0000-0000000000b0'); set role authenticated;
select 'REACTIVATE_FULL_SHOULD_FAIL'; update profiles set is_active = true where id = '00000000-0000-0000-0000-0000000000b2';
select 'B_ACTIVE', count(*) from profiles where is_active;
reset role;

-- ---------- Suspend (the owner) ----------
select as_user('00000000-0000-0000-0000-0000000000ff'); set role authenticated;
update offices set status = 'suspended' where id = (select v from test_ids where k='B');
reset role;
select as_user('00000000-0000-0000-0000-0000000000b0'); set role authenticated;
select 'SUSPENDED', my_account_state(), (select count(*) from leads), (select count(*) from profiles), (select count(*) from offices);
select 'SUSPENDED_WRITE_SHOULD_FAIL';
insert into leads (owner_id,company_name,niche_id,channel_id) values (auth.uid(), 'x', null, null);
reset role;
select as_user('00000000-0000-0000-0000-0000000000ff'); set role authenticated;
update offices set status = 'active' where id = (select v from test_ids where k='B');
reset role;
select as_user('00000000-0000-0000-0000-0000000000b0'); set role authenticated;
select 'REACTIVATED', my_account_state(), (select count(*) from leads);
reset role;

-- ---------- The reviewed list: security definer functions that skip the office wall ----------
select 'DEFINER_OWNERS', string_agg(p.proname, ',' order by p.proname)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) <> 'office_definer';
select 'UNWALLED', count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'pending_members'
  and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'office_id')
  and not exists (select 1 from pg_policies p where p.tablename = c.relname and p.policyname = 'office_boundary' and p.permissive = 'RESTRICTIVE');
-- sanity: the zero counts above are real (trusted context sees both offices)
select 'ALL_LEADS', count(*), count(distinct office_id) from leads;
