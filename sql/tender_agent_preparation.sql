-- OFFRYA public tender agent: evidence-based scoring and non-binding preparation.
-- External submissions, contacts, and purchases are never performed by this migration.
alter table public.offrya_tender_alerts
 add column if not exists buyer text,
 add column if not exists departments text,
 add column if not exists match_score smallint,
 add column if not exists match_reason text,
 add column if not exists first_steps jsonb not null default '[]'::jsonb;

create index if not exists offrya_tender_alerts_ranked
 on public.offrya_tender_alerts(user_id,match_score desc,deadline asc);

-- Dedicated target selector excludes temporary QA grants: the agent must
-- serve only confirmed, registered, identity-verified, paid professionals.
create or replace function public.offrya_agent_watch_targets()
returns table(user_id uuid,sectors text[],department text,keywords text)
language sql stable security definer set search_path=''
as $$
 select p.user_id,p.sectors,p.department,p.keywords
 from public.offrya_opportunity_preferences p
 join auth.users u on u.id=p.user_id
 join public.offrya_profiles pf on pf.id=p.user_id
 join public.offrya_premium_requests v on v.user_id=p.user_id
 join public.offrya_premium_subscriptions s on s.user_id=p.user_id
 where p.alerts_enabled is true
   and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false) is false
   and pf.role='pro' and v.status='verified'
   and v.representative_kind='dirigeant'
   and v.registry_name_matched is true and v.registry_match_checked_at is not null
   and v.registry_match_source in ('official_search_rne','inpi_rne_review')
   and v.identity_live_verified is true and v.presence_verified_at is not null
   and v.presence_method='stripe_selfie'
   and v.identity_status='verified' and v.identity_verified_at is not null
   and v.authority_status='verified' and v.authority_verified_at is not null
   and v.authority_review_method='registry_representative'
   and s.status='active' and s.paid_through>now();
$$;
revoke all on function public.offrya_agent_watch_targets() from public,anon,authenticated;
grant execute on function public.offrya_agent_watch_targets() to service_role;
-- Existing offrya_tender_alerts RLS remains enabled. Only the service role
-- can INSERT; signed-in users may only SELECT their own records and mark read.
