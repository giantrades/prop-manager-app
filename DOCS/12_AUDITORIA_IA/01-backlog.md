# Backlog — Auditoria IA (execução rastreável)

> **Esta é a memória do plano.** Nada aqui é feito sem o dono pedir. Ao executar um item,
> marque `[x]` + data + commit. Qualquer nova sessão/agente lê este arquivo e continua daqui.
> Análise/justificativa: `00-analise-auditoria-profissional.md`.
>
> Convenção: `- [ ] ID — descrição (módulo · nota)`.

## P0 — alto impacto e barato
- [ ] AUD-P0-01 — Terminologia: renomear "ROI" (payout/capital nominal) → **Payout Yield** e padronizar "return/capital" (Trading, Contas, Relatórios).
- [ ] AUD-P0-02 — Widget **Data Freshness** na Home (Quantower, preços, USD/BRL, backup + idade/status do dado).
- [ ] AUD-P0-03 — Insights com **evidência clicável**: `metric`, `evidence`, `threshold`, `href` (Insight Engine + gaveta).
- [ ] AUD-P0-04 — Alertas: severidade INFO/WARN/CRIT + **snooze/dismiss** + link ao contexto.
- [ ] AUD-P0-05 — **Drill-down + Entity Drawer** (abrir conta/payout/trade/ativo sem sair da página).
- [ ] AUD-P0-06 — **URL state** dos filtros (período/conta/estratégia) para preservar/voltar.
- [ ] AUD-P0-07 — **Delta vs período anterior** nos KPIs da Home.

## P1 — analítico e gestão
- [ ] AUD-P1-01 — **Risk Headroom** por conta (equity, DD máx/usado/restante).
- [ ] AUD-P1-02 — **Daily PnL bars** (resultado por dia).
- [ ] AUD-P1-03 — **Rolling Expectancy** (janela ~20 trades).
- [ ] AUD-P1-04 — **MAE/MFE** (usar `AllFills` capturado pelo bridge).
- [ ] AUD-P1-05 — **Heatmap** dia×hora e setup×sessão.
- [ ] AUD-P1-06 — **R Distribution + Box Plot**.
- [ ] AUD-P1-07 — **Strategy Matrix / Edge por setup** (Journal).
- [ ] AUD-P1-08 — **Rule Adherence** (checklist × resultado).
- [ ] AUD-P1-09 — **Account Matrix** (tabela comparável: status/equity/DD/payouts/sync).
- [ ] AUD-P1-10 — **Payout Waterfall** (gross → fees → taxes → costs → net).
- [ ] AUD-P1-11 — **Budget Variance** (orçado × realizado por categoria).
- [ ] AUD-P1-12 — **Stacked Category Trend** (composição dos gastos por mês).
- [ ] AUD-P1-13 — **Savings Rate** (poupado % + variação).
- [ ] AUD-P1-14 — **Quick Add** (lançamento rápido + "mais opções").
- [ ] AUD-P1-15 — **Net Worth Waterfall** (início → trading → payouts → gastos → invest → fim).
- [ ] AUD-P1-16 — **Relative Performance** vs CDI/IBOV (normalizado 100).
- [ ] AUD-P1-17 — **Filtros globais** conta/estratégia (período já existe).
- [ ] AUD-P1-18 — **Micro UX**: skeleton estrutural, empty states com ação, erros "o quê/por quê/como".

## P2 — depois
- [ ] AUD-P2-01 — Sync Center simples (último run, criados/atualizados/skipped/erros).
- [ ] AUD-P2-02 — Platform Health (Live): conexão, último tick, último erro.
- [ ] AUD-P2-03 — Exposure long×short + Position Heatmap (conta×símbolo).
- [ ] AUD-P2-04 — Strategy Versioning (versões do playbook × performance).
- [ ] AUD-P2-05 — Relatório do mês (waterfall + KPIs) — builder genérico adiado.
- [ ] AUD-P2-06 — Purchase Simulator ("posso comprar isso?").
- [ ] AUD-P2-07 — Cashflow Scenario Cone + Runway.
- [ ] AUD-P2-08 — Goal Projection (conservador/base/agressivo).
- [ ] AUD-P2-09 — Portfolio Treemap.
- [ ] AUD-P2-10 — Credit Card como entidade (limite/fechamento/vencimento) — **precisa schema**.
- [ ] AUD-P2-11 — Metric Registry leve (doc nome+fórmula+versão) / Data Quality.
- [ ] AUD-P2-12 — Reserva de imposto (alocação dedicada).
- [ ] AUD-P2-13 — Auditoria de rotas/legacy (Defined → … → Dead).

## Descartado conscientemente (não fazer agora)
- Metric Registry formal, audit log before/after, agregação pré-computada, Sankey,
  idempotência com contentHash, gauges/radar/3D. Motivo: infraestrutura de "empresa",
  sem ganho proporcional para trader solo. Reavaliar só se virar multiusuário/time.

## Desvios vs a auditoria (decisões já tomadas)
- **Tax**: tracker de impostos por categoria (não fluxo fiscal day/swing). Cockpit removido.
- **ROI**: será renomeado (AUD-P0-01).
