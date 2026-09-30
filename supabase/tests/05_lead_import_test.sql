\set ON_ERROR_STOP 0
\set QUIET 1
\pset format unaligned
\pset footer off
-- CSV lead import (docs/04 section 10). Run on a fresh database by scripts/db-test.sh.
-- Lines ending in _SHOULD_FAIL are followed by exactly one statement that must raise an ERROR.

-- M16: the office and its reservations come first (docs/11 section 5)
do $$ begin
  perform setup_first_office('Test office', 'Asia/Karachi', 'zain@x.com');
  insert into pending_members (email, office_id, role)
  select e, (select id from offices), 'bd' from unnest(array['ahmed@x.com', 'sara@x.com', 'hina@x.com']) e;
end $$;
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000f','zain@x.com','{"full_name":"Zain"}'),
 ('00000000-0000-0000-0000-00000000000a','ahmed@x.com','{"full_name":"Ahmed"}'),
 ('00000000-0000-0000-0000-00000000000b','sara@x.com','{"full_name":"Sara"}'),
 ('00000000-0000-0000-0000-00000000000c','hina@x.com','{"full_name":"Hina"}');

create or replace function as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub',u)::text, false), null::void $$;
grant execute on function as_user to authenticated;
update profiles set role = 'social' where id = '00000000-0000-0000-0000-00000000000c';

-- A two-row batch the app would have validated (rows keyed by column).
create or replace function batch_rows(owner uuid, second_company text) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('row',2,'owner_id',owner,'niche_id',(select id from niches order by sort_order limit 1),
      'channel_id',(select id from channels order by sort_order limit 1),'priority','high','company_name','Acme Dental',
      'website','https://acme.com','domain','acme.com','country','United States','tags','["import"]'::jsonb,
      'contact',jsonb_build_object('first_name','Ann','email','ann@acme.com')),
    jsonb_build_object('row',3,'owner_id',owner,'niche_id',(select id from niches order by sort_order limit 1),
      'channel_id',(select id from channels order by sort_order limit 1),'company_name',second_company,
      'country','United States','contact',null))
$$;
grant execute on function batch_rows to authenticated;

-- Ahmed has no permission yet.
select as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select 'AHMED_CAN', can_import_leads();
select 'NO_PERMISSION_SHOULD_FAIL';
insert into lead_import_batches (filename,file_sha256,status,rows)
values ('a.csv',repeat('a',64),'validated',batch_rows(auth.uid(),'Beta'));
select 'SELF_GRANT_SHOULD_FAIL';
update profiles set can_import_leads = true where id = auth.uid();

-- The founder turns it on.
select as_user('00000000-0000-0000-0000-00000000000f');
update profiles set can_import_leads = true where id = '00000000-0000-0000-0000-00000000000a';
select as_user('00000000-0000-0000-0000-00000000000a');
select 'AHMED_CAN_2', can_import_leads();

-- Atomic: row 3 breaks a constraint (blank company), so row 2 is not kept either.
insert into lead_import_batches (id,filename,file_sha256,status,rows) values
 ('20000000-0000-0000-0000-000000000001','bad.csv',repeat('b',64),'validated',batch_rows(auth.uid(),' '));
select 'BAD_BATCH_SHOULD_FAIL';
select import_lead_batch('20000000-0000-0000-0000-000000000001');
select 'AFTER_BAD', count(*) from leads;
select 'BAD_STATUS', status from lead_import_batches where id = '20000000-0000-0000-0000-000000000001';

-- A good batch: both leads, marked, one feed line, no Leads added credit.
insert into lead_import_batches (id,filename,file_sha256,status,rows) values
 ('20000000-0000-0000-0000-000000000002','good.csv',repeat('c',64),'validated',batch_rows(auth.uid(),'Beta Law'));
select 'CODE', code ~ '^IMP-[0-9]{4}-[0-9]{5}$' from lead_import_batches where id = '20000000-0000-0000-0000-000000000002';
select 'IMPORT', import_lead_batch('20000000-0000-0000-0000-000000000002');
select 'LEADS', count(*), count(*) filter (where import_batch_id = '20000000-0000-0000-0000-000000000002'),
  bool_and(source_id = (select id from lead_sources where name = 'CSV import')), bool_and(created_by = auth.uid())
  from leads;
