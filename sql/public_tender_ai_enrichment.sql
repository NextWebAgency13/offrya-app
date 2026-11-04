-- REVIEW MIGRATION: DO NOT RUN ON PRODUCTION WITHOUT APPROVAL.
-- Cache AI analysis of PUBLIC notice data, once per canonical notice and not once
-- per professional. Public catalogue is NOT directly readable by anon/auth users.
begin;
create table if not exists public.offrya_public_tender_digest (
 digest_key text primary key check (digest_key ~ '^[0-9a-f]{64}$'),
 title text not null,
 buyer text,
 first_source text not null,
 official_url text not null check (official_url like 'https://%'),
 published_at timestamptz,
 deadline timestamptz,
 departments text,
 ai_summary text not null,
 ai_category text not null check (ai_category in
   ('Bâtiment','Espaces verts','Nettoyage','Informatique','Transport',
    'Restauration & Hôtellerie','Bien-être & Beauté','Autres')),
 ai_location text,
 ai_budget_eur numeric(15,2),
 ai_model text,
 ai_status text not null default 'completed',
 analyzed_at timestamptz not null default now()
);
alter table public.offrya_public_tender_digest enable row level security;
revoke all on public.offrya_public_tender_digest from public,anon,authenticated;
-- No direct read/write policy. Only the server-side trusted cron service role
-- can access this cache. Do not publish the service key to the browser.
alter table public.offrya_tender_alerts
 add column if not exists digest_key text,
 add column if not exists published_at timestamptz,
 add column if not exists ai_summary text,
 add column if not exists ai_category text,
 add column if not exists ai_location text,
 add column if not exists ai_budget_eur numeric(15,2),
 add column if not exists ai_status text;
create index if not exists offrya_tender_alerts_daily_premium_idx
 on public.offrya_tender_alerts(user_id,detected_at desc)
 where deadline is not null;
create index if not exists offrya_public_tender_digest_recent_idx
 on public.offrya_public_tender_digest(analyzed_at desc);
-- Existing offrya_tender_alerts RLS is preserved: subscriber + verified
-- representative only. The cron handles enrichment and official links.
commit;
