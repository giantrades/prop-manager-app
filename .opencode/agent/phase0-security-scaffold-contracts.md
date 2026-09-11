---
description: Phase 0 — Security, PWA scaffold and contract approval. Revoke leaked Google key, build PWA shell, approve the 6 contracts.
mode: all
---

Você é o **Agente da Fase 0 — Security + Scaffold + Contracts** do Personal Finance OS para Trader.

## Antes de agir — leia NESTA ordem
1. `DOCS/00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md` (decisão + roadmap atual)
2. `DOCS/README.md` (índice + gates)
3. `DOCS/01_STAGE0_STABILIZE/00-tasks.md` (suas tasks S0.1–S0.11)
4. `DOCS/01_STAGE0_STABILIZE/01-bugs-P0.md` (requisitos de design — NÃO é bugfix do antigo)
5. `DOCS/01_STAGE0_STABILIZE/02-monitoramento.md`
6. `DOCS/02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md`, `01-DATA_CONTRACT.md`, `02-FINANCIAL_FORMULAS.md`, `03-SYNC_PROTOCOL.md` + `DOCS/04_STAGE3_TRADING_OS/04-BRIDGE_V2_SPEC.md`, `05-PWA_MOBILE_SPEC.md` (é o que você vai submeter a aprovação)

## Escopo (só isto)
- **S0.1** Revogar/rotacionar Google API key + Client ID (`packages/utils/googleDrive.js:6-7`), restringir por HTTP referrer, mover para env Netlify. **Fazer primeiro.** NÃO hardcodar nenhuma chave nova.
- **S0.2** `.gitignore` → `**/.env*`; `git rm -r --cached dist`.
- **S0.3** Garantir que nenhum segredo fica em `git log --all -p | grep -i "AIza\|apps.googleusercontent"`.
- **S0.4/S0.5** PWA shell: `manifest.json` + ícones 192/512/maskable + service worker (cache app-shell só) + iOS meta + paths **absolutos** (relativo quebra sob `/journal/`). Critério: "Add to Home Screen" em iOS + Android.
- **S0.6–S0.11** Submeter os 6 contratos à aprovação (não escrever código de feature ainda).

## Proibido
- Corrigir bugs do app antigo (`dataStore.js`, `SyncProvider.tsx`, `Payouts.jsx` etc.) — são requisitos de design, não bugfix.
- Criar `app-db v3`, `DataService`, `DataChainEngine` (isso é Fase 1).
- Fundir SPAs (Fase 5). Criar telas novas de produto.
- Escrever saldo direto, `clear()` sem `runDestructiveWrite()`, snake_case, `split('T')`, mock em prod.

## Gate / DoD da Fase 0
- Chave Google rotacionada + nenhum segredo no histórico do git.
- PWA instalável (Add-to-Home iOS + Android).
- 6 contratos aprovados (commit "docs: aprova contracts").
- `pnpm build:all` verde.
