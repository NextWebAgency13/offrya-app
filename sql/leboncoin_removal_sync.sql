-- À exécuter MANUELLEMENT après leboncoin_external_opportunities.sql.
-- Deux contrôles explicites et indépendants de l'annonce source avant retrait.
-- Une suppression passée n'est jamais annulée par un réimport automatique.
alter table public.offrya_external_opportunities
 add column if not exists last_checked_at timestamptz,
 add column if not exists first_missing_at timestamptz,
 add column if not exists missing_checks integer not null default 0,
 add column if not exists expired_at timestamptz,
 add column if not exists removal_reason text;

alter table public.offrya_external_opportunities
 drop constraint if exists offrya_external_missing_checks_range;
alter table public.offrya_external_opportunities
 add constraint offrya_external_missing_checks_range check(missing_checks between 0 and 2);
alter table public.offrya_external_opportunities
 drop constraint if exists offrya_external_removal_reason_valid;
alter table public.offrya_external_opportunities
 add constraint offrya_external_removal_reason_valid
 check(removal_reason is null or removal_reason in ('http_404','http_410','explicit_unavailable'));

create index if not exists offrya_external_recheck
 on public.offrya_external_opportunities(last_checked_at asc nulls first)
 where source='leboncoin' and status='published';

-- Publication/validation externes demeurent réservées à la clé de service.
-- Le code import utilise désormais resolution=ignore-duplicates pour qu'un
-- réimport ne puisse pas réactiver un retrait, une annonce rejetée ou
-- modifier silencieusement une opportunité précédemment approuvée.
-- Les changements de statut déclenchés par la synchronisation sont répercutés
-- automatiquement dans les résultats Premium : seuls les enregistrements
-- status='published' sont lisibles et sélectionnés par l'API.
