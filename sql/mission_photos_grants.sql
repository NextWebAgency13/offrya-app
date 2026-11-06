-- Les photos de mission suivent les missions : réservées au propriétaire et aux comptes premium.
-- RLS bloque déjà les lignes ; on retire en plus les privilèges inutiles (défense en profondeur).
revoke all on table public.offrya_mission_photos from anon;
revoke truncate, trigger, references, update on table public.offrya_mission_photos from authenticated;
grant select, insert, delete on table public.offrya_mission_photos to authenticated;
