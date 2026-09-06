# STAGE 0 — Tasks (ordem de execução)

> Agente 0 executa só isto. Proibido: mudar schema, criar IndexedDB v3, fundir SPAs, criar telas novas.

## Semana 1 — Trava/dados

- [ ] T0.1 Fix `isPushing` finally + debounce push 3s (`SyncProvider.tsx:178-202,357`)
- [ ] T0.2 Quarentena `load()` corrupt (`dataStore.js:46-117`) + teste: corromper JSON -> seed NÃO sobrescreve, backup criado
- [ ] T0.3 Unificar restore em `applyFullBackupPayload` + backup prévio + remover `restoreFromDrive` direto (`googleDrive.js:449-474`)
- [ ] T0.4 Fix `forceResync` snake_case (`SyncProvider.tsx:231-238`) + teste reload Journal
- [ ] T0.5 Paginar `pull.ts` + migration `UNIQUE(user_id,platform_trade_id)` + `sql/001_init.sql` (tabelas+RLS faltantes)
- [ ] T0.6 Segredos: `git rm main-app/.env`, `.gitignore` -> `**/.env*`, mover para Netlify env, rotacionar chave Google

## Semana 2 — Verdade financeira mínima

- [ ] T0.7 Testes caracterizando `recalc`, `computeSplit`, payout create/update/delete, ROI goals (só documentam atual)
- [ ] T0.8 Fix `recalc` multi-conta + `computeSplit` com `defaultWeight`
- [ ] T0.9 Fix payout delete (reverter por `splitByAccount.net`) + remover `Math.max(...,0)` mudo (logar divergência)
- [ ] T0.10 Remover `genMockTrades` prod + marcar Sharpe/RoR como `UNRELIABLE` na UI até Stage 1
- [ ] T0.11 Fix TradeTable paginação única + `useIsMobile` com listener + rotas lowercase + DEV URLs (`5173/5174`)
- [ ] T0.12 Bridge: `X-Bridge-Token`, `AllowExternal:false`, desabilitar auto-sync em `https+http`

## DoD

- `pnpm build:all` verde, nenhum P0 em `01-bugs-P0.md` aberto, `02-monitoramento.md` ativo.
