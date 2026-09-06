# STAGE 6 — Command Center + Intelligence (por último)

## Home (`HomeCommandCenter.tsx`) = composição, sem lógica

```
NET WORTH R$487k +8.4% | CASH | INVEST | PROP EQUITY | PENDING | TAX RESERVE
TRADING TODAY (PnL, trades, risk, SAFE) | INVESTMENTS | GOALS | ACTION CENTER
(⚠ DARF, ✓ payout, ⚠ DD, ✓ meta)
```

Só agrega motores prontos. Se precisar de dado novo, volta ao stage dono.

## Financial Calendar

Mês único: Trading + Economic (FOMC/CPI overlay) + Bills + Payouts + Tax + Invest + Goals.
Banner `High impact em 2h: não opere XAU`. Tela permanente no monitor.

## Alerts

`risk:warning`, `goal:completed`, payout disponível, DARF prazo. Badge Navbar + push/email futuro.

## AI como camada (não página)

`financialIntelligence.ts` só leitura:
"63% do crescimento 6m veio de prop", "28% em caixa parado", "setup X 1.8R vs Y 0.4R", "R$500k em X meses no ritmo atual".
Perguntas cruzam Transactions/Trades/Payouts/Tax/Cashflow. Sem auto-mover dinheiro.
