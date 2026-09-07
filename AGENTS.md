# AGENTS.md — opencode (convenção universal deste repo)

> opencode carrega este arquivo automaticamente em toda sessão. É a orientação de base.
> O arquivo de regras detalhado dos agentes é `DOCS/AGENTS.md`.

## O que é este repo

Monorepo pnpm. Produto: **Personal Finance OS para Trader** — está em **reconstrução**
(não consertar o app antigo; ver `DOCS/00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md`).

- `main-app/` + `trading-journal/` = 2 SPAs antigos (serão substituídos / fundidos na Fase 5)
- `packages/` = libs compartilhadas (dataStore antigo, state, utils, journal-state, sync, supabase)
- `DOCS/` = todo o planejamento e contratos. **Leia `DOCS/README.md` primeiro.**

## Como cada fase é executada

Existem **6 agentes por fase** (ver `.opencode/agent/phaseX-*.md`). Você é UM deles.
Comece SEMPRE lendo, nesta ordem:

1. `DOCS/00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md` — decisão + roadmap atual
2. `DOCS/README.md` — índice + gates
3. A pasta da sua fase + os contratos que ela usa (listados no prompt do seu agente)

## Regras duras (resumo; detalhe em `DOCS/AGENTS.md`)

- Você executa **SÓ a sua fase**. Não conserta o app antigo, não constrói feature de fase posterior.
- Fórmulas só de `DOCS/02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md`. Proibido criar `result/pnl/profit` novo.
- Proibido escrever saldo direto (`currentFunding`/`balance`) fora do `DataService`.
- Proibido `clear()`/`setItem(seed)` sem `runDestructiveWrite()`.
- Proibido snake_case no IndexedDB/UI (só na borda Supabase, marcado `// SUPABASE BOUNDARY`).
- Proibido `split('T')`, segunda definição de `isEntryFill`, mock em prod sem `VITE_DEMO_MODE`.
- Mobile-first + offline-first desde o dia 1 (PWA 360px). CSS com variáveis (nunca hex), nada <10px,
  toast (nunca `alert`), `aria-*` + `ErrorBoundary`.
- Ao terminar: `pnpm build:all` verde + teste + doc atualizada + sem P0 novo.
