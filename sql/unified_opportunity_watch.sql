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
