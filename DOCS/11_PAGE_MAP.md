# MAPA DE PÁGINAS — onde vive cada tela, funcionalidade e UI

> **Para a IA:** este é o índice de navegação do código. Antes de mexer em qualquer
> tela, ache a rota aqui e siga a coluna "Container" → "UI" → "Motor". Para melhorias
> por página, use o agente `module-page-improvements` com o nome da rota.
>
> **Regra dura:** o container (em `main-app/src/pages`) só **liga** UI ↔ motor.
> Cálculo financeiro vive em `packages/lib/db`. A UI (`packages/ui`) **nunca** calcula —
> só renderiza props. Tema/glass em `packages/ui/styles.css`.

## 1. Arquitetura em uma tela

```
main-app/src/App.jsx ........ Rotas + Command palette + atalhos + PWA + ErrorBoundary
        │  providers (main.jsx)
        ▼
packages/state/FinanceContext.jsx .... useFinance() → { ds, chain, money, wealth, risk, cloud }
packages/state/CommandContext.jsx .... useCommandSnapshot() → snapshot/actions/insights (Home)
        │
        ▼
main-app/src/pages/**/*.jsx .......... CONTAINERS (carregam dados do motor, passam props)
        │
        ▼
packages/ui/*.tsx .................... COMPONENTES (render puro; recharts; aria)
        │
        ▼
packages/lib/db/*.ts ................. MOTORES (DataService, DataChainEngine, selectors)
```

- **Navegação:** `main-app/src/navConfig.js` (fonte única: âncoras da sidebar + abas + palette).
- **Abas de módulo:** `main-app/src/ModuleTabs.jsx` (`<ModuleTabs module="dinheiro" />`).
- **Sidebar:** `main-app/src/Navbar.jsx` (clique no módulo → dashboard; sem acordeão).
- **Tema/glass:** `packages/ui/styles.css` (+ `main-app/src/styles.css` p/ shell).

## 2. Mapa rápido (rota → módulo → arquivos)

