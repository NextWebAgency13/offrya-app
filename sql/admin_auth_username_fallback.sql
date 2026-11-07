-- Follow-up to sql/signup_unique_pseudonyms.sql
-- Allow Supabase Auth administrator-created and invited accounts without an
-- interactive nickname while keeping public OFFRYA signup checks and uniqueness.
create or replace function offrya_private.reserve_signup_username()
returns trigger language plpgsql security definer set search_path=''
as $$
declare chosen text;
begin
 chosen := nullif(btrim(new.raw_user_meta_data ->> 'offrya_username'),'');
 if chosen is null then
   chosen := 'user_' || left(replace(new.id::text,'-',''),25);
 end if;
 if chosen !~ '^[A-Za-z0-9_]{3,30}$' then
   raise exception 'Invalid OFFRYA username' using errcode='23514';
 end if;
 insert into public.offrya_profiles(id,role,display_name,city,specialty)
 values(new.id,'client',chosen,'','');
 return new;
end;
$$;
