-- Les annonces importées (import_source non nul) ne sont visibles que par les comptes premium,
-- y compris par le compte propriétaire technique de l'import (compte gratuit).
drop policy if exists missions_read_authorized on public.offrya_missions;
create policy missions_read_authorized on public.offrya_missions
  for select to authenticated
  using (
    (owner_id = (select auth.uid()) and import_source is null)
    or (
      ((status = 'open' and expires_at > now()) or selected_pro_id = (select auth.uid()))
      and (select offrya_private.has_active_professional_access())
    )
  );
