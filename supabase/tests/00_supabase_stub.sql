-- Plain-Postgres stand-in for the parts of Supabase the migration needs (auth schema, roles, default grants).
-- Run: psql -f 00_supabase_stub.sql && psql -d cao -f ../migrations/20260924000000_init.sql && psql -d cao -f 02_smoke_test.sql
-- Lines tagged SHOULD_FAIL are expected to print an ERROR. Every other check prints a value.
drop database if exists cao; create database cao;
\c cao
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
grant usage on schema public to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
