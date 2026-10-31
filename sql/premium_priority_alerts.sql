-- OFFRYA Premium: notifications internes prioritaires à la publication d'une mission.
-- À appliquer après sql/premium_access.sql et sql/subscriptions.sql.
create table if not exists public.offrya_priority_alerts (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 mission_id uuid not null references public.offrya_missions(id) on delete cascade,
 created_at timestamptz not null default now(),
 seen_at timestamptz,
 email_eligible boolean not null default false,
 emailed_at timestamptz,
 unique(recipient_id,mission_id)
);
create index if not exists offrya_priority_alerts_recipient_idx on public.offrya_priority_alerts(recipient_id,created_at desc);
create index if not exists offrya_priority_alerts_mail_idx on public.offrya_priority_alerts(created_at asc) where email_eligible=true and emailed_at is null;
alter table public.offrya_priority_alerts enable row level security;
revoke all on public.offrya_priority_alerts from public,anon,authenticated;
grant select on public.offrya_priority_alerts to authenticated;
grant update(seen_at) on public.offrya_priority_alerts to authenticated;
create policy priority_alert_read_own on public.offrya_priority_alerts for select to authenticated using(recipient_id=(select auth.uid()));
create policy priority_alert_mark_seen on public.offrya_priority_alerts for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));
create or replace function offrya_private.queue_priority_mission_alerts()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status<>'open' then return new; end if;
 insert into public.offrya_priority_alerts(recipient_id,mission_id,email_eligible)
 select p.id,new.id,coalesce(pref.missions_enabled,false) and pref.missions_consented_at is not null
 from public.offrya_profiles p
 join public.offrya_premium_requests req on req.user_id=p.id and req.status='verified'
 left join public.offrya_premium_subscriptions sub on sub.user_id=p.id
 left join public.offrya_alert_preferences pref on pref.user_id=p.id
 where p.role='pro' and p.id<>new.owner_id
  and (req.premium_until>now() or(sub.status='active' and sub.paid_through>now()))
  and(coalesce(pref.department,'')='' or pref.department=new.department)
  and(coalesce(pref.category,'')='' or pref.category=new.category)
 on conflict(recipient_id,mission_id) do nothing;
 return new;
end; $$;
revoke all on function offrya_private.queue_priority_mission_alerts() from public,anon,authenticated;
drop trigger if exists offrya_mission_priority_alert_trigger on public.offrya_missions;
create trigger offrya_mission_priority_alert_trigger after insert on public.offrya_missions
for each row execute function offrya_private.queue_priority_mission_alerts();
