# STAGE 2 — Data Engine (infra definitiva)

## Camadas

```
UI -> DataService (único writer) -> IndexedDB app-db v3 -> Sync Engine -> Supabase
                                        +-> Drive backup (arquivo, secundário)
```

- `DataService`: único lugar que escreve. UI nunca toca `localStorage`/IDB direto.
- Repositórios por entidade (`accountsRepo`, `tradesRepo`...), com `toSnake/toCamel` só na borda Supabase + `isEntryFill()` único (hoje dedup em 3 lugares).
- `DataChainEngine`: propaga `Trade->Ledger->Equity->Eligibility->Wallet->NetWorth->Goals` via eventos do contrato, com testes:
  `criar Trade -> PnL->Equity->Eligibility->Wallet` verde.

## Migração

Backup v1 -> seed v3 -> mapear + verificar contagens/somas -> flag `migrated`. `propmanager-data-v1` vira legado read-only. Remover `journal-db`, `quantower-ledger`, `propmanager-proton-db` separados (um `openDB('app-db',3)`).

## Build/deploy

`pnpm --frozen-lockfile`, `PNPM_VERSION=9`, limpar `dist/` no `merge-builds.js`, remover `package-lock.json`, alinhar `react18+types18`, remover `gapi-script/localforage/jest` ou criar `test` script, `logoUrl` relativo (quebra sob `/journal/`), revisar `COOP/COEP` (quebra GIS popup).
Fusão SPA definitiva fica DEPOIS do Stage 6 (3º parecer). Aqui só isolar CSS por página + `tokens.css`.
