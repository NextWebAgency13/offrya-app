-- OFFRYA: saved professional onboarding progress, isolated from account privileges.
-- No verified flags or authorization claims live here.
create table if not exists public.offrya_professional_drafts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 step smallint not null default 1 check (step between 1 and 3),
 siret text check (siret is null or siret ~ '^[0-9]{14}$'),
 legal_name text check (legal_name is null or char_length(btrim(legal_name)) between 2 and 150),
 representative_name text check (representative_name is null or char_length(btrim(representative_name)) between 4 and 120),
 representative_capacity text check (representative_capacity is null or char_length(btrim(representative_capacity)) between 3 and 100),
 representative_kind text check (representative_kind is null or representative_kind in ('dirigeant','mandataire')),
 updated_at timestamptz not null default now()
);
alter table public.offrya_professional_drafts enable row level security;
revoke all on public.offrya_professional_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.offrya_professional_drafts to authenticated;
drop policy if exists offrya_drafts_own_read on public.offrya_professional_drafts;
create policy offrya_drafts_own_read on public.offrya_professional_drafts for select to authenticated
 using (user_id=(select auth.uid()));
drop policy if exists offrya_drafts_own_write on public.offrya_professional_drafts;
create policy offrya_drafts_own_write on public.offrya_professional_drafts for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.offrya_profiles p where p.id=(select auth.uid()) and p.role='pro'));
drop policy if exists offrya_drafts_own_update on public.offrya_professional_drafts;
create policy offrya_drafts_own_update on public.offrya_professional_drafts for update to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.offrya_profiles p where p.id=(select auth.uid()) and p.role='pro'));
drop policy if exists offrya_drafts_own_delete on public.offrya_professional_drafts;
create policy offrya_drafts_own_delete on public.offrya_professional_drafts for delete to authenticated
 using(user_id=(select auth.uid()));
alter table public.offrya_premium_requests
 add column if not exists representative_kind text;
alter table public.offrya_premium_requests
 add constraint offrya_representative_kind_valid check (representative_kind is null or representative_kind in ('dirigeant','mandataire'));
grant select(representative_kind) on public.offrya_premium_requests to authenticated;