| Rota | Módulo (aba) | Container | UI | Motor / dados |
|---|---|---|---|---|
| `/` | Home | `command/HomePage.jsx` | `HomeCommandCenter.tsx` | `useCommandSnapshot` |
| `/calendar` | Home | `command/CalendarPage.jsx` | `FinancialCalendar.tsx` | `ds.trades/txs`, `economicCalendar.ts`, `optionExpiryEvents` (camada Opções) |
| `/actions` | Home | `command/ActionCenterPage.jsx` | `ActionCenter.tsx` | `useCommandSnapshot().actions` |
| `/trading` | Trading | `command/TradingDashboardPage.jsx` | `JournalDashboard.tsx` | `risk.snapshot()`, `ds.trades`, checklist |
| `/journal` | Trading | `trading/JournalPage.jsx` | `HeatmapSection`, `BreakdownSection`, `HistogramR`, `DurationAnalysis`, `WeeklyReview`, `PlaybookPanel`, `NotesEditor` | `ds.trades`, `journalAnalytics.ts` |
| `/trades` | Trading | `trading/TradesPage.jsx` | `Trades.tsx`, `TradeForm.tsx` | `ds.trades`, `chain.syncTrade/deleteTrade`, `csvImport.ts` |
| `/options` | Trading | `trading/OptionsPage.jsx` | `options/OptionAnalyzer.tsx`, `OptionDesk.tsx`, `OptionChainEditor.tsx`, `OptionSmile.tsx`, `OptionPositions.tsx`, `OptionLegForm.tsx`, `OptionBoundary.tsx` | `options.ts` (templates/agregação/rolagem/fechamento), `optionsImport.ts` (CSV), `financialFormulas.ts § Opções` (BSM/gregas/payoff/T+0/What-If/risco), `ds.optionChain/optionLegs/meta` |
| `/playbook` | Trading | `trading/PlaybookPage.jsx` | `PreTradeChecklist`, `Strategies`, `EmotionalDiary` | `strategies.ts`, `checklist.ts` |
| `/risk` | Trading | `command/EngineViews.jsx` → `RiskPage()` | `RiskCenter.tsx` | `risk.snapshot()` |
| `/live-positions` | Trading | `trading/LivePositionsPage.jsx` | (tabela inline) | `usePlatform().livePositions`, `QuantowerAdapter.modifyPosition/closePosition` |
| `/contas` | Contas | `command/AccountsDashboardPage.jsx` | `RiskCenter` pills (inline) | `risk.snapshot()`, `firmPnlByFirm`, `listFirms` |
| `/accounts` | Contas | `trading/AccountsPage.jsx` | `Accounts.tsx` (reg. de contas), `AccountDetail.tsx` (modal) | `ds.accounts`, `computeAccountBalance`, `propExtensions`, `listFirms` |
| `/firms` | Contas | `trading/FirmsPage.jsx` | `FirmPnl.tsx` | `listFirms`/`saveFirm`/`deleteFirm`, `firmPnlByFirm`, `firmPnlHistory` |
| `/gastos` | Gastos | `command/GastosDashboardPage.jsx` | — | `computeFreeCash`, `budgetStatus`, `expensesByCategory`, `pendingBills`, `upcomingBills`, `invoiceStatus` |
| `/expenses` | Gastos | `command/EngineViews.jsx` → `ExpensesPage()` | `Expenses.tsx`, `QuickAddExpense.tsx` | `money.ts` (recorrentes/cartão), `bankImport.ts` |
| `/gastos/orcamento` | Gastos | `command/BudgetPage.jsx` | — | `budgetStatus`, `rolloverAmount`, `suggestBudget` |
| `/gastos/categorias` | Gastos | `command/CategoriasPage.jsx` | — | `listCategories`, `saveCategory`, `mergeCategories`, `removeCategory`, `categoryUsage` |
| `/investimentos` | Investimentos | `command/InvestmentsDashboardPage.jsx` | `NetWorth.tsx` | `wealth.netWorth()`, `portfolio()`, `netWorthSeries()` |
| `/portfolio` | Investimentos | `command/EngineViews.jsx` → `PortfolioPage()` | `Portfolio.tsx` | `wealth.portfolio()`, `priceService.ts` |
| `/networth` | Investimentos | `command/EngineViews.jsx` → `NetWorthPage()` | `NetWorth.tsx` | `wealth.netWorth()`, `netWorthSeries()` |
| `/payouts` | Investimentos | `trading/PayoutsPage.jsx` | `Payouts.tsx`, `PayoutCenter.tsx` (alocar inline) | `ds.payouts`, `chain.applyPayout`, `money.applyPayoutAllocation` |
| `/planejamento` | Planejamento | `command/PlanningDashboardPage.jsx` | `Goals.tsx`, `Forecast.tsx` | `wealth.goals()`, `forecast()`, `safeAvailable()` |
| `/goals` | Planejamento | `trading/WealthEditors.jsx` → `GoalsManagePage()` | `GoalsEditor.tsx`, `Goals.tsx` | `ds.goals`, `wealth.goals()` |
| `/forecast` | Planejamento | `command/EngineViews.jsx` → `ForecastPage()` | `Forecast.tsx` | `wealth.forecast()`, `safeAvailable()` |
| `/journal-events` | Planejamento | `command/EngineViews.jsx` → `FinancialJournalPage()` | `FinancialJournal.tsx` | `wealth.suggestJournalEvents()`, `listJournalEvents()` |
| `/reports` | Relatórios | `command/ReportsPage.jsx` | (recharts inline) | `firmPnlHistory`, `freeCash`, `taxCockpit`, `netWorth` |
| `/market` | Market | `market/MarketDashboardPage.jsx` | `market/MarketOverview.tsx` | `useMarketData`, `buildOverview`/`buildRiskComposite`/`buildBreadth` (`marketData.ts`) |
| `/market/heatmap` | Market | `market/MarketHeatmapPage.jsx` | `market/MarketHeatmap.tsx` (+ `treemap.ts`) | `useMarketData`, `buildHeatmap` |
| `/market/breadth` | Market | `market/MarketBreadthPage.jsx` | `market/MarketBreadth.tsx` | `useMarketData`, `buildBreadthDetail` |
| `/market/themes` | Market | `market/MarketThemesPage.jsx` | `market/MarketBaskets.tsx` | `useMarketData`, `buildThemes` (`marketBaskets.ts`) |
| `/market/factors` | Market | `market/MarketFactorsPage.jsx` | `market/MarketBaskets.tsx` | `useMarketData`, `buildFactors` |
| `/market/etf-map` | Market | `market/MarketEtfMapPage.jsx` | `market/MarketEtfMap.tsx` | `useMarketData`, `buildEtfMap` |
| `/market/movers` | Market | `market/MarketMoversPage.jsx` | `market/MarketMovers.tsx` | `useMarketData`, `buildMovers` |
| `/macro` | Macro | `macro/MacroCrossAssetPage.jsx` | `market/MacroCrossAsset.tsx` | `useMarketData` (1mo), `buildCrossAssetSeries` (`marketMacro.ts`) |
| `/macro/session-tape` | Macro | `macro/MacroSessionTapePage.jsx` | `market/MacroCrossAsset.tsx` | `useMarketData` (1d/5m), `buildCrossAssetSeries` |
| `/macro/rates` | Macro | `macro/MacroRatesPage.jsx` | `market/MacroRates.tsx` | `useMarketData`, `buildRatesLiquidity`/`buildCreditStress` |
| `/macro/vol` | Macro | `macro/MacroVolPage.jsx` | `market/MacroVol.tsx` | `useMarketData`, `buildVolRegime` |
| `/macro/curves` | Macro | `macro/MacroCurvesPage.jsx` | `market/MacroCurves.tsx` | `useMarketData`, `buildYieldCurve`/`buildYieldSpreads` |
| `/macro/events` | Macro | `macro/MacroEventsPage.jsx` | `market/MacroEvents.tsx` | `fetchEconomicEvents` (`economicCalendar.ts`) |
| `/live` | Live | `live/LiveSetupboardPage.jsx` | `market/LiveSetupboard.tsx` | `useMarketData` (1mo), `buildSetupboard` (`marketLive.ts`) |
| `/live/intraday-breadth` | Live | `live/LiveIntradayBreadthPage.jsx` | `market/LiveIntradayBreadth.tsx` | `useMarketData` (1d/5m), `buildIntradayBreadth` |
| `/live/alerts` | Live | `live/LiveAlertsPage.jsx` | `market/LiveAlerts.tsx` | `useMarketData`, `buildAlerts` |
| `/scanner` | Scanner | `scanner/ScannerScreenerPage.jsx` | `market/MarketScreener.tsx` | `useMarketData` (chave `market`), `buildScreener` (`marketScanner.ts`) |
| `/crypto` | Crypto | `crypto/CryptoOverviewPage.jsx` | `market/CryptoOverview.tsx` | `useMarketData` (chave `crypto`), `buildCryptoBoard` (`marketCrypto.ts`) |
| `/settings` | Sistema | `trading/SettingsPage.jsx` | `SyncConflicts.tsx` | `dumpAppDb`/`restoreAppDb`, `supabase` |
| `/quantower` | Sistema | `trading/QuantowerPage.jsx` | — | `quantowerAdapter`, `quantowerIngest.ts` |
| `/import` | Sistema | `trading/DataPage.jsx` | — | `bankImport.ts`, `importPayouts.ts` |

