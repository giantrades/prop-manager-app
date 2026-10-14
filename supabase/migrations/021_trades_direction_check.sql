-- 021 — Corrige a CHECK constraint legada de trades.direction.
--
-- CAUSA DA NUVEM VAZIA (celular sem trades/contas):
--   A tabela `trades` em produção veio do schema LEGADO e carrega
--   `trades_direction_check`, que só aceita os valores antigos `'Long' | 'Short'`
--   (ver `packages/supabase/client.ts`: `direction: 'Long' | 'Short'`).
--   O app-db v3 grava o canônico MINÚSCULO `'long' | 'short'` (TradeDirection,
--   `packages/lib/db/types.ts`). Como a migration 008 só recria uma tabela quando ela
--   está VAZIA, a tabela `trades` (que já tinha linhas legadas) manteve a constraint
--   velha. Resultado: TODO upsert de trade falha com 23514
--   (`... violates check constraint "trades_direction_check"`) e nada de trades
--   chega ao Supabase — um aparelho novo (celular) puxa a nuvem vazia.
--
-- Ação: normaliza os valores legados para o canônico minúsculo, remove a constraint
-- antiga e recria alinhada ao domínio do app. Idempotente e não destrutiva para dados
-- (apenas normaliza a CAIXA de `direction`).

-- 1. Normaliza para 'long'/'short' (mesma regra de csvImport.normalizeDirection).
--    Comparação SENSÍVEL à caixa de propósito: 'Long'/'Short' também são convertidos.
update public.trades
   set direction = case
     when lower(btrim(coalesce(direction, ''))) in ('short', 'sell', 'venda', 'sell-side', 's') then 'short'
     else 'long'
   end
 where direction is null
    or direction not in ('long', 'short');

-- 2. Remove a constraint legada (qualquer definição).
alter table public.trades drop constraint if exists trades_direction_check;

-- 3. Recria alinhada ao app-db v3 (minúsculo).
alter table public.trades
  add constraint trades_direction_check check (direction in ('long', 'short'));
