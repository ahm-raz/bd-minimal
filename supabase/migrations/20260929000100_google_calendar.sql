-- M11 (docs/10 section 2): each user's own Google Calendar connection.
-- The refresh token is stored encrypted by the app (AES-256-GCM, key only in the server env) and can't be
-- selected by any user: the table grants no SELECT on that column, and only my_google_token() returns it,
-- for the caller's own row. No service-role key is involved.

create type public.google_connection_status as enum ('active', 'needs_reconnect');

create table public.google_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  google_email text not null,
  calendar_id text not null default 'primary',
  scopes text[] not null default '{}',
  refresh_token_enc text not null,
  status public.google_connection_status not null default 'active',
  last_error text check (last_error is null or length(last_error) <= 500),
  auto_add boolean not null default true,       -- "Add booked meetings to my calendar"
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger google_connections_updated_at before update on public.google_connections
  for each row execute function public.set_updated_at();

-- Old calendar events to delete with their owner's own session (after reassignment or lead deletion).
create table public.calendar_cleanup (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  gcal_event_id text not null,
  calendar_id text not null default 'primary',
  created_at timestamptz not null default now()
);
create index calendar_cleanup_user_idx on public.calendar_cleanup (user_id);

alter table public.google_connections enable row level security;
alter table public.calendar_cleanup enable row level security;

create policy google_connections_own_select on public.google_connections for select to authenticated
  using (user_id = auth.uid());
create policy google_connections_own_update on public.google_connections for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy google_connections_own_delete on public.google_connections for delete to authenticated
  using (user_id = auth.uid());

-- Column privileges: the token column is never readable or writable directly.
revoke all on public.google_connections from anon, authenticated;
grant select (user_id, google_email, calendar_id, scopes, status, last_error, auto_add, connected_at, updated_at)
  on public.google_connections to authenticated;
grant update (auto_add) on public.google_connections to authenticated;
grant delete on public.google_connections to authenticated;

create policy calendar_cleanup_own_select on public.calendar_cleanup for select to authenticated
  using (user_id = auth.uid());
create policy calendar_cleanup_own_delete on public.calendar_cleanup for delete to authenticated
  using (user_id = auth.uid());
revoke all on public.calendar_cleanup from anon, authenticated;
grant select, delete on public.calendar_cleanup to authenticated;

-- The caller's own encrypted token (the app decrypts it with the server-only key).
create or replace function public.my_google_token() returns table (refresh_token_enc text, calendar_id text, status public.google_connection_status)
language sql stable security definer set search_path = public as $$
  select g.refresh_token_enc, g.calendar_id, g.status
  from public.google_connections g
  where g.user_id = auth.uid() and public.is_active_user();
$$;

-- Save (or replace) the caller's connection after the OAuth callback.
create or replace function public.save_google_connection(p_email text, p_scopes text[], p_token_enc text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Sign in first';
  end if;
  if coalesce(trim(p_email), '') = '' or coalesce(p_token_enc, '') = '' then
    raise exception 'Google didn''t return an account or a token';
  end if;
  insert into public.google_connections (user_id, google_email, scopes, refresh_token_enc, status, last_error, connected_at)
  values (auth.uid(), lower(trim(p_email)), coalesce(p_scopes, '{}'), p_token_enc, 'active', null, now())
  on conflict (user_id) do update
    set google_email = excluded.google_email, scopes = excluded.scopes, refresh_token_enc = excluded.refresh_token_enc,
        status = 'active', last_error = null, connected_at = now();
end $$;

-- Mark the caller's connection as needing a reconnect (token expired or revoked at Google).
create or replace function public.mark_google_needs_reconnect(p_error text) returns void
language sql security definer set search_path = public as $$
  update public.google_connections
     set status = 'needs_reconnect', last_error = left(coalesce(p_error, 'Access was revoked'), 500)
   where user_id = auth.uid();
$$;

-- Founder: connection status of every member, without any token.
create or replace function public.team_calendar_status()
returns table (user_id uuid, status public.google_connection_status, google_email text)
language sql stable security definer set search_path = public as $$
  select g.user_id, g.status, g.google_email from public.google_connections g where public.is_founder();
$$;

revoke execute on function public.my_google_token() from public, anon;
revoke execute on function public.save_google_connection(text, text[], text) from public, anon;
revoke execute on function public.mark_google_needs_reconnect(text) from public, anon;
revoke execute on function public.team_calendar_status() from public, anon;
grant execute on function public.my_google_token() to authenticated;
grant execute on function public.save_google_connection(text, text[], text) to authenticated;
grant execute on function public.mark_google_needs_reconnect(text) to authenticated;
grant execute on function public.team_calendar_status() to authenticated;
