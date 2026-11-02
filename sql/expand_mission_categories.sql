alter table public.offrya_missions drop constraint if exists offrya_missions_category_check;
alter table public.offrya_missions add constraint offrya_missions_category_check check (category in ('Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté','Autre'));
alter table public.offrya_alert_preferences drop constraint if exists offrya_alert_preferences_category_check;
alter table public.offrya_alert_preferences add constraint offrya_alert_preferences_category_check check (category='' or category in ('Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté','Autre'));
