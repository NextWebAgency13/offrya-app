-- Proposed OFFRYA access fix: apply through reviewed Supabase migration only.
-- Existing permissive INSERT policies are ORed by PostgreSQL.
-- A single policy must enforce email confirmation AND ownership together.
begin;
drop policy if exists missions_insert on public.offrya_missions;
drop policy if exists missions_confirmed_email_insert on public.offrya_missions;
create policy missions_confirmed_owner_insert on public.offrya_missions
 for insert to authenticated
 with check (
   owner_id=(select auth.uid())
   and status='open'
   and (select offrya_private.has_confirmed_mission_account())
   and exists (select 1 from public.offrya_profiles p where p.id=(select auth.uid()))
 );
commit;
