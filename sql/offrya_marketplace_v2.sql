-- OFFRYA v2 : données structurées, statistiques agrégées, photos privées,
-- attribution contrôlée, avis post-prestation, profils vérifiés et signalements.
-- Exécuter uniquement sur le projet Supabase OFFRYA. Aucun effacement de données.
alter table public.offrya_missions
 add column if not exists area_sqm numeric(9,2),
 add column if not exists urgency text not null default 'normal',
 add column if not exists desired_date date,
 add column if not exists place_type text,
 add column if not exists expires_at timestamptz not null default (now()+interval '30 days'),
 add column if not exists selected_pro_id uuid references auth.users(id),
 add column if not exists awarded_at timestamptz,
 add column if not exists closed_at timestamptz;
alter table public.offrya_missions drop constraint if exists offrya_missions_status_check;
alter table public.offrya_missions add constraint offrya_missions_status_check
 check (status in ('open','awarded','closed','expired'));
alter table public.offrya_missions add constraint offrya_missions_extra_check
 check ((area_sqm is null or area_sqm between 1 and 1000000)
 and urgency in ('normal','soon','urgent')
 and (place_type is null or place_type in ('maison','appartement','bureau','commerce','terrain','autre'))
 and expires_at>created_at
 and (selected_pro_id is null or status in ('awarded','closed'))
 and (status<>'awarded' or (selected_pro_id is not null and awarded_at is not null)));
create index if not exists offrya_missions_expire on public.offrya_missions(status,expires_at,category,department);

-- Les missions périmées ne sont plus accessibles aux autres pros, même via REST.
alter policy missions_read_authorized on public.offrya_missions
 using(owner_id=(select auth.uid()) or
 ((status='open' and expires_at>now() or selected_pro_id=(select auth.uid()))
  and (select offrya_private.has_active_professional_access())));
-- Impossible d'ouvrir une nouvelle conversation ou de mettre en favori une
-- demande périmée en appelant directement le Data API.
alter policy conversation_open on public.offrya_conversations
 with check(
 professional_id=(select auth.uid()) and client_id<>(select auth.uid())
 and (select offrya_private.has_active_professional_access())
 and exists(select 1 from public.offrya_missions m
   where m.id=mission_id and m.owner_id=client_id
   and m.status='open' and m.expires_at>now()));
alter policy favorites_insert on public.offrya_favorites
 with check(user_id=(select auth.uid())
 and (select offrya_private.has_active_professional_access())
 and exists(select 1 from public.offrya_missions m
   where m.id=mission_id and m.owner_id<>(select auth.uid())
   and m.status='open' and m.expires_at>now()));


-- Ne jamais rendre un rang, une description, un utilisateur, une photo ou
-- un identifiant public. Résultat uniquement catégories et départements.
create or replace function public.offrya_public_mission_counts()
returns table(category text, department text, count bigint)
language sql stable security definer set search_path=''
as $$
 select m.category,m.department,count(*)::bigint
 from public.offrya_missions m
 where m.status='open' and m.expires_at>now()
 group by m.category,m.department
 order by m.category,m.department
$$;
revoke all on function public.offrya_public_mission_counts() from public;
grant execute on function public.offrya_public_mission_counts() to anon,authenticated;

-- La lecture de photos nécessite une propriété de mission ou l'accès Pro.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('offrya-mission-images','offrya-mission-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update
set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create table if not exists public.offrya_mission_photos(
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.offrya_missions(id) on delete cascade,
 object_path text not null unique,
 created_at timestamptz not null default now(),
 constraint photo_path_check check(length(object_path)<260)
);
alter table public.offrya_mission_photos enable row level security;
create policy mission_photos_own_or_pro on public.offrya_mission_photos for select to authenticated
 using(exists(select 1 from public.offrya_missions m where m.id=mission_id and
  (m.owner_id=(select auth.uid()) or
    ((m.status='open' and m.expires_at>now() or m.selected_pro_id=(select auth.uid()))
    and (select offrya_private.has_active_professional_access())))));
create policy mission_photos_owner_add on public.offrya_mission_photos for insert to authenticated
 with check(exists(select 1 from public.offrya_missions m
  where m.id=mission_id and m.owner_id=(select auth.uid())
    and m.status='open' and m.expires_at>now()
    and object_path like ((select auth.uid())::text||'/'||m.id::text||'/%')));
