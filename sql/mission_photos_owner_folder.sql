-- Photos de mission : finitions de sécurité et de nettoyage.
-- 1. L'auteur peut toujours lire (et donc retirer) les fichiers de son propre dossier,
--    y compris après la clôture de la mission : le site efface ainsi les photos d'une
--    mission clôturée au lieu de les laisser stockées.
drop policy if exists offrya_storage_owner_folder_read on storage.objects;
create policy offrya_storage_owner_folder_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'offrya-mission-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 2. Six photos au maximum par mission (le formulaire applique la même limite).
create or replace function offrya_private.limit_mission_photos()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if (select count(*) from public.offrya_mission_photos where mission_id = new.mission_id) >= 6 then
    raise exception 'Six photos au maximum par mission.' using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;
revoke all on function offrya_private.limit_mission_photos() from public, anon, authenticated;

drop trigger if exists offrya_mission_photos_limit on public.offrya_mission_photos;
create trigger offrya_mission_photos_limit
  before insert on public.offrya_mission_photos
  for each row execute function offrya_private.limit_mission_photos();
