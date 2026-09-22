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
| `/calendar` | Home | `command/CalendarPage.jsx` | `FinancialCalendar.tsx` | `ds.trades/txs`, `economicCalendar.ts` |
| `/actions` | Home | `command/ActionCenterPage.jsx` | `ActionCenter.tsx` | `useCommandSnapshot().actions` |
| `/trading` | Trading | `command/TradingDashboardPage.jsx` | `JournalDashboard.tsx` | `risk.snapshot()`, `ds.trades`, checklist |
| `/journal` | Trading | `trading/JournalPage.jsx` | `JournalDashboard`, `PnLCalendar`, `HeatmapSection`, `BreakdownSection`, `HistogramR`, `DurationAnalysis`, `WeeklyReview`, `Trades`, `TradeForm`, `NotesEditor` | `ds.trades`, `journalAnalytics.ts` |
| `/playbook` | Trading | `trading/PlaybookPage.jsx` | `PreTradeChecklist`, `Strategies`, `EmotionalDiary` | `strategies.ts`, `checklist.ts` |
| `/risk` | Trading | `command/EngineViews.jsx` → `RiskPage()` | `RiskCenter.tsx` | `risk.snapshot()` |
| `/live-positions` | Trading | `trading/LivePositionsPage.jsx` | (tabela inline) | `usePlatform().livePositions`, `QuantowerAdapter.modifyPosition/closePosition` |
| `/contas` | Contas | `command/AccountsDashboardPage.jsx` | `RiskCenter` pills (inline) | `risk.snapshot()`, `firmPnlByFirm`, `listFirms` |
| `/accounts` | Contas | `trading/AccountsPage.jsx` | `Accounts.tsx` (reg. de contas), `AccountDetail.tsx` (modal) | `ds.accounts`, `computeAccountBalance`, `propExtensions`, `listFirms` |
| `/firms` | Contas | `trading/FirmsPage.jsx` | `FirmPnl.tsx` | `listFirms`/`saveFirm`/`deleteFirm`, `firmPnlByFirm`, `firmPnlHistory` |
| `/gastos` | Gastos | `command/GastosDashboardPage.jsx` | — | `computeFreeCash`, `budgetStatus`, `expensesByCategory`, `pendingBills` |
| `/expenses` | Gastos | `command/EngineViews.jsx` → `ExpensesPage()` | `Expenses.tsx` | `money.ts` (budget/categorias/recorrentes), `bankImport.ts` |
| `/tax` | Gastos | `command/EngineViews.jsx` → `TaxPage()` | `TaxCockpit.tsx` (+ `AssetSalesSection` local) | `money.taxCockpit()` |
| `/investimentos` | Investimentos | `command/InvestmentsDashboardPage.jsx` | `NetWorth.tsx` | `wealth.netWorth()`, `portfolio()`, `netWorthSeries()` |
| `/portfolio` | Investimentos | `command/EngineViews.jsx` → `PortfolioPage()` | `Portfolio.tsx` | `wealth.portfolio()`, `priceService.ts` |
| `/networth` | Investimentos | `command/EngineViews.jsx` → `NetWorthPage()` | `NetWorth.tsx` | `wealth.netWorth()`, `netWorthSeries()` |
| `/payouts` | Investimentos | `trading/PayoutsPage.jsx` | `Payouts.tsx`, `PayoutCenter.tsx` (alocar inline) | `ds.payouts`, `chain.applyPayout`, `money.applyPayoutAllocation` |
| `/planejamento` | Planejamento | `command/PlanningDashboardPage.jsx` | `Goals.tsx`, `Forecast.tsx` | `wealth.goals()`, `forecast()`, `safeAvailable()` |
| `/goals` | Planejamento | `trading/WealthEditors.jsx` → `GoalsManagePage()` | `GoalsEditor.tsx`, `Goals.tsx` | `ds.goals`, `wealth.goals()` |
| `/forecast` | Planejamento | `command/EngineViews.jsx` → `ForecastPage()` | `Forecast.tsx` | `wealth.forecast()`, `safeAvailable()` |
| `/journal-events` | Planejamento | `command/EngineViews.jsx` → `FinancialJournalPage()` | `FinancialJournal.tsx` | `wealth.suggestJournalEvents()`, `listJournalEvents()` |
| `/reports` | Relatórios | `command/ReportsPage.jsx` | (recharts inline) | `firmPnlHistory`, `freeCash`, `taxCockpit`, `netWorth` |
| `/settings` | Sistema | `trading/SettingsPage.jsx` | `SyncConflicts.tsx` | `dumpAppDb`/`restoreAppDb`, `supabase` |
| `/quantower` | Sistema | `trading/QuantowerPage.jsx` | — | `quantowerAdapter`, `quantowerIngest.ts` |
| `/import` | Sistema | `trading/DataPage.jsx` | — | `bankImport.ts`, `importPayouts.ts` |

