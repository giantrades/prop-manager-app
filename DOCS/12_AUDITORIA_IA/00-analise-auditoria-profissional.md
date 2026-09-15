# Análise da Auditoria Profissional (PDF da outra IA) — leitura crítica

> Arquivo analisado: `PropManager_Auditoria_Profissional.pdf` (extraído p/ texto).
> Este doc é a **minha leitura** (agente Page Improvements) do que **faz sentido**, do que
> **já existe**, do que é **exagero/adiar** e do meu **plano sugerido**, módulo a módulo.
> Sem código aqui — é decisão de produto.

## Veredito geral (minha opinião)
A auditoria está **boa e madura no diagnóstico** e fraca na priorização: ela lista ~80 itens
como se todos fossem igualmente importantes, e não conhece o que **já existe** no app. Os
pontos fortes reais são 3 teses:

1. **Integração > páginas novas** — “explicar o que aconteceu”, não só mostrar. Concordo.
2. **Insight Engine determinístico e auditável** (regra → evidência → severidade → ação).
   Concordo e **já temos a base** (`generateInsights`/`buildActions`/gaveta de notificações).
3. **Confiança no dado** (freshness/qualidade/sync audit). Concordo, mas é **P1**, não P0.

O que eu **descartaria ou adiaria**: Metric Registry formal, audit log com before/after,
camada de agregação pré-computada, Sankey, idempotência com contentHash — é engenharia de
“empresa”, não de um trader solo. Dá pra colher 80% do valor com 20% do esforço.

## O que a auditoria não sabe que já existe
- **Filtro de período global** (Mês/Intervalo/Tudo) já em Home/Trading/Contas/Investimentos/
  Planejamento/Gastos (Batches AF/AG).
- **Insight/Action**: `buildCommandSnapshot` + `buildActions` + `generateInsights` + gaveta
  de notificações com “lido” sincronizado + regras em Settings.
