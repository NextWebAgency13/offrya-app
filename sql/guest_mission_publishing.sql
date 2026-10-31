-- OFFRYA : permettre les dépôts sans inscription visible via session invitée Supabase.
-- Les utilisateurs anonymes Supabase ont le rôle SQL authenticated :
-- il faut donc distinguer auth.jwt().is_anonymous des comptes identifiés.
-- Ne pas permettre à un invité de déclarer un rôle professionnel.
drop policy if exists profile_insert on public.offrya_profiles;
create policy profile_insert on public.offrya_profiles
 for insert to authenticated with check (
   id=(select auth.uid())
   and (
     coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
     or role='client'
   )
 );

drop policy if exists profile_update on public.offrya_profiles;
create policy profile_update on public.offrya_profiles
 for update to authenticated
 using (id=(select auth.uid()))
 with check (
   id=(select auth.uid())
   and (
     coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
     or role='client'
   )
 );

-- Défense en profondeur : un invité peut voir ses propres annonces,
-- mais JAMAIS les annonces des autres, même si un compte est mal configuré.
drop policy if exists missions_guest_owner_only on public.offrya_missions;
create policy missions_guest_owner_only on public.offrya_missions
 as restrictive for select to authenticated using (
   coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
   or owner_id=(select auth.uid())
 );

-- Anti-abus supplémentaire par session : au plus trois missions invitées
-- par fenêtre glissante de 24 h. Ne remplace PAS un CAPTCHA / Turnstile
-- et les protections par adresse IP au niveau du fournisseur Auth.
create or replace function offrya_private.limit_guest_mission_posts()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   if new.owner_id is distinct from auth.uid() then
     raise exception 'Propriétaire de mission invalide';
   end if;
   if (select count(*) from public.offrya_missions
        where owner_id=auth.uid() and created_at >= now()-interval '24 hours')>=3 then
     raise exception 'Limite de 3 missions sans compte par période de 24 h atteinte';
   end if;
 end if;
 return new;
end;
$$;
drop trigger if exists offrya_guest_mission_limit on public.offrya_missions;
create trigger offrya_guest_mission_limit before insert on public.offrya_missions
 for each row execute function offrya_private.limit_guest_mission_posts();
revoke all on function offrya_private.limit_guest_mission_posts() from public,anon,authenticated;

-- Par défaut RLS missions_read_authorized et missions_insert restent inchangés :
-- seuls les auteurs lisent leurs annonces ; les abonnés validés lisent celles d'autrui.
