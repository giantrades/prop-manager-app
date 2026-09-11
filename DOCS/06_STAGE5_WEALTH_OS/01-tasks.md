# STAGE 5 — Tasks

- [x] T5.1 `Position` + Portfolio cost-basis/DCA + alocação/concentração — `packages/lib/db/wealth.ts` (`computeFifoLots` FIFO, `computePortfolio`, `computeDcaFromTransactions`, `computeAllocation`) + `packages/ui/Portfolio.tsx`
- [x] T5.2 Net Worth derivado + snapshots mensais + gráfico evolução — `packages/lib/db/wealth.ts` (`computeNetWorth`, `WealthService.captureNetWorthSnapshot`/`netWorthSeries`) + `packages/ui/NetWorth.tsx`
- [x] T5.3 Goals 2.0 (5 kinds) com progresso automático — `packages/lib/db/wealth.ts` (`computeGoalProgress`, `sumPayoutsInWindow`) + `packages/ui/Goals.tsx`
- [x] T5.4 Forecast 30/60/90 + "Safe Available" — `packages/lib/db/wealth.ts` (`computeForecast`, `computeSafeAvailable`) + `packages/ui/Forecast.tsx`
- [x] T5.5 Financial Journal (eventos + patrimônio) — `packages/lib/db/wealth.ts` (`deriveJournalEvents`, `WealthService.suggestJournalEvents`) + `packages/ui/FinancialJournal.tsx`
- [x] T5.6 `WealthService` orquestrador no DataService + export barrel

Gate: Net Worth reconcilia com soma Accounts+Positions+Payouts pendentes (teste automático `wealth.test.ts`).
