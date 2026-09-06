# STAGE 1 — Domain Model (centro do sistema)

> Adota a correção do 3º parecer: centro = Account unificada, não "Prop Account" isolada.

## Entidades fundamentais (só estas criam verdade)

```
Account { id, kind: bank|wallet|investment|crypto|cash|prop, name, currency, institution }
  PropExtension { nominalSize, challengeCost, phase: challenge1|challenge2|funded|paused|failed,
                  target, maxDD, trailingDD, dailyDD, consistencyPct, minDays, payoutRules, profitSplit,
                  quantowerAccountId, lastSync }
Transaction { id, accountId, firmId?, kind: payout_in|challenge_cost|reset_fee|monthly_fee|commission|swap|rebate|expense|transfer|buy|sell|fee|tax_reserve,
              amount, currency, date, ref: payoutId|tradeId|investmentId, note }
  // Ledger LEAN v1: começa só como log unificado do que hoje está espalhado.
  // Não é double-entry completo. É o que permite responder:
  // "quanto gastei por firm/conta? comissões/fees/rebates?" sem query ad-hoc.
  // Payouts e snapshots atuais são migrados como Transactions seed (agressivo, com backup).
FirmCost { id, firmId, accountId?, kind: challenge|reset|monthly|commission_share, amount, date }
Position { id, accountId, symbol, qty, avgPrice, updatedAt }   // investimento/crypto
Trade { id, accountId | accounts[{id,weight}], strategyId, symbol, direction,
        entry/exit datetime (ISO com TZ), qty, entry/exit, fees, source: manual|quantower|csv,
        quantowerId, result_net, result_R, notes }             // nunca atualiza equity direto
Payout { id, accountIds[], gross, fee, net, splitByAccount, status, method, attachments }
Goal { id, kind: emergency|networth|property|payout_year|portfolio, targetValue, currentDerived, deadline }
```

Exemplo: `C6, Wise, XP, Binance, FTMO, E8, Cash` são todos `Account`. Só `kind=prop` tem `PropExtension`.

## Regra de ouro (anti-currentFunding)

```
Trade -> Realized PnL -> Account Ledger (Transaction) -> Equity (derivado)
```

Proibido: `Trade -> incrementa currentFunding/equity/dashboard/goal` em 4 lugares.
`Account balance, Net Worth, Goal progress, Portfolio value` = derivados. Snapshots só histórico.

## Ledger — por que precisa (resposta direta)

Sem ledger você nunca responde "quanto gastei com cada propfirm / comissões / rebates"
porque hoje isso está em 4 lugares: `payout.fee`, `trade.commission`, `account.initialFunding`
editado na mão, e custo de challenge nem existe no schema.

Ledger LEAN = 1 tabela `transactions` que unifica o que você já tem:
- payouts existentes viram `payout_in` + `fee`
- trades existentes viram `commission/swap` derivados
- custo de challenge/reset/mensalidade vira `challenge_cost/reset_fee` (campo novo, você cadastra 1x)
- rebates viram `rebate` (positivo)

Sem isso, o painel de "quanto recebi vs gastei por firm" continua confuso para sempre.
Com isso, Firm dashboard = `Σ payouts - Σ costs - Σ fees + Σ rebates` por `firmId`. Simples.

Migração: como você confirmou que não há nada a preservar além de payouts/snapshots,
migração pode ser AGRESSIVA desde o Stage 1 (backup + seed Transactions a partir de payouts/trades).
Sem tela escrevendo saldo direto — saldo é sempre derivado do ledger.
