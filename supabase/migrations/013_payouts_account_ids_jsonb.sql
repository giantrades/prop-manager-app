-- 013 — payouts.account_ids: uuid[] -> jsonb.
--
-- A tabela remota declarava `account_ids uuid[]`, mas o app grava a lista de ids das
-- contas (TEXT, ex. 'acct-mu5e3csr-dtvf') → o PostgREST devolvia 400
-- ("invalid input syntax for type uuid") e o payout nunca sincronizava.
-- Converte preservando o conteúdo (array -> array JSON de strings).

alter table payouts
  alter column account_ids type jsonb
  using to_jsonb(account_ids);

alter table payouts alter column account_ids set default '[]'::jsonb;
alter table payouts alter column account_ids drop not null;
