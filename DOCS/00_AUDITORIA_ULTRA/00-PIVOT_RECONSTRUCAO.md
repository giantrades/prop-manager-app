# PIVOT — Reconstruir em vez de consertar o app antigo

> **Decisão do dono (confirmada).** Este documento é a fonte de verdade ATUAL do roadmap.
> O roadmap fix-first em `02-ROADMAP_ARMADILHAS_APOSTAS.md` e o gap audit em
> `01-GAP_AUDIT_E_EXPANSAO.md` permanecem como **especificação de requisitos** (o que o
> app novo NÃO pode fazer) e **referência histórica** — não como lista de bugfix a aplicar
> no código atual.

## Como executar (1 agente por conversa)

Cada fase tem **um agente** em `.opencode/agent/phaseX-*.md`. Para rodar a fase X:

1. Abra o opencode na raiz do repo (contexto = todo o monorepo).
2. **Novo agente/conversa** → selecione o agente da fase: `phase0-security-scaffold-contracts`,
   `phase1-data-engine`, `phase2-trading-os`, `phase3-money-os`, `phase4-wealth-os`,
   `phase5-command-intelligence` (via seletor de agente ou `/agent <nome>`).
3. O prompt do agente já diz **o que ler, o que construir, o que é proibido e o gate**.
4. O `AGENTS.md` da raiz (auto-carregado) dá a orientação universal em toda sessão.

**Regra de paralelismo:** só rode a Fase 1 depois da Fase 0 (chave + contratos). Fases 2 e 3
podem rodar em paralelo (após Fase 1). Fase 4 depende da 3; Fase 5 depende de 2/3/4.

## Decisão

1. **Reconstruir direto.** O app antigo (`dataStore.js` ~1675 linhas, 2 SPAs Vite
   independentes, 3 sistemas de persistência) será substituído. Corrigir `isPushing`,
   `computeSplit`, `deletePayout`, paginação etc. no código antigo é **trabalho jogado
   fora** — essas responsabilidades nascem certas no novo `DataService`.
2. **Pode ignorar o app antigo** durante a construção do novo. Não precisa continuar 100%
   funcional no meio-tempo.
3. **Dados: só os 2 payouts importam** (com toda a informação deles). Todo o resto do
   histórico atual pode ser descartado. Migração vira **importador opcional de payouts**,
   não "migração sem perda dos 3 storages".

## O que sobrevive do audit ULTRA

- **P0s = requisitos de design do app novo** (não fixes do antigo):
  - `currentFunding` **nunca** é escrito direto — é derivado do ledger.
  - Um único `DataService` writer + um único `app-db v3` (não 3 storages).
  - `navigator.locks` multi-tab, `isEntryFill`/`split('T')` num util único.
  - Campo financeiro **nunca** merge automático em conflito (Opção B).
  - `clear()`/`setItem(seed)` só via `runDestructiveWrite()`.
  - Bridge com token + `clientOrderId` idempotente + sem `Private-Network` header.
  - Sem mock em prod, sem `split('T')`, sem estatística decorativa.
- **Ação imediata (não é sobre arquitetura, é segurança):** revogar/rotacionar a Google
  API key (`packages/utils/googleDrive.js:6-7`), restringir por HTTP referrer, mover para
  env Netlify. **Fazer hoje.**

## Roadmap enxuto (reconstrução, mobile-first desde o dia 1)

| Fase | Nome | Objetivo | Gate |
|---|---|---|---|
| 0 | Security + Scaffold + Contracts | Revogar chave; PWA shell (manifest+SW); aprovar 6 docs de contrato | chave rotacionada; 6 contratos aprovados |
| 1 | Data Engine (novo) | `app-db v3` + `DataService` único + `DataChainEngine` + importador opcional de payouts | cadeia `Trade->Wallet` verde; 2 payouts importados |
| 2 | Trading OS | Risk genérico + Journal + Quantower/CSV + Bridge v2 + abrir/editar/fechar no celular | 20 scalps/dia sem digitação; abre/edita/fecha no celular demo |
| 3 | Money OS | Transactions + Wallets + Payouts + Tax + Firm P&L | Payout->Wallet->Tax fim-a-fim |
| 4 | Wealth OS | Portfolio cost-basis + Net Worth derivado + Forecast + Goals 2.0 | Net Worth reconcilia (teste automático) |
| 5 | Command + Intel | Home (composição) + Calendar + Alerts + AI leitura-only + fusão SPA | Home sem query própria; SPA fundida |

## Restrições de arquitetura (mobile-first, desde o dia 1)

- **Tudo precisa funcionar no celular.** Schema, eventos e componentes nascem pensando em
  PWA 360px + offline. Não é retrofit.
- **Offline-first:** app abre 100% offline com snapshot; Quantower é fonte live, nunca
  fonte de verdade; fila `sync_queue` idempotente.
- **Critérios numéricos:** Lighthouse PWA 100, Performance ≥90 (4G), TTI <3s, Add-to-Home
  em iOS+Android, operável com uma mão em 360×640.
- **Specs que já cobrem isso:** `04_STAGE3_TRADING_OS/04-BRIDGE_V2_SPEC.md` +
  `05-PWA_MOBILE_SPEC.md`.

## Migração = importador opcional (só payouts)

Em vez de "inventariar 3 storages + oráculo + rollback + quarentena":
- Novo app começa limpo com `app-db v3`.
- Um **importador de payouts** lê os 2 payouts atuais (toda a info: gross, fee, net,
  splitByAccount, status, method, attachments, data) e os converte em `Transaction`
  (`payout_in` + `fee`) + `Payout` seed.
- Sem preservar trades/contas/goals antigos.