## 3. Detalhe por módulo

### Home (âncora `home`) — dashboard `/`
- **HomePage** `command/HomePage.jsx` — snapshot + widgets (`WIDGETS` localStorage
  `homeWidgetsHidden`) + painel Personalizar. UI: `HomeCommandCenter.tsx`
  (hero patrimônio + quadrants Trading Today/Action Center/Investments/Goals/Money +
  **Renda de opções** (`OptionIncome`) + Insights).
- **CalendarPage** `command/CalendarPage.jsx` — calendário unificado (trades, bills, tax,
  aportes). UI `FinancialCalendar.tsx`.
- **ActionCenterPage** `command/ActionCenterPage.jsx` — flags dos motores. UI `ActionCenter.tsx`.

### Trading (âncora `trading`) — dashboard `/trading`
- **TradingDashboardPage** — PnL hoje, contas em risco, checklist do dia, estratégias +
  `JournalDashboard`. Abas Resumo|Journal|Trades|Positions & Orders.
- **JournalPage** — 2 modos internos: Review | Playbook. Review = heatmaps (sessão/dia da
  semana/mapa mundial), breakdowns, distribuição R, duração e review semanal; notas por
  `NotesEditor.tsx`. Analytics em `journalAnalytics.ts` (testes `journalAnalytics.test.ts`).
  A lista/CRUD de trades saiu daqui para a aba **Trades**.
