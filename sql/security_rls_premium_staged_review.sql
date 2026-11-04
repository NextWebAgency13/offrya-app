-- OFFRYA - SECURITY REVIEW ONLY. DO NOT EXECUTE DIRECTLY IN PRODUCTION.
-- Apply on a disposable Supabase branch with real authenticated JWT contexts first.
-- Owner access preserved; other users' mission access requires verified paid Pro.
-- The older guest policy was deployed as PERMISSIVE instead of RESTRICTIVE.
begin;

do $guard$
begin
 if not exists (
  select 1 from pg_policies where schemaname='public' and tablename='offrya_missions'
   and policyname='missions_read_authorized'
 ) then
  raise exception 'Missing core missions_read_authorized policy; abort rather than widen access';
 end if;
 if not exists (
  select 1 from pg_policies where schemaname='public' and tablename='offrya_conversations'
   and policyname='conversation_read'
 ) then
  raise exception 'Missing conversation_read policy; abort rather than lose participant lookup';
 end if;
end
$guard$;

alter table public.offrya_missions enable row level security;
drop policy if exists missions_guest_owner_only on public.offrya_missions;
create policy missions_guest_owner_only on public.offrya_missions
 as restrictive for select to authenticated
 using (
  coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
  or owner_id=(select auth.uid())
 );

-- Keep the owner's own profile and the counterpart's profile in an actual
-- authorized conversation. No all-authenticated profile directory in base table.
-- The conversation RLS independently enforces participant authorization.
alter table public.offrya_profiles enable row level security;
drop policy if exists profile_read on public.offrya_profiles;
create policy profile_read on public.offrya_profiles
 for select to authenticated
 using (
  id=(select auth.uid())
  or exists (
   select 1 from public.offrya_conversations c
   where
    (c.client_id=(select auth.uid()) and c.professional_id=offrya_profiles.id)
    or
    (c.professional_id=(select auth.uid()) and c.client_id=offrya_profiles.id)
  )
 );

-- Preserve the verified identity + active paid subscription requirement.
-- No temporary grant may bypass the real entitlement, irrespective of its expiry.
create or replace function offrya_private.has_active_professional_access()
returns boolean language sql stable security definer set search_path=''
as $body$
 select (select auth.uid()) is not null
  and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
  and exists (
   select 1 from public.offrya_profiles p
   join public.offrya_premium_requests v on v.user_id=p.id
   join public.offrya_premium_subscriptions s on s.user_id=p.id
   where p.id=(select auth.uid()) and p.role='pro'
     and v.status='verified' and v.representative_kind='dirigeant'
     and v.registry_name_matched is true and v.registry_match_checked_at is not null
     and v.registry_match_source in ('official_search_rne','inpi_rne_review')
     and v.identity_live_verified is true and v.presence_verified_at is not null
     and v.presence_method='stripe_selfie'
     and v.identity_status='verified' and v.identity_verified_at is not null
     and v.authority_status='verified' and v.authority_verified_at is not null
     and v.authority_review_method='registry_representative'
     and s.status='active' and s.paid_through>now()
  );
$body$;

-- Remove the externally callable test-grant lookup. Existing grants are left
-- untouched for audit; they no longer grant access. Revisit after review.
revoke all on function public.offrya_test_premium_expires_at() from public,anon,authenticated;
-- Do not DROP function yet: staged frontend rollout may still call it.
commit;

-- Post-apply read-only checks (run separately and review output):
-- select policyname,permissive,qual from pg_policies
--   where schemaname='public' and tablename in ('offrya_missions','offrya_profiles');
-- select has_function_privilege('authenticated','public.offrya_test_premium_expires_at()','EXECUTE');
-- After application also test genuine Auth sessions A/B and verified pro in a
-- disposable branch. Do not assert safety based only on SQL text inspection.