## 3. Detalhe por módulo

### Home (âncora `home`) — dashboard `/`
- **HomePage** `command/HomePage.jsx` — snapshot + widgets (`WIDGETS` localStorage
  `homeWidgetsHidden`) + painel Personalizar. UI: `HomeCommandCenter.tsx`
  (hero patrimônio + quadrants Trading Today/Action Center/Investments/Goals/Money + Insights).
- **CalendarPage** `command/CalendarPage.jsx` — calendário unificado (trades, bills, tax,
  aportes). UI `FinancialCalendar.tsx`.
- **ActionCenterPage** `command/ActionCenterPage.jsx` — flags dos motores. UI `ActionCenter.tsx`.

### Trading (âncora `trading`) — dashboard `/trading`
- **TradingDashboardPage** — PnL hoje, contas em risco, checklist do dia, estratégias +
  `JournalDashboard`. Abas Resumo|Journal|Playbook|Risk|Positions.
- **JournalPage** — 3 modos internos: `view` Dashboard | Trades | Review. Cadastro/edição
  por `TradeForm.tsx`, notas por `NotesEditor.tsx`. Analytics em `journalAnalytics.ts`
  (testes `journalAnalytics.test.ts`).
- **PlaybookPage** — checklist do dia + edge por estratégia + diário emocional×R.
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
  próximas contas, top categorias e últimos lançamentos. Abas Resumo|Lançamentos|Tax.
- **ExpensesPage** (aba "Lançamentos", `/expenses`) — Gastos estilo Mobills (ícones,
  orçamento, recorrentes, rollover, comparação de meses, contas a pagar/receber com status,
  parcelamento, cartão/fatura, tags, ranking por estabelecimento, busca e visão por dia).
  UI grande em `Expenses.tsx`; testes `expenses.test.ts`, `bankImport.test.ts`.
  **Dívida:** hoje orçamento/categorias são toggles in-page; viram abas do módulo numa próxima rodada.
- **TaxPage** (`/tax`) — cockpit fiscal (day 20% / swing 15% / carry / DARF) + vendas de ativos.

### Investimentos (âncora `investimentos`) — dashboard `/investimentos`
- **InvestmentsDashboardPage** — patrimônio, investido, PnL, maiores posições + série
  (`NetWorth`). Abas Resumo|Portfolio|Net Worth|Payouts e Withdrawals.
- **PortfolioPage** — resumo/alloc/DCA/histórico/benchmark CDI + preço live
  (`priceService.ts`) + alertas + proventos. Aba **Configurar** (FX+CDI) no próprio módulo.
- **NetWorthPage** — patrimônio derivado + snapshots. UI `NetWorth.tsx`.
- **PayoutsPage** — "Payouts e Withdrawals": CRUD de payout (`chain.applyPayout`) + alocação
  inline (Tax→Living→Invest→Cash) via `PayoutCenter` em modal. Sem aba separada de "Alocar".
- **Removido**: "Wallets" (info agora vive em Contas/Accounts) e "Holdings"
  (`PositionsManagePage` ficou sem rota; a gestão de posições é a aba live no Trading).

### Planejamento (âncora `planejamento`) — dashboard `/planejamento`
- **PlanningDashboardPage** — metas, safe available, fluxo mensal, projeção 90d + Forecast/
  Goals. Abas Resumo|Goals|Forecast|Marcos.
- **GoalsManagePage** — metas (editor + progresso).
- **ForecastPage** — 30/60/90 + Safe Available + gráfico de projeção.
- **FinancialJournalPage** ("Marcos") — eventos de vida sugeridos/confirmados.

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