- **TradesPage** (`/trades`) — tabela de trades (busca/ordenação/paginação/cards no mobile),
  cadastro/edição via `TradeForm.tsx`, import/export CSV e exclusão em lote (com lápides
  anti-reimport). Escrita sempre por `ds.trades.put` + `chain.syncTrade`; exclusão por
  `chain.deleteTrade` + `rememberDeletedTrades`.
- **PlaybookPage** — checklist do dia + edge por estratégia + diário emocional×R.
- **Opções (F2/F3 offline — spec em `DOCS/10_MODULES/options/00-spec.md`)** — aba `/options`
  no módulo Trading (Resumo|Journal|Trades|**Opções**|Positions & Orders): **Analyzer**
  (`packages/ui/options/OptionAnalyzer.tsx` — 37 templates, payoff, breakevens, gregas),
  **Desk** (`OptionDesk.tsx` — chain com IV/Δ/OI + paper), **Smile** (`OptionSmile.tsx`) e
  **Posições** (`OptionPositions.tsx`). Paper → "Salvar estratégia" grava em `option_legs`.
  Sub-abas atuais: Analyzer · Desk · **Cotações** (`OptionChainEditor.tsx`: manual + CSV) · Smile ·
  Posições (fechar/rolar/exercer, registrar operação `OptionLegForm.tsx`, risk gate).
  Parâmetros (spot por subjacente, taxa, multiplicador padrão, estresse) em `meta['options.settings']`.
  Widgets em outras páginas: Journal → `options/OptionAnalytics.tsx` (por subjacente);
  Investimentos → `options/OptionIncomeDetail.tsx` (cobertura/yield/data-com/assignments);
  Calendar → camada "Opções" com vencimentos + data-com. Dados via `options/useOptionData.ts`.
  Motor `packages/lib/db/options.ts` + fórmulas no contrato (seção Opções). Live é a F3
  (bridge `04_STAGE3_TRADING_OS/06-OPTIONS_BRIDGE_SPEC.md`). Widget **Renda de opções**
  (`OptionIncome.tsx`) no Trading Resumo.
- **RiskCenter** (`EngineViews.jsx → RiskPage`) — drawdown/headroom/live via `risk.ts`.
- **LivePositionsPage** (`/live-positions`) — posições **abertas/ao vivo** da plataforma
  (`usePlatform().livePositions`); edita SL/TP (`modifyPosition`) e fecha (`closePosition`).
  Fonte é o bridge (Quantower/cTrader) — sem storage próprio.
  SL/TP: usa o que o bridge manda em `/positions` (`sl`/`tp`); quando vem vazio (plataforma
  guarda SL/TP como ordens separadas), `mergeOrdersIntoPositions`
  (`packages/utils/livePositionSlTp.ts`) infere das **ordens pendentes** (casa por `positionId`
  e, em fallback, conta+símbolo+lado oposto; `stop`→SL, `limit`→TP). Valores inferidos
  aparecem como "sugeridos" (input tracejado) e só vão ao bridge quando o usuário salva.
  `getOrders` expõe `positionId` e `QuantowerAdapter.normalizeOrder` normaliza também o SSE.

