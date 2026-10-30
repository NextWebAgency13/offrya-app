-- OFFRYA 4.0 — Installation sur un projet Supabase OFFRYA NEUF et DÉDIÉ.
-- Ne jamais exécuter dans le projet NextWeb Agency.
-- Aucun paiement ni commission en mode bêta.
create extension if not exists pgcrypto;
-- Les fonctions elevées sont dans un schéma NON exposé à l'API REST.
create schema if not exists offrya_private;
revoke all on schema offrya_private from public, anon, authenticated;
grant usage on schema offrya_private to authenticated;


create table public.offrya_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('client','pro')),
 display_name text not null check(char_length(trim(display_name)) between 2 and 100),
 city text not null default '' check(char_length(city)<=90),
 specialty text not null default '' check(char_length(specialty)<=100),
 created_at timestamptz not null default now()
);
create table public.offrya_missions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(trim(title)) between 8 and 140),
 description text not null check(char_length(trim(description)) between 30 and 5000),
 category text not null check(category in ('Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Autre')),
 department text not null check(department ~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$'),
 city text not null check(char_length(trim(city)) between 2 and 90),
 budget_cents integer check(budget_cents is null or budget_cents between 100 and 100000000),
 status text not null default 'open' check(status in ('open','awarded','closed')),
 created_at timestamptz not null default now(),
 constraint mission_owner_nonnull check(owner_id is not null)
);
create index offrya_missions_find on public.offrya_missions (status,created_at desc);
create index offrya_missions_dept on public.offrya_missions (department, category, created_at desc);
create index offrya_missions_owner on public.offrya_missions (owner_id, created_at desc);


-- Favoris privés des missions, indépendants de la liste des missions publiques.
create table public.offrya_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 mission_id uuid not null references public.offrya_missions(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (user_id,mission_id)
);
create index offrya_favorites_mission on public.offrya_favorites(mission_id);

create table public.offrya_conversations (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.offrya_missions(id) on delete cascade,
 client_id uuid not null references auth.users(id) on delete cascade,
 professional_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique (mission_id, professional_id),
 check(client_id <> professional_id)
);
create index offrya_conv_client on public.offrya_conversations (client_id,created_at desc);
create index offrya_conv_pro on public.offrya_conversations (professional_id,created_at desc);

create table public.offrya_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.offrya_conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(trim(body)) between 1 and 2500),
 created_at timestamptz not null default now()
);
create index offrya_messages_conversation on public.offrya_messages (conversation_id,created_at);

