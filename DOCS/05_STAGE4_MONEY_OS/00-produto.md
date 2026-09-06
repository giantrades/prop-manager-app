# STAGE 4 — Money OS (payout vira cadeia financeira)

## Payout Center (`PayoutCenter.tsx`)

```
Payout #12 | FTMO 100K | Eligible YES | Gross $3,200 | Fee $640 | Recebe $2,560
Wise 3-5d | Tax est $384 | Disponível investir $1,700
"O que fez com esse payout?" -> $384 Tax reserve / $700 Living / $1,000 Invest / $476 Cash
```

Regras por firm: minProfit, minDays, fee%, method fee. Botão `Sacar $X -> líquido $Y`.

## Wallets (`Wallets.tsx`)

`Wise $12k | C6 R$18k | Nubank R$4k | Pix | Crypto $3k`, multi-moeda USD/BRL/EUR/Crypto.
Ledger unificado: inflows payouts, outflows despesas, aportes. Responde "quanto realmente tenho?".

## Expenses (lite, trader-first)

Categorias: Moradia/Alimentação/Transporte/Saúde/Lazer/Impostos/Trading/Invest/Educação.
`Income = Payouts + Trading + Other - Expenses = Free Cash`. Sem YNAB completo.

## Tax Cockpit (`TaxCockpit.tsx`, cockpit não ERP)

Month, day-trade net, swing net, fees, carry prejuízo, `Taxable`, `Est tax`, `⚠ Prepare DARF`.
Separar Day 20% / Swing 15% / Payout internacional. Contador prazo DARF.

## Firm P&L (exigência: "quanto gastei com cada propfirm?")

Painel hoje confuso porque custo não existe no schema. Novo:

```
FIRM E8
  Challenges pagos .... $499 (3x)
  Resets .............. $150 (1x)
  Mensalidades ........ $0
  Payouts recebidos ... $2,560
  Fees firm ........... -$640
  Comissões/swap ...... -$87
  Rebates ............. +$42
  LUCRO FIRM .......... +$1,376
```

- Todo custo entra como `Transaction kind=challenge_cost|reset_fee|monthly_fee` com `firmId+accountId`.
- Rebates como `kind=rebate` positivo (nunca abater direto na fee — auditoria).
- Trade carrega `commission+swap+rebate` separados (não só `result_net`).
- View por firm E por conta: `Accounts.jsx` mostra `recebido - gasto - fees + rebates`, não só `currentFunding`.
