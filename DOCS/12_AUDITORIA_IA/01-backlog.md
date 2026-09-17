# Backlog — Auditoria IA (execução rastreável)

> **Esta é a memória do plano.** Nada aqui é feito sem o dono pedir. Ao executar um item,
> marque `[x]` + data + commit. Qualquer nova sessão/agente lê este arquivo e continua daqui.
> Análise/justificativa: `00-analise-auditoria-profissional.md`.
>
> Convenção: `- [ ] ID — descrição (módulo · nota)`.

## P0 — alto impacto e barato
- [x] AUD-P0-01 — Terminologia: "ROI" → **Payout Yield** (payouts/capital nominal) em Trading e Contas. (branch `audit/execucao`)
- [x] AUD-P0-02 — Widget **Data Freshness** na Home (Quantower, última sync, preços, USD/BRL + idade/status).
- [x] AUD-P0-03 — Insights com **evidência clicável** (`href` de drill-down por tipo; `source` como evidência).
- [x] AUD-P0-04 — Alertas: severidade **critical/warn/info/good** + **snooze/dismiss** + link ao contexto.
- [x] AUD-P0-05 — **Entity Drawer** (conta a partir dos widgets da Home) + drill-down nos insights/alertas.
- [x] AUD-P0-06 — **URL state** do período (`?p=month|range|all&ym=...&from=...&to=...`).
- [x] AUD-P0-07 — **Delta vs período anterior** nos KPIs da Home (saldo e PnL acumulado).

## P1 — analítico e gestão
- [x] AUD-P1-01 — **Risk Headroom** por conta prop (equity + % DD usado, colorido por status) no Trading.
- [x] AUD-P1-02 — **Daily PnL bars** (resultado por dia) no Trading.
- [x] AUD-P1-03 — **Rolling Expectancy** (janela 20 trades) no Trading.
- [x] AUD-P1-04 — **MAE/MFE** (médias + razão MFE/MAE; usa fills/mae/mfe do trade) no Trading.
- [x] AUD-P1-05 — **Heatmap por dia da semana** (PnL/winrate/R) no Trading. (sessão/setup = a seguir)
- [x] AUD-P1-06 — **R — caixa (quartis + outliers)** no Trading.
- [x] AUD-P1-07 — **Strategy Matrix / Edge por setup** (tabela com N/WR/Avg R/PF/Expectancy por estratégia) no Trading.
- [x] AUD-P1-08 — **Rule Adherence** (checklist do dia × resultado) no Trading (últimos 30 dias com trades).
- [x] AUD-P1-09 — **Account Matrix** (tabela: status/equity/DD/payouts/trades/sync) no dashboard de Contas.
- [x] AUD-P1-10 — **Payout Waterfall** (gross → fees → net) no dashboard de Contas.
- [x] AUD-P1-11 — **Budget Variance** (orçado × realizado por categoria, barra verde/vermelha) no Gastos.
- [x] AUD-P1-12 — **Stacked Category Trend** (composição dos gastos por mês, empilhado) no Gastos.
- [x] AUD-P1-13 — **Savings Rate** (poupado % + comparação com o período anterior) no Gastos.
- [x] AUD-P1-14 — **Quick Add** (lançamento rápido: conta/valor/categoria/nota) no Gastos.
- [x] AUD-P1-15 — **Fluxo do patrimônio (waterfall)** no Investimentos: Entradas → (−) Gastos → (−) Custos → PnL trading → Variação.
- [x] AUD-P1-16 — **Relative Performance** vs CDI (base 100) no Investimentos.
- [x] AUD-P1-17 — **Filtros globais** conta/estratégia (contexto + URL; aplicados em Trading e Gastos).
- [x] AUD-P1-18 — **Micro UX** (slice): empty states acionáveis em Gastos e Trading (skeleton/erros acionáveis ficam como melhoria contínua).

## P2 — depois
- [x] AUD-P2-01 — Sync Center simples (último run, criados/atualizados/skipped) na página Quantower.
- [x] AUD-P2-02 — Platform Health (Live): plataforma, conexões, posições, ordens, última sync.
- [x] AUD-P2-03 — Exposure long×short + Position Heatmap (por símbolo) na página de posições.
- [x] AUD-P2-04 — Strategy Versioning: campo `strategyVersion` no trade (form) + migration 004.
- [x] AUD-P2-05 — Relatório do período (KPIs + waterfall) com seletor de período.
- [x] AUD-P2-06 — Purchase Simulator ("posso comprar isso?") no Planejamento.
- [x] AUD-P2-07 — Runway (meses de caixa) no Planejamento. *(Scenario Cone fica como continuação)*
- [x] AUD-P2-08 — Goal Projection (meses + data estimada pelo fluxo mensal) no Planejamento.
- [x] AUD-P2-09 — Treemap do portfólio (por ativo) no Investimentos.
- [x] AUD-P2-10 — Cartão como entidade (limite/fechamento/vencimento) + manager em Settings + migration 004.
- [x] AUD-P2-11 — Metric Registry leve (doc `03-metric-registry.md`).
- [x] AUD-P2-12 — Reserva de imposto (linha "A pagar (reservar)" no widget de Impostos).
- [x] AUD-P2-13 — Auditoria de rotas/legacy: removidas rotas órfãs /risk e /networth; nav e rotas alinhadas.

## Passo 3 — continuidades + próximo nível (A/B)
> "Passo 3" = fechar as continuidades da auditoria (A) e o próximo nível estrutural (B).
> A1/A2 entregues em `2ed291f4`. A3–B8 entregues na rodada de 2026-09-16.

