# Personal Finance OS para Trader — Índice dos Docs

> Origem: combina PLANO_V1 + audit P0 + parecer 3 + **auditoria ULTRA** (verificada contra `f26cea5`)
> + **PIVOT do dono: reconstruir em vez de consertar o app antigo** (ver `00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md`).
> Regra: agentes só executam a pasta do seu stage. Nada de pular fase sem gate verde.

```
DOCS/
  README.md                        <- você está aqui + roadmap + gates
  AGENTS.md                        <- como dividir agentes, contratos, DoD
  00_AUDITORIA_ULTRA/
    00-PIVOT_RECONSTRUCAO.md       <- ★ FONTE DE VERDADE ATUAL (reconstruir direto, mobile-first, importar só payouts)
    01-GAP_AUDIT_E_EXPANSAO.md     <- especificação de requisitos (P0s = o que o app novo NÃO pode fazer)
    02-ROADMAP_ARMADILHAS_APOSTAS.md <- referência histórica + armadilhas + 3 apostas ousadas
  00_VISAO/visao-produto.md        <- visão, 7 áreas, o que NÃO construir
  01_STAGE0_STABILIZE/
    00-tasks.md                    <- Security + Scaffold + Contracts (S0.1–S0.11)
    01-bugs-P0.md                  <- REQUISITOS DE DESIGN (o que o app novo não pode fazer), não bugfix
    02-monitoramento.md            <- logs, Sentry, métricas, quota
  02_STAGE1_DOMAIN/
    00-DOMAIN_MODEL.md             <- Account unificada + PropExtension + Transaction lean + rename
    01-DATA_CONTRACT.md            <- schema v3, eventos com payload, contrato de erro
    02-FINANCIAL_FORMULAS.md      <- fórmulas únicas + edge cases (PF ∞, Sharpe por dia, consistency, PTAX)
    03-SYNC_PROTOCOL.md           <- conflito Opção B + multi-tab + restore transacional
  03_STAGE2_DATA_ENGINE/
    00-arquitetura.md              <- construção do NOVO app-db v3 (não migração), DataService, runDestructiveWrite
    01-tasks.md                    <- T2.0–T2.7 (inclui importador opcional de payouts)
    02-offline-resiliencia.md      <- offline-first, snapshot, fila idempotente, bridge health
  04_STAGE3_TRADING_OS/
    00-produto.md                  <- Risk genérico, Journal, Strategies, Challenge, Quantower
    01-tasks.md                    <- T3.1–T3.7 (+ T3.8/3.9/3.10)
    02-design.md                   <- UX day-trader, Quick Entry, mobile
    03-mobile-trading-PWA.md       <- abrir/editar/fechar pelo celular, copy-trade
    04-BRIDGE_V2_SPEC.md           <- endpoints open/modify/orders, X-Bridge-Token, idempotência
    05-PWA_MOBILE_SPEC.md          <- manifest, SW por rota, 360px, critérios numéricos
  05_STAGE4_MONEY_OS/
    00-produto.md                  <- Transactions, Wallets, Payouts, Expenses, Tax, Firm P&L
    01-tasks.md                    <- T4.0–T4.6
  06_STAGE5_WEALTH_OS/
    00-produto.md                  <- Portfolio, Net Worth, Forecast, Goals 2.0
    01-tasks.md                    <- T5.0–T5.6
  07_STAGE6_COMMAND/
    00-produto.md                  <- Home (composição), Calendar, Alerts, AI layer leitura-only
    01-tasks.md                    <- T6.1–T6.7
  08_STAGE7_INTEGRATION/
    00-plano.md                    <- Fases 6–13 (unificação, auth, polish, fim do legado, LIVE, gaps, robustez)
  10_MODULES/                      <- ★ cada módulo é um "app separado" (dashboard+gerenciar+configurar)
    README.md                      <- índice + como atacar (1 agente/conversa por módulo)
    trading-journal/00-spec.md     <- journal ✅ (J1–J12) + melhorias/ (6 itens p/ executar)
    gastos/00-spec.md              <- Mobills-like + melhorias/ (4 itens)
    portfolio/00-spec.md           <- dados LIVE + melhorias/ (4 itens)
    propfirm/00-spec.md            <- Prop/Firm + melhorias/ (4 itens)
  12_AUDITORIA_IA/                 <- auditoria externa (PDF) + analise critica + backlog rastreavel
    00-analise-auditoria-profissional.md  <- leitura critica por modulo (o que faz sentido/adiar)
    01-backlog.md                  <- MEMORIA: checklist de execucao (P0/P1/P2) - marcar [x] ao fazer
```

## Roadmap (reconstrução, mobile-first desde o dia 1)

| Fase | Nome | Gate para avançar |
|---|---|---|
| 0 | Security + Scaffold + Contracts | chave Google rotacionada + PWA instalável + 6 contratos aprovados |
| 1 | Data Engine (novo) | `app-db v3` + `DataService` + `DataChainEngine` verde + 2 payouts importados |
| 2 | Trading OS | Risk reativo + Quantower/CSV mata input manual + abre/edita/fecha no celular |
| 3 | Money OS | Payout->Wallet->Tax cadeia fim-a-fim + Firm P&L bate com cálculo manual |
| 4 | Wealth OS | Net Worth derivado reconcilia (teste automático) + Portfolio cost-basis + Goals 2.0 |
| 5 | Command + Intel | Home só composição + SPA fundida + AI leitura-only |
| 6 | Build + Integração | Um app, uma fonte de verdade (app-db v3) + Sync Supabase + Auth + fim do legado — ver `08_STAGE7_INTEGRATION/00-plano.md` (roadmap pós-Fase 5) |

## Cadeia de dados (única verdade)

```
Trade -> Account Ledger -> Equity -> Payout Eligibility -> Payout
  -> Wallet Inflow -> Tax Reserve / Expense / Investment
  -> Net Worth (derivado) -> Goal Progress (derivado)
```

Net Worth, Goal progress, Account balance = derivados. Snapshots só para histórico.

## Ação imediata (não espera Stage 0)

Google API key hardcoded e viva em `packages/utils/googleDrive.js:6-7` num repo público.
**Rotacionar no Google Cloud Console hoje** + restringir por HTTP referrer + mover para env Netlify.
