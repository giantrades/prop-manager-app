# STAGE 2 — Data Engine (construção do NOVO, não migração do antigo)

> **PIVOT (ver `00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md`):** não migramos os 3 storages
> antigos — **construímos o novo**. O app antigo é ignorado; só importamos os 2 payouts.

## Por que "3 storages -> 1" é resolvido por construção, não por migração

O antigo tem `localStorage['propmanager-data-v1']` (blob) + `IndexedDB('journal-db',v2)` +
`IndexedDB('quantower-ledger',v1)`, e 2 SPAs Vite independentes (base `/` vs `/journal/`,
unidas por `merge-builds.js` + redirect Netlify). No novo, nasce **um** `app-db v3` com
**um** `DataService` writer. Não há migração de storage — há construção limpa.

## Camadas

```
UI -> DataService (único writer) -> IndexedDB app-db v3 -> Sync Engine -> Supabase
                                      +-> Export JSON (backup manual)
```

- `DataService`: único lugar que escreve. UI nunca toca `localStorage`/IDB direto.
- Repositórios por entidade (`accountsRepo`, `tradesRepo`...), `toSnake/toCamel` só na
  borda Supabase (`// SUPABASE BOUNDARY`), `isEntryFill()` único, `dateUtils.ts` único.
- `DataChainEngine`: propaga `Trade->Ledger->Equity->Eligibility->Wallet->NetWorth->Goals`
  via eventos do contrato. Teste: `criar Trade -> PnL->Equity->Eligibility->Wallet` verde.
- `runDestructiveWrite()`: wrapper único pra `clear()`/`setItem(seed)` (snapshot→try→clear+put).
  Proibido `.clear()` fora dele.
- **Mobile-first desde o dia 1:** schema, eventos e componentes pensados para PWA 360px +
  offline. `navigator.locks` para multi-tab.

## Importador opcional de payouts (só os 2 atuais)

Em vez de "inventariar 3 storages + oráculo + rollback + quarentena":
- App novo começa limpo com `app-db v3`.
- Um importador lê os 2 payouts atuais (toda a info: gross, fee, net, splitByAccount,
  status, method, attachments, data) e converte em `Transaction` (`payout_in` + `fee`)
  + `Payout` seed.
- Nada de trades/contas/goals antigos. `propmanager-data-v1` não é tocado (fica legado
  ignorado; se o usuário quiser, export manual).

## Build/deploy

`pnpm --frozen-lockfile`, `PNPM_VERSION=9`, **limpar `dist/`** no `merge-builds.js` (hoje só
`fs.cpSync` por cima), remover `package-lock.json` (repo tem 2 lockfiles), alinhar
`react18+types18`, remover `gapi-script/localforage/jest` ou criar `test` script, `logoUrl`
absoluto (relativo quebra sob `/journal/`), revisar `COOP/COEP` (quebra GIS popup).
Fusão SPA definitiva fica na Fase 5 (Command). Aqui só isolar CSS por página + `tokens.css`.
