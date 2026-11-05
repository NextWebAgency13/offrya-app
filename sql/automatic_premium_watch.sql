-- Veille automatique pour TOUS les professionnels OFFRYA éligibles.
-- Pas de condition de souscription aux alertes ni de profil de filtres préexistant.
-- Les filtres éventuellement renseignés restent des préférences facultatives.
-- Aucun changement aux consentements aux alertes e-mail.
-- La veille inclut aussi les comptes d'essai QA autorisés explicitement,
-- uniquement s'ils sont professionnels et pendant la durée de la dérogation.
-- Cela ne modifie PAS la vérification des droits côté application/RLS.
create or replace function public.offrya_agent_watch_targets()
returns table(user_id uuid,sectors text[],department text,keywords text)
language sql stable security definer set search_path=''
as $$
 select pf.id,
  coalesce(
   nullif(op.sectors,'{}'::text[]),
   case
    when lower(coalesce(pf.specialty,'')) like '%nettoy%' or lower(coalesce(pf.specialty,'')) like '%propret%' then array['Nettoyage']::text[]
    when lower(coalesce(pf.specialty,'')) like '%paysag%' or lower(coalesce(pf.specialty,'')) like '%jardin%' or lower(coalesce(pf.specialty,'')) like '%espace%vert%' then array['Espaces verts']::text[]
    when lower(coalesce(pf.specialty,'')) like '%bâtim%' or lower(coalesce(pf.specialty,'')) like '%batim%' or lower(coalesce(pf.specialty,'')) like '%construct%' then array['Bâtiment']::text[]
    when lower(coalesce(pf.specialty,'')) like '%informati%' or lower(coalesce(pf.specialty,'')) like '%numérique%' or lower(coalesce(pf.specialty,'')) like '%numerique%' then array['Informatique']::text[]
    when lower(coalesce(pf.specialty,'')) like '%transport%' or lower(coalesce(pf.specialty,'')) like '%logist%' then array['Transport']::text[]
    when lower(coalesce(pf.specialty,'')) like '%restaurat%' or lower(coalesce(pf.specialty,'')) like '%traiteur%' or lower(coalesce(pf.specialty,'')) like '%hôtel%' then array['Restauration & Hôtellerie']::text[]
    when lower(coalesce(pf.specialty,'')) like '%beauté%' or lower(coalesce(pf.specialty,'')) like '%beaute%' or lower(coalesce(pf.specialty,'')) like '%coiffur%' or lower(coalesce(pf.specialty,'')) like '%spa%' then array['Bien-être & Beauté']::text[]
    else null::text[]
   end,
   array['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté']::text[]
  ) as sectors,
  coalesce(op.department,'') as department,
  coalesce(op.keywords,'') as keywords
 from public.offrya_profiles pf
 join auth.users u on u.id=pf.id
 left join public.offrya_premium_requests v on v.user_id=pf.id
 left join public.offrya_premium_subscriptions s on s.user_id=pf.id
 left join public.offrya_opportunity_preferences op on op.user_id=pf.id
 where u.email_confirmed_at is not null and coalesce(u.is_anonymous,false) is false
   and pf.role='pro'
   and (
     (
       v.status='verified' and v.representative_kind='dirigeant'
   and v.registry_name_matched is true and v.registry_match_checked_at is not null
   and v.registry_match_source in ('official_search_rne','inpi_rne_review')
   and v.identity_live_verified is true and v.presence_verified_at is not null
   and v.presence_method='stripe_selfie'
   and v.identity_status='verified' and v.identity_verified_at is not null
   and v.authority_status='verified' and v.authority_verified_at is not null
   and v.authority_review_method='registry_representative'
       and s.status='active' and s.paid_through>now()
     )
     or exists (
       select 1 from offrya_private.temporary_premium_grants g
       where g.user_id=pf.id and g.expires_at>now()
     )
   );
$;
revoke all on function public.offrya_agent_watch_targets() from public,anon,authenticated;
grant execute on function public.offrya_agent_watch_targets() to service_role;
