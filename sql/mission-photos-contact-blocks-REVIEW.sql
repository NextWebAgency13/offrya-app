-- OFFRYA — Proposition pour examen préalable, NE PAS EXÉCUTER EN PRODUCTION sans accord.
-- Pré-requis : la base contient déjà les champs d'urgences / date / surface /
-- statuts, RPC clore / attribuer, offrya_reports et offrya_mission_photos.
-- Ne change pas ces objets existants ni les abonnements Stripe.

-- Photos privées. La confidentialité des photos doit refléter celle des missions.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('offrya-mission-photos','offrya-mission-photos',false,3145728,
 array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
 set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Fonction de contrôle isolée : évite les conversions UUID dangereuses sur des chemins invalides.
create or replace function offrya_private.can_read_mission_photo_path(p_path text)
returns boolean language sql stable security definer set search_path=''
as $$
 select case
  when p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  then exists(
   select 1 from public.offrya_missions m
   where m.id=split_part(p_path,'/',2)::uuid
   and (
    m.owner_id=(select auth.uid())
    or (offrya_private.has_active_professional_access()
      and (m.status='open' and m.expires_at>now() or m.selected_pro_id=(select auth.uid())))
   )
  )
  else false end
$$;
revoke all on function offrya_private.can_read_mission_photo_path(text) from public,anon,authenticated;
grant execute on function offrya_private.can_read_mission_photo_path(text) to authenticated;

create or replace function offrya_private.can_upload_mission_photo_path(p_path text)
returns boolean language sql stable security definer set search_path=''
as $$
 select case
  when p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  then exists(
   select 1 from public.offrya_missions m where m.id=split_part(p_path,'/',2)::uuid
   and m.owner_id=(select auth.uid())
   and split_part(p_path,'/',1)=(select auth.uid())::text
   and m.status='open' and m.expires_at>now()
  )
  else false end
$$;
revoke all on function offrya_private.can_upload_mission_photo_path(text) from public,anon,authenticated;
grant execute on function offrya_private.can_upload_mission_photo_path(text) to authenticated;

drop policy if exists offrya_photo_read on storage.objects;
create policy offrya_photo_read on storage.objects for select to authenticated
 using(bucket_id='offrya-mission-photos' and
  (select offrya_private.can_read_mission_photo_path(name)));
drop policy if exists offrya_photo_insert on storage.objects;
create policy offrya_photo_insert on storage.objects for insert to authenticated
 with check(bucket_id='offrya-mission-photos' and
  (select offrya_private.can_upload_mission_photo_path(name)));
drop policy if exists offrya_photo_delete on storage.objects;
create policy offrya_photo_delete on storage.objects for delete to authenticated
 using(bucket_id='offrya-mission-photos' and
  (select offrya_private.can_upload_mission_photo_path(name)));

-- Bloquer un contact à partir d'une discussion existante ; ne supprime pas les
-- éléments de preuve des échanges déjà envoyés.
create table if not exists public.offrya_contact_blocks(
 blocker_id uuid not null references auth.users(id) on delete cascade,
 blocked_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),
 constraint no_self_block check(blocker_id<>blocked_id)
);
alter table public.offrya_contact_blocks enable row level security;
revoke all on public.offrya_contact_blocks from anon,authenticated;
grant select,insert,delete on public.offrya_contact_blocks to authenticated;
drop policy if exists contact_blocks_read on public.offrya_contact_blocks;
create policy contact_blocks_read on public.offrya_contact_blocks for select to authenticated
 using(blocker_id=(select auth.uid()));
drop policy if exists contact_blocks_insert on public.offrya_contact_blocks;
create policy contact_blocks_insert on public.offrya_contact_blocks for insert to authenticated
 with check(blocker_id=(select auth.uid()) and exists (
  select 1 from public.offrya_conversations c
  where (c.client_id=blocker_id and c.professional_id=blocked_id)
     or (c.professional_id=blocker_id and c.client_id=blocked_id)));
drop policy if exists contact_blocks_delete on public.offrya_contact_blocks;
create policy contact_blocks_delete on public.offrya_contact_blocks for delete to authenticated
 using(blocker_id=(select auth.uid()));

-- La politique de messagerie doit refuser l'envoi des deux côtés.
-- Fonction privée avec retour booléen uniquement.
create or replace function offrya_private.can_send_to_contact(p_conversation uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists (
  select 1 from public.offrya_conversations c
  where c.id=p_conversation
   and (c.client_id=(select auth.uid()) or c.professional_id=(select auth.uid()))
   and not exists (
    select 1 from public.offrya_contact_blocks b
    where (b.blocker_id=c.client_id and b.blocked_id=c.professional_id)
       or (b.blocker_id=c.professional_id and b.blocked_id=c.client_id)
   )
 )
$$;
revoke all on function offrya_private.can_send_to_contact(uuid) from public,anon,authenticated;
grant execute on function offrya_private.can_send_to_contact(uuid) to authenticated;

drop policy if exists messages_write on public.offrya_messages;
create policy messages_write on public.offrya_messages for insert to authenticated
 with check(sender_id=(select auth.uid()) and
 (select offrya_private.can_send_to_contact(conversation_id)) and
 exists (
  select 1 from public.offrya_conversations c where c.id=conversation_id and
  (c.client_id=(select auth.uid()) or
   (c.professional_id=(select auth.uid()) and offrya_private.has_active_professional_access()))
 ));

-- À vérifier après autorisation de migration :
-- select * from pg_policies where schemaname='storage' and tablename='objects';
-- select * from pg_policies where tablename='offrya_contact_blocks';
-- Contrôler avec les rôles anon, client, pro non vérifié, pro abonné.
