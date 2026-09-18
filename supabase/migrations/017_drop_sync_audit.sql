-- 017 — Remove a tabela de auditoria usada na 016 (ela era só para conferir o schema e
-- estava legível por anon). O retrato do schema já foi verificado: nenhuma coluna uuid
-- restante além de `user_id` (login).
drop table if exists public._sync_audit;