create policy mission_photos_owner_delete on public.offrya_mission_photos for delete to authenticated
 using(exists(select 1 from public.offrya_missions m
  where m.id=mission_id and m.owner_id=(select auth.uid())));
create or replace function offrya_private.photo_count_guard() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if (select count(*) from public.offrya_mission_photos where mission_id=new.mission_id)>=6
 then raise exception 'Maximum de 6 photos par mission'; end if;
 return new;
end $$;
create trigger offrya_photo_count before insert on public.offrya_mission_photos
for each row execute function offrya_private.photo_count_guard();
revoke all on function offrya_private.photo_count_guard() from public,anon,authenticated;
create policy offrya_storage_owner_upload on storage.objects for insert to authenticated
 with check(bucket_id='offrya-mission-images' and
  (storage.foldername(name))[1]=(select auth.uid())::text and
  exists(select 1 from public.offrya_missions m where m.id::text=(storage.foldername(name))[2]
    and m.owner_id=(select auth.uid()) and m.status='open' and m.expires_at>now()));
create policy offrya_storage_owner_pro_download on storage.objects for select to authenticated
 using(bucket_id='offrya-mission-images' and exists(
  select 1 from public.offrya_missions m
  where m.id::text=(storage.foldername(name))[2] and
  ((m.owner_id=(select auth.uid())) or
  ((m.status='open' and m.expires_at>now() or m.selected_pro_id=(select auth.uid()))
    and (select offrya_private.has_active_professional_access())))
 ));
create policy offrya_storage_owner_remove on storage.objects for delete to authenticated
 using(bucket_id='offrya-mission-images' and
  (storage.foldername(name))[1]=(select auth.uid())::text);

-- Pro : fiche publique volontaire, seulement si entreprise/dirigeant contrôlés.
create table if not exists public.offrya_public_pro_profiles(
 user_id uuid primary key references public.offrya_profiles(id) on delete cascade,
 sectors text[] not null default '{}',
 service_area text not null default '',
 presentation text not null default '',
 published boolean not null default false,
 updated_at timestamptz not null default now(),
 constraint pro_public_fields check(cardinality(sectors)<=6 and
  sectors<@array['Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Autre']::text[]
  and char_length(service_area)<=120 and char_length(presentation)<=700)
);
alter table public.offrya_public_pro_profiles enable row level security;
create policy public_pro_edit_own on public.offrya_public_pro_profiles for insert to authenticated
 with check(user_id=(select auth.uid()) and
 exists(select 1 from public.offrya_profiles p where p.id=user_id and p.role='pro'));
create policy public_pro_select_own on public.offrya_public_pro_profiles for select to authenticated
 using(user_id=(select auth.uid()));
create policy public_pro_update_own on public.offrya_public_pro_profiles for update to authenticated
 using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()));
create table if not exists public.offrya_pro_qualification_badges(
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references public.offrya_profiles(id) on delete cascade,
 kind text not null check(kind in ('decennale','rge','qualibat')),
 label text not null check(char_length(label) between 3 and 70),
 valid_until date,
 verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),
 checked_at timestamptz,
 created_at timestamptz not null default now(),
 constraint badge_approved_check check(verification_status<>'verified' or checked_at is not null)
);
create index if not exists pro_badges_professional on public.offrya_pro_qualification_badges(professional_id);
alter table public.offrya_pro_qualification_badges enable row level security;
-- Aucune politique d'INSERT/UPDATE authentifiée : badge réservé à un contrôle administratif.
create or replace function public.offrya_verified_pro_directory()
returns table(user_id uuid,display_name text,sectors text[],service_area text,
 presentation text,badges text[])
language sql stable security definer set search_path=''
as $$
 select d.user_id,p.display_name,d.sectors,d.service_area,d.presentation,
 coalesce((select array_agg(b.label order by b.kind) from public.offrya_pro_qualification_badges b
 where b.professional_id=d.user_id and b.verification_status='verified'
 and (b.valid_until is null or b.valid_until>=current_date)),array[]::text[]) as badges
 from public.offrya_public_pro_profiles d
 join public.offrya_profiles p on p.id=d.user_id and p.role='pro'
 join public.offrya_premium_requests v on v.user_id=p.id
 where d.published is true and v.status='verified' and v.identity_status='verified'
 and v.authority_status='verified' and v.representative_kind='dirigeant'
 and v.registry_name_matched is true
 order by p.display_name limit 100