- **Widget Grid** (drag/resize/hide) em todos os dashboards.
- **Live Positions & Orders** via bridge Quantower (SL/TP, fechar, cancelar, nova ordem).
- **Firms** com cor/ícone, conexão→firm, propagação p/ contas.
- **Payouts** com status, split, alocação, e o **tracker de Impostos por categoria** (novo).
- Extração MAE/MFE: o bridge **já grava `AllFills`** (comentado no C#) para MAE/MFE.

---

## Por módulo

### 2. Home / Command Center
**Auditoria:** 4 camadas (Estado + delta, Attention, Equity+DD sincronizados, Upcoming) +
widget **Data Freshness**.
- **Faz sentido:** “estado + **delta vs período anterior**” (barato e alto valor); Attention
  Center (já temos Ações — só falta priorizar por severidade e linkar ao contexto);
  “Upcoming” (calendário já existe).
- **Exagero agora:** equity+DD sincronizados na Home (temos no Trading).
- **Minha ideia:** (a) adicionar **delta vs período anterior** nos KPIs da Home; (b)
  **Data Freshness** como widget pequeno (Quantower/preços/USD-BRL/backup + idade) — é
  barato e resolve dúvida real; (c) Attention já existe, só melhorar severidade/ordenação.

### 3. Trading Dashboard
**Auditoria:** Risk Headroom, Daily Risk, Daily PnL bars, Rolling Expectancy, R dist +
box plot, Heatmap dia×hora e setup×sessão, MAE/MFE, Risk×Result scatter, revisar “ROI”.
- **Faz sentido (alto valor):** **Risk Headroom por conta** (equity, DD máx/usado/restante —
  já temos os dados em `risk.snapshot`/drawdown); **Daily PnL bars**; **Rolling Expectancy**;
  **Heatmap dia×hora**; **MAE/MFE** (bridge já captura os fills).
- **Médio:** R distribution **+ box plot** (temos histograma); Risk×Result scatter.
- **Correção que concordo 100%:** **terminologia de “ROI”** — hoje é payout/capital nominal,
  o que é enganoso. Renomear para **Payout Yield** e reservar “ROI” para retorno sobre risco.
- **Minha ideia:** atacar nessa ordem: terminologia → Risk Headroom → Daily PnL →
  Heatmap → Rolling Expectancy → MAE/MFE.

### 4. Journal / Playbook
**Auditoria:** Edge Analysis, Rule Adherence, Behavioral Correlation, Streak, Strategy
Matrix, Strategy Versioning, Strategy Lab.
- **Faz sentido:** **Edge Analysis** (setup×WR×Avg R×PF×expectancy×holding) e **Strategy
  Matrix** — já temos `allStrategyMetrics`; falta UI comparativa. **Rule Adherence**
  (checklist×resultado) é diferencial real.
- **Adiar:** Behavioral Correlation (sono/humor) e Strategy Versioning dependem de disciplina
  de input; muito trabalho de UI para amostra pequena. Só com amostra visível.
- **Minha ideia:** “Strategy Matrix” + “Edge por setup” primeiro; versioning depois.

### 5. Accounts / Firms / Payouts
**Auditoria:** Lifecycle, Account Health decomponível, Account Matrix, Firm Performance,
Payout Waterfall, Payout Pipeline, Allocation (Tax/Living/Investment/Cash).
- **Faz sentido e casa com o que já fizemos:** **status CHALLENGE/FUNDED/LIVE/STANDBY** já
  entrou; falta **Account Matrix** (tabela comparável por status/equity/DD/payouts/sync) e
  **Payout Waterfall** (gross→fees→taxes→costs→net). **Firm Performance** já existe parcial
  (`firmPnl`).
- **Pipeline** (Expected→Requested→Approved→Received→Allocated) é bom, mas exige mais estados
  no Payout; dá para simplificar para 3 (Pendente/Recebido/Alocado) e evoluir.
- **Minha ideia:** Account Matrix (tabela) + Payout Waterfall + manter Allocation como donut.

### 6. Portfolio / Wealth
**Auditoria:** Treemap, Contribution to Return, Relative Performance (vs CDI/IBOV), Income
Calendar, Dividend History, Net Worth Composition (stacked area), Net Worth Waterfall.
- **Faz sentido:** **Relative Performance** (temos CDI + benchmark; falta IBOV/IBOV proxy) e
  **Net Worth Waterfall** (mês: início→trading→payouts→gastos→investimentos→fim) — alto valor
  para entender de onde veio o dinheiro.
- **Médio:** Treemap (bonito, mas o donut por classe já responde o essencial), Dividend
  History/Calendar (depende de dados de dividendos confiáveis).
- **Minha ideia:** Net Worth Waterfall + Relative vs CDI/IBOV primeiro; treemap depois.

### 7. Gastos / Finance
**Auditoria:** Budget Variance, Stacked Category Trend, Savings Rate, Recurring consolidado,
Quick Add, **Credit Card entity**.
- **Faz sentido:** **Budget Variance** (orçado×realizado por categoria), **Stacked Category
  Trend** (composição ao longo dos meses), **Savings Rate** e **Recurring consolidado** (já
  temos candidatos a recorrentes). **Quick Add** rápido com “Mais opções” — ótimo UX.
- **Médio:** Credit Card como **entidade** (limite/fechamento/vencimento/moeda). Hoje usamos
  `card` string + `paid`; entidade é melhor, mas mexe em schema/sync.
- **Minha ideia:** Quick Add + Budget Variance + Stacked Trend (não precisa schema). Cartão
  entidade só se você realmente precisar de limite/fechamento.

### 8. Planejamento / Forecast / Tax
**Auditoria:** Planning Center, Goal Projection (cenários), Purchase Simulator, Cashflow
Scenario Cone, Runway, Tax flow.
- **Faz sentido:** **Goal Projection** e **Runway** (meses de caixa) — deriváveis do forecast
  atual. **Purchase Simulator** (“posso comprar isso?”) é o `safeAvailable` já existente com
  sliders; barato e útil. **Cashflow Scenario Cone** é o forecast com faixa — bom.
- **Tax:** a auditoria assume um **fluxo fiscal** (Trade income→Taxable→Reserve→Due→Paid).
  **Já decidimos diferente**: você não faz day trade BR; o app **registra o que você paga**
  (tracker de Impostos por categoria). O que faz sentido roubar daqui: **Reserve** (separar
  dinheiro p/ imposto) — é barato via alocação.
- **Minha ideia:** Purchase Simulator + Runway + Goal Projection; sobre Tax, manter o tracker
  e opcionalmente uma “reserva de imposto”.

### 9. Live Trading / Quantower
**Auditoria:** Trading Monitor, Platform Health, Exposure, PnL by Account, Position Heatmap,
Sync Center/History/Audit.
- **Faz sentido:** **Platform Health** (conexão, último tick, último erro) e **Exposure**
  (por símbolo, long×short) — temos posições/ordens; falta a visão de saúde e exposição.
  **PnL by Account** já existe. **Position Heatmap** conta×símbolo é barato (temos os dados).
- **Exagero agora:** Sync Audit com before/after + syncRunId (muito caro para o ganho).
- **Minha ideia:** Platform Health + Exposure + Position Heatmap; “Sync Center” simples
  (último run, criados/atualizados/erros) reaproveitando o auto-sync.

### 10. Reports
**Auditoria:** Report Builder (Trading/Finance/Portfolio/Tax) + Monthly Waterfall.
- **Faz sentido parcial:** um **Report Builder** completo é muito trabalho. Um **Monthly
  Review** pronto (1 página com waterfall + KPIs do mês) entrega 90%. Templates salvos: adiar.
- **Minha ideia:** “Relatório do mês” fixo e bom > builder genérico.

### 11. Insight Engine
**Auditoria:** regras determinísticas com id/métrica/condição/threshold/severidade/evidência.
- **Concordo integralmente e a base já existe.** O ganho é **formalizar a regra** (id/métrica/
  evidência clicável) e **ligar cada alerta ao contexto** que o gerou.
- **Minha ideia:** evoluir `generateInsights`/`buildActions` para carregar `metric`,
  `evidence`, `threshold` e um `href` de drill-down. Nada de IA generativa agora.

### 12. Action Center / Notifications
**Auditoria:** severidade INFO/WARNING/CRITICAL, Review/Snooze/Dismiss/mute, Digest, link ao
contexto.
- **Faz sentido:** já temos gaveta + “lido” + regras on/off. Falta **severidade visual**,
  **snooze/dismiss** e **link para o contexto**. Digest diário: bom, mas depende de push.

### 13. Personalização / Navegação
**Auditoria:** Widget Grid (temos), presets, filtros globais (período/conta/firm/strategy/
currency), drill-down, URL state, Entity Drawer, keyboard.
- **Faz sentido:** **filtros globais** (temos período; falta **conta/estratégia**), **URL
  state** dos filtros, **Entity Drawer** (abrir trade/conta/payout sem sair da página) e
  **drill-down** clicando no gráfico. Presets de widgets: legal, baixo custo.
- **Minha ideia:** Entity Drawer + drill-down + URL state (grandes ganhos de UX).

### 14/15. Sistema de visualizações / o que evitar
- **Concordo com a lista de “evitar”** (radar, gauges decorativos, excesso de donut, 3D).
- A tabela “informação → visualização” é um bom guia. **Serifa:** só trocar gráfico se ele
  responde uma pergunta melhor; senão vira enfeite.

### 16. Arquitetura de dados / métricas
- **Metric Registry / Data Quality / Audit log / agregação pré-computada / idempotência
  pesada:** é o item mais “empresa” da auditoria. **Não recomendo agora.** Para escala pessoal,
  os motores já são a fonte única e os volumes são pequenos.
- **O que vale:** um **“metric registry” leve** (só um doc/nome + fórmula + versão, para
  evitar divergência de terminologia) e **Data Freshness** (item 2). O resto adiar.

### 17. Micro UX
- **Concordo quase 100%:** skeleton estrutural, empty states com ação, erros “o que/por quê/
  como resolver”, hover actions, separar Surface/Widget/Data. É barato e melhora muito.

### 18. Rotas / legacy / produção
- **Concordo:** auditoria “Defined→…→Dead”. Já temos demo atrás de flag e removemos páginas
  mortas (Tax, Dinheiro). Vale um passe periódico para matar export/rota órfã.

### 19. Roadmap (P0/P1/P2)
A auditoria coloca Metric Registry/Data Quality/Sync Audit no P0 — **discordo**. Meu P0:
1. **Terminologia** (ROI → Payout Yield; consistência de “return/capital”).
2. **Data Freshness** (widget) — confiança no dado com pouco esforço.
3. **Filtros globais** (conta/estratégia) + **URL state** + **drill-down/Entity Drawer**.
4. **Insight/Alert**: evidência clicável + severidade + snooze/dismiss.
P1: Risk Headroom, Daily PnL bars, Rolling Expectancy, MAE/MFE, Heatmap, Account Matrix,
Payout Waterfall, Budget Variance, Quick Add, Net Worth Waterfall, Relative vs CDI/IBOV.
P2: Strategy Versioning, Report Builder, Purchase Simulator, Scenario Cone, Treemap, Sync
Audit, Metric Registry formal, Credit Card entity.

### 20/21. Top 15 funcionalidades / Top 10 gráficos
Boas listas, mas **genéricas**. Minha versão curta (o que eu faria amanhã):
- **Features:** 1) Data Freshness, 2) Attention/Digest com drill-down, 3) Risk Headroom,
  4) MAE/MFE, 5) Account Matrix, 6) Payout Waterfall, 7) Budget Variance, 8) Net Worth
  Waterfall, 9) Entity Drawer, 10) Strategy Edge Matrix.
- **Gráficos:** 1) Equity+Underwater, 2) Daily PnL bars, 3) R dist + box, 4) Heatmap dia×hora,
  5) MAE/MFE scatter, 6) Waterfall do patrimônio, 7) Stacked category trend, 8) Relative vs CDI,
  9) Payout waterfall, 10) Scenario cone.

## Conclusão minha
A auditoria **acerta na direção** (integração, diagnóstico, evidência) e **erra na dosagem**
(transforma confiança-em-dado e registry em P0 e lista oitenta features). O melhor caminho:
colher os itens **baratos e de alto impacto** (terminologia, freshness, drill-down, alertas
com evidência, alguns gráficos já deriváveis dos motores) e **ignorar a infraestrutura
pesada** por enquanto. Se um dia o app virar multiusuário/time, aí sim Metric Registry/audit
log/agregação entram.

### Desvios conscientes vs a auditoria (e por quê)
- **Tax**: mantemos “tracker de impostos por categoria” (você não faz day trade BR) em vez do
  fluxo fiscal day/swing.
- **ROI**: renomear (concordância total).
- **Metric Registry/Data Quality/Audit/Sankey/Treemap**: adiados; cadência de P2.
