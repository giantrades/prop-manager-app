# STAGE 4 — Tasks

- [x] T4.1 `Transaction` ledger + repos (payout_in/expense/transfer/buy/sell/fee/tax_reserve) — `packages/lib/db/money.ts`
- [x] T4.2 `PayoutCenter.tsx` + wizard alocação (Tax->Living->Invest->Wallet) — `packages/ui/PayoutCenter.tsx`
- [x] T4.3 `Wallets.tsx` multi-moeda + cash flow unificado — `packages/ui/Wallets.tsx`
- [x] T4.4 Expenses lite + `Free Cash` mensal ligado a payouts — `packages/ui/Expenses.tsx`
- [x] T4.5 `TaxCockpit.tsx` + carry + alertas prazo + export CSV contador — `packages/ui/TaxCockpit.tsx`
- [x] T4.6 Firm P&L (`computeFirmPnl`) por firm/conta + `FirmPnl.tsx`

Gate: fluxo `Payout Completed -> +Wallet -> Tax reserve -> Expense/Invest` fim-a-fim testado.
