# AGENTS — Como dividir execução (regras duras)

## Regra #0 — Fonte de convenção única

O **único** arquivo de convenção de agente é este (`DOCS/AGENTS.md`). Os 2 documentos
históricos que **não devem ser lidos** como convenção ativa já foram **arquivados em
`DOCS/_ARCHIVE/`** (Fase 5), com cabeçalho "SUPERSEDED BY":
- `DOCS/_ARCHIVE/agent.md` — última atualização 2026-05-20, pré-stages, conflita em rigor.
- `DOCS/_ARCHIVE/PLANO_V1_REMAKE_OVERHAUL.md` — visão "Fase 0-4" superada.

Ferramentas de agente procuram por convenção na raiz — o risco real é um agente carregar
o arquivo errado; por isso os dois foram movidos para `DOCS/_ARCHIVE/`.

## Ordem (reconstrução, ver `00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md`)

1. **Agente 0 — Security + Scaffold + Contracts** sozinho: `01_STAGE0_STABILIZE/*`. Gate: chave rotacionada + PWA instalável + 6 contratos aprovados.
2. **Agente 1 — Data Engine (novo)** sozinho: `03_STAGE2_DATA_ENGINE/*`. Gate: `app-db v3` + `DataService` + `DataChainEngine` verde + 2 payouts importados.
3. Em paralelo (pós-gate 1): **Agente 2 Trading** (`04_*`), **Agente 3 Money** (`05_*`).
4. Depois: **Agente 4 Wealth** (`06_*`, depende de Money).
5. Por último: **Agente 5 Command** (`07_*`).

> O app antigo é **ignorado**. Nenhum agente corrige `dataStore.js`/`SyncProvider.tsx`/`Payouts.jsx`
> antigos — os P0s são requisitos de design do novo `DataService`, não bugfix. Só importamos os 2 payouts.

## Regras para todo agente

- Ler só sua pasta + `02_STAGE1_DOMAIN/*` + `README.md`. Proibido importar lógica de outro stage.
- Fórmulas só de `02-FINANCIAL_FORMULAS.md`. Proibido criar `result/pnl/profit` novo.
- **Proibido escrever saldo direto** (`currentFunding`/`balance`) fora de `packages/lib` — bug mais repetido do código atual (10 pontos).
- **Proibido `clear()`/`setItem(seed)` sem `runDestructiveWrite()`** (snapshot→try→clear+put).
- **Proibido snake_case no IndexedDB/UI** (só na borda Supabase, marcado `// SUPABASE BOUNDARY`).
- **Proibido** `split('T')` / segunda definição de `isEntryFill` / mock em prod sem flag `VITE_DEMO_MODE`.
- Todo fix financeiro: teste caracterizando antes + depois. `build:all` verde.
- CSS: variáveis, nunca hex hardcoded; nada de `<10px`; `aria-*` + `ErrorBoundary` + toast (sem alert).
- DoD por task: código + teste + doc atualizada + sem P0 novo.

## Armadilhas top 10 (onde agentes erram)

Ver `00_AUDITORIA_ULTRA/02-ROADMAP_ARMADILHAS_APOSTAS.md § SEÇÃO E`. Resumo: saldo direto,
snake vazando, LWW cego em campo financeiro, clear sem backup, duplicar util em vez de
importar, mock em prod, CORS aberto/bridge sem token, estatística decorativa, clamp mudo,
doc de agente divergente.

## Por que reconstruir em vez de consertar

O app antigo (`dataStore.js` ~1675 linhas, 2 SPAs, 3 storages) será substituído. Corrigir os P0s
nele é trabalho jogado fora — o novo `DataService`/`DataChainEngine` nasce certo. Home e SPA
merge ficam por último porque são composição (montar cockpit antes dos motores gera tela mentirosa).
Account unificada + ledger + net worth derivado evitam a próxima geração de `currentFunding`.
**Mobile-first + offline-first são restrições de arquitetura desde o dia 1**, não retrofit.
