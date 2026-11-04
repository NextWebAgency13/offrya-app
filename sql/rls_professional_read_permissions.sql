-- Restore the minimal authenticated privileges needed by the existing RLS policies.
-- Security invariants: RLS must remain enabled and the premium dossier must remain owner-only.
do $guard$
begin
 if not (select relrowsecurity from pg_class where oid = 'public.offrya_premium_requests'::regclass) then
   raise exception 'offrya_premium_requests RLS must remain enabled';
 end if;
 if not exists (
  select 1 from pg_policies where schemaname='public' and tablename='offrya_premium_requests'
  and policyname='premium_read_own' and cmd='SELECT'
  and roles @> array['authenticated']::name[]
  and qual like '%auth.uid()%'
  and qual like '%user_id%'
 ) then
   raise exception 'Owner-only premium_read_own policy was not found';
 end if;
end $guard$;

-- Read own verification record only (RLS premium_read_own remains authoritative).
grant select on public.offrya_premium_requests to authenticated;

-- Required by SELECT policies on missions/conversations/tenders and sales tracking.
-- The function reads auth.uid() and computes a boolean from a verified, paid account
-- or a separately authorized unexpired QA grant; it does not expose private rows.
revoke execute on function offrya_private.has_active_professional_access() from public, anon;
grant execute on function offrya_private.has_active_professional_access() to authenticated;
