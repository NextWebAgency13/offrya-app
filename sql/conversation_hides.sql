-- Masquer un échange pour un seul participant (déjà appliqué sur le projet Supabase).
-- Rien n'est supprimé : l'autre participant conserve la conversation et ses messages.
-- Un nouveau message réaffiche automatiquement l'échange pour la personne qui l'avait retiré.
create table if not exists public.offrya_conversation_hides (
  conversation_id uuid not null references public.offrya_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists offrya_conversation_hides_user on public.offrya_conversation_hides (user_id);

alter table public.offrya_conversation_hides enable row level security;
revoke all on public.offrya_conversation_hides from anon, authenticated;
grant select, insert, delete on public.offrya_conversation_hides to authenticated;

drop policy if exists conversation_hides_read on public.offrya_conversation_hides;
create policy conversation_hides_read on public.offrya_conversation_hides for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists conversation_hides_insert on public.offrya_conversation_hides;
create policy conversation_hides_insert on public.offrya_conversation_hides for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.offrya_conversations c
      where c.id = offrya_conversation_hides.conversation_id
        and (c.client_id = (select auth.uid()) or c.professional_id = (select auth.uid()))
    )
  );

drop policy if exists conversation_hides_delete on public.offrya_conversation_hides;
create policy conversation_hides_delete on public.offrya_conversation_hides for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function offrya_private.unhide_conversation_on_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.offrya_conversation_hides where conversation_id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists offrya_message_unhide on public.offrya_messages;
create trigger offrya_message_unhide after insert on public.offrya_messages
  for each row execute function offrya_private.unhide_conversation_on_message();