### Contas (âncora `contas`) — dashboard `/contas`
- **AccountsDashboardPage** — contas prop ativas, equity total, risco (STOP/WARN/SAFE),
  firms/contas, lista de contas com pill + P&L por firm. Abas Resumo|Contas|Firms.
- **AccountsPage** — **registro unificado de contas** (prop, banco, carteira, investimento,
  cripto, dinheiro): resumo, busca, filtro por tipo, cards com saldo/nominal e cor da firm,
  modal criar/editar (regras da prop quando `kind=prop`, firm — com "+ Nova empresa" inline
  — e plataforma) e modal de painel (`AccountDetail`). UI em `Accounts.tsx`.
- **FirmsPage** — cadastro de empresas/corretoras (nome, tipo, cor, logo, obs) + P&L por firm
  (`FirmPnl`); a **cor da firm propaga** para contas, pills e gráficos. Persistido em `meta`
  via `firms.ts` (`listFirms`/`saveFirm`/`deleteFirm`).

### Gastos (âncora `gastos`) — dashboard `/gastos`
- **GastosDashboardPage** — porta de entrada: gasto do mês, orçamento, a pagar, saldo do mês,
  próximas a vencer (15d), projeção de caixa, top categorias, faturas e últimos lançamentos.
  Widgets reordenáveis/ocultáveis (layout no meta `ui:widgets:gastos`) e com tendência (Δ + sparkline).
- **ExpensesPage** (aba "Lançamentos", `/expenses`) — Gastos estilo Mobills: Quick Add (≤3 toques),
  ícones, recorrentes, contas a pagar/receber com status, parcelamento, cartão/fatura
  (aberta/fechada/paga/parcial), tags, ranking, busca, visão por dia com **saldo acumulado** e
  importador OFX/CSV/QIF v2 (conta/moeda/FITID/mapeamento/regras). UI `Expenses.tsx` + `QuickAddExpense.tsx`.
  Testes `expenses.test.ts`, `bankImport.test.ts`, `amount.test.ts`.
- **BudgetPage** (aba "Orçamento", `/gastos/orcamento`) — quanto ainda posso gastar (e por dia),
  sugestão pela média de 3 meses, copiar do mês anterior, visão por grupo e rollover (B1).
- **CategoriasPage** (aba "Categorias", `/gastos/categorias`) — CRUD (ícone/cor/pai/subcategoria),
  mesclar, remover com reatribuição, reordenar, preview de uso e pack de impostos.
- **ForecastPage** (`/forecast`) — projeção de caixa 30/60/90 (wealth).

### Investimentos (âncora `investimentos`) — dashboard `/investimentos`
- **InvestmentsDashboardPage** — patrimônio, investido, PnL, maiores posições + série
  (`NetWorth`). Abas Resumo|Portfolio|Net Worth|Payouts e Withdrawals.
- **PortfolioPage** — resumo/alloc/DCA/histórico/benchmark CDI + preço live
  (`priceService.ts`) + alertas + proventos. Aba **Configurar** (FX+CDI) no próprio módulo.
- **NetWorthPage** — patrimônio derivado + snapshots. UI `NetWorth.tsx`.
- **PayoutsPage** — "Payouts e Withdrawals": CRUD de payout (`chain.applyPayout`) + alocação
  inline (Tax→Living→Invest→Cash) via `PayoutCenter` em modal. Sem aba separada de "Alocar".
- **Opções (F4 parcial)** — widget **Renda de opções** (`OptionIncome.tsx`) no Resumo:
  prêmios realizados, prêmio aberto, **cobertura de covered call** e série mensal. Prêmio
  realizado também entra no ledger (`kind: option_premium`). A aba dedicada do módulo e o
  assignment→Position automático ainda pendentes.
