-- OFFRYA production QA entitlement, separate from Stripe and verified identities.
-- Grants can only be written by the database administrator; automatic expiry
-- is evaluated by the database on every access (no scheduled task needed).
create table if not exists offrya_private.temporary_premium_grants (
 user_id uuid primary key references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 reason text not null default 'OFFRYA production QA'
);
revoke all on offrya_private.temporary_premium_grants from public, anon, authenticated;
alter table offrya_private.temporary_premium_grants enable row level security;

create or replace function offrya_private.has_temporary_premium_access()
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null
  and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
  and exists (
    select 1 from offrya_private.temporary_premium_grants g
    where g.user_id=(select auth.uid()) and g.expires_at>now()
  );
$$;
revoke all on function offrya_private.has_temporary_premium_access() from public,anon,authenticated;

-- An authenticated user may inspect ONLY their own active trial expiry.
-- This is status information, never an endpoint to create or extend a grant.
create or replace function public.offrya_test_premium_expires_at()
returns timestamptz language sql stable security definer set search_path=''
as $$
 select g.expires_at
 from offrya_private.temporary_premium_grants g
 where g.user_id=(select auth.uid())
   and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
   and g.expires_at>now()
 limit 1;
$$;
revoke all on function public.offrya_test_premium_expires_at() from public,anon,authenticated;
grant execute on function public.offrya_test_premium_expires_at() to authenticated;

-- Keep all existing verified-and-paid checks; OR-in the precisely scoped QA grant.
create or replace function offrya_private.has_active_professional_access()
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null
  and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
  and (
    offrya_private.has_temporary_premium_access()
    or exists (
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
    )
  );
$$;
revoke all on function offrya_private.has_active_professional_access() from public,anon,authenticated;
