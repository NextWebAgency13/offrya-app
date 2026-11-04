-- OFFRYA official public-opportunity alerts (BOAMP / TED).
-- Service-role inserts only. No temporary QA entitlement bypass.
alter table public.offrya_tender_alerts
 add column if not exists source text not null default 'BOAMP'
 constraint offrya_tender_alerts_source_check check (source in ('BOAMP','TED'));
create index if not exists offrya_tender_alerts_source_unread_idx
 on public.offrya_tender_alerts(user_id,source,detected_at desc)
 where seen_at is null;
alter table public.offrya_tender_alerts enable row level security;
revoke all on public.offrya_tender_alerts from public,anon,authenticated;
grant select on public.offrya_tender_alerts to authenticated;
grant update(seen_at) on public.offrya_tender_alerts to authenticated;
drop policy if exists offrya_tender_alerts_read on public.offrya_tender_alerts;
create policy offrya_tender_alerts_read on public.offrya_tender_alerts for select to authenticated
 using (user_id=(select auth.uid()) and (
 exists (
  select 1 from public.offrya_profiles p
  join public.offrya_premium_requests v on v.user_id=p.id
  join public.offrya_premium_subscriptions s on s.user_id=p.id
  where p.id=(select auth.uid()) and p.role='pro'
   and v.status='verified' and v.representative_kind='dirigeant'
   and v.registry_name_matched is true and v.registry_match_checked_at is not null
   and v.registry_match_source in ('official_search_rne','inpi_rne_review')
   and v.identity_live_verified is true and v.presence_verified_at is not null
   and v.presence_method='stripe_selfie'
   and v.identity_status='verified' and v.identity_verified_at is not null
   and v.authority_status='verified' and v.authority_verified_at is not null
   and v.authority_review_method='registry_representative'
   and s.status='active' and s.paid_through>now()
 )
));
drop policy if exists offrya_tender_alerts_seen on public.offrya_tender_alerts;
create policy offrya_tender_alerts_seen on public.offrya_tender_alerts for update to authenticated
 using (user_id=(select auth.uid()) and (
 exists (
  select 1 from public.offrya_profiles p
  join public.offrya_premium_requests v on v.user_id=p.id
  join public.offrya_premium_subscriptions s on s.user_id=p.id
  where p.id=(select auth.uid()) and p.role='pro'
   and v.status='verified' and v.representative_kind='dirigeant'
   and v.registry_name_matched is true and v.registry_match_checked_at is not null
   and v.registry_match_source in ('official_search_rne','inpi_rne_review')
   and v.identity_live_verified is true and v.presence_verified_at is not null
   and v.presence_method='stripe_selfie'
   and v.identity_status='verified' and v.identity_verified_at is not null
   and v.authority_status='verified' and v.authority_verified_at is not null
   and v.authority_review_method='registry_representative'
   and s.status='active' and s.paid_through>now()
 )
))
 with check (user_id=(select auth.uid()) and (
 exists (
  select 1 from public.offrya_profiles p
  join public.offrya_premium_requests v on v.user_id=p.id
  join public.offrya_premium_subscriptions s on s.user_id=p.id
  where p.id=(select auth.uid()) and p.role='pro'
   and v.status='verified' and v.representative_kind='dirigeant'
   and v.registry_name_matched is true and v.registry_match_checked_at is not null
   and v.registry_match_source in ('official_search_rne','inpi_rne_review')
   and v.identity_live_verified is true and v.presence_verified_at is not null
   and v.presence_method='stripe_selfie'
   and v.identity_status='verified' and v.identity_verified_at is not null
   and v.authority_status='verified' and v.authority_verified_at is not null
   and v.authority_review_method='registry_representative'
   and s.status='active' and s.paid_through>now()
 )
));
