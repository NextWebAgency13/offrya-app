-- Commercial pipeline for OFFRYA Pro. No private mission access is granted by this table.
create table if not exists public.offrya_pro_lead_tracking (
 user_id uuid not null references auth.users(id) on delete cascade,
 mission_id uuid not null references public.offrya_missions(id) on delete cascade,
 stage text not null default 'new' check (stage in ('new','qualifying','reply_ready','contacted','followup','quote','won','lost')),
 updated_at timestamptz not null default now(),
 primary key(user_id,mission_id)
);
alter table public.offrya_pro_lead_tracking enable row level security;
revoke all on public.offrya_pro_lead_tracking from public,anon,authenticated;
grant select,insert,update,delete on public.offrya_pro_lead_tracking to authenticated;
drop policy if exists offrya_pro_lead_owner_select on public.offrya_pro_lead_tracking;
create policy offrya_pro_lead_owner_select on public.offrya_pro_lead_tracking for select to authenticated
using (user_id=(select auth.uid()) and offrya_private.has_active_professional_access()
 and exists(select 1 from public.offrya_missions m where m.id=mission_id and m.owner_id<>(select auth.uid())));
drop policy if exists offrya_pro_lead_owner_insert on public.offrya_pro_lead_tracking;
create policy offrya_pro_lead_owner_insert on public.offrya_pro_lead_tracking for insert to authenticated
with check (user_id=(select auth.uid()) and offrya_private.has_active_professional_access()
 and exists(select 1 from public.offrya_missions m where m.id=mission_id and m.owner_id<>(select auth.uid()) and m.status='open'));
drop policy if exists offrya_pro_lead_owner_update on public.offrya_pro_lead_tracking;
create policy offrya_pro_lead_owner_update on public.offrya_pro_lead_tracking for update to authenticated
using (user_id=(select auth.uid()) and offrya_private.has_active_professional_access())
with check (user_id=(select auth.uid()) and offrya_private.has_active_professional_access()
 and exists(select 1 from public.offrya_missions m where m.id=mission_id and m.owner_id<>(select auth.uid())));
drop policy if exists offrya_pro_lead_owner_delete on public.offrya_pro_lead_tracking;
create policy offrya_pro_lead_owner_delete on public.offrya_pro_lead_tracking for delete to authenticated
using (user_id=(select auth.uid()) and offrya_private.has_active_professional_access());
