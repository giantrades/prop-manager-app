# STAGE 1 — Data Contract (schema + eventos + versão)

## Stores IndexedDB v3 (nomes finais)

`app-db v3`: `accounts, transactions, positions, trades, payouts, goals, tax_records, snapshots_networth, meta`
Legado: `propmanager-data-v1` (read-only após migração), `journal-db v2`, `quantower-ledger v1` (depreciar).

## Convenções

- IndexedDB e UI: camelCase. Supabase: snake_case só na borda (push/pull). Proibido snake no IndexedDB (bug `forceResync`).
- Todo registro: `{ id, updatedAt, deviceId, version }`. Sync usa `entityId+updatedAt+deviceId+version`, nunca LWW cego.
- Datas: ISO 8601 com timezone (`date-fns`). Proibido `split('T')` ingênuo.
- Moeda: valor + `currency` + `rate` com timestamp. `rate=0` proibido (zera tudo hoje).

## Eventos (únicos permitidos)

```
datastore:change { timestamp, source }   // mutação local confirmada
sync:pushed / sync:pulled { count }
quantower:synced { count, lastSync } / quantower:error { message }
risk:warning { accountId, level } / goal:completed { goalId }
```

Debounce push 3s, guarda `visibilityState`. `BroadcastChannel('propmanager-datastore')` único (hoje `DriveContext` cria por render).

## Migração v1->v3

1. backup `v1` integral, 2. seed v3, 3. mapear accounts/trades/payouts/goals + `t.accounts[]` + `splitByAccount`, 4. verificar contagens + somas, 5. só então marcar `migrated`. Rollback = restaurar backup.
