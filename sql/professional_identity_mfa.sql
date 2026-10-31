-- OFFRYA : identity of natural person, independent authority verification and MFA
-- Apply on the OFFRYA Supabase project (never on NextWeb).
-- Fail-closed rollout: existing verified users must complete the new checks.
alter table public.offrya_premium_requests
 add column if not exists identity_status text not null default 'not_started',
 add column if not exists identity_verified_at timestamptz,
 add column if not exists stripe_identity_session_id text,
 add column if not exists authority_status text not null default 'pending',
 add column if not exists authority_verified_at timestamptz,
 add column if not exists authority_review_method text,
 add column if not exists authority_reviewed_by uuid;

alter table public.offrya_premium_requests
 add constraint offrya_identity_status_valid check (identity_status in ('not_started','processing','verified','requires_input','redacted')),
 add constraint offrya_authority_status_valid check (authority_status in ('pending','verified','rejected')),
 add constraint offrya_authority_verification_evidence check (
   authority_status <> 'verified' or
   (authority_verified_at is not null and authority_review_method in ('registry_representative','independent_mandate') and authority_reviewed_by is not null)
 );

-- Client sees only a minimal status; never expose Stripe session IDs or internal reviewer data.
revoke select on public.offrya_premium_requests from authenticated;
grant select (user_id,siret,legal_name,status,premium_until,requested_at,reviewed_at,
 representative_name,representative_capacity,identity_status,authority_status) on public.offrya_premium_requests to authenticated;
revoke insert,update,delete on public.offrya_premium_requests from authenticated;

-- Existing manually approved rows are NOT grandfathered into verified identity/authority.
-- Enforce approval invariants even if a human operator tries to update status prematurely.
create or replace function offrya_private.guard_professional_approval()
returns trigger language plpgsql set search_path=''
as $$
begin
 if new.status='verified' and (
   new.identity_status <> 'verified' or new.identity_verified_at is null or
   new.authority_status <> 'verified' or new.authority_verified_at is null or
   new.authority_review_method not in ('registry_representative','independent_mandate') or
   new.authority_reviewed_by is null
 ) then
   raise exception 'Identity and independently documented authority required before verification';
 end if;
 return new;
end;
$$;
drop trigger if exists offrya_guard_professional_approval on public.offrya_premium_requests;
create trigger offrya_guard_professional_approval before insert or update
on public.offrya_premium_requests for each row execute function offrya_private.guard_professional_approval();
revoke all on function offrya_private.guard_professional_approval() from public,anon,authenticated;

create or replace function offrya_private.has_active_professional_access()
returns boolean language sql stable security definer set search_path = ''
as $$
 select coalesce((select auth.jwt()->>'aal'),'')='aal2' and exists(
  select 1 from public.offrya_profiles p
  join public.offrya_premium_requests v on v.user_id=p.id
  join public.offrya_premium_subscriptions s on s.user_id=p.id
  where p.id=(select auth.uid()) and p.role='pro'
    and v.status='verified'
    and v.identity_status='verified' and v.identity_verified_at is not null
    and v.authority_status='verified' and v.authority_verified_at is not null
    and v.authority_review_method in ('registry_representative','independent_mandate')
    and s.status='active' and s.paid_through>now()
 );
$$;
revoke all on function offrya_private.has_active_professional_access() from public,anon;
grant execute on function offrya_private.has_active_professional_access() to authenticated;

-- Priority alerts must also meet the new verification requirements.
create or replace function offrya_private.queue_priority_mission_alerts()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status<>'open' then return new; end if;
 insert into public.offrya_priority_alerts(recipient_id,mission_id,email_eligible)
 select p.id,new.id,coalesce(pref.missions_enabled,false) and pref.missions_consented_at is not null
 from public.offrya_profiles p
 join public.offrya_premium_requests v on v.user_id=p.id
  and v.status='verified' and v.identity_status='verified' and v.identity_verified_at is not null
  and v.authority_status='verified' and v.authority_verified_at is not null
  and v.authority_review_method in ('registry_representative','independent_mandate')
 join public.offrya_premium_subscriptions s on s.user_id=p.id and s.status='active' and s.paid_through>now()
 left join public.offrya_alert_preferences pref on pref.user_id=p.id
 where p.role='pro' and p.id<>new.owner_id
  and (coalesce(pref.department,'')='' or pref.department=new.department)
  and (coalesce(pref.category,'')='' or pref.category=new.category)
 on conflict(recipient_id,mission_id) do nothing;
 return new;
end;$$;
revoke all on function offrya_private.queue_priority_mission_alerts() from public,anon,authenticated;

-- Any existing priority alert is also hidden by the updated has_active_professional_access().
