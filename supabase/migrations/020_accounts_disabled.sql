-- Soft-disable de conta (Account.disabled/disabledAt). A conta sai das listas, pickers e
-- conexões (bridge) mas o REGISTRO permanece — referências antigas (payouts/trades) mostram
-- o nome em "ghost". Sem estas colunas o sync genérico (camelToSnake) falharia no upsert
-- com "column disabled does not exist". Aditivo e idempotente.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
