-- Identifiant de l'annonce d'origine pour les missions importées automatiquement
-- (déjà appliqué sur le projet Supabase) : anti-doublon fiable et suivi pour le nettoyage
-- des annonces disparues. Seul le compte d'import peut renseigner ces colonnes.
alter table public.offrya_missions
  add column if not exists import_source text,
  add column if not exists import_source_id text;

alter table public.offrya_missions drop constraint if exists offrya_missions_import_source_chk;
alter table public.offrya_missions add constraint offrya_missions_import_source_chk check (
  (import_source is null and import_source_id is null)
  or (import_source in ('leboncoin','paruvendu','vivastreet')
      and import_source_id ~ '^[0-9A-Za-z]{6,40}$'
      and owner_id = '86e8b1e9-d11b-4aa9-b6b2-f906cf6027c6'::uuid)
);

-- Reprise de l'existant à partir du lien d'origine placé en pied de description.
update public.offrya_missions set
  import_source = 'leboncoin',
  import_source_id = substring(description from 'leboncoin\.fr/ad/[^/\s]+/([0-9]+)')
where owner_id = '86e8b1e9-d11b-4aa9-b6b2-f906cf6027c6'::uuid
  and import_source is null
  and description ~ 'leboncoin\.fr/ad/[^/\s]+/[0-9]+';

update public.offrya_missions set
  import_source = 'paruvendu',
  import_source_id = substring(description from '([0-9]{6,}A1KLTR[0-9]+)')
where owner_id = '86e8b1e9-d11b-4aa9-b6b2-f906cf6027c6'::uuid
  and import_source is null
  and description ~ '[0-9]{6,}A1KLTR[0-9]+';

create unique index if not exists offrya_missions_import_source_uidx
  on public.offrya_missions (import_source, import_source_id)
  where import_source is not null;
