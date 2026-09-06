# STAGE 1 — Financial Formulas (única implementação)

> Toda tela importa daqui. Proibido reimplementar no Dashboard (`finance.js/stats.js` hoje mortos + lógica duplicada inline).

## Trading

- `Realized PnL (trade)` = `(exit-entry)*direction*qty*multiplier - commission - fees - swap - slippage`
- `R` = `PnL / riskInicial` (risk = `|entry-stop|*qty*multiplier`, não `(exit-entry)/|entry-stop|` ignorando volume como hoje no `TradeForm`)
- `Equity(account)` = `initialFunding + Σ PnL rateado por weight` (rateio `t.accounts[]`, não só `t.accountId`)
- `Drawdown`: `maxDD`, `trailingDD` (vs peak), `dailyDD` (vs equity 00:00). Headroom = `limite - usado`.
- `Payout Eligibility` = `equity>=target && DD usado <100% && minDays && consistency` (hoje inexistente)
- `Winrate` exclui breakeven; `avgR`, `expectancy = WR*avgW - LR*avgL`, `PF = grossW/grossL` (nunca `Infinity` na UI, mostrar `n/a`), `Sharpe` só com equity base + risk-free (remover `net/10000` fixo), `RoR` remover até definir edge válido.

## Patrimônio (nomes corrigidos do 3º parecer)

- `Trading Return` = `PnL líquido / capital referência`
- `Challenge ROI` = `payouts líquidos / custo challenges` (não chamar de "ROI")
- `Cash-on-Cash` = `recebido / desembolsado`
- `Net Worth` = `Σ Accounts + Positions mark-to-market + receivables - liabilities` (derivado, snapshot só histórico)
- `Cost Basis` = `Σ buys - Σ sells rateado`; `DCA` = aportes por mês.

## Fiscal (cockpit, não ERP)

Day 20%, Swing 15%, carry prejuízo, DARF prazo. Payout internacional via Carnê-Leão/PJ (estimativa, contador decide).
