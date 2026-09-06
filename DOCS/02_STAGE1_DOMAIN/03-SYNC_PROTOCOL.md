# STAGE 1 — Sync Protocol

## Push/Pull

- Push debounced 3s, batch upsert 500/chunk (`push.ts` hoje N+1 por trade). Pull com `.range()` (hoje trunca 1000).
- Conflito: `resolveConflict` real com `updatedAt+version+deviceId` (`sync/conflict.ts` hoje morto). Crítico: merge campo-a-campo, nunca LWW de blob.
- `deleted_trades (user_id, platform_trade_id)` único. Falta DDL/RLS demais tabelas -> `sql/001_init.sql`.
- Realtime só se visível; hidden = polling 1h + `focus pull`. Sem `datastore:change` em loop.

## Multi-tab

Trocar locks `localStorage` (`platformManager.js:368-380`) por `navigator.locks` ou leader election `BroadcastChannel`. Documentar sequência `save->event->push->save` que hoje gera amplificação.

## Restore

Transacional: backup atual -> aplicar -> verificar `tx.done` -> evento. Nunca `clear()` sem verificação (`backupPayload.js:63-75` hoje apaga antes).
