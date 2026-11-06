-- OFFRYA : opportunités externes issues d'une collecte Leboncoin expressément autorisée.
-- Migration à appliquer MANUELLEMENT après premium_access.sql et ses mises à jour.
-- Ne touche pas à offrya_missions : aucun propriétaire ni compte demandeur simulé.
create table if not exists public.offrya_external_opportunities (
 id uuid primary key default gen_random_uuid(),
 source text not null default 'leboncoin' check(source='leboncoin'),
 source_id text not null check(source_id ~ '^[0-9]{7,12}$'),
 source_url text not null check(source_url ~ '^https://(www\.)?leboncoin\.fr/ad/[a-zA-Z0-9_-]+/[0-9]{7,12}/?$'),
 title text not null check(char_length(trim(title)) between 8 and 140),
 summary text not null check(char_length(trim(summary)) between 15 and 480),
 category text not null check(category in ('Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Restauration & Hôtellerie','Bien-être & Beauté','Autre')),
 department text check(department is null or department ~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$'),
 city text check(city is null or char_length(city)<=90),
 confidence real not null check(confidence between 0 and 1),
 status text not null default 'staged' check(status in ('staged','published','expired','rejected')),
 source_last_seen_at timestamptz not null default now(),
 published_at timestamptz,
 created_at timestamptz not null default now(),
 unique(source,source_id),
 constraint external_publish_must_have_timestamp check(status<>'published' or published_at is not null)
);
create index if not exists offrya_external_published_feed
 on public.offrya_external_opportunities(status,source_last_seen_at desc)
 where status='published';
create index if not exists offrya_external_category_department
 on public.offrya_external_opportunities(category,department,source_last_seen_at desc);

alter table public.offrya_external_opportunities enable row level security;
revoke all on public.offrya_external_opportunities from public,anon,authenticated;
grant select on public.offrya_external_opportunities to authenticated;
grant all on public.offrya_external_opportunities to service_role;

drop policy if exists external_premium_only on public.offrya_external_opportunities;
create policy external_premium_only
 on public.offrya_external_opportunities
 for select to authenticated
 using (status='published' and (select offrya_private.has_active_professional_access()));

-- Aucune policy INSERT/UPDATE/DELETE pour authenticated : seul le backend service_role
-- peut collecter, publier, clôturer ou rejeter une annonce tierce.
-- Aucune insertion dans offrya_missions : ses contraintes d'auteur confirmé restent intactes.
