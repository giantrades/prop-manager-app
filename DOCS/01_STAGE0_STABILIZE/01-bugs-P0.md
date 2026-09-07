# STAGE 0 — Requisitos de design (o que o app novo NÃO pode fazer)

> **PIVOT:** não é lista de bugfix do app antigo. É a **especificação de requisitos** do
> novo `DataService`/`DataChainEngine`. Cada item abaixo nasce certo por construção no
> rebuild — não se conserta no código antigo.
> Verificação linha-a-linha contra commit `f26cea5` em `00_AUDITORIA_ULTRA/01-GAP_AUDIT_E_EXPANSAO.md`.

## Dados (o app novo nunca pode)

1. **Travar sync após 1º push** — no antigo `packages/sync/SyncProvider.tsx:180-192`
   `isPushing` nunca volta a `false` (liberava `isPulling`). Requisito: `DataService` sem
   estado de lock manual; push debounced 3s; `visibilityState`; evento `sync:error` visível.
   *Efeito colateral no antigo: `if (!isPushing.current) pull()` (`:272`) também trava.*
2. **Apagar tudo em JSON corrompido** — no antigo `dataStore.js:113-115` `catch { setItem(seed) }`.
   Requisito: `runDestructiveWrite()` (snapshot → try → clear+put); quarentena `*.corrupt-<ts>`.
3. **Restore destrutivo** — no antigo `googleDrive.js:449-480` (setItem puro, ignora journal-db,
   usa `alert()`) vs `applyFullBackupPayload` (que já faz `tx.done`). Requisito: 1 caminho de
   restore + backup prévio + toast (nunca `alert`).
4. **snake_case vazando para UI/IndexedDB** — no antigo `forceResync` (`SyncProvider.tsx:227-242`)
   e o próprio `Trade` mistura `entry_datetime` com `accountId`. Requisito: camelCase no IDB/UI;
   snake só na borda Supabase marcado `// SUPABASE BOUNDARY`.
5. **Pull truncado + UNIQUE global** — no antigo `pull.ts:16-27` (`.select('*')` sem `.range()`),
   `sql/create_deleted_trades_table.sql:10` `UNIQUE(platform_trade_id)`. Requisito: `.range()` +
   `UNIQUE(user_id, platform_trade_id)`.

## Números (o app novo nunca pode mentir)

6. **Ignorar trade multi-conta** — no antigo `dataStore.js:301` filtra só `t.accountId`, ignora
   `t.accounts[]` (campo que já existe, `:502`). Requisito: equity rateada por `weight`.
7. **Split sem peso** — no antigo `dataStore.js:318-330` `amount / accounts.length`. Requisito:
   ponderar por `defaultWeight`.
8. **ROI dividindo por lotes** — no antigo `Goals.jsx:87-89` e `:135-138` (`invested = Σ t.volume`).
   Requisito: `Trading Return` (PnL / capital ref), `Challenge ROI`, `Cash-on-Cash` separados.
9. **Sharpe/RoR inválidos** — no antigo `Dashboard.tsx:226` (`net/10000` fixo), `:230` (`sqrt(252)`
   por-trade). Requisito: série por dia; `n/a` se `PF` indefinido; `∞` como badge (nunca `Infinity` cru).
10. **Payout delete sem reverter** — no antigo `dataStore.js:393-400` não reverte nada;
    `Payouts.jsx:727,742-750` usa `solicited/n`. Requisito: reverter por `splitByAccount.net`.

## Segurança / Integração (o app novo nunca pode)

11. **Chave hardcoded** — `googleDrive.js:6-7`. Requisito: env Netlify + restrição referrer. **Ação imediata.**
12. **Bridge CORS * + `Access-Control-Allow-Private-Network: true` sem auth** —
    `QuantowerBridge.cs:366,370`; `quantowerAdapter.js:23` default `http` não passa no filtro `https`.
    Requisito: `X-Bridge-Token` em toda rota + remover `Private-Network` + filtrar default `bridgeUrl`.
13. **Paginação dupla** — `TradeTable.tsx:62-63` (`currentPage/rowsPerPage=10`) vs `:128-134`
    (`page/pageSize=25`). Requisito: fonte única.
14. **Mock em prod** — `Dashboard.tsx:135,1582-1585` (`genMockTrades(120)` sem banner demo).
    Requisito: modo Demo opt-in com banner; build falha sem `VITE_DEMO_MODE`.
15. **Timezone ingênuo** — `split('T')` em 16 pontos. Requisito: `dateUtils.ts` + ISO com offset.

## Nota de duplicação (o app novo consolida)

- `isEntryFill` em 5 arquivos (`push.ts:165`, `pull.ts:55`, `usePlatform.js:174`, `platformManager.js:245,486`) → 1 util.
- `BroadcastChannel` 2 instâncias (`dataStore.js:122` correto; `DriveContext.jsx:19` recriado por render) → 1 em module scope.
- 3 locks `platformManager.js:369,421,576` → `navigator.locks`.
