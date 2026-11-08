-- OFFRYA : ajoute APProch (projets d'achats publics de l'État, Licence Ouverte Etalab 2.0)
-- aux sources autorisées des alertes. À appliquer AVANT d'activer OFFRYA_APPROCH_ENABLED=true.
alter table public.offrya_tender_alerts
 drop constraint if exists offrya_tender_alerts_source_check;
alter table public.offrya_tender_alerts
 add constraint offrya_tender_alerts_source_check check (source in ('BOAMP','TED','APPROCH'));
