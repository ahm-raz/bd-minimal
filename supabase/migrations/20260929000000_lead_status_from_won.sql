-- Lead status from opportunities follows docs/04 section 2:
--   Customer = has a won opportunity; Lost = its only open opportunity was lost; Qualified = has an open one.
-- The init trigger treated Customer as permanent, so a lead stayed Customer after its only won deal
-- was moved back to an open stage or lost. Now "has a won opportunity" is checked each time.

create or replace function public.trg_opportunity_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.leads;
  stage_label text;
  open_left int;
  has_won boolean;
begin
  if tg_op = 'UPDATE' and new.stage_key is not distinct from old.stage_key then
    return null;
  end if;

  select * into l from public.leads where id = new.lead_id;
  select label into stage_label from public.stages where key = new.stage_key;

  insert into public.opportunity_stage_events (opportunity_id, from_stage, to_stage, owner_id, changed_by)
  values (new.id, case when tg_op = 'UPDATE' then old.stage_key end, new.stage_key, new.owner_id, auth.uid());

  select count(*) into open_left from public.opportunities o join public.stages s on s.key = o.stage_key
  where o.lead_id = new.lead_id and s.is_open;
  select exists (select 1 from public.opportunities where lead_id = new.lead_id and stage_key = 'won') into has_won;

  if new.stage_key = 'won' then
    update public.leads set status = 'customer' where id = new.lead_id;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('opportunity_won', auth.uid(), new.owner_id, new.lead_id, new.id,
            'won ' || l.company_name || ' for $' || to_char(new.won_value, 'FM999,999,990'));
  elsif new.stage_key = 'lost' then
    if has_won then
      update public.leads set status = 'customer' where id = new.lead_id and status <> 'customer';
    elsif open_left = 0 then
      update public.leads set status = 'lost' where id = new.lead_id;
    end if;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('opportunity_lost', auth.uid(), new.owner_id, new.lead_id, new.id, 'lost ' || l.company_name);
  else
    update public.leads set status = case when has_won then 'customer' else 'qualified' end::public.lead_status
    where id = new.lead_id;
    insert into public.feed_events (kind, actor_id, subject_user_id, lead_id, opportunity_id, summary)
    values ('stage_changed', auth.uid(), new.owner_id, new.lead_id, new.id,
            case when tg_op = 'INSERT' then 'created opportunity for ' || l.company_name
                 else 'moved ' || l.company_name || ' to ' || stage_label end
            || case when new.estimated_value > 0 then ' ($' || to_char(new.estimated_value, 'FM999,999,990') || ')' else '' end);
  end if;
  return null;
end $$;

-- Repair leads left as Customer without a won opportunity.
update public.leads l
set status = case
  when exists (select 1 from public.opportunities o join public.stages s on s.key = o.stage_key
               where o.lead_id = l.id and s.is_open) then 'qualified'
  else 'lost' end::public.lead_status
where l.status = 'customer'
  and not exists (select 1 from public.opportunities o where o.lead_id = l.id and o.stage_key = 'won')
  and exists (select 1 from public.opportunities o where o.lead_id = l.id);
