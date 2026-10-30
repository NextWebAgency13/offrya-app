-- OFFRYA : retrait non destructif des fonctionnalités de devis et suivi des contrats.
-- Les anciennes tables restent présentes, mais invisibles/inaccessibles depuis les clients REST.
-- Ne pas DROP les tables tant que le propriétaire n'a pas demandé leur suppression.
revoke select,insert,update,delete on public.offrya_quotes from authenticated,anon;
revoke select,insert,update,delete on public.offrya_contracts from authenticated,anon;
revoke execute on function public.offrya_decide_quote(uuid,boolean) from authenticated,anon,public;
revoke execute on function public.offrya_set_contract_status(uuid,text) from authenticated,anon,public;
revoke execute on function offrya_private.decide_quote(uuid,boolean) from authenticated,anon,public;
revoke execute on function offrya_private.set_contract_status(uuid,text) from authenticated,anon,public;
