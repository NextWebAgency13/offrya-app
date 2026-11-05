-- OFFRYA: align BOAMP/TED alert visibility with the same Premium authorization
-- already used for mission discovery and private tender tracking.
-- Corrects a production policy drift: paid professionals could read alerts,
-- while expressly authorized, non-expired Premium QA accounts could not.
--
-- Keep the per-user boundary, email/session/identity checks inside the existing
-- offrya_private.has_active_professional_access() function. No user-editable
-- metadata, no public grants, no service-role exposure to the browser.
-- The temporary entitlement remains time-limited and never becomes a subscription.
--
-- Intentionally preserve existing table and column-level grants:
-- authenticated has SELECT and UPDATE(seen_at) only; anon has no access.

alter table public.offrya_tender_alerts enable row level security;

drop policy if exists offrya_tender_alerts_read on public.offrya_tender_alerts;
create policy offrya_tender_alerts_read
 on public.offrya_tender_alerts for select to authenticated
 using (
  user_id = (select auth.uid())
  and (select offrya_private.has_active_professional_access())
 );

drop policy if exists offrya_tender_alerts_seen on public.offrya_tender_alerts;
create policy offrya_tender_alerts_seen
 on public.offrya_tender_alerts for update to authenticated
 using (
  user_id = (select auth.uid())
  and (select offrya_private.has_active_professional_access())
 )
 with check (
  user_id = (select auth.uid())
  and (select offrya_private.has_active_professional_access())
 );
