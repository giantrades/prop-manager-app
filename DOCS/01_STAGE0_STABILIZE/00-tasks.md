# STAGE 0 — Security + Scaffold + Contracts

> **PIVOT (ver `00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md`):** não consertamos o app
> antigo — reconstruímos. Estes são os 3 blocos que antecedem a construção do novo.

## Bloco A — Segurança (FARZER PRIMEIRO, não espera nada)

- [x] **S0.1** Revogar/rotacionar Google API key + Client ID (`packages/utils/googleDrive.js:6-7`), restringir por HTTP referrer, mover para env Netlify.
- [x] **S0.2** `.gitignore` → `**/.env*` + `git rm -r --cached dist` (dist commitado hoje).
- [x] **S0.3** Remover segredo de `git history` (opcional: `git filter-repo`); pelo menos rotacionar.

## Bloco B — PWA Scaffold (não depende de contrato)

- [x] **S0.4** `manifest.json` + ícones 192/512/maskable + service worker shell (cache app-shell só, zero cache de dado).
- [x] **S0.5** iOS meta (`apple-mobile-web-app-capable` + `apple-touch-icon`) + paths absolutos (não relativo — quebra sob `/journal/`).
- [ ] Critério: "Add to Home Screen" funciona em iOS + Android.

## Bloco C — Contracts (aprovar antes de qualquer código de feature)

- [x] **S0.6** Aprovar `02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md`
- [x] **S0.7** Aprovar `02_STAGE1_DOMAIN/01-DATA_CONTRACT.md`
- [x] **S0.8** Aprovar `02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md`
- [x] **S0.9** Aprovar `02_STAGE1_DOMAIN/03-SYNC_PROTOCOL.md`
- [x] **S0.10** Aprovar `04_STAGE3_TRADING_OS/04-BRIDGE_V2_SPEC.md`
- [x] **S0.11** Aprovar `04_STAGE3_TRADING_OS/05-PWA_MOBILE_SPEC.md`

## Referência: o que o audit ULTRA marcou como P0

NÃO corrigir no app antigo. São **requisitos de design** do novo `DataService`/`DataChainEngine`:
`currentFunding` nunca escrito direto; 1 `app-db v3` (não 3 storages); `navigator.locks`;
campo financeiro sem merge automático; `runDestructiveWrite()`; bridge token + idempotência;
sem mock em prod; sem `split('T')`. Lista completa em `01-bugs-P0.md` (agora como especificação).

## DoD do Stage 0

- Google key rotacionada + sem segredo no `git log --all -p | grep -i "AIza\|apps.googleusercontent"`.
- PWA instalável (Add-to-Home em iOS+Android).
- 6 contratos aprovados por você (commit "docs: aprova contracts").