- **Removido**: "Wallets" (info agora vive em Contas/Accounts) e "Holdings"
  (`PositionsManagePage` ficou sem rota; a gestão de posições é a aba live no Trading).

### Planejamento (âncora `planejamento`) — dashboard `/planejamento`
- **PlanningDashboardPage** — metas, safe available, fluxo mensal, projeção 90d + Forecast/
  Goals. Abas Resumo|Goals|Forecast|Marcos.
- **GoalsManagePage** — metas (editor + progresso).
- **ForecastPage** — 30/60/90 + Safe Available + gráfico de projeção.
- **FinancialJournalPage** ("Marcos") — eventos de vida sugeridos/confirmados.

### Market (âncora `market`) — dashboard `/market`
> Terminal de mercado **read-only** (não escreve saldo/ledger). Spec em
> `DOCS/10_MODULES/market/00-spec.md`. Dados: Yahoo (batch via proxy) + Brapi/CoinGecko.
> **Vertical slice:** Environment/Heatmap/**Breadth/Themes/Factors/ETF map**/Movers; Macro virou
> módulo próprio (abaixo); Live/Scanner/Crypto no roadmap da spec.
- **MarketDashboardPage** (`/market`, "Environment") — painel cross-asset (índices, setores
  SPDR, juros/crédito, câmbio, commodities, cripto) com sparkline, **apetite a risco**
  (`buildRiskComposite`), **breadth** por setor e KPIs. UI `MarketOverview.tsx`.
- **MarketHeatmapPage** (`/market/heatmap`) — treemap setorial (2 níveis: setor → nome),
  tamanho ≈ cap, cor = variação do dia. UI `MarketHeatmap.tsx` + layout `treemap.ts`
  (`squarify`). Mobile (<640px) empilha os setores.
- **MarketBreadthPage** (`/market/breadth`) — amplitude: adv/dec/linha A/D, distribuição
  das variações (histograma), volume up/down e breadth por setor. UI `MarketBreadth.tsx`.
- **MarketThemesPage** (`/market/themes`) e **MarketFactorsPage** (`/market/factors`) — cestas
  temáticas e de fator pontuadas (variação média, breadth, rel SPY). UI `MarketBaskets.tsx`;
  universos + `buildThemes`/`buildFactors` em `packages/lib/db/marketBaskets.ts`.
- **MarketEtfMapPage** (`/market/etf-map`) — treemap de ETFs por categoria (AUM ≈ tamanho).
  UI `MarketEtfMap.tsx`.
- **MarketMoversPage** (`/market/movers`) — maiores altas/baixas, mais negociadas (volume)
  e movimentos incomuns. UI `MarketMovers.tsx`.
- **Motor** `packages/lib/db/marketData.ts` + `marketBaskets.ts` — universos curados +
  `fetchMarketQuotes` (lote, cache offline-first, `stale`) + builders puros. Hook
  `useMarketData.js` (SWR + auto-refresh 60s, 1 fetch compartilhado por `MARKET_FULL_SYMBOLS`).
  Proxy `netlify/functions/yahoo-quote.ts` (modo batch `?symbols=&range=&interval=`).

### Macro (âncora `macro`) — dashboard `/macro`
> Painel macro **read-only**. Spec em `DOCS/10_MODULES/market/00-spec.md`. Dados: Yahoo
> (batch via proxy, range `1mo`/`1d`; session tape `1d`/`5m`) + calendário free.
> Sem FRED/COT (exigem chave/pago): juros via yields do Yahoo (3M/5Y/10Y/30Y; sem 2Y).
- **MacroCrossAssetPage** (`/macro`) — desempenho normalizado (base 100) no mês + tabela.
  UI `MacroCrossAsset.tsx` (recharts multi-linha). `buildCrossAssetSeries`.
- **MacroSessionTapePage** (`/macro/session-tape`) — intraday (barras de 5 min) normalizado
  no open da sessão. Mesmo UI; `buildCrossAssetSeries(..., { granularity: '5m' })`.
