# STAGE 2 — Tasks (construir o novo, mobile-first)

> Status: **Fase 1 concluída** — código em `packages/lib/db/*`, testes em
> `packages/lib/db/__tests__/*`. Cadeia `Trade->Wallet` verde, 2 payouts importados,
> 2 abas sem drift. `pnpm build:all` verde.

- [x] T2.0 `app-db v3` (IndexedDB) com stores: accounts, prop_extensions, transactions, positions, trades, payouts, goals, tax_records, snapshots_networth, firm_costs, meta
- [x] T2.1 `DataService` único writer + repositórios por entidade + `events.js` central (payload exato do contrato)
- [x] T2.2 `DataChainEngine` + testes unitários (`Trade->Ledger->Equity->Eligibility->Wallet`) + teste DD trailing vs daily
- [x] T2.3 `runDestructiveWrite()` + `dateUtils.ts` + `isEntryFill()` único (dedup em 5 arquivos -> 1)
- [x] T2.4 Sync Engine: push debounce 3s + batch 500 + `resolveConflict` Opção B (campo financeiro nunca merge automático) + `.range()` + `sql/001_init.sql` (`UNIQUE(user_id, platform_trade_id)`, RLS)
- [x] T2.5 `navigator.locks` multi-tab + `BroadcastChannel` único (module scope) + teste 2 abas
- [x] T2.6 **Importador opcional de payouts** (lê os 2 payouts atuais -> `Transaction payout_in/fee` + `Payout` seed)
- [x] T2.7 Netlify: frozen-lockfile, limpar `dist/` no `merge-builds.js`, remover `package-lock.json`, deps alinhadas

## Resumo do que foi entregue (Data Engine novo)

| Módulo | Arquivo | Papel |
|---|---|---|
| `app-db v3` | `db/appDb.ts` | Abre/cria IndexedDB `app-db` v3, 11 stores + índices compostos (range query por data) |
| Storage | `db/adapter.ts` | `DbAdapter` (IndexedDb p/ produção + Memory p/ teste, compartilhável entre abas) |
| Tipos | `db/types.ts` | Domain types camelCase (Account, PropExtension, Transaction, Trade, Payout...) |
| Events | `db/events.ts` | `EventBus` injetável + payload exato do contrato + BroadcastChannel único (module scope) |
| DataService | `db/DataService.ts` | Único writer (stamp `updatedAt/deviceId/version` + evento). Proibido saldo direto |
| Repositórios | `db/repositories.ts` | 1 por entidade (accountsRepo, tradesRepo, transactionsRepo...) |
| DataChainEngine | `db/DataChainEngine.ts` | Trade->Ledger->Equity->Eligibility->Wallet. `risk:warning` |
| Fórmulas | `db/financialFormulas.ts` | Única implementação (PnL, R, equity derivado, DD max/trailing/daily, PF, consistency) |
| runDestructiveWrite | `db/runDestructiveWrite.ts` | snapshot->try->clear+put->restore. Proibido `clear()` fora dele |
| dateUtils | `db/dateUtils.ts` | Central de data (sem `split('T')`), fuso da firm p/ dailyDD |
| isEntryFill | `db/isEntryFill.ts` | Único util (dedup dos 5 arquivos antigos) |
| Importador | `db/importPayouts.ts` | Lê `propmanager-data-v1` -> `Payout` seed + `Transaction` payout_in/fee |
| Sync Engine | `db/syncEngine.ts` | debounce 3s + batch 500 + `resolveConflict` Opção B + `.range()`/`pullAllPages` |
| Multi-tab | `db/multiTab.ts` | `navigator.locks` + `withLock` + coordenador multi-tab |
| SQL | `sql/001_init.sql` | `deleted_trades` `UNIQUE(user_id, platform_trade_id)` + RLS + tabelas v3 |

## Gate / DoD da Fase 1 — confirmado

- [x] Cadeia `Trade->Wallet` verde (teste `DataChainEngine.test.ts`)
- [x] 2 payouts importados (teste `importPayouts.test.ts`)
- [x] 2 abas sem drift (<3s) (teste `multiTab.test.ts`)
- [x] Mobile-first: schema + eventos + componentes pensados para PWA 360px + offline
- [x] `pnpm build:all` verde

> Nota: a Fase 1 **não** constrói telas de produto. `app-db v3` é consumido pelas
> Fases 2/3/4 via `import { DataService, DataChainEngine } from '@apps/lib/db'`.
