-- OFFRYA Premium: active subscription/beta access requires manual verification.
create table if not exists public.offrya_premium_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 siret text not null check (siret ~ '^[0-9]{14}$'),
 legal_name text not null check (char_length(btrim(legal_name)) between 2 and 150),
 status text not null default 'pending' check (status in ('pending','verified','rejected')),
 premium_until timestamptz,
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz,
 constraint active_requires_verification check (premium_until is null or status='verified')
);
alter table public.offrya_premium_requests enable row level security;
revoke all on public.offrya_premium_requests from public,anon,authenticated;
grant select (user_id,siret,legal_name,status,premium_until,requested_at,reviewed_at) on public.offrya_premium_requests to authenticated;
grant insert (user_id,siret,legal_name) on public.offrya_premium_requests to authenticated;
create policy premium_read_own on public.offrya_premium_requests for select to authenticated using ((select auth.uid())=user_id);
create policy premium_request_account_holder on public.offrya_premium_requests for insert to authenticated
with check ((select auth.uid())=user_id and status='pending' and premium_until is null and reviewed_at is null
 and exists (select 1 from public.offrya_profiles p where p.id=(select auth.uid()) ));
revoke update on public.offrya_profiles from authenticated;
grant update (display_name,city,specialty) on public.offrya_profiles to authenticated;
