# STAGE 0 — Bugs P0 CONFIRMADOS (verificados no código)

> Não mudar arquitetura aqui. Só estabilizar + testar.

## P0-dados (perda/trava)

1. **Sync trava após 1º push** — `packages/sync/SyncProvider.tsx:180-192`
   `isPushing.current=true` mas `finally` libera `isPulling`. Fix: `isPushing.current=false` + debounce 3s no handler `datastore:change:357` + guarda `visibilityState`.
2. **load() apaga tudo em JSON corrompido** — `packages/lib/dataStore.js:113-115`
   `catch { setItem(seed); return seed }`. Fix: quarentena `propmanager-data-v1.corrupt-<ts>` + nunca sobrescrever sem backup.
3. **Restore duplo destrutivo**
   `packages/utils/googleDrive.js:449-474` (setItem puro, ignora journal-db) vs `packages/utils/backupPayload.js:37-86` (clear+put sem tx.done). Fix: unificar em `applyFullBackupPayload` + backup prévio `backup-<ts>` + verificar `tx.done`.
4. **forceResync escreve snake_case no IndexedDB camelCase** — `packages/sync/SyncProvider.tsx:231-238`
   Journal espera `entry_datetime` (`JournalContext.jsx:57-85`). Fix: remover `_toSnakeCase` no IndexedDB, snake só no push.
5. **pull sem paginação + UNIQUE global** — `packages/sync/pull.ts:16-27`, `sql/create_deleted_trades_table.sql:10`
   `select('*')` trunca em 1000; `UNIQUE(platform_trade_id)` deveria ser `(user_id, platform_trade_id)`. Fix: `.range()` + migration SQL + RLS completo.

## P0-financeiro (número mente)

6. **recalc ignora multi-conta** — `packages/lib/dataStore.js:301` filtra só `t.accountId`, ignora `t.accounts[]`. Fix: somar rateio por `weights`.
7. **computeSplit ignora peso** — `packages/lib/dataStore.js:318-320` `amount/n`. Fix: ponderar por `defaultWeight` (fallback 1).
8. **ROI goals usa volume (lotes) como denominador.** Separar: Trading Return vs Challenge ROI (payouts/custo) vs Cash-on-Cash. Nunca chamar `payouts/custo` de "ROI" genérico.
9. **Sharpe/RoR inválidos** no Dashboard journal (`returns=net/10000` fixo). Marcar como não-confiável até `02-FINANCIAL_FORMULAS.md` definir.
10. **Payout delete devolve valor errado** (solicited/n em vez de net por split) + `Math.max(...,0)` esconde erro. Fix: reverter pelo `splitByAccount.net` real.

## P0-segurança/higiene

11. **API key Google hardcoded + .env commitado** — `packages/utils/googleDrive.js:6-7`, `main-app/.env`, `.gitignore:3` só ignora `/.env` raiz. Fix: env Netlify + `**/.env*` + rotacionar chave.
12. **Bridge CORS * sem auth + http inoperante em https** — `quantower-bridge/QuantowerBridge.cs:390-397`, `packages/utils/adapters/quantowerAdapter.js:8-11`. Fix: `X-Bridge-Token` + doc `AllowExternal:false` default + desabilitar auto-sync se `https + bridge http`.
13. **TradeTable paginação dupla** — `TradeTable.tsx:62-134` header 10 vs dados 25. Fix: fonte única + reset page em filtro.
14. **genMockTrades em prod** mascara "sem dados". Remover fallback mock em prod.
15. **Timezone ingênuo** (`split('T')`, sem segundos/Z) quebra `calculateDuration` com trades Quantower. Fix: `date-fns` + ISO com offset.

## Critério de saída do Stage 0

- [ ] Nenhum item acima aberto
- [ ] Teste caracterizando comportamento atual antes de cada fix financeiro
- [ ] Backup pré-restore + quarentena testados manualmente
