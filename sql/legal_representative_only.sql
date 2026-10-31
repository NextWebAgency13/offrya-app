-- OFFRYA : seuls les dirigeants personnes physiques figurant au registre
-- et dont le nom est rapproché de la pièce d'identité + selfie peuvent
-- devenir professionnels. Aucune habilitation par mandat/salarié.
alter table public.offrya_premium_requests
 add column if not exists registry_name_matched boolean not null default false,
 add column if not exists registry_match_checked_at timestamptz,
 add column if not exists registry_match_source text;
alter table public.offrya_premium_requests
 add constraint offrya_registry_match_evidence check (
   registry_name_matched is not true or
   (registry_match_checked_at is not null and registry_match_source in ('official_search_rne','inpi_rne_review'))
 );
-- Refuser tout ancien dossier non éligible, sans supprimer l'historique.
update public.offrya_premium_requests
set status='pending', authority_status='pending',authority_verified_at=null,
 authority_review_method=null,authority_reviewed_by=null
where status='verified' and (representative_kind is distinct from 'dirigeant' or registry_name_matched is not true);

-- L’approbation ne dépend JAMAIS de la déclaration libre du demandeur.
create or replace function offrya_private.guard_professional_approval()
returns trigger language plpgsql set search_path=''
as $$
begin
 if new.status='verified' and not (
   coalesce(new.representative_kind='dirigeant',false) and
   new.registry_name_matched is true and
   new.registry_match_checked_at is not null and
   new.registry_match_source in ('official_search_rne','inpi_rne_review') and
   coalesce(new.identity_status='verified',false) and new.identity_verified_at is not null and
   new.identity_live_verified is true and
   coalesce(new.presence_method='stripe_selfie',false) and new.presence_verified_at is not null and
   coalesce(new.authority_status='verified',false) and new.authority_verified_at is not null and
   coalesce(new.authority_review_method='registry_representative',false) and
   new.authority_reviewed_by is not null
 ) then
  raise exception 'Document + selfie en direct et correspondance avec un dirigeant officiel requis';
 end if;
 return new;
end;
$$;
drop trigger if exists offrya_guard_professional_approval on public.offrya_premium_requests;
create trigger offrya_guard_professional_approval before insert or update on public.offrya_premium_requests
for each row execute function offrya_private.guard_professional_approval();
revoke all on function offrya_private.guard_professional_approval() from public,anon,authenticated;

create or replace function offrya_private.has_active_professional_access()
returns boolean language sql stable security definer set search_path=''
as $$
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
$$;
revoke all on function offrya_private.has_active_professional_access() from public,anon;
grant execute on function offrya_private.has_active_professional_access() to authenticated;

-- Déclencher une alerte uniquement vers un dirigeant définitivement validé.
create or replace function offrya_private.queue_priority_mission_alerts()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status<>'open' then return new; end if;
 insert into public.offrya_priority_alerts(recipient_id,mission_id,email_eligible)
 select p.id,new.id,coalesce(pref.missions_enabled,false) and pref.missions_consented_at is not null
 from public.offrya_profiles p
 join public.offrya_premium_requests v on v.user_id=p.id
  and v.status='verified' and v.representative_kind='dirigeant'
  and v.registry_name_matched is true and v.registry_match_checked_at is not null
  and v.registry_match_source in ('official_search_rne','inpi_rne_review')
  and v.identity_status='verified' and v.identity_live_verified is true
  and v.presence_method='stripe_selfie' and v.presence_verified_at is not null
  and v.authority_status='verified' and v.authority_review_method='registry_representative'
  and v.authority_verified_at is not null
 join public.offrya_premium_subscriptions s on s.user_id=p.id and s.status='active' and s.paid_through>now()
 left join public.offrya_alert_preferences pref on pref.user_id=p.id
 where p.role='pro' and p.id<>new.owner_id
 and (coalesce(pref.department,'')='' or pref.department=new.department)
 and (coalesce(pref.category,'')='' or pref.category=new.category)
 on conflict(recipient_id,mission_id) do nothing;
 return new;
end;
$$;
revoke all on function offrya_private.queue_priority_mission_alerts() from public,anon,authenticated;

-- Revoquer les droits de lecture du résultat de matching administratif : exposer
-- seulement un statut utilisateur via l'interface existante.
revoke select on public.offrya_premium_requests from authenticated;
grant select(user_id,siret,legal_name,status,premium_until,requested_at,reviewed_at,
 representative_name,representative_capacity,representative_kind,identity_status,authority_status)
on public.offrya_premium_requests to authenticated;
revoke insert,update,delete on public.offrya_premium_requests from authenticated;
