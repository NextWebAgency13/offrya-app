-- OFFRYA Web Push. No browser access to this table, not even its owner.
-- Activated only after explicit browser permission and server-side registration.
create extension if not exists pg_net with schema extensions;

create table if not exists public.offrya_push_subscriptions (
 endpoint text primary key check(length(endpoint) between 20 and 2048 and left(endpoint,8)='https://'),
 user_id uuid not null references auth.users(id) on delete cascade,
 p256dh text not null check(length(p256dh) between 80 and 160),
 auth text not null check(length(auth) between 16 and 160),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists offrya_push_subscriptions_user on public.offrya_push_subscriptions(user_id);

alter table public.offrya_push_subscriptions enable row level security;
revoke all on public.offrya_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.offrya_push_subscriptions to service_role;

-- This internal trigger never transmits message content, tokens or subscriptions.
-- The webhook secret is stored separately in Supabase Vault, never this migration.
-- A SHA-256 HMAC signature (not the secret) crosses the pg_net request queue.
create or replace function offrya_private.notify_message_web_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
 push_recipient uuid;
 secret text;
 issued bigint;
 signature text;
begin
 select case when new.sender_id=c.client_id then c.professional_id
             when new.sender_id=c.professional_id then c.client_id end
 into push_recipient
 from public.offrya_conversations c where c.id=new.conversation_id;
 if push_recipient is null then return new; end if;
 if not exists (select 1 from public.offrya_push_subscriptions s where s.user_id=push_recipient) then return new; end if;
 select decrypted_secret into secret from vault.decrypted_secrets
 where name='offrya_push_webhook_secret' limit 1;
 if secret is null or length(secret)<32 then return new; end if;
 issued := floor(extract(epoch from clock_timestamp()))::bigint;
 signature := encode(extensions.hmac(
  convert_to(new.id::text||':'||issued::text,'UTF8'),
  convert_to(secret,'UTF8'),'sha256'),'hex');
 perform net.http_post(
  url:='https://offrya-app.onrender.com/api/push/message',
  body:=jsonb_build_object('message_id',new.id::text,'timestamp',issued),
  headers:=jsonb_build_object('Content-Type','application/json','x-offrya-push-signature',signature),
  timeout_milliseconds:=90000
 );
 return new;
exception when others then
 raise warning 'OFFRYA Web Push webhook cannot be queued (event only): %', sqlstate;
 return new;
end;
$$;
revoke all on function offrya_private.notify_message_web_push() from public, anon, authenticated;

drop trigger if exists offrya_message_web_push on public.offrya_messages;
create trigger offrya_message_web_push
after insert on public.offrya_messages
for each row execute function offrya_private.notify_message_web_push();
