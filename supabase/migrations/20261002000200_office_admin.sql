-- =====================================================================
-- M17 (docs/11-offices.md sections 5 and 6): seat limits, stale reservations, the platform admin's office list.
-- =====================================================================

-- ---------- Seat limit ------------------------------------------------------
-- Counts active members, founder included. Checked when a member is reserved and again when a profile is
-- added or reactivated, so a full office can't gain a member by any path.
create or replace function public.office_seat_error(p_office uuid, p_adding int) returns text
language sql stable security definer set search_path = public as $$
  select format('Your office is using all %s seats. Deactivate someone or contact us for more seats.', o.seat_limit)
  from public.offices o
  where o.id = p_office and o.seat_limit is not null
    and (select count(*) from public.profiles p where p.office_id = o.id and p.is_active) + p_adding > o.seat_limit;
$$;
revoke all on function public.office_seat_error(uuid, int) from public, anon, authenticated;

create or replace function public.trg_profile_seats() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  msg text;
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    msg := public.office_seat_error(new.office_id, 1);
    if msg is not null then
      raise exception '%', msg using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_seats before insert or update of is_active on public.profiles
  for each row execute function public.trg_profile_seats();

-- Reservations: stale ones (an add that failed halfway) are cleared after 10 minutes, and the seat limit
-- is checked before the auth user exists, so a full office leaves no orphan account behind.
create or replace function public.trg_pending_member_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  msg text;
begin
  delete from public.pending_members where created_at < now() - interval '10 minutes';
  if exists (select 1 from public.profiles where lower(email) = new.email) then
    raise exception 'This email already has an account' using errcode = '23505';
  end if;
  msg := public.office_seat_error(new.office_id, 1);
  if msg is not null then
    raise exception '%', msg using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger pending_members_insert before insert on public.pending_members
  for each row execute function public.trg_pending_member_insert();

-- ---------- The platform admin's office list --------------------------------
-- Counts and dates only: never names of leads, contacts, deals or anything else inside an office.
create or replace function public.admin_office_summary()
returns table (
  id uuid, name text, timezone text, status public.office_status, seat_limit int, created_at timestamptz,
  founder_email text, active_members bigint, leads_count bigint, last_activity_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can see the office list' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.timezone, o.status, o.seat_limit, o.created_at,
         (select p.email from public.profiles p where p.office_id = o.id and p.role = 'founder'),
         (select count(*) from public.profiles p where p.office_id = o.id and p.is_active),
         (select count(*) from public.leads l where l.office_id = o.id),
         (select max(f.created_at) from public.feed_events f where f.office_id = o.id)
  from public.offices o
  order by lower(o.name), o.created_at;
end $$;
revoke all on function public.admin_office_summary() from public, anon;
grant execute on function public.admin_office_summary() to authenticated;

-- ---------- Undo an office whose founder couldn't be created ------------------
-- Creating an office is two steps (the office, then the founder's auth user). If the second fails, the
-- empty office and its default settings are removed so the platform admin can try again. Refuses an office
-- that has any member.
create or replace function public.discard_empty_office(p_office uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t text;
begin
  if not public.is_platform_admin() and not public.is_trusted_context() then
    raise exception 'Only a platform admin can discard an office' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where office_id = p_office) then
    raise exception 'This office has members' using errcode = '42501';
  end if;
  delete from public.pending_members where office_id = p_office;
  foreach t in array array['activity_types', 'niches', 'channels', 'lead_sources', 'lost_reasons', 'outcomes',
                           'stages', 'content_pillars'] loop
    execute format('delete from public.%I where office_id = $1', t) using p_office;
  end loop;
  delete from public.offices where id = p_office;
end $$;
revoke all on function public.discard_empty_office(uuid) from public, anon;
grant execute on function public.discard_empty_office(uuid) to authenticated;
