# STAGE 3 — Tasks

> Status atual (execução da Fase 2): engine + serviços + bridge + PWA + testes prontos.
> A wire-up de UI/SPA fica na Fase 5 (fusão), exceto o que já roda no app legado.

- [x] T3.1 `accountModel.ts` + `PropExtension` + Eligibility a partir de FORMULAS
      (`packages/lib/db/accountModel.ts` + `risk.ts`: `getRiskStatus` -> `{status, reason, headroom}`)
- [x] T3.2 `RiskCenter.tsx` (Account Risk genérico) + `risk:warning` + badge Navbar
      (`packages/ui/RiskCenter.tsx` + `RiskBadge.tsx`; `RiskService` emite `risk:warning`)
- [x] T3.3 Quantower service + Sync button + `quantowerAccountId` mapping UI
      (`packages/utils/adapters/quantowerAdapter.js` v2 + `QuantowerBridge.cs` v2)
- [x] T3.4 CSV universal (mapeamento colunas + preview + dedup `brokerId+openTime`)
      (`packages/lib/db/csvImport.ts`)
- [~] T3.5 `TradeForm` em steps (Info->Contas->Execuções->Review) + Quick Entry <30s + Position Size Calc
      (engine pronto; UI do form novo fica na Fase 5)
- [x] T3.6 Strategies: consistência ponderada, long/short, significância, sem órfão em delete
      (`packages/lib/db/strategies.ts`)
- [x] T3.7 Equity por conta + DD real por conta (plugar `AccountPicker` no `detectDrawdowns` existente)
      (`RiskService`/`DataChainEngine.drawdowns`)
- [x] T3.8 Bridge v2 (token, /open, /modify, /orders/place|cancel, idempotência, contrato de erro) — `04-BRIDGE_V2_SPEC.md`
- [x] T3.9 PWA cache de leitura offline + fila `sync_queue` — `05-PWA_MOBILE_SPEC.md`
- [x] T3.10 Copy-trade (copyGroup + multiplier + lotStep, preview antes de enviar) — `packages/lib/db/copyTrade.ts`

Gate: 20 scalps/dia sem digitação massiva + Risk reativo em lote.