$$;
revoke all on function public.offrya_verified_pro_directory() from public;
grant execute on function public.offrya_verified_pro_directory() to anon,authenticated;

-- Attribution irrévocable à un seul pro après échange bidirectionnel réel.
create or replace function offrya_private.award_mission(p_mission uuid,p_professional uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_mission public.offrya_missions%rowtype;
begin
 if auth.uid() is null then return false; end if;
 select * into v_mission from public.offrya_missions where id=p_mission for update;
 if not found or v_mission.owner_id<>auth.uid()
    or v_mission.status<>'open' or v_mission.expires_at<=now()
 then return false; end if;
 -- Le professionnel sélectionné est encore certifié et abonné lors de l'attribution.
 if not exists(
   select 1 from public.offrya_profiles p
   join public.offrya_premium_requests v on v.user_id=p.id
   join public.offrya_premium_subscriptions sub on sub.user_id=p.id
   where p.id=p_professional and p.role='pro'
   and v.status='verified' and v.representative_kind='dirigeant'
   and v.registry_name_matched is true
   and v.identity_status='verified' and v.authority_status='verified'
   and sub.status='active' and sub.paid_through>now()
 ) then return false; end if;
 if not exists(select 1 from public.offrya_conversations c
    where c.mission_id=p_mission and c.client_id=auth.uid()
    and c.professional_id=p_professional
    and exists(select 1 from public.offrya_messages msg where msg.conversation_id=c.id and msg.sender_id=c.client_id)
    and exists(select 1 from public.offrya_messages msg where msg.conversation_id=c.id and msg.sender_id=c.professional_id))
 then return false; end if;
 update public.offrya_missions
 set status='awarded',selected_pro_id=p_professional,awarded_at=now()
 where id=p_mission;
 return true;
end $$;
revoke all on function offrya_private.award_mission(uuid,uuid) from public,anon;
grant execute on function offrya_private.award_mission(uuid,uuid) to authenticated;
create or replace function public.offrya_award_mission(p_mission uuid,p_professional uuid)
returns boolean language sql set search_path='' as $$
 select offrya_private.award_mission(p_mission,p_professional)
$$;
revoke all on function public.offrya_award_mission(uuid,uuid) from public,anon;
grant execute on function public.offrya_award_mission(uuid,uuid) to authenticated;

create or replace function offrya_private.finish_mission(p_mission uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return false; end if;
 update public.offrya_missions set status='closed',closed_at=now()
 where id=p_mission and owner_id=auth.uid() and status in ('open','awarded','expired');
 return found;
end $$;
revoke all on function offrya_private.finish_mission(uuid) from public,anon;
grant execute on function offrya_private.finish_mission(uuid) to authenticated;
create or replace function public.offrya_finish_mission(p_mission uuid)
returns boolean language sql set search_path='' as $$
 select offrya_private.finish_mission(p_mission)
$$;
revoke all on function public.offrya_finish_mission(uuid) from public,anon;
grant execute on function public.offrya_finish_mission(uuid) to authenticated;

-- Avis uniquement du donneur d'ordre, mission attribuée puis clôturée,
-- conversation avec des messages des deux participants.
create table if not exists public.offrya_reviews(
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null unique references public.offrya_missions(id),
 client_id uuid not null references auth.users(id),
 professional_id uuid not null references auth.users(id),
 rating smallint not null check(rating between 1 and 5),
 comment text not null check(char_length(trim(comment)) between 15 and 1500),
 created_at timestamptz not null default now()
);
alter table public.offrya_reviews enable row level security;
create policy review_after_real_exchange on public.offrya_reviews for insert to authenticated
 with check(client_id=(select auth.uid()) and exists(
 select 1 from public.offrya_missions m
 where m.id=offrya_reviews.mission_id and m.owner_id=offrya_reviews.client_id and m.selected_pro_id=offrya_reviews.professional_id
 and m.status='closed' and exists(
  select 1 from public.offrya_conversations c where c.mission_id=m.id
  and c.client_id=offrya_reviews.client_id and c.professional_id=offrya_reviews.professional_id
  and exists(select 1 from public.offrya_messages msg where msg.conversation_id=c.id and msg.sender_id=client_id)
  and exists(select 1 from public.offrya_messages msg where msg.conversation_id=c.id and msg.sender_id=professional_id)
  )
 ));
create policy review_client_read_own on public.offrya_reviews for select to authenticated
 using(client_id=(select auth.uid()) or professional_id=(select auth.uid()));
create or replace function public.offrya_public_pro_reviews(p_professional uuid)
returns table(rating smallint, comment text, created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.rating,r.comment,r.created_at from public.offrya_reviews r
 where r.professional_id=p_professional and exists(
 select 1 from public.offrya_verified_pro_directory() d where d.user_id=p_professional)
 order by r.created_at desc limit 30
$$;
revoke all on function public.offrya_public_pro_reviews(uuid) from public;
grant execute on function public.offrya_public_pro_reviews(uuid) to anon,authenticated;

-- Signalements réservés aux personnes ayant légitimement accès au contenu.
create table if not exists public.offrya_reports(
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id),
 target_type text not null check(target_type in ('mission','message','profile')),
 target_id uuid not null,
 reason text not null check(reason in ('spam','fraude','harcelement','contenu_inapproprie','autre')),
 details text not null default '' check(char_length(details)<=1000),
 status text not null default 'pending' check(status in ('pending','reviewing','closed')),
 created_at timestamptz not null default now(),
 unique(reporter_id,target_type,target_id)
);
alter table public.offrya_reports enable row level security;
create policy report_owner_insert on public.offrya_reports for insert to authenticated
 with check(reporter_id=(select auth.uid()) and (
  (target_type='mission' and exists(select 1 from public.offrya_missions m
    where m.id=target_id and (m.owner_id=(select auth.uid()) or
     ((m.status='open' and m.expires_at>now() or m.selected_pro_id=(select auth.uid()))
    and (select offrya_private.has_active_professional_access())))))
  or (target_type='message' and exists(select 1 from public.offrya_messages msg
    join public.offrya_conversations c on c.id=msg.conversation_id
    where msg.id=target_id and (c.client_id=(select auth.uid()) or
     (c.professional_id=(select auth.uid()) and (select offrya_private.has_active_professional_access())))))
  or (target_type='profile' and exists(select 1 from public.offrya_verified_pro_directory() d where d.user_id=target_id))
 ));
create policy report_own_read on public.offrya_reports for select to authenticated
 using(reporter_id=(select auth.uid()));
-- Aucun changement de statut par les utilisateurs ; modération service uniquement.

-- Justificatifs de décennale/RGE/Qualibat : strictement privés.
-- Les professionnels déposent une pièce, l'équipe OFFRYA valide le badge
-- séparément. Déposer un fichier ne confère AUCUN badge automatiquement.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('offrya-pro-proofs','offrya-pro-proofs',false,10485760,
 array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update
set public=false,file_size_limit=10485760,
 allowed_mime_types=array['application/pdf','image/jpeg','image/png'];
create table if not exists public.offrya_pro_proof_requests(
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references public.offrya_profiles(id) on delete cascade,
 kind text not null check(kind in ('decennale','rge','qualibat')),
 object_path text not null unique,
 status text not null default 'pending' check(status in ('pending','verified','rejected')),
 created_at timestamptz not null default now(),
 constraint proof_path_check check(length(object_path)<260)
);
alter table public.offrya_pro_proof_requests enable row level security;
create policy pro_proof_owner_read on public.offrya_pro_proof_requests for select to authenticated
 using(professional_id=(select auth.uid()));
create policy pro_proof_owner_insert on public.offrya_pro_proof_requests for insert to authenticated
 with check(professional_id=(select auth.uid()) and
 object_path like ((select auth.uid())::text||'/%') and exists(
 select 1 from public.offrya_profiles p where p.id=professional_id and p.role='pro'));
create policy offrya_proof_storage_upload on storage.objects for insert to authenticated
 with check(bucket_id='offrya-pro-proofs' and
 (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.offrya_profiles p
 where p.id=(select auth.uid()) and p.role='pro'));
create policy offrya_proof_storage_owner_download on storage.objects for select to authenticated
 using(bucket_id='offrya-pro-proofs' and
 (storage.foldername(name))[1]=(select auth.uid())::text);

-- Privilèges REST explicites ; RLS détermine ensuite les lignes visibles.
revoke all on public.offrya_pro_qualification_badges from anon,authenticated;
grant select,insert,delete on public.offrya_mission_photos to authenticated;
grant select,insert,update on public.offrya_public_pro_profiles to authenticated;
grant select,insert on public.offrya_reviews to authenticated;
grant select,insert on public.offrya_reports to authenticated;
grant select,insert on public.offrya_pro_proof_requests to authenticated;
