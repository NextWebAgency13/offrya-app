-- OFFRYA : MFA TOTP supprimé comme prérequis professionnel.
-- Les autres garanties restent impératives (entreprise, identité réelle,
-- présence, mandat contrôlé et abonnement payé).
-- L'authentification invitée NE permet jamais l'accès professionnel.
create or replace function offrya_private.has_active_professional_access()
returns boolean language sql stable security definer set search_path = ''
as $$
 select (select auth.uid()) is not null
  and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
  and exists (
  select 1 from public.offrya_profiles p
  join public.offrya_premium_requests v on v.user_id=p.id
  join public.offrya_premium_subscriptions s on s.user_id=p.id
  where p.id=(select auth.uid()) and p.role='pro'
    and v.status='verified'
    and v.identity_live_verified is true and v.presence_verified_at is not null
    and v.presence_method in ('stripe_selfie','manual_live_check')
    and v.identity_status='verified' and v.identity_verified_at is not null
    and v.authority_status='verified' and v.authority_verified_at is not null
    and v.authority_review_method in ('registry_representative','independent_mandate')
    and s.status='active' and s.paid_through>now()
 );
$$;
revoke all on function offrya_private.has_active_professional_access() from public,anon;
grant execute on function offrya_private.has_active_professional_access() to authenticated;

-- Le statut verified d'un dossier continue d'être protégé par
-- offrya_private.guard_professional_approval() : ne pas le modifier.
-- RLS des missions, discussions, alertes et autorisations continue de
-- référencer has_active_professional_access() et héritera de ce changement.
