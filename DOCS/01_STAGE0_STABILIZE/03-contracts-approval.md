# STAGE 0 — Aprovação dos 6 contratos (S0.6–S0.11)

> Aprovado na Fase 0 em 2026-09-07. Estes 6 docs são a lei do rebuild:
> Fase 1+ implementa contra eles; qualquer mudança de campo pós-aprovação
> exige `app-db v4` explícito (nunca editar `v3` in-place).

## S0.6 — `02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md` — APROVADO

- Centro = Account unificada (`kind` enum fechado); só `kind=prop` tem `PropExtension`.
- Tabela de rename v1→v3 obrigatória (`entry_datetime`→`entryDatetime`, …,
  `Account.type`→`kind` manual conta por conta, `currentFunding` removido).
- Regra de ouro travada: `Trade -> PnL -> Ledger (Transaction) -> Equity (derivado)`.
- Campos copy-trade (`copyGroup`, `copyMultiplier`, `lotStep`) confirmados como
  necessários pelo Bridge v2 — sem `lotStep` o arredondamento quebra.

## S0.7 — `02_STAGE1_DOMAIN/01-DATA_CONTRACT.md` — APROVADO

- `app-db v3` com os stores listados; camelCase no IDB/UI, snake só na borda
  Supabase (`// SUPABASE BOUNDARY`).
- Payloads de evento exatos (`datastore:change` com `source`+`entityIds`,
  `sync:error`, `quantower:*`, `risk:warning`, `goal:completed`).
- Push debounce 3s; `BroadcastChannel` único em module scope.
- Migração = PIVOT: app novo começa limpo; só importador opcional de payouts.

## S0.8 — `02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md` — APROVADO (implementação única)

- Travado como import único de toda tela: PnL, R (`null` sem stop, nunca `0`),
  Equity rateada por `weight`, DDs (fuso da firm), consistency
  (`bestDay/total <= pct`, `n/a` se `total <= 0`), eligibility como checklist,
  PF com `n/a`/`∞`-badge, Sharpe por dia com `amostra insuficiente` se <20 dias,
  RoR fora da UI até o modelo ser definido.
- Tríade patrimonial travada: `Trading Return` vs `Challenge ROI` vs `Cash-on-Cash`.
- Fiscal: PTAX venda do dia do recebimento guardada na `Transaction`, nunca recalculada.

## S0.9 — `02_STAGE1_DOMAIN/03-SYNC_PROTOCOL.md` — APROVADO, decisão: **Opção B**

- **Decisão Fase 0: Opção B** — merge por registro (last-writer-wins por `updatedAt`),
  **exceto campos financeiros** (`Transaction.amount`, `Payout.net`,
  `Account.initialFunding`), que nunca fazem merge automático: viram
  `status: 'conflict'` com `localVersion`/`remoteVersion` para confirmação humana.
- Revisitamos granularidade por campo (Opção A) só se virar multi-usuário real.
- Push batch 500/chunk; pull com `.range()` nas 10 queries;
  `UNIQUE(user_id, platform_trade_id)`; realtime só com `visibilityState==='visible'`.
- Restore unificado em `applyFullBackupPayload` (backup atual antes de `clear()`).

## S0.10 — `04_STAGE3_TRADING_OS/04-BRIDGE_V2_SPEC.md` — APROVADO, com 2 ressalvas

- Travado: `X-Bridge-Token` em TODAS as rotas, sem `Private-Network` antes do token,
  `clientOrderId` idempotente em todo POST de escrita, `ErrorPayload` com
  `code`+`retryable`, handshake de versão com banner, filtro `isPageSecure` no
  default de `bridgeUrl`, copy-trade com preview + 1 `clientOrderId` por réplica.
- **Ressalva 1:** formato de resposta de `GET /orders` marcado NÃO VERIFICADO no
  próprio spec — confirmar contra o `QuantowerBridge.cs` na implementação (Fase 2).
- **Ressalva 2:** deep-link `quantower://` NÃO VERIFICADO — confirmar na doc do
  Quantower antes de prometer na UI; sem confirmação, a ação cai para desktop manual.

## S0.11 — `04_STAGE3_TRADING_OS/05-PWA_MOBILE_SPEC.md` — APROVADO (shell entregue)

- Shell entregue nesta fase: `manifest.webmanifest` + ícones 192/512/maskable +
  SW app-shell-only + metas iOS + paths absolutos nos 2 SPAs
  (`/` com escopo `/`, `/journal/` com escopo `/journal/`).
- Diferido conforme o próprio spec: cache de leitura offline (stale-while-revalidate)
  e fila de escrita entram na Fase 2/3 com o `DataChainEngine` (T3.9).
- Critérios de aceite travados: Lighthouse PWA 100, Performance ≥90 (4G),
  TTI <3s, Add-to-Home testado em iOS Safari + Android Chrome, teste de campo
  via Tailscale (checklist no spec).

## Segurança (S0.1–S0.3, registrado aqui para o gate)

- Chave antiga REVOGADA pelo dono; nova chave NUNCA entra no código — só via
  `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` (Netlify env).
  Pendente do dono (console, 5 min): adicionar as vars no Netlify + restrição
  por HTTP referrer no Google Cloud Console (passo a passo em
  `main-app/.env.example`).
- `dist/` desindexado do git; `.gitignore` → `**/.env*` (com exceção `!.env.example`).
- Histórico do git ainda contém a chave REVOGADA (8 commits antigos).
  Decisão: sem `filter-repo` — chave morta + repo público com origin
  (reescrita exigiria force-push e invalidaria clones). Se um dia quiser o
  histórico limpo, é `git filter-repo` + force-push coordenado — fora do escopo da Fase 0.