- **MacroRatesPage** (`/macro/rates`) — yields do Treasury + ETFs de duration/crédito +
  stress de crédito (HY vs Treasury). UI `MacroRates.tsx`; `buildRatesLiquidity`/`buildCreditStress`.
- **MacroVolPage** (`/macro/vol`) — VIX + estrutura a termo (9D/VIX/3M/6M), contango/
  backwardation e regime. UI `MacroVol.tsx`; `buildVolRegime`.
- **MacroCurvesPage** (`/macro/curves`) — curva de juros + spreads 10y−3m / 30y−10y / 10y−5y.
  UI `MacroCurves.tsx`; `buildYieldCurve`/`buildYieldSpreads`.
- **MacroEventsPage** (`/macro/events`) — calendário econômico do mês (alta importância).
  UI `MacroEvents.tsx`; `fetchEconomicEvents` + `monthRange` (`economicCalendar.ts`).
- **Motor** `packages/lib/db/marketMacro.ts` — universos (`MACRO_SYMBOLS`, `CROSS_ASSET`,
  `SESSION_TAPE`, `RATE_ROWS`, `YIELD_POINTS`) + builders puros. Compartilha
  `fetchMarketQuotes`/`useMarketData` com o módulo Market (chaves `macro` e `macro-session`).

### Live (âncora `live`) — dashboard `/live`
> Painel "ao vivo" **read-only** derivado do feed. Spec em `DOCS/10_MODULES/market/00-spec.md`.
> Dados: Yahoo (diário `1mo` p/ SMA20; intraday `1d`/`5m`). **Sem dealer gamma** (exige feed de opções).
- **LiveSetupboardPage** (`/live`) — regime agregado (trend SPY vs SMA20, breadth setorial,
  vol/VIX, crédito HY−IEF, juros, dólar) com score e cards por sinal. UI `LiveSetupboard.tsx`;
  `buildSetupboard`.
- **LiveIntradayBreadthPage** (`/live/intraday-breadth`) — % de instrumentos acima do open da
  sessão, adv/dec e barras por instrumento. UI `LiveIntradayBreadth.tsx`; `buildIntradayBreadth`.
- **LiveAlertsPage** (`/live/alerts`) — alertas objetivos (vol spike, breadth thrust, curva
  invertida, estresse de crédito, movimento de BTC, dólar forte). UI `LiveAlerts.tsx`; `buildAlerts`.
- **Motor** `packages/lib/db/marketLive.ts` — universos (`LIVE_SYMBOLS`, `LIVE_BREADTH`) + `sma`,
  `sessionChangePct`, `buildSetupboard`, `buildIntradayBreadth`, `buildAlerts`. Reusa
  `fetchMarketQuotes`/`useMarketData` (chaves `live` e `live-intraday`).

### Scanner (âncora `scanner`) — `/scanner`
> Screener **read-only** configurável. Spec em `DOCS/10_MODULES/market/00-spec.md`.
> **Compartilha o MESMO fetch/cache do Market** (chave `market` + `MARKET_FULL_SYMBOLS`).
- **ScannerScreenerPage** (`/scanner`) — screener estilo mercado: presets (Gainers/Losers/
  Volume/Movers/Near 5d high-low), filtros (universo ações/setores/cestas/tudo, setor, direção,
  variação mín./máx., preço mín./máx., volume mín., busca), ordenação por coluna, limite, export
  CSV e filtros persistidos (`localStorage`). UI `MarketScreener.tsx`; `buildScreener`/
  `applyPreset` (`marketScanner.ts`). Métricas de 5d (`change5d`/`offHigh5d`/`offLow5d`) do série.
  **Linguagem de regras:** editor de texto (`change > 2% AND volume > 1M`…) com parser/avaliador
  em `screenerRules.ts` (`parseRule`/`evaluateRule`, `RULE_FIELDS`/`RULE_EXAMPLES` para o guia no
  app) e referência em `DOCS/10_MODULES/market/01-scanner-rules.md`.
  **Fundamentos & Earnings:** seção separada com regra própria (`fundamentals.ts`,
  `FUNDAMENTAL_FIELDS`) e feed plugável (`VITE_FUNDAMENTALS_ENDPOINT`; sem feed = “Aguardando
  feed”; contrato em `02-fundamentals-feed.md`). **Campos personalizados:** expressões
  (`customFields.ts`) persistidas em `localStorage` e usáveis como campos normais.