select 'CONTACTS', count(*), bool_and(is_primary) from contacts;
select 'BATCH', status, imported_rows, rows is null, imported_at is not null
  from lead_import_batches where id = '20000000-0000-0000-0000-000000000002';
select 'TWICE_SHOULD_FAIL';
select import_lead_batch('20000000-0000-0000-0000-000000000002');
select 'SCOREBOARD', leads_added from metrics_scoreboard(now() - interval '1 day', now() + interval '1 day')
  where user_id = auth.uid();
select 'DAILY', sum(leads_added) from metrics_daily(current_date - 1, current_date + 1, 'UTC', auth.uid());

-- The same file again: blocked as duplicates, nothing added.
insert into lead_import_batches (id,filename,file_sha256,status,rows) values
 ('20000000-0000-0000-0000-000000000003','good.csv',repeat('c',64),'validated',batch_rows(auth.uid(),'Beta Law'));
select 'CONFLICTS', string_agg(row_number || ':' || reason, ' | ' order by row_number)
  from import_conflicts('20000000-0000-0000-0000-000000000003');
select 'DUPLICATE_SHOULD_FAIL';
select import_lead_batch('20000000-0000-0000-0000-000000000003');
select 'AFTER_DUP', count(*) from leads;

-- Batches can't be edited or marked imported by hand.
select 'EDIT_SHOULD_FAIL';
update lead_import_batches set filename = 'x.csv' where id = '20000000-0000-0000-0000-000000000003';
select 'FAKE_IMPORTED_SHOULD_FAIL';
update lead_import_batches set status = 'imported' where id = '20000000-0000-0000-0000-000000000003';
update lead_import_batches set status = 'cancelled' where id = '20000000-0000-0000-0000-000000000003';
select 'CANCELLED', status, rows is null from lead_import_batches where id = '20000000-0000-0000-0000-000000000003';

-- A BD can't import leads for someone else (RLS on leads, as in Add lead).
insert into lead_import_batches (id,filename,file_sha256,status,rows) values
 ('20000000-0000-0000-0000-000000000004','sara.csv',repeat('d',64),'validated',
  batch_rows('00000000-0000-0000-0000-00000000000b','Gamma'));
select 'OTHER_OWNER_SHOULD_FAIL';
select import_lead_batch('20000000-0000-0000-0000-000000000004');

-- Revoked between preview and import: blocked.
insert into lead_import_batches (id,filename,file_sha256,status,rows) values
 ('20000000-0000-0000-0000-000000000005','late.csv',repeat('e',64),'validated',batch_rows(auth.uid(),'Delta'));
select as_user('00000000-0000-0000-0000-00000000000f');
update profiles set can_import_leads = false where id = '00000000-0000-0000-0000-00000000000a';
select as_user('00000000-0000-0000-0000-00000000000a');
select 'REVOKED_SHOULD_FAIL';
select import_lead_batch('20000000-0000-0000-0000-000000000005');

-- Others: Sara sees none of Ahmed's batches; Hina (SMM) can't import; the founder sees all and was told.
select as_user('00000000-0000-0000-0000-00000000000b');
select 'SARA_BATCHES', count(*) from lead_import_batches;
select as_user('00000000-0000-0000-0000-00000000000c');
select 'HINA_CAN', can_import_leads();
select as_user('00000000-0000-0000-0000-00000000000f');
select 'FOUNDER_BATCHES', count(*) from lead_import_batches;
select 'FEED', count(*) filter (where kind = 'leads_imported'), count(*) filter (where kind = 'lead_created') from feed_events;
select 'FOUNDER_NOTIF', kind, title like 'Ahmed imported 2 leads from good.csv (IMP-%)', link
  from notifications where kind = 'leads_imported';

-- Rate limit: the founder's 11th upload in 10 minutes is refused.
insert into lead_import_batches (filename,file_sha256,status)
select 'f' || g || '.csv', repeat('f',64), 'failed' from generate_series(1,10) g;
select 'RATE_LIMIT_SHOULD_FAIL';
insert into lead_import_batches (filename,file_sha256,status) values ('f11.csv',repeat('f',64),'failed');
