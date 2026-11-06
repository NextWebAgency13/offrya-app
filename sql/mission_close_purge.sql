-- Clôturer une mission : elle disparaît pour tous les comptes (auteur compris) et ses échanges
-- (conversations, messages, devis) sont supprimés définitivement. La ligne de mission est conservée
-- (marquée « retirée ») : elle sert d'anti-doublon aux imports et de support aux avis/contrats.

-- 1. Marqueur « retirée par son auteur ».
alter table public.offrya_missions add column if not exists withdrawn_at timestamptz;

-- 2. Journal minimal de support (comptes uniquement, aucun contenu de message).
create table if not exists public.offrya_mission_closures(
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null,
  owner_id uuid not null,
  closed_at timestamptz not null default now(),
  conversations_deleted integer not null default 0,
  messages_deleted integer not null default 0
);
alter table public.offrya_mission_closures enable row level security;
revoke all on table public.offrya_mission_closures from anon, authenticated;

-- 3. Une mission retirée n'est lisible par personne via l'API.
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

-- 4. Clôture atomique (auteur uniquement ; missions ouvertes ou expirées ; jamais si un contrat existe).
create or replace function offrya_private.close_mission(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_conversations integer;
  v_messages integer;
begin
  if v_uid is null then raise exception 'Authentification requise'; end if;
  perform 1 from public.offrya_missions
    where id = p_id and owner_id = v_uid and status in ('open', 'expired') and withdrawn_at is null
    for update;
  if not found then raise exception 'Mission inaccessible ou déjà attribuée'; end if;
  if exists (select 1 from public.offrya_contracts where mission_id = p_id) then
    raise exception 'Cette mission est liée à un contrat : elle ne peut pas être clôturée.';
  end if;
  select count(*) into v_conversations from public.offrya_conversations where mission_id = p_id;
  select count(*) into v_messages from public.offrya_messages m
    join public.offrya_conversations c on c.id = m.conversation_id where c.mission_id = p_id;
  -- Les messages, devis et masquages sont supprimés en cascade avec les conversations.
  delete from public.offrya_conversations where mission_id = p_id;
  delete from public.offrya_favorites where mission_id = p_id;
  delete from public.offrya_pro_lead_tracking where mission_id = p_id;
  delete from public.offrya_priority_alerts where mission_id = p_id;
  delete from public.offrya_mission_photos where mission_id = p_id;
  update public.offrya_missions
    set status = 'closed', closed_at = now(), withdrawn_at = now()
    where id = p_id;
  insert into public.offrya_mission_closures(mission_id, owner_id, conversations_deleted, messages_deleted)
    values (p_id, v_uid, v_conversations, v_messages);
  return true;
end;
$fn$;