### Crypto (âncora `crypto`) — `/crypto`
> Painel cripto **read-only** (majors) via Yahoo. Spec em `DOCS/10_MODULES/market/00-spec.md`.
- **CryptoOverviewPage** (`/crypto`) — KPIs (BTC/ETH, adv/dec, média), tiles com sparkline e
  tabela de majors. UI `CryptoOverview.tsx`; `buildCryptoBoard` (`marketCrypto.ts`, `CRYPTO_MAJORS`).

### Relatórios (âncora `relatorios`) — `/reports`
- **ReportsPage** — cards (patrimônio/firm-6m/IR-6m) + barras firm×mês + tabela de
  fechamento 6m + CSV + imprimir. **Dívida:** v1 — falta evolução ano a ano, histórico de
  DARF, exposição cambial dedicada.

### Sistema (âncora `system`) — dashboard `/settings`
- **SettingsPage** — global: moeda + taxa USD/BRL de exibição, dados (export/import/payouts
  legado), push, conta, conflitos de sync. **Regra:** config específica de módulo fica no
  módulo, não aqui.
- **QuantowerPage** — bridge live. **DataPage** — importações.

## 4. Onde ficam as peças transversais

| Peça | Arquivo |
|---|---|
| Rotas + palette + atalhos + PWA | `main-app/src/App.jsx` |
| Fonte única de rotas/módulos/keywords | `main-app/src/navConfig.js` |
| Abas de módulo | `main-app/src/ModuleTabs.jsx` |
| Sidebar (clique → dashboard) | `main-app/src/Navbar.jsx` |
| Tema/glass/cards/tabs/print | `packages/ui/styles.css` |
| Toast | `packages/ui/Toast.tsx` |
| Command palette | `packages/ui/CommandPalette.tsx` |
| Onboarding / PWA flow / push | `main-app/src/Onboarding.jsx`, `usePwa.js`, `usePush.js` |
| Contexto financeiro (useFinance) | `packages/state/FinanceContext.jsx` |
| Snapshot do Command (Home) | `packages/state/CommandContext.jsx` |
| Fórmulas (única fonte) | `packages/lib/db/financialFormulas.ts` + `DOCS/02_STAGE1_DOMAIN/02_FINANCIAL_FORMULAS.md` |
| Motores | `packages/lib/db/*.ts` (ver tabela acima) |
| Testes dos motores | `packages/lib/db/__tests__/*.test.ts` |

## 5. Convenções de UI (obrigatórias)

- Mobile-first 360px; nada <10px; toque ≥40px (`min-height`).
- Cores só por variável CSS (`--brand`, `--green`…), nunca hex em componente novo.
- `aria-*` em tabs/grupos; toast (nunca `alert`); `ErrorBoundary` no shell.
- Cards: usar as classes do tema (`.card`, `.accentN`, gradiente) — não `rgba(255,255,255,0.02)`.
- Abas de módulo sempre via `<ModuleTabs module="..." />` (não escrever `ws-tabs` à mão).
- Container não calcula dinheiro; se faltar número, o motor precisa expor (não improvisar).

## 6. Como pedir melhoria (fluxo do agente)

1. `/agent module-page-improvements` + a rota (ex.: "melhore `/expenses`").
2. O agente lê este mapa, a spec do módulo (`DOCS/10_MODULES/<modulo>/`) e o
   `melhorias.md` do módulo; executa por item; marca `[x]`; roda `pnpm build:all` + testes.
3. Achados transversais vão para `DOCS/10_MODULES/shell-ux-foundation.md` (batch novo),
   nunca em doc solto.
