-- OFFRYA: privately configured watch for both user-posted missions and official public tenders.
-- An account must be a verified, subscribed professional (or authorized temporary QA account)
-- before it can access other users' missions or integrated BOAMP discovery.
create table if not exists public.offrya_opportunity_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 sectors text[] not null default '{}'::text[],
 department text not null default '',
 keywords text not null default '',
 min_budget_cents integer,
 max_budget_cents integer,
 alerts_enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 constraint opportunity_dept_valid check (department = '' or department ~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$'),
 constraint opportunity_keywords_valid check (char_length(keywords)<=180),
 constraint opportunity_sectors_valid check (array_length(sectors,1) is null or (array_length(sectors,1)<=8 and sectors <@ array['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté','Autre']::text[])),
 constraint opportunity_budget_valid check (coalesce(min_budget_cents,0)>=0 and (max_budget_cents is null or max_budget_cents>=coalesce(min_budget_cents,0)))
);
alter table public.offrya_opportunity_preferences enable row level security;
revoke all on public.offrya_opportunity_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.offrya_opportunity_preferences to authenticated;
drop policy if exists offrya_opportunity_pref_own_select on public.offrya_opportunity_preferences;
create policy offrya_opportunity_pref_own_select on public.offrya_opportunity_preferences for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists offrya_opportunity_pref_own_insert on public.offrya_opportunity_preferences;
create policy offrya_opportunity_pref_own_insert on public.offrya_opportunity_preferences for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists offrya_opportunity_pref_own_update on public.offrya_opportunity_preferences;
create policy offrya_opportunity_pref_own_update on public.offrya_opportunity_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists offrya_opportunity_pref_own_delete on public.offrya_opportunity_preferences;
create policy offrya_opportunity_pref_own_delete on public.offrya_opportunity_preferences for delete to authenticated using(user_id=(select auth.uid()));

-- Track BOAMP opportunities by official id. Rows are isolated to their owning user.
create table if not exists public.offrya_tender_tracking (
 user_id uuid not null references auth.users(id) on delete cascade,
 tender_id text not null check(char_length(tender_id) between 3 and 80),
 title text not null default '' check(char_length(title)<=500),
 url text not null default '' check(char_length(url)<=800),
 stage text not null default 'saved' check(stage in ('saved','reviewing','preparing','submitted','done')),
 updated_at timestamptz not null default now(),
 primary key(user_id,tender_id)
);
alter table public.offrya_tender_tracking enable row level security;
revoke all on public.offrya_tender_tracking from public,anon,authenticated;
grant select,insert,update,delete on public.offrya_tender_tracking to authenticated;
drop policy if exists offrya_tender_own_select on public.offrya_tender_tracking;
create policy offrya_tender_own_select on public.offrya_tender_tracking for select to authenticated using(user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()));
drop policy if exists offrya_tender_own_insert on public.offrya_tender_tracking;
create policy offrya_tender_own_insert on public.offrya_tender_tracking for insert to authenticated with check(user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()));
drop policy if exists offrya_tender_own_update on public.offrya_tender_tracking;
create policy offrya_tender_own_update on public.offrya_tender_tracking for update to authenticated using(user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access())) with check(user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()));
drop policy if exists offrya_tender_own_delete on public.offrya_tender_tracking;
create policy offrya_tender_own_delete on public.offrya_tender_tracking for delete to authenticated using(user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()));

-- Opt-in in-app BOAMP alerts. A unique key suppresses duplicate notifications.
create table if not exists public.offrya_tender_alerts (
 user_id uuid not null references auth.users(id) on delete cascade,
 tender_id text not null check (char_length(tender_id) between 3 and 80),
 title text not null check (char_length(title) between 1 and 500),
 url text not null check (char_length(url)<=800),
 deadline timestamptz,
 detected_at timestamptz not null default now(),
 seen_at timestamptz,
 primary key(user_id,tender_id)
);
create index if not exists offrya_tender_alerts_unread on public.offrya_tender_alerts(user_id,detected_at desc) where seen_at is null;
alter table public.offrya_tender_alerts enable row level security;
revoke all on public.offrya_tender_alerts from public,anon,authenticated;
grant select on public.offrya_tender_alerts to authenticated;
grant update(seen_at) on public.offrya_tender_alerts to authenticated;
drop policy if exists offrya_tender_alerts_read on public.offrya_tender_alerts;
create policy offrya_tender_alerts_read on public.offrya_tender_alerts for select to authenticated
 using(user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()));
drop policy if exists offrya_tender_alerts_seen on public.offrya_tender_alerts;
create policy offrya_tender_alerts_seen on public.offrya_tender_alerts for update to authenticated
 using(user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()))
 with check(user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()));

-- Only the backend service key can enumerate opted-in recipients.
-- The function checks actual Stripe/Identity authorization or a currently
-- unexpired, explicitly authorized QA entitlement, not user-editable metadata.
create or replace function public.offrya_watch_targets()
returns table(user_id uuid,sectors text[],department text,keywords text)
language sql stable security definer set search_path=''
as $$
 select p.user_id,p.sectors,p.department,p.keywords
 from public.offrya_opportunity_preferences p
 join auth.users u on u.id=p.user_id
 where p.alerts_enabled is true and u.email_confirmed_at is not null
   and coalesce(u.is_anonymous,false) is false
   and (
    exists(select 1 from offrya_private.temporary_premium_grants g
      where g.user_id=p.user_id and g.expires_at>now())
    or exists (
      select 1 from public.offrya_profiles pf
      join public.offrya_premium_requests v on v.user_id=pf.id
      join public.offrya_premium_subscriptions s on s.user_id=pf.id
      where pf.id=p.user_id and pf.role='pro'
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
revoke all on function public.offrya_watch_targets() from public,anon,authenticated;
grant execute on function public.offrya_watch_targets() to service_role;
