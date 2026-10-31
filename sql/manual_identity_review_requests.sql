-- OFFRYA : demandes de vérification d'identité en présence d'un opérateur.
-- Cette table est uniquement une file d'attente : elle ne valide JAMAIS l'identité
-- et ne donne aucun accès aux missions ni aux paiements.
create table if not exists public.offrya_manual_identity_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'requested'
    check (status in ('requested','contacting','scheduled','needs_information','completed','rejected')),
 requested_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid
);
alter table public.offrya_manual_identity_requests enable row level security;
revoke all on public.offrya_manual_identity_requests from public,anon,authenticated;
-- Autoriser seulement les champs non sensibles. Un professionnel ne peut pas
-- définir lui-même son statut ni une approbation de vérification.
grant select (user_id,status,requested_at,updated_at) on public.offrya_manual_identity_requests to authenticated;
grant insert (user_id) on public.offrya_manual_identity_requests to authenticated;
grant all on public.offrya_manual_identity_requests to service_role;
drop policy if exists offrya_manual_identity_owner_read on public.offrya_manual_identity_requests;
create policy offrya_manual_identity_owner_read on public.offrya_manual_identity_requests
 for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists offrya_manual_identity_owner_request on public.offrya_manual_identity_requests;
create policy offrya_manual_identity_owner_request on public.offrya_manual_identity_requests
 for insert to authenticated with check(
  user_id=(select auth.uid())
  and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) is false
  and exists(
   select 1 from public.offrya_profiles p
    join public.offrya_premium_requests v on v.user_id=p.id
   where p.id=(select auth.uid()) and p.role='pro'
      and v.status='pending' and v.identity_status <> 'verified'
  )
);
comment on table public.offrya_manual_identity_requests is
 'Demandes administratives uniquement. Ne valide aucune identité, aucun mandat et aucun droit professionnel.';
