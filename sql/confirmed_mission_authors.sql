-- OFFRYA 2026-11 : compte gratuit et adresse e-mail confirmée obligatoires
-- AVANT toute nouvelle publication, y compris via l'API Supabase directe.
-- Les missions déjà publiées (notamment par des invités historiques)
-- ne sont ni supprimées ni réattribuées : lecture et suivi restent inchangés.
-- Ne modifie pas les politiques de lecture ni les droits Premium.
--
-- Fonction privée : auth.users est inaccessible aux utilisateurs.
-- SECURITY DEFINER limité à une réponse booléenne pour auth.uid(),
-- schéma non exposé, search_path verrouillé, aucune entrée contrôlée.
create or replace function offrya_private.has_confirmed_mission_account()
returns boolean
language sql stable security definer set search_path=''
as $$
 select exists (
  select 1
  from auth.users u
  where u.id=(select auth.uid())
   and u.is_anonymous is false
   and u.email is not null
   and btrim(u.email)<>''
   and u.email_confirmed_at is not null
 );
$$;
revoke all on function offrya_private.has_confirmed_mission_account() from public, anon, authenticated;
grant execute on function offrya_private.has_confirmed_mission_account() to authenticated;

-- RESTRICTIVE : s'ajoute à la politique missions_insert existante,
-- préserve le contrôle owner_id=auth.uid(), le statut open et le profil.
drop policy if exists missions_confirmed_email_insert on public.offrya_missions;
create policy missions_confirmed_email_insert
 on public.offrya_missions as restrictive for insert to authenticated
 with check ((select offrya_private.has_confirmed_mission_account()));

-- Conserver missions_guest_owner_only pour permettre à d'anciens invités
-- de consulter et clôturer leurs propres missions (s'ils ont encore leur
-- session d'origine). Un nouvel invité ne peut plus publier.
