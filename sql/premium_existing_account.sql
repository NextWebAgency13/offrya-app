-- Migration complémentaire pour comptes Client existants.
-- Ne jamais donner l'accès sans statut verified signé par un administrateur.
drop policy if exists premium_request_professional on public.offrya_premium_requests;
drop policy if exists premium_request_account_holder on public.offrya_premium_requests;
create policy premium_request_account_holder on public.offrya_premium_requests for insert to authenticated
with check ((select auth.uid())=user_id and status='pending' and premium_until is null and reviewed_at is null
 and exists(select 1 from public.offrya_profiles p where p.id=(select auth.uid())));
-- Fonction de notification : voir la version mise à jour dans premium_priority_alerts.sql.
-- Donne les droits de répondre aux missions à une entreprise vérifiée dont Premium est actif.
drop policy if exists conversation_open on public.offrya_conversations;
create policy conversation_open on public.offrya_conversations for insert to authenticated
with check (
 professional_id=(select auth.uid()) and client_id<>(select auth.uid())
 and (exists(select 1 from public.offrya_profiles p where p.id=(select auth.uid()) and p.role='pro')
   or exists(select 1 from public.offrya_premium_requests pr
     left join public.offrya_premium_subscriptions s on s.user_id=pr.user_id
     where pr.user_id=(select auth.uid()) and pr.status='verified'
     and (pr.premium_until>now() or (s.status='active' and s.paid_through>now()))))
 and exists(select 1 from public.offrya_missions m where m.id=mission_id and m.owner_id=client_id and m.status='open'));
