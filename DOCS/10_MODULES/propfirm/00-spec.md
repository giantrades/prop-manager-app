# MÓDULO — Contas Prop / Firm Manager

> "App separado" para gerenciar contas de prop trading (FTMO/E8/Apex...) e **firms**:
> quanto gastou em cada empresa/conta, payouts, funding por conta, e gerenciar tudo.
> Conectado ao **Quantower** e (futuro) **cTrader**. Motor compartilhado; casca própria.
> Era o módulo central do app antigo — precisa ser ultra-completo.

## Sub-áreas (como app separado)

| Área | Rotas | O que faz |
|---|---|---|
| Dashboard | `/accounts` | Visão geral das contas + funding + payouts + risco |
| Contas | `/accounts` | Editor de Account + PropExtension (funding, fases, DD, split) |
| Firms | `/firms` | Firm P&L (gasto por empresa), regras da firm, comparador |
| Payouts | `/payouts` + `/payout-center` | Payouts com split + alocação (Tax→Living→Invest) |
| Integração | `/quantower` | Sync Quantower + mapping de conta + cTrader |

## O que JÁ existe (verificado)

- `packages/ui/Accounts.tsx` — editor de Account (`kind: prop|bank|wallet|investment|crypto|cash`)
  + **PropExtension** completo (nominalSize, challengeCost, phase, target, maxDD/trailing/daily,
  consistencyPct, minDays, payoutRules, profitSplit, payoutFrequency). Mobile 360px.
- `packages/ui/RiskCenter.tsx` + `packages/lib/db/risk.ts` (`RiskService`, `getRiskStatus`,
  `risk:warning`).
- `packages/ui/FirmPnl.tsx` + `firmPnlByFirm` — gasto por firm.
- `packages/ui/Payouts.tsx` + `PayoutCenter.tsx` + `MoneyService.applyPayoutAllocation`.
- `packages/lib/db/accountModel.ts` (equity/drawdown derivados) + `computePayoutEligibility`,
  `consistencyPercent`, `computeDailyDrawdown`, `computeTrailingDrawdown`.
- Integração Quantower: `quantowerIngest.ts` + `QuantowerPage.jsx` + `copyTrade.ts`.
- **cTrader:** `packages/utils/adapters/ctraderAdapter.js` existe (OAuth + WebSocket), mas a
  ingestão no `app-db v3` é **só Quantower** (`quantowerIngest.ts`).

## O que FALTA (priorizado)

### P0 — Casca de "app separado" + profundidade
1. **Dashboard por conta** (detail): equity, peak, DD usado, headroom, payouts, trades —
   com **gráficos** (equity/drawdown por conta). O antigo tinha AccountDetail.
2. **Gasto por firm E por conta** com gráficos (challenge/reset/mensalidade/fee/rebate) —
   hoje só texto. Comparador "qual firm paga melhor".
3. **Lista de payouts por conta** + anexos/comprovantes (já tem base64; considerar Drive).
4. **Gerenciar contas**: recriar/duplicar/fail challenge, mover entre firms, marcar fases.

### P1 — Integração
5. **cTrader ingest** (`ctraderIngest.ts`) + bridge cTrader (só existe `QuantowerBridge.cs`) +
   mapping de conta. Adapter já existe; falta ligar ao `app-db v3`.
6. **Multi-plataforma unificado**: `source: quantower|ctrader|csv` no mesmo schema.

### P2 — Inteligência
7. **Challenge EV** (com n≥5 tentativas: sinal "continuar vs. não compensa") — aposta ousada.
8. **Payout eligibility checklist** por conta (o que falta: target/DD/days/consistency).

## Dados / fórmula (não criar nova)

- `Account` + `PropExtension` (`accountModel.ts`), `computeEquity`, `computeMaxDrawdown`,
  `computeTrailingDrawdown`, `computeDailyDrawdown`, `consistencyPercent`,
  `computePayoutEligibility`, `firmPnlByFirm`, `weightForAccount`.
- Transaction: `challenge_cost/reset_fee/monthly_fee/payout_in/fee/rebate/commission/swap`.
- cTrader: reutilizar `quantowerIngest.ts` como template, com `platformName='ctrader'`.

## UI / design

- 360px primeiro; detail de conta vira cards no mobile.
- Gráficos por conta com `useId()`; `tabular-nums`; toast + `ErrorBoundary`.
- Sem `alert()`; sem hex hardcoded (tokens).

## Tasks (checkáveis) — ✅ MÓDULO EXECUTADO

- [x] F1 Dashboard por conta (`accountDashboard()` + `AccountDetail.tsx`: equity/peak/DD/headroom/payouts/trades + gráfico equity + `useId()`)
- [x] F2 Gasto por firm/conta com gráficos (barras por firm) + comparador (badge "melhor" + retorno por $ gasto) + expand per-conta (`computeFirmPnlByAccount`)
- [x] F3 Payouts por conta (filtro na `PayoutsPage` + lista com 📎 comprovantes no `AccountDetail`)
- [x] F4 Gerenciar contas (duplicar / **selecionar status** challenge·funded·live·demo·standby / **desabilitar-reabilitar** com ghost no histórico — ver Batch E em melhorias.md)
- [x] F5 cTrader ingest (`ctraderIngest.ts` template Quantower, `ct_` ids, mapping via `Account.platformAccountId` editável no form)
- [x] F6 Multi-plataforma unificado (`source` += `ctrader`; `platformTradeId`/`platformName` no schema; dedup por primary-key)
- [x] F7 Challenge EV (`challengeEv()` n≥5, "sem amostra" abaixo)
- [x] F8 Payout eligibility checklist por conta (4 checks no `AccountDetail`)
- [x] Testes: 9 novos em `propfirm.test.ts` (dashboard à mão, EV 89.94, ingest dedup)
- [x] `pnpm build:all` verde + mobile 360px + offline

## Gate / DoD

- [x] Cada conta prop tem **dashboard próprio** (equity/DD/headroom/payouts) com gráficos.
- [x] Firm P&L mostra **gasto por firm e por conta** de forma visual.
- [x] cTrader ingere no mesmo schema com dedup por id de plataforma.
- [x] Nenhuma fórmula financeira nova. `tsc` 0 erros, testes verdes, build verde.

## Notas pós-execução
- **Bridge cTrader C# não existe** (só `QuantowerBridge.cs`): o ingest + mapping estão prontos;
  sync live cTrader precisa da bridge ou import CSV (`source: 'csv'`). `QuantowerPage` continua
  Quantower-only.
- Dedup cTrader usa **primary-key `ct_`** (sem índice novo, sem bump de versão do `app-db v3`).
- "Mover entre firms": sem `firmId` em `Account`, mover = editar `institution`; P&L por firm
  deriva das transactions (correto por construção).
- Puts do ingest usam `source: 'local'` (o union de `put` não tem `'ctrader'`; entra no sync normal).

## Melhorias futuras (pasta melhorias.md)

> Itens numerados em melhorias.md com Status [ ]. O agente do m�dulo deve ler a pasta,
> analisar os itens abertos e execut�-los um a um (c�digo + teste + doc + build verde).
> Ao concluir, marcar - [x] no arquivo da melhoria.

