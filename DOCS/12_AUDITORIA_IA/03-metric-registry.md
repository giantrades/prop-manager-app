# Metric Registry (leve) — nome · definição · fonte · versão

> Objetivo: evitar divergência de **terminologia** e de **fórmula** entre telas/agentes.
> Não é infraestrutura: é um registro vivo. Toda métrica exibida deve apontar para a função
> do motor que a produz (fonte única) — a UI **nunca** recalcula.
>
> Regra: fórmula só existe em `packages/lib/db/financialFormulas.ts` (+ `money.ts`/`wealth.ts`
> para agregações). Se aparecer número sem fonte aqui, é bug de arquitetura.

## v1 (2026-09)

| Métrica | Definição | Fonte (motor) | Versão |
|---|---|---|---|
| PnL realizado (trade) | Σ resultado líquido do trade (com custos) | `tradePnl` / `Trade.resultNet` | v1 |
| R (múltiplo de risco) | pnl realizado ÷ risco inicial = \|entrada − stop\| × qtd × multiplicador | `calcR` / `tradeR` (`trade.resultR`) | v1 |
| Win rate | vitórias ÷ trades fechados | `winrate(trades)` | v1 |
| Profit factor | ganhos brutos ÷ perdas brutas (`n/a`/`∞` quando aplicável) | `profitFactor(trades)` | v1 |
| Expectancy | WR×avgW − LR×avgL | `expectancyOf` / `StrategyMetrics.expectancy` | v1 |
| Expectancy móvel | média de R em janela de N trades | `rollingExpectancy(trades, N)` | v1 |
| Equity da conta | base (nominal) + Σ PnL ponderado por conta | `computeEquity` (DataChainEngine) | v1 |
| Drawdown usado | fração do limite consumida (max/trailing/daily) | `AccountRiskMetrics.*Used` (RiskService) | v1 |
| Headroom | quanto resta até o limite (valor e %) | `RiskStatus.headroom` | v1 |
| **Payout Yield** | payouts líquidos ÷ capital nominal prop | tela Trading/Contas (composição) | v1 |
| Saldo de conta (líquida) | Σ amounts assinados das transações da conta | `computeAccountBalance` | v1 |
| Entrou / Gastou / Saldo (período) | Σ por tipo no período | `computeFreeCash` / `computeFreeCashPeriod` | v1 |
| Gastos por categoria | Σ despesas por categoria no período | `expensesByCategory(Period)` | v1 |
| Budget variance | orçado × realizado por categoria | `budgetStatus(Period)` | v1 |
| Savings rate | (entradas − gastos) ÷ entradas | composição (period) | v1 |
| Runway | caixa livre ÷ gasto médio mensal (3m) | composição (Planejamento) | v1 |
| Risco por classe/ativo | concentração e exposição | `wealth.allocation` / `portfolio` | v1 |
| Relative performance | portfólio vs CDI, base 100 | `relativeSeries` (`applyBenchmark`) | v1 |
| Net worth | cash + investimentos + outros | `wealth.netWorth` | v1 |
| Fluxo do patrimônio | entradas − gastos − custos + PnL trading | composição (Relatórios/Investimentos) | v1 |

## Convenções de nome (evitar confusão)
- **Payout Yield** (não “ROI”): payouts ÷ capital nominal prop.
- **Saldo** de conta = soma do ledger; **Equity** de prop = base + PnL.
- **Amostra insuficiente**: n < 20 trades (Playbook) — UI marca com `*`, nunca “estatística decorativa”.

## v2 (2026-09) — métricas do Insight Engine (B5)

> Cada insight do Command Center carrega `metric` (nome canônico abaixo), `evidence`
> (os números que o sustentam) e `threshold` (a regra determinística que disparou).

| Métrica (`metric`) | Definição | Fonte (motor) | Versão |
|---|---|---|---|
| `payout_share_by_firm` | participação da firm líder nos payouts (%) | `firmPnlByFirm` + Σ | v2 |
| `cash_ratio` | caixa ÷ patrimônio líquido (%) | `wealth.netWorth()` → components.cash | v2 |
| `avg_r_by_strategy` | R médio por estratégia (n ≥ 20) | `allStrategyMetrics(trades)` | v2 |
| `projected_net_worth_90d` | patrimônio projetado em 90 dias pelo fluxo líquido | `wealth.forecast()` → d90 | v2 |
| `accounts_at_risk` | contas prop em WARN/STOP | `risk.snapshot()` → counts | v2 |
| `mae` / `mfe` | excursão máxima adversa/favorável em $ | `Trade.mae/mfe` (bridge PATCH C) ou `maeMfe()` | v2 |

## Pendências conscientes (não são métricas ainda)
- **MAE/MFE**: o bridge agora envia `mae`/`mfe` em `$` (PATCH C); `maeMfe()` prefere os
  campos reais e cai no proxy via `executions` quando ausentes. Sem fills, null (nunca 0).
- **Sessão/hora**: heatmap por dia da semana entregue; sessão×hora/setup = continuação.