- [x] A1 — Heatmap por **sessão** (Trading). `2ed291f4`
- [x] A2 — **Cenário do forecast** 30/60/90d (Planejamento). `2ed291f4`
- [x] A3 — **MAE/MFE com dados do bridge**: `TradeDto.Mae/Mfe` (PATCH C, C#) + adapter + ingest + testes. *(compilar o bridge no Quantower)*
- [x] A4 — **Micro UX**: `DashSkeleton` + `ActionableError` (o quê/por quê/como resolver + retry) em Trading/Gastos/Investimentos/Contas/Planejamento/Relatórios.
- [x] B5 — **Insight Engine formal**: cada insight com `metric` + `evidence` + `threshold` (+ UI e `03-metric-registry.md` v2).
- [x] B6 — **Entity Drawer universal**: `useEntityDrawer` + drawer declarativo (`rows`/`href`); Home (conta/ação), Trading (dia/estratégia/conta), Investimentos (ativo/payout), Gastos (lançamento).
- [x] B7 — **Drill-down de gráficos**: clique nas barras de PnL por dia (Trading), payouts por mês (Investimentos), treemap (Investimentos) e linha de lançamento (Gastos).
- [x] B8 — **Push Digest**: Edge Function `push-digest` (retrospecto 24h, só narra números já gravados) + toggle "Resumo diário" em Settings + runbook de cron.

## Descartado conscientemente (não fazer agora)
- Metric Registry formal, audit log before/after, agregação pré-computada, Sankey,
  idempotência com contentHash, gauges/radar/3D. Motivo: infraestrutura de "empresa",
  sem ganho proporcional para trader solo. Reavaliar só se virar multiusuário/time.

## Desvios vs a auditoria (decisões já tomadas)
- **Tax**: tracker de impostos por categoria (não fluxo fiscal day/swing). Cockpit removido.
- **ROI**: será renomeado (AUD-P0-01).

## Pendências fora do passo 3 (levantadas após o P2 + fixes de deploy)
- [x] **Cartão integrado aos lançamentos** (#1): `Transaction.cardId` (aditivo) + select de cartão salvo no
      form (fallback texto quando não há cartões) + `invoiceCycle()` (fatura aberta por fechamento) + faturas
      por cartão com uso do limite no Gastos. Corrigido também o `onAdd` que descartava card/paid/dueDate/
      tags/anexos ao lançar. *(Testes: expenses/`invoiceCycle`.)*
- [x] **Strategy Matrix por `strategyVersion`** (#2): `strategyVersionMetrics()` (mesma métrica, agrupada por
      `strategyId` × versão) + toggle "por estratégia / por versão" + versão no detalhe (Entity Drawer).
- [ ] **Relative Performance só vs CDI** — falta IBOV/benchmark configurável.
- [x] **Dividendos** (#4): motor `dividendHistory` / `dividendIncomeByMonth` / `dividendByAsset` /
      `dividendCalendar` (puros) + na aba Proventos do Portfolio: **Histórico de proventos** (total,
      média/mês, barras por mês, ranking por ativo) e **Calendário de renda** (recebido × anunciado,
      navegação por mês). Testes em `expenses.test.ts`.
      Widget **Proventos** no dashboard de Investimentos. **Decisão**: sem automação de "anunciados" —
      o Yahoo só dá histórico e a projeção por cadência era palpite do app; **recebidos e anunciados são
      manuais** (botões "+ provento" / "Anunciar provento"), que é o confiável.
- [x] **AccountPicker melhorado (Trading)** (#5): busca + seleção múltipla escalável (20+ contas), ordenação
      por tipo/nome, "todas (filtradas)", contador e fechar por Esc/clique-fora; seleção persistida em
      `ui:filters` (meta) e na URL (`?accounts=`). **Gastos segue sem filtro de conta (geral).**
- [x] **Fila offline de ordens na camada do app** (#6): `packages/utils/orderQueue.js`
      (`submitOrQueue`/`flushQueue`, `clientOrderId` estável p/ replay idempotente, erros reais não entram
      na fila). `LivePositionsPage` usa a fila em modificar SL/TP, fechar, cancelar e nova ordem + banner
      "N na fila" com "Enviar agora"; flush automático ao reconectar. `closePosition` passou a aceitar
      `clientOrderId`. Testes em `packages/utils/__tests__/orderQueue.test.js`.
      **+ Editar ordem**: botão "Editar" em cada ordem pendente faz **substituir** (cancelar + recolocar
      com qty/preço/SL/TP), via fila quando offline. Também: **streaming SSE** (`/stream` no bridge +
      `EventSource` + indicador LIVE) e **SL/TP no form de nova ordem**.
- [ ] **Sync cross-device a validar**: `cards` e `app_meta` (onConflict composto `user_id,id`) e
      `trades.strategy_version`.
- [ ] **Backup antes/depois do bump `DB_VERSION=4`** (store `cards` nova).
- [x] **RLS auditado** (#9): `001_init.sql` liga RLS em **10 tabelas sem nenhuma policy** (bloqueava sync
      autenticado); `cards`/`app_meta` sem DELETE. Criada a migration **`005_rls_and_sync_columns.sql`**
      (policies de dono para todas + DELETE de app_meta/cards + colunas de sync que faltavam: firm_id,
      category/recurrence/attachments/asset/paid/due_date/installments/card/card_id/tags em transactions;
      executions/mae/mfe/platform_*/tags em trades; currency/asset_kind/yield_*/alerts em positions).
      **Aplicar: `supabase db push`.**
- [ ] **QA manual** (sem E2E): checklist por módulo (Home, Trading, Contas, Gastos, Investimentos,
      Planejamento, Relatórios, Positions & Orders, Settings).
- [ ] **Produção**: confirmar deploy do fix do SW + Portfolio abrindo; e **hard refresh** (SW antigo pode
      estar ativo no navegador).
