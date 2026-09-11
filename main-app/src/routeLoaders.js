// Fonte única dos chunks por rota (lazy) + prefetch. O prefetch é chamado pelas
// abas de módulo (ModuleTabs) para que trocar de aba dentro do módulo seja
// instantâneo (sem flash de Suspense). Ver App.jsx.
export const pageLoaders = {
  '/': () => import('./pages/command/HomePage.jsx'),
  '/dinheiro': () => import('./pages/command/MoneyDashboardPage.jsx'),
  '/contas': () => import('./pages/command/AccountsDashboardPage.jsx'),
  '/trading': () => import('./pages/command/TradingDashboardPage.jsx'),
  '/investimentos': () => import('./pages/command/InvestmentsDashboardPage.jsx'),
  '/planejamento': () => import('./pages/command/PlanningDashboardPage.jsx'),
  '/calendar': () => import('./pages/command/CalendarPage.jsx'),
  '/actions': () => import('./pages/command/ActionCenterPage.jsx'),
  '/journal': () => import('./pages/trading/JournalPage.jsx'),
  '/playbook': () => import('./pages/trading/PlaybookPage.jsx'),
  '/accounts': () => import('./pages/trading/AccountsPage.jsx'),
  '/payouts': () => import('./pages/trading/PayoutsPage.jsx'),
  '/payout-center': () => import('./pages/trading/PayoutCenterPage.jsx'),
  '/settings': () => import('./pages/trading/SettingsPage.jsx'),
  '/goals': () => import('./pages/trading/WealthEditors.jsx').then((m) => ({ default: m.GoalsManagePage })),
  '/positions': () => import('./pages/trading/WealthEditors.jsx').then((m) => ({ default: m.PositionsManagePage })),
  '/import': () => import('./pages/trading/DataPage.jsx'),
  '/quantower': () => import('./pages/trading/QuantowerPage.jsx'),
  '/risk': () => import('./pages/command/EngineViews.jsx').then((m) => ({ default: m.RiskPage })),
  '/networth': () => import('./pages/command/EngineViews.jsx').then((m) => ({ default: m.NetWorthPage })),
  '/portfolio': () => import('./pages/command/EngineViews.jsx').then((m) => ({ default: m.PortfolioPage })),
  '/wallets': () => import('./pages/command/EngineViews.jsx').then((m) => ({ default: m.WalletsPage })),
  '/tax': () => import('./pages/command/EngineViews.jsx').then((m) => ({ default: m.TaxPage })),
  '/forecast': () => import('./pages/command/EngineViews.jsx').then((m) => ({ default: m.ForecastPage })),
  '/firms': () => import('./pages/trading/FirmsPage.jsx'),
  '/expenses': () => import('./pages/command/EngineViews.jsx').then((m) => ({ default: m.ExpensesPage })),
  '/journal-events': () => import('./pages/command/EngineViews.jsx').then((m) => ({ default: m.FinancialJournalPage })),
  '/reports': () => import('./pages/command/ReportsPage.jsx'),
};

const prefetched = new Set();

/** Baixa o chunk da rota (uma vez). Tolerante a erro (offline). */
export function prefetchPage(path) {
  if (!path || prefetched.has(path)) return;
  const loader = pageLoaders[path];
  if (!loader) return;
  prefetched.add(path);
  try { Promise.resolve(loader()).catch(() => prefetched.delete(path)); } catch { prefetched.delete(path); }
}
