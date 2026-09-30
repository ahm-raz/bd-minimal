-- =====================================================================
-- M19 (docs/11-offices.md section 2): the platform owner is a separate account, not a member of any office.
--   - platform_admins now point at auth users; an owner has no profile, so RLS gives them no office's data
--   - pending_platform_admins: a reservation so the sign-up trigger makes an owner instead of a member
--   - office founders are no longer platform admins; /setup no longer makes one
-- Create an owner with `pnpm owner:add <email>` (scripts/platform-owner.ts).
-- =====================================================================

-- ---------- Owners are accounts without a profile -------------------------
alter table public.platform_admins drop constraint platform_admins_user_id_fkey;
delete from public.platform_admins;   -- founders were admins until now; owners are separate accounts
alter table public.platform_admins
  add constraint platform_admins_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = auth.uid()
      and not exists (select 1 from public.profiles p where p.id = a.user_id)
  );
$$;

-- A member of an office can never also be an owner.
create or replace function public.trg_platform_admin_not_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id) then
    raise exception 'A member of an office can''t be a platform owner' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger platform_admins_not_member before insert or update on public.platform_admins
  for each row execute function public.trg_platform_admin_not_member();

-- ---------- Reserving an owner account ------------------------------------
-- Written only with the service-role key (no policies), like the owner script does.
create table public.pending_platform_admins (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.pending_platform_admins enable row level security;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pm public.pending_members;
begin
  -- A platform owner: no profile, no office.
  delete from public.pending_platform_admins where email = lower(new.email);
  if found then
    insert into public.platform_admins (user_id) values (new.id);
    return new;
  end if;

  delete from public.pending_members where email = lower(new.email) returning * into pm;
  if pm.email is null then
    raise exception 'No office is waiting for %', new.email using errcode = '42501';
  end if;
  insert into public.profiles (id, email, full_name, role, office_id, timezone)
  select new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), pm.role, o.id, o.timezone
  from public.offices o where o.id = pm.office_id;
  return new;
end $$;

-- An owner's email can't be reserved for an office either.
create or replace function public.trg_pending_member_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  msg text;
begin
  delete from public.pending_members where created_at < now() - interval '10 minutes';
  if exists (select 1 from public.profiles where lower(email) = new.email)
     or exists (select 1 from public.platform_admins a join auth.users u on u.id = a.user_id where lower(u.email) = new.email)
     or exists (select 1 from public.pending_platform_admins where email = new.email) then
    raise exception 'This email already has an account' using errcode = '23505';
  end if;
  msg := public.office_seat_error(new.office_id, 1);
  if msg is not null then
    raise exception '%', msg using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- /setup no longer makes a platform admin -------------------------
drop trigger profiles_first_admin on public.profiles;
drop function public.trg_first_founder_is_admin();

-- ---------- Why a signed-in user reads nothing: "owner" is new ---------------
create or replace function public.my_account_state() returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'signed_out'
    when p.id is null and exists (select 1 from public.platform_admins a where a.user_id = auth.uid()) then 'owner'
    when p.id is null then 'no_profile'
    when not p.is_active then 'deactivated'
    when o.status <> 'active' then 'suspended'
    else 'active' end
  from (select 1) one
  left join public.profiles p on p.id = auth.uid()
  left join public.offices o on o.id = p.office_id;
$$;

-- ---------- create_office: the owner has no profile to record as created_by ----------
create or replace function public.create_office(p_name text, p_timezone text, p_seat_limit int, p_founder_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  office uuid;
begin
  if not public.is_platform_admin() and not public.is_system() then
    raise exception 'Only a platform admin can create offices' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where lower(email) = lower(trim(p_founder_email))) then
    raise exception 'This email already has an account' using errcode = '23505';
  end if;
  insert into public.offices (name, timezone, seat_limit) values (trim(p_name), p_timezone, p_seat_limit)
  returning id into office;
  perform public.seed_office_defaults(office);
  insert into public.pending_members (email, office_id, role)
  values (lower(trim(p_founder_email)), office, 'founder');
  return office;
end $$;
