# AGENTS — Como dividir execução (regras duras)

## Ordem

1. **Agente 0 — Stabilize** sozinho: `01_STAGE0_STABILIZE/*`. Gate: P0 zerado.
2. **Contrato:** `02_STAGE1_DOMAIN/*` aprovado por você antes de qualquer feature.
3. **Agente 2 — Data Engine** sozinho: `03_STAGE2_DATA_ENGINE/*`. Gate: migração sem perda.
4. Em paralelo (pós-gate 2): **Agente 3 Trading** (`04_*`), **Agente 4 Money** (`05_*`).
5. Depois: **Agente 5 Wealth** (`06_*`, depende de Money).
6. Por último: **Agente 6 Command** (`07_*`).

## Regras para todo agente

- Ler só sua pasta + `02_STAGE1_DOMAIN/*` + `README.md`. Proibido importar lógica de outro stage.
- Fórmulas só de `02-FINANCIAL_FORMULAS.md`. Proibido criar `result/pnl/profit` novo.
- Nenhum `clear()/setItem(seed)` sem backup + `tx.done`. Nenhum snake_case no IDB.
- Todo fix financeiro: teste caracterizando antes + depois. `build:all` verde.
- CSS: variáveis, nunca hex hardcoded; nada de `<10px`; `aria-*` + `ErrorBoundary` + toast (sem alert).
- DoD por task: código + teste + doc atualizada + sem P0 novo.

## Por que 7 stages e não 5

Fase 0 do plano antigo misturava bugfix+engine+migração+SPA. Aqui cada risco tem gate próprio.
Home e SPA merge por último porque são composição — montar cockpit antes dos motores gera tela mentirosa.
Account unificada + ledger + net worth derivado (3º parecer) evitam a próxima geração de `currentFunding`.