create table public.offrya_quotes (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null unique references public.offrya_conversations(id) on delete cascade,
 professional_id uuid not null references auth.users(id) on delete cascade,
 amount_cents integer not null check(amount_cents between 100 and 100000000),
 details text not null check(char_length(trim(details)) between 10 and 3000),
 status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default now()
);
create table public.offrya_contracts (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null unique references public.offrya_missions(id) on delete restrict,
 quote_id uuid not null unique references public.offrya_quotes(id) on delete restrict,
 client_id uuid not null references auth.users(id) on delete restrict,
 professional_id uuid not null references auth.users(id) on delete restrict,
 amount_cents integer not null check(amount_cents between 100 and 100000000),
 status text not null default 'active' check(status in ('active','delivered','completed','cancelled','disputed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index offrya_contracts_client on public.offrya_contracts (client_id,created_at desc);
create index offrya_contracts_pro on public.offrya_contracts (professional_id,created_at desc);

create table public.offrya_alert_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 missions_enabled boolean not null default false,
 messages_enabled boolean not null default false,
 department text not null default '' check(department = '' or department ~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$'),
 category text not null default '' check(category = '' or category in ('Nettoyage','Espaces verts','Bâtiment','Informatique','Transport','Autre')),
 missions_consented_at timestamptz,
 messages_consented_at timestamptz,
 missions_revoked_at timestamptz,
 messages_revoked_at timestamptz,
 updated_at timestamptz not null default now()
);
-- Audit privé, non exposé par la Data API aux utilisateurs.
create table public.offrya_consent_audit (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 consent_type text not null check(consent_type in ('missions','messages')),
 enabled boolean not null,
 changed_at timestamptz not null default now()
);
create table public.offrya_alert_deliveries (
 user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check(event_type in ('mission','message')),
 event_id uuid not null,
 status text not null default 'pending' check(status in ('pending','sent')),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 primary key(user_id,event_type,event_id)
);

create table public.offrya_waitlist (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);

-- RLS et permissions minimales, sans rôle SQL exposé aux tables admin.
alter table public.offrya_profiles enable row level security;
alter table public.offrya_missions enable row level security;
alter table public.offrya_favorites enable row level security;
alter table public.offrya_conversations enable row level security;
alter table public.offrya_messages enable row level security;
alter table public.offrya_quotes enable row level security;
alter table public.offrya_contracts enable row level security;
alter table public.offrya_alert_preferences enable row level security;
alter table public.offrya_consent_audit enable row level security;
alter table public.offrya_alert_deliveries enable row level security;
alter table public.offrya_waitlist enable row level security;
revoke all on public.offrya_profiles, public.offrya_missions, public.offrya_favorites, public.offrya_conversations,
 public.offrya_messages, public.offrya_quotes, public.offrya_contracts, public.offrya_alert_preferences,
 public.offrya_consent_audit, public.offrya_alert_deliveries, public.offrya_waitlist from anon,authenticated;
grant select, insert on public.offrya_profiles to authenticated;
grant update(display_name,city,specialty) on public.offrya_profiles to authenticated;
grant select on public.offrya_missions to anon, authenticated;
grant insert on public.offrya_missions to authenticated;
grant select,insert,delete on public.offrya_favorites to authenticated;
grant select,insert on public.offrya_conversations to authenticated;
grant select,insert on public.offrya_messages to authenticated;
grant select,insert on public.offrya_quotes to authenticated;
grant select on public.offrya_contracts to authenticated;
grant select on public.offrya_alert_preferences to authenticated;
grant insert(user_id,missions_enabled,messages_enabled,department,category) on public.offrya_alert_preferences to authenticated;
grant update(missions_enabled,messages_enabled,department,category) on public.offrya_alert_preferences to authenticated;
grant select, insert, delete on public.offrya_waitlist to authenticated;

create policy profile_read on public.offrya_profiles for select to authenticated using (true);
create policy profile_insert on public.offrya_profiles for insert to authenticated
 with check ((select auth.uid())=id);
create policy profile_update on public.offrya_profiles for update to authenticated
 using ((select auth.uid())=id) with check ((select auth.uid())=id);
-- Évite une récursion RLS entre missions et conversations.
create function offrya_private.is_mission_professional(p_mission_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.offrya_conversations c
where c.mission_id=p_mission_id and c.professional_id=(select auth.uid())) $$;
revoke all on function offrya_private.is_mission_professional(uuid) from public,anon;
grant execute on function offrya_private.is_mission_professional(uuid) to authenticated;
create policy missions_read_public on public.offrya_missions for select to anon,authenticated
using(status='open');
create policy missions_read_members on public.offrya_missions for select to authenticated
using(owner_id=(select auth.uid()) or offrya_private.is_mission_professional(id));
create policy missions_insert on public.offrya_missions for insert to authenticated
 with check(owner_id=(select auth.uid()) and status='open'
  and exists(select 1 from public.offrya_profiles p where p.id=(select auth.uid()) and p.role='client'));
create policy favorites_read on public.offrya_favorites for select to authenticated
 using(user_id=(select auth.uid()));
create policy favorites_insert on public.offrya_favorites for insert to authenticated
 with check(user_id=(select auth.uid()) and exists (
 select 1 from public.offrya_missions m where m.id=mission_id and m.status='open'));
create policy favorites_delete on public.offrya_favorites for delete to authenticated
 using(user_id=(select auth.uid()));
create policy conversation_read on public.offrya_conversations for select to authenticated
 using(client_id=(select auth.uid()) or professional_id=(select auth.uid()));
create policy conversation_open on public.offrya_conversations for insert to authenticated
 with check(professional_id=(select auth.uid()) and client_id<>(select auth.uid()) and
 exists(select 1 from public.offrya_profiles p where p.id=(select auth.uid()) and p.role='pro') and
 exists(select 1 from public.offrya_missions m where m.id=mission_id and m.owner_id=client_id and m.status='open'));
create policy messages_read on public.offrya_messages for select to authenticated
 using(exists(select 1 from public.offrya_conversations c where c.id=conversation_id
  and (c.client_id=(select auth.uid()) or c.professional_id=(select auth.uid()))));
create policy messages_write on public.offrya_messages for insert to authenticated
 with check(sender_id=(select auth.uid()) and exists(select 1 from public.offrya_conversations c
 where c.id=conversation_id and (c.client_id=(select auth.uid()) or c.professional_id=(select auth.uid()))));
create policy quotes_read on public.offrya_quotes for select to authenticated
 using(exists(select 1 from public.offrya_conversations c where c.id=conversation_id
 and (c.client_id=(select auth.uid()) or c.professional_id=(select auth.uid()))));
create policy quotes_insert on public.offrya_quotes for insert to authenticated
 with check(professional_id=(select auth.uid()) and status='pending' and
 exists(select 1 from public.offrya_conversations c join public.offrya_missions m on m.id=c.mission_id
 where c.id=conversation_id and c.professional_id=(select auth.uid()) and m.status='open'));
create policy contracts_read on public.offrya_contracts for select to authenticated
 using(client_id=(select auth.uid()) or professional_id=(select auth.uid()));
create policy preferences_read on public.offrya_alert_preferences for select to authenticated
 using(user_id=(select auth.uid()));
create policy preferences_insert on public.offrya_alert_preferences for insert to authenticated
 with check(user_id=(select auth.uid()));
create policy preferences_update on public.offrya_alert_preferences for update to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy waitlist_read on public.offrya_waitlist for select to authenticated using(user_id=(select auth.uid()));
create policy waitlist_insert on public.offrya_waitlist for insert to authenticated with check(user_id=(select auth.uid()));
create policy waitlist_delete on public.offrya_waitlist for delete to authenticated using(user_id=(select auth.uid()));

-- Trigger : conserver une preuve serveur des changements de préférences (pas les dates soumises par navigateur).
create or replace function offrya_private.offrya_track_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 new.updated_at=now();
 if tg_op='INSERT' or new.missions_enabled is distinct from old.missions_enabled then
  if new.missions_enabled then new.missions_consented_at=now();new.missions_revoked_at=null;
  else new.missions_revoked_at=now();end if;
  insert into public.offrya_consent_audit(user_id,consent_type,enabled) values(new.user_id,'missions',new.missions_enabled);
 end if;
 if tg_op='INSERT' or new.messages_enabled is distinct from old.messages_enabled then
  if new.messages_enabled then new.messages_consented_at=now();new.messages_revoked_at=null;
  else new.messages_revoked_at=now();end if;
  insert into public.offrya_consent_audit(user_id,consent_type,enabled) values(new.user_id,'messages',new.messages_enabled);
 end if;
 return new;
end;$$;
revoke all on function offrya_private.offrya_track_consent() from public,anon,authenticated;
create trigger offrya_consent_change before insert or update on public.offrya_alert_preferences
 for each row execute function offrya_private.offrya_track_consent();

-- Transition atomique d'un devis : acteur client propriétaire de la mission, montant immuable.
create or replace function offrya_private.decide_quote(p_quote_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q record; m record; contract_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Authentification requise';end if;
 select q0.*, c.mission_id, c.client_id, c.professional_id into q
 from public.offrya_quotes q0 join public.offrya_conversations c on c.id=q0.conversation_id
 where q0.id=p_quote_id for update of q0;
 if not found or q.client_id<>auth.uid() then raise exception 'Devis non accessible';end if;
 select * into m from public.offrya_missions where id=q.mission_id for update;
 if q.status<>'pending' or m.status<>'open' then raise exception 'Devis non disponible';end if;
 if not p_accept then
   update public.offrya_quotes set status='rejected' where id=q.id;
   return null;
 end if;
 insert into public.offrya_contracts(mission_id,quote_id,client_id,professional_id,amount_cents)
 values(q.mission_id,q.id,q.client_id,q.professional_id,q.amount_cents) returning id into contract_id;
 update public.offrya_quotes set status='accepted' where id=q.id;
 update public.offrya_quotes set status='rejected' where status='pending' and conversation_id in
  (select id from public.offrya_conversations where mission_id=q.mission_id and id<>q.conversation_id);
 update public.offrya_missions set status='awarded' where id=q.mission_id;
 return contract_id;
end;$$;
revoke all on function offrya_private.decide_quote(uuid,boolean) from public,anon;
grant execute on function offrya_private.decide_quote(uuid,boolean) to authenticated;

create or replace function offrya_private.set_contract_status(p_id uuid,p_status text)
returns text language plpgsql security definer set search_path = '' as $$
declare ctr record;
begin
 if (select auth.uid()) is null then raise exception 'Authentification requise';end if;
 select * into ctr from public.offrya_contracts where id=p_id for update;
 if not found then raise exception 'Contrat introuvable';end if;
 if not ((ctr.status='active' and p_status='delivered' and ctr.professional_id=auth.uid()) or
 (ctr.status='delivered' and p_status='completed' and ctr.client_id=auth.uid()) or
 (ctr.status='active' and p_status='cancelled' and ctr.client_id=auth.uid()) or
 (ctr.status in ('active','delivered') and p_status='disputed' and ctr.client_id=auth.uid()))
 then raise exception 'Transition non autorisée';end if;
 update public.offrya_contracts set status=p_status,updated_at=now() where id=p_id;
 return p_status;
end;$$;
revoke all on function offrya_private.set_contract_status(uuid,text) from public,anon;
grant execute on function offrya_private.set_contract_status(uuid,text) to authenticated;
-- À auditer avant production : vérifier que le rôle propriétaire de SECURITY DEFINER est bien contrôlé.

-- Clôture volontaire : uniquement propriétaire, mission encore ouverte.
create or replace function offrya_private.close_mission(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is null then raise exception 'Authentification requise';end if;
 update public.offrya_missions set status='closed'
 where id=p_id and owner_id=auth.uid() and status='open';
 if not found then raise exception 'Mission inaccessible ou déjà attribuée';end if;
 update public.offrya_quotes set status='rejected' where status='pending' and conversation_id in
 (select id from public.offrya_conversations where mission_id=p_id);
 return true;
end;$$;
revoke all on function offrya_private.close_mission(uuid) from public,anon;
grant execute on function offrya_private.close_mission(uuid) to authenticated;

-- Une seule notification par jour et par compte, y compris en cas d'exécution répétée du cron.
create table public.offrya_digest_runs (
 user_id uuid not null references auth.users(id) on delete cascade,
 digest_day date not null,
 status text not null default 'pending' check(status in ('pending','sent')),
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(user_id,digest_day)
);
alter table public.offrya_digest_runs enable row level security;
revoke all on public.offrya_digest_runs from anon,authenticated;

-- Limites de publication et d'envoi : protections anti-abus minimales pour la bêta.
-- Réévaluer avant lancement ouvert, compléter par contrôle CAPTCHA et modération.
create or replace function offrya_private.offrya_limit_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 if tg_table_name='offrya_missions' then
  select count(*) into n from public.offrya_missions where owner_id=new.owner_id and created_at>now()-interval '1 day';
  if n>=6 then raise exception 'Limite de 6 missions par 24 heures';end if;
 elsif tg_table_name='offrya_conversations' then
  select count(*) into n from public.offrya_conversations where professional_id=new.professional_id and created_at>now()-interval '1 day';
  if n>=15 then raise exception 'Limite de 15 nouvelles discussions par 24 heures';end if;
 elsif tg_table_name='offrya_messages' then
  select count(*) into n from public.offrya_messages where sender_id=new.sender_id and created_at>now()-interval '1 hour';
  if n>=40 then raise exception 'Limite de 40 messages par heure';end if;
 end if;
 return new;
end;$$;
revoke all on function offrya_private.offrya_limit_rate() from public,anon,authenticated;
create trigger offrya_missions_rate before insert on public.offrya_missions for each row execute function offrya_private.offrya_limit_rate();
create trigger offrya_conversations_rate before insert on public.offrya_conversations for each row execute function offrya_private.offrya_limit_rate();
create trigger offrya_messages_rate before insert on public.offrya_messages for each row execute function offrya_private.offrya_limit_rate();

-- Wrappers RPC exposés sans privilèges élevés ; logique transactionnelle privée ci-dessus.
create function public.offrya_decide_quote(p_quote_id uuid,p_accept boolean)
returns uuid language sql security invoker set search_path = ''
as $$ select offrya_private.decide_quote(p_quote_id,p_accept) $$;
revoke all on function public.offrya_decide_quote(uuid,boolean) from public,anon;
grant execute on function public.offrya_decide_quote(uuid,boolean) to authenticated;

create function public.offrya_set_contract_status(p_id uuid,p_status text)
returns text language sql security invoker set search_path = ''
as $$ select offrya_private.set_contract_status(p_id,p_status) $$;
revoke all on function public.offrya_set_contract_status(uuid,text) from public,anon;
grant execute on function public.offrya_set_contract_status(uuid,text) to authenticated;

create function public.offrya_close_mission(p_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select offrya_private.close_mission(p_id) $$;
revoke all on function public.offrya_close_mission(uuid) from public,anon;
grant execute on function public.offrya_close_mission(uuid) to authenticated;

-- Indexes supplémentaires indiqués par les conseils de performance après installation.
create index offrya_consent_audit_user on public.offrya_consent_audit(user_id);
create index offrya_messages_sender on public.offrya_messages(sender_id);
create index offrya_quotes_pro on public.offrya_quotes(professional_id);


-- OFFRYA : retrait non destructif des fonctionnalités de devis et suivi des contrats.
-- Les anciennes tables restent présentes, mais invisibles/inaccessibles depuis les clients REST.
-- Ne pas DROP les tables tant que le propriétaire n'a pas demandé leur suppression.
revoke select,insert,update,delete on public.offrya_quotes from authenticated,anon;
revoke select,insert,update,delete on public.offrya_contracts from authenticated,anon;
revoke execute on function public.offrya_decide_quote(uuid,boolean) from authenticated,anon,public;
revoke execute on function public.offrya_set_contract_status(uuid,text) from authenticated,anon,public;
revoke execute on function offrya_private.decide_quote(uuid,boolean) from authenticated,anon,public;
revoke execute on function offrya_private.set_contract_status(uuid,text) from authenticated,anon,public;
