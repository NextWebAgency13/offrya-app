-- Liens « pour répondre » des alertes appels d'offres (dossier de consultation,
-- dépôt en ligne ou plateforme de l'acheteur), issus des données officielles BOAMP/TED.
alter table public.offrya_tender_alerts
  add column if not exists respond_url text,
  add column if not exists respond_kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offrya_tender_alerts_respond_url_check') then
    alter table public.offrya_tender_alerts
      add constraint offrya_tender_alerts_respond_url_check
      check (respond_url is null or (respond_url ~ '^https?://' and length(respond_url) <= 600));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offrya_tender_alerts_respond_kind_check') then
    alter table public.offrya_tender_alerts
      add constraint offrya_tender_alerts_respond_kind_check
      check (respond_kind is null or respond_kind in ('documents', 'submission', 'profile', 'platform'));
  end if;
end $$;
