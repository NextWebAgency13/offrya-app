-- OFFRYA usernames, 2026-11-03.
-- Preserve existing display_name values; prevent case-insensitive duplicates.
create unique index if not exists offrya_profiles_username_unique
 on public.offrya_profiles (lower(display_name));

-- Public availability lookup; the unique index is the final authority under concurrency.
create or replace function public.offrya_username_available(p_username text)
returns boolean language sql stable security definer set search_path=''
as $$
 select p_username ~ '^[A-Za-z0-9_]{3,30}$'
   and not exists (
     select 1 from public.offrya_profiles p
     where lower(p.display_name)=lower(p_username)
   );
$$;
revoke all on function public.offrya_username_available(text) from public;
grant execute on function public.offrya_username_available(text) to anon,authenticated;

-- Reserve the username immediately when an Auth account is created.
-- Existing users are preserved; every newly created Auth account must choose a username.
create or replace function offrya_private.reserve_signup_username()
returns trigger language plpgsql security definer set search_path=''
as $$
declare chosen text;
begin
 chosen := new.raw_user_meta_data ->> 'offrya_username';
 if chosen is null then
   raise exception 'OFFRYA username required at signup' using errcode='23514';
 end if;
 if chosen !~ '^[A-Za-z0-9_]{3,30}$' then
   raise exception 'Invalid OFFRYA username' using errcode='23514';
 end if;
 insert into public.offrya_profiles(id,role,display_name,city,specialty)
 values(new.id,'client',chosen,'','');
 return new;
end;
$$;
drop trigger if exists offrya_signup_username on auth.users;
create trigger offrya_signup_username after insert on auth.users
 for each row execute function offrya_private.reserve_signup_username();

-- A username chosen at signup cannot be silently changed through the profile API.
create or replace function offrya_private.prevent_username_change()
returns trigger language plpgsql set search_path=''
as $$
begin
 if new.display_name is distinct from old.display_name then
   raise exception 'Le pseudonyme ne peut pas être modifié depuis le profil.' using errcode='23514';
 end if;
 return new;
end;
$$;
drop trigger if exists offrya_immutable_username on public.offrya_profiles;
create trigger offrya_immutable_username before update of display_name on public.offrya_profiles
 for each row execute function offrya_private.prevent_username_change();
