# STAGE 3 — Trading OS (abrir ANTES de operar)

## Risk Center (novo, `RiskCenter.tsx`)

Adota correção do 3º parecer: **Account Risk**, não "Prop Risk". Cada kind tem regra:

- Prop: daily/trailing/max DD, target, consistency, minDays -> `🟢 SAFE / 🟡 WARN 50% / 🔴 STOP`
- Invest/Crypto: allocation, concentration, drawdown, exposure/volatilidade

Header dia: nominal total, PnL today, DD used, worst account, headroom, trades W/L.
Tabela: Equity, Peak, DD restante, trailing trigger, `Payout Eligible YES/NO`.

## Prop Engine 2.0 (`accountModel.ts`)

Conta vira entidade financeira real (visão do 2º parecer):
`$100k Nominal | Equity $103,420 | Peak $104,180 | Daily -$320 | MaxDD used 17% | Eligible YES | Headroom $2,580`
Campos: nominal, custo, fase, target, DDs, consistency, minDays, payout rules, split, `quantowerAccountId/lastSync`.

## Journal/Strategies/Quantower

- Journal conversa com cadeia (Trade->Equity->Eligibility->Payout->Wallet->Tax).
- Playbook: `setup/tf/sessão/símbolo/long-short: n, WR, avgR, PF, expectancy`, `n<20` = sem amostra.
- Checklist pré-trade bloqueante + diário emocional (sono/humor/FOMO) correlacionado com R.
- Quantower fim-a-fim (`fetch->normalize->upsert qt_*->recalc->goals->quantower:synced`) + botão Navbar `lastSync` OU CSV universal (MT5/cTrader/Apex/Rithmic) como fallback. Sem isso Risk nasce com dado manual atrasado.
- Corrigir `TradeForm`: R com volume/multiplier, `weights` rateiam PnL, fim dualidade `executions vs PartialExecutions`, `VWAP` usado ou removido.
