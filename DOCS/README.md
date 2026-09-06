# Personal Finance OS para Trader — Índice dos Docs

> Origem: combina PLANO_V1 + audit P0 + parecer 3 (Account unificada, ledger, net worth derivado, 7 stages).
> Regra: agentes só executam a pasta do seu stage. Nada de pular fase sem gate verde.

```
DOCS/
  README.md                        <- você está aqui + roadmap + gates
  AGENTS.md                        <- como dividir agentes, contratos, DoD
  00_VISAO/visao-produto.md        <- visão, 7 áreas, o que NÃO construir
  01_STAGE0_STABILIZE/
    00-tasks.md                    <- checklist executável P0
    01-bugs-P0.md                  <- bugs CONFIRMADOS com arquivo:linha
    02-monitoramento.md            <- logs, Sentry, métricas, quota
  02_STAGE1_DOMAIN/
    00-DOMAIN_MODEL.md             <- Account+Transaction+Position+Trade+Payout+Goal
    01-DATA_CONTRACT.md            <- schema, eventos, versionamento
    02-FINANCIAL_FORMULAS.md      <- fórmulas únicas (verdade financeira)
    03-SYNC_PROTOCOL.md           <- sync idempotente, multi-tab, restore
  03_STAGE2_DATA_ENGINE/
    00-arquitetura.md              <- DataService, IndexedDB v3, migração
    01-tasks.md
  04_STAGE3_TRADING_OS/
    00-produto.md                  <- Risk, Journal, Strategies, Challenge, Quantower
    01-tasks.md
    02-design.md                   <- UX day-trader, Quick Entry, mobile
  05_STAGE4_MONEY_OS/
    00-produto.md                  <- Transactions, Wallets, Payouts, Expenses, Tax
    01-tasks.md
  06_STAGE5_WEALTH_OS/
    00-produto.md                  <- Portfolio, Net Worth, Forecast, Goals 2.0
    01-tasks.md
  07_STAGE6_COMMAND/
    00-produto.md                  <- Home (composição), Calendar, Alerts, AI layer
    01-tasks.md
```

## Roadmap (7 stages)

| Stage | Nome | Gate para avançar |
|-------|------|-------------------|
| 0 | Stabilize | testes verdes + nenhum P0 aberto + backup pré-restore funcionando |
| 1 | Domain Foundation | DOMAIN_MODEL + DATA_CONTRACT + FORMULAS + SYNC_PROTOCOL aprovados |
| 2 | Data Engine | migração v1->v3 sem perda + multi-tab OK + paginação Supabase |
| 3 | Trading OS | Risk Center reativo + Quantower ou CSV matando input manual |
| 4 | Money OS | Payout->Wallet->Tax cadeia fim-a-fim testada |
| 5 | Wealth OS | Net Worth derivado + Portfolio cost-basis + Goals 2.0 |
| 6 | Command + Intel | Home só composição + Calendar + AI como camada leitura |

## Cadeia de dados (única verdade)

```
Trade -> Account Ledger -> Equity -> Payout Eligibility -> Payout
  -> Wallet Inflow -> Tax Reserve / Expense / Investment
  -> Net Worth (derivado) -> Goal Progress (derivado)
```

Net Worth, Goal progress, Account balance = derivados. Snapshots só para histórico.
