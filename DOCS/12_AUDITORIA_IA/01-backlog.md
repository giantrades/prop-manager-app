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

## Descartado conscientemente (não fazer agora)
- Metric Registry formal, audit log before/after, agregação pré-computada, Sankey,
  idempotência com contentHash, gauges/radar/3D. Motivo: infraestrutura de "empresa",
  sem ganho proporcional para trader solo. Reavaliar só se virar multiusuário/time.

## Desvios vs a auditoria (decisões já tomadas)
- **Tax**: tracker de impostos por categoria (não fluxo fiscal day/swing). Cockpit removido.
- **ROI**: será renomeado (AUD-P0-01).

## Pend�ncias fora do passo 3 (levantadas ap�s o P2 + fixes de deploy)
- [ ] **Cart�o ainda n�o integrado aos lan�amentos**: `Transaction.card` continua texto livre. Ligar o
      formul�rio de despesa � entidade `cards` (selecionar cart�o salvo; fatura por fechamento/vencimento).
- [ ] **Strategy Matrix n�o agrupa por `strategyVersion`**: o campo � salvo, mas a compara��o por vers�o
      ainda n�o existe (completar o Strategy Versioning de verdade).
- [ ] **Relative Performance s� vs CDI** � falta IBOV/benchmark configur�vel.
- [ ] **Dividendos**: Income Calendar / Dividend History n�o implementados.
- [ ] **`filters` (conta/estrat�gia) sem uso** ap�s remover do Gastos/Trading: o AccountPicker do Trading �
      estado local (n�o persiste, n�o vai para a URL). Decidir: religar em `ui:filters` + URL, ou remover.
- [ ] **SW n�o enfileira mais writes cross-origin** (bridge): se quiser fila offline de ordens, implementar
      na camada do app (n�o no SW).
- [ ] **Sync cross-device a validar**: `cards` e `app_meta` (onConflict composto `user_id,id`) e
      `trades.strategy_version`.
- [ ] **Backup antes/depois do bump `DB_VERSION=4`** (store `cards` nova).
- [ ] **Verificar RLS**: `cards`/`app_meta` t�m policies; conferir que as demais tabelas usadas t�m policy
      correspondente (a migration `001` habilita RLS em v�rias sem policy expl�cita).
- [ ] **QA manual** (sem E2E): checklist por m�dulo (Home, Trading, Contas, Gastos, Investimentos,
      Planejamento, Relat�rios, Positions & Orders, Settings).
- [ ] **Produ��o**: confirmar deploy do fix do SW + Portfolio abrindo; e **hard refresh** (SW antigo pode
      estar ativo no navegador).
