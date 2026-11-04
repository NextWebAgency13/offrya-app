-- PREPARED ONLY; not applied to Supabase production.
-- Enable additional official-source identifiers only after source terms have
-- been reviewed and a verified RSS feed has been configured by the operator.
begin;
alter table public.offrya_tender_alerts
 drop constraint if exists offrya_tender_alerts_source_check;
alter table public.offrya_tender_alerts
 add constraint offrya_tender_alerts_source_check
 check (source in ('BOAMP','TED','PLACE','MAXIMILIEN','MEGALIS','EBOURGOGNE','OCCITANIE','SUD'));
commit;
