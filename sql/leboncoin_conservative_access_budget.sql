-- OFFRYA : quota centralisé et atomique de lecture des annonces externes.
-- Les accès réels restent désactivés tant que les autorisations ne sont pas confirmées.
-- Les compteurs sont partagés entre Playwright, Scrapfly et la synchronisation des retraits.
create schema if not exists offrya_private;
create table if not exists offrya_private.leboncoin_access_ledger (
 id bigint generated always as identity primary key,
 event_kind text not null check(event_kind in ('run','request')),
 created_at timestamptz not null default now()
);
create index if not exists leboncoin_access_ledger_recent
 on offrya_private.leboncoin_access_ledger(event_kind,created_at desc);
revoke all on offrya_private.leboncoin_access_ledger from public,anon,authenticated;

create or replace function public.offrya_claim_leboncoin_budget(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
 v_now timestamptz := pg_catalog.clock_timestamp();
 v_paris_hour integer;
 v_day timestamptz;
 v_month timestamptz;
begin
 if p_kind not in ('run','request') then return false; end if;
 -- Verrou atomique commun à tous les collecteurs, y compris sur plusieurs serveurs.
 perform pg_catalog.pg_advisory_xact_lock(629141, 116734);
 v_paris_hour := extract(hour from v_now at time zone 'Europe/Paris');
 if v_paris_hour < 7 or v_paris_hour >= 23 then return false; end if;
 if p_kind='run' then
  if exists(
    select 1 from offrya_private.leboncoin_access_ledger
    where event_kind='run' and created_at > v_now - interval '4 hours'
  ) then return false; end if;
 else
  if exists(
    select 1 from offrya_private.leboncoin_access_ledger
    where event_kind='request' and created_at > v_now - interval '5 seconds'
  ) then return false; end if;
  v_day := (date_trunc('day',v_now at time zone 'Europe/Paris') at time zone 'Europe/Paris');
  v_month := (date_trunc('month',v_now at time zone 'Europe/Paris') at time zone 'Europe/Paris');
  if (select count(*) from offrya_private.leboncoin_access_ledger
      where event_kind='request' and created_at >= v_day) >= 20 then return false; end if;
  if (select count(*) from offrya_private.leboncoin_access_ledger
      where event_kind='request' and created_at >= v_month) >= 300 then return false; end if;
 end if;
 insert into offrya_private.leboncoin_access_ledger(event_kind,created_at)
 values (p_kind,v_now);
 return true;
end;
$function$;
revoke all on function public.offrya_claim_leboncoin_budget(text) from public,anon,authenticated;
grant execute on function public.offrya_claim_leboncoin_budget(text) to service_role;
-- Limitation : les accès réseau sont décomptés avant tentative, y compris si la source échoue.
