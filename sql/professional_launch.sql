-- OFFRYA Professionnel : contrôle obligatoire de l'entreprise, représentant et abonnement payant.
-- À exécuter après premium_access.sql, subscriptions et premium_priority_alerts.sql.
-- Les anciennes périodes de gratuité ne donnent plus accès aux missions d'autrui.

alter table public.offrya_premium_requests
 add column if not exists representative_name text,
 add column if not exists representative_capacity text;
alter table public.offrya_premium_requests
 add constraint offrya_representative_name_valid check (representative_name is not null and char_length(btrim(representative_name)) between 4 and 120),
 add constraint offrya_representative_capacity_valid check (representative_capacity is not null and char_length(btrim(representative_capacity)) between 3 and 100);

-- Un dossier peut être créé exclusivement par le serveur après contrôle officiel du SIRET.
revoke insert on public.offrya_premium_requests from authenticated;
drop policy if exists premium_request_account_holder on public.offrya_premium_requests;
drop policy if exists premium_request_professional on public.offrya_premium_requests;
grant select (representative_name,representative_capacity) on public.offrya_premium_requests to authenticated;

-- Conversion volontaire d'un compte client en compte professionnel, sans privilèges automatiques.
grant update(role) on public.offrya_profiles to authenticated;

create or replace function offrya_private.has_active_professional_access()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(
  select 1 from public.offrya_profiles p
  join public.offrya_premium_requests v on v.user_id=p.id and v.status='verified'
  join public.offrya_premium_subscriptions s on s.user_id=p.id
  where p.id=(select auth.uid()) and p.role='pro'
    and s.status='active' and s.paid_through>now()
 );
$$;
revoke all on function offrya_private.has_active_professional_access() from public,anon;
grant execute on function offrya_private.has_active_professional_access() to authenticated;

-- Aucune annonce d'autrui n'est accessible sans entreprise vérifiée et période payée.
revoke select on public.offrya_missions from anon;
drop policy if exists missions_read_public on public.offrya_missions;
drop policy if exists missions_read_members on public.offrya_missions;
create policy missions_read_authorized on public.offrya_missions for select to authenticated
 using (owner_id=(select auth.uid()) or (status='open' and (select offrya_private.has_active_professional_access())));

-- Publier est gratuit pour les utilisateurs ayant un profil, pro ou particulier.
drop policy if exists missions_insert on public.offrya_missions;
create policy missions_insert on public.offrya_missions for insert to authenticated
 with check (owner_id=(select auth.uid()) and status='open'
 and exists(select 1 from public.offrya_profiles p where p.id=(select auth.uid())));

-- Contacter un annonceur et enregistrer ses opportunités exige un abonnement actif.
drop policy if exists conversation_open on public.offrya_conversations;
create policy conversation_open on public.offrya_conversations for insert to authenticated
 with check (professional_id=(select auth.uid()) and client_id<>(select auth.uid())
 and (select offrya_private.has_active_professional_access())
 and exists(select 1 from public.offrya_missions m
    where m.id=mission_id and m.owner_id=client_id and m.status='open'));
drop policy if exists favorites_insert on public.offrya_favorites;
create policy favorites_insert on public.offrya_favorites for insert to authenticated
 with check (user_id=(select auth.uid()) and (select offrya_private.has_active_professional_access())
 and exists(select 1 from public.offrya_missions m where m.id=mission_id and m.status='open' and m.owner_id<>(select auth.uid())));

drop policy if exists priority_alert_read_own on public.offrya_priority_alerts;
create policy priority_alert_read_own on public.offrya_priority_alerts for select to authenticated
 using(recipient_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()));
drop policy if exists priority_alert_mark_seen on public.offrya_priority_alerts;
create policy priority_alert_mark_seen on public.offrya_priority_alerts for update to authenticated
 using(recipient_id=(select auth.uid()) and (select offrya_private.has_active_professional_access()))
 with check(recipient_id=(select auth.uid()));

create or replace function offrya_private.queue_priority_mission_alerts()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status<>'open' then return new; end if;
 insert into public.offrya_priority_alerts(recipient_id,mission_id,email_eligible)
 select p.id,new.id,coalesce(pref.missions_enabled,false) and pref.missions_consented_at is not null
 from public.offrya_profiles p
 join public.offrya_premium_requests v on v.user_id=p.id and v.status='verified'
 join public.offrya_premium_subscriptions s on s.user_id=p.id and s.status='active' and s.paid_through>now()
 left join public.offrya_alert_preferences pref on pref.user_id=p.id
 where p.role='pro' and p.id<>new.owner_id
  and(coalesce(pref.department,'')='' or pref.department=new.department)
  and(coalesce(pref.category,'')='' or pref.category=new.category)
 on conflict(recipient_id,mission_id) do nothing;
 return new;
end;$$;
revoke all on function offrya_private.queue_priority_mission_alerts() from public,anon,authenticated;
