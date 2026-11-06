-- Clôturer une mission :
--   * la mission disparaît pour tous les comptes (auteur compris) ; la ligne est conservée,
--     marquée « retirée » : anti-doublon des imports, rattachement des avis et contrats ;
--   * l'échange est supprimé uniquement du côté de celui qui clôture (l'auteur) ;
--     le professionnel conserve sa copie (lecture seule) avec le titre de la mission.

-- 1. Marqueurs.
alter table public.offrya_missions add column if not exists withdrawn_at timestamptz;
alter table public.offrya_conversations add column if not exists mission_title text;

-- 2. Suppression « de mon côté » : table fermée à l'API, écrite uniquement par les fonctions ci-dessous.
create table if not exists public.offrya_conversation_purges(
  conversation_id uuid not null references public.offrya_conversations(id) on delete cascade,
  user_id uuid not null,
  purged_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.offrya_conversation_purges enable row level security;
revoke all on table public.offrya_conversation_purges from anon, authenticated;

-- 3. Journal de support : comptes et totaux uniquement, aucun contenu de message.
create table if not exists public.offrya_mission_closures(
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null,
  owner_id uuid not null,
  closed_at timestamptz not null default now(),
  conversations_purged integer not null default 0,
  messages_purged integer not null default 0
);
alter table public.offrya_mission_closures enable row level security;
revoke all on table public.offrya_mission_closures from anon, authenticated;

-- 4. Aides lisibles par les politiques (SECURITY DEFINER : les tables ci-dessus restent fermées).
create or replace function offrya_private.conversation_purged_for(p_conversation uuid, p_user uuid)
returns boolean language sql stable security definer set search_path to ''
as $fn$ select exists (select 1 from public.offrya_conversation_purges where conversation_id = p_conversation and user_id = p_user) $fn$;

create or replace function offrya_private.mission_withdrawn(p_mission uuid)
returns boolean language sql stable security definer set search_path to ''
as $fn$ select exists (select 1 from public.offrya_missions where id = p_mission and withdrawn_at is not null) $fn$;

revoke all on function offrya_private.conversation_purged_for(uuid, uuid) from public, anon;
revoke all on function offrya_private.mission_withdrawn(uuid) from public, anon;
grant execute on function offrya_private.conversation_purged_for(uuid, uuid) to authenticated;
grant execute on function offrya_private.mission_withdrawn(uuid) to authenticated;

-- 5. Politiques.
-- 5a. Une mission retirée n'est lisible par personne via l'API.
drop policy if exists missions_read_authorized on public.offrya_missions;
create policy missions_read_authorized on public.offrya_missions
  for select to authenticated
  using (
    withdrawn_at is null
    and (
      (owner_id = (select auth.uid()) and import_source is null)
      or (
        ((status = 'open' and expires_at > now()) or selected_pro_id = (select auth.uid()))
        and (select offrya_private.has_active_professional_access())
      )
    )
  );

-- 5b. Un échange supprimé de mon côté n'est plus lisible par moi ; l'autre participant le garde.
drop policy if exists conversation_read on public.offrya_conversations;
create policy conversation_read on public.offrya_conversations
  for select to authenticated
  using (
    ((client_id = (select auth.uid()))
     or (professional_id = (select auth.uid()) and (select offrya_private.has_active_professional_access())))
    and not offrya_private.conversation_purged_for(id, (select auth.uid()))
  );

drop policy if exists messages_read on public.offrya_messages;
create policy messages_read on public.offrya_messages
  for select to authenticated
  using (exists (
    select 1 from public.offrya_conversations c
    where c.id = offrya_messages.conversation_id
      and ((c.client_id = (select auth.uid()))
        or (c.professional_id = (select auth.uid()) and (select offrya_private.has_active_professional_access())))
      and not offrya_private.conversation_purged_for(c.id, (select auth.uid()))
  ));

-- 5c. Plus de nouveau message sur l'échange d'une mission retirée (lecture seule pour le professionnel).
drop policy if exists messages_write on public.offrya_messages;
create policy messages_write on public.offrya_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.offrya_conversations c
      where c.id = offrya_messages.conversation_id
        and ((c.client_id = (select auth.uid()))
          or (c.professional_id = (select auth.uid()) and (select offrya_private.has_active_professional_access())))
        and not offrya_private.mission_withdrawn(c.mission_id)
        and not offrya_private.conversation_purged_for(c.id, (select auth.uid()))
    )
  );

-- 6. Retrait d'une mission (utilisé par le bouton et par la reprise de l'existant).
create or replace function offrya_private.withdraw_mission(p_mission uuid, p_owner uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_title text;
  v_conversations integer;
  v_messages integer;
begin
  select title into v_title from public.offrya_missions where id = p_mission;
  select count(*) into v_conversations from public.offrya_conversations where mission_id = p_mission;
  select count(*) into v_messages from public.offrya_messages m
    join public.offrya_conversations c on c.id = m.conversation_id where c.mission_id = p_mission;
  -- Le professionnel garde l'échange, avec le titre de la mission.
  update public.offrya_conversations set mission_title = coalesce(mission_title, v_title) where mission_id = p_mission;
  -- Seul l'auteur perd l'échange.
  insert into public.offrya_conversation_purges(conversation_id, user_id)
    select id, p_owner from public.offrya_conversations where mission_id = p_mission
    on conflict do nothing;
  update public.offrya_quotes set status = 'rejected'
    where status = 'pending'
      and conversation_id in (select id from public.offrya_conversations where mission_id = p_mission);
  delete from public.offrya_favorites where mission_id = p_mission;
  delete from public.offrya_priority_alerts where mission_id = p_mission;
  delete from public.offrya_mission_photos where mission_id = p_mission;
  update public.offrya_missions
    set status = 'closed', closed_at = coalesce(closed_at, now()), withdrawn_at = now()
    where id = p_mission;
  insert into public.offrya_mission_closures(mission_id, owner_id, conversations_purged, messages_purged)
    values (p_mission, p_owner, v_conversations, v_messages);
end;
$fn$;
revoke all on function offrya_private.withdraw_mission(uuid, uuid) from public, anon, authenticated;

-- 7. Clôture à la demande de l'auteur : missions ouvertes, expirées ou pourvues ; jamais avec un contrat en cours.
create or replace function offrya_private.close_mission(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentification requise'; end if;
  perform 1 from public.offrya_missions
    where id = p_id and owner_id = v_uid and status in ('open', 'expired', 'awarded') and withdrawn_at is null
    for update;
  if not found then raise exception 'Mission inaccessible ou déjà clôturée'; end if;
  if exists (select 1 from public.offrya_contracts
             where mission_id = p_id and status in ('active', 'delivered', 'disputed')) then
    raise exception 'Cette mission est liée à un contrat en cours : elle ne peut pas être clôturée.';
  end if;
  perform offrya_private.withdraw_mission(p_id, v_uid);
  return true;
end;
$fn$;

-- 8. Reprise de l'existant : les missions déjà clôturées par le passé sont retirées de la même façon.
do $purge$
declare r record;
begin
  for r in select id, owner_id from public.offrya_missions where status = 'closed' and withdrawn_at is null loop
    perform offrya_private.withdraw_mission(r.id, r.owner_id);
  end loop;
end;
$purge$;
