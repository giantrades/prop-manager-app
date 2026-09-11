import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { useFinance } from "@apps/state";
import { useToast } from "@apps/ui/Toast";
import CommandPalette from "@apps/ui/CommandPalette";
import Navbar from "./Navbar";
import Onboarding from "./Onboarding";
import { usePwa } from "./usePwa";
import { pageLoaders } from "./routeLoaders";
import './styles.css';
import { PALETTE_ROUTES } from "./navConfig";

// UX foundation: code-split por rota — o chunk inicial carrega só shell.
// Páginas pesadas (charts) vão para chunks sob demanda.
// Chunks por rota (fonte única em routeLoaders.js — usada no lazy e no prefetch).
const HomePage = lazy(pageLoaders['/']);
const MoneyDashboardPage = lazy(pageLoaders['/dinheiro']);
const AccountsDashboardPage = lazy(pageLoaders['/contas']);
const TradingDashboardPage = lazy(pageLoaders['/trading']);
const InvestmentsDashboardPage = lazy(pageLoaders['/investimentos']);
const PlanningDashboardPage = lazy(pageLoaders['/planejamento']);
const CalendarPage = lazy(pageLoaders['/calendar']);
const ActionCenterPage = lazy(pageLoaders['/actions']);
const JournalPage = lazy(pageLoaders['/journal']);
const PlaybookPage = lazy(pageLoaders['/playbook']);
const AccountsPage = lazy(pageLoaders['/accounts']);
const PayoutsPage = lazy(pageLoaders['/payouts']);
const PayoutCenterPage = lazy(pageLoaders['/payout-center']);
const SettingsPage = lazy(pageLoaders['/settings']);
const GoalsManagePage = lazy(pageLoaders['/goals']);
const PositionsManagePage = lazy(pageLoaders['/positions']);
const DataPage = lazy(pageLoaders['/import']);
const QuantowerPage = lazy(pageLoaders['/quantower']);
const RiskPage = lazy(pageLoaders['/risk']);
const NetWorthPage = lazy(pageLoaders['/networth']);
const PortfolioPage = lazy(pageLoaders['/portfolio']);
const WalletsPage = lazy(pageLoaders['/wallets']);
const TaxPage = lazy(pageLoaders['/tax']);
const ForecastPage = lazy(pageLoaders['/forecast']);
const FirmPnlPage = lazy(pageLoaders['/firms']);
const ExpensesPage = lazy(pageLoaders['/expenses']);
const FinancialJournalPage = lazy(pageLoaders['/journal-events']);
const ReportsPage = lazy(pageLoaders['/reports']);

function RouteFallback() {
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '24px 0' }}>
      <div style={{ height: 14, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
      <div style={{ height: 14, width: '70%', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Carregando página…</span>
    </div>
  );
}
import {
  initGoogleDrive,
  isSignedIn,
  onSignChange,
} from "@apps/utils/googleDrive.js";

export default function App() {
  const [driveReady, setDriveReady] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    return localStorage.getItem("sidebarPinned") !== "false";
  });
  const navigate = useNavigate();
  const finance = useFinance();
  const { toast } = useToast();
  const pwa = usePwa();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [entities, setEntities] = useState({ accounts: [], strategies: [] });
  const [onboarding, setOnboarding] = useState({ checked: false, show: false });

  // Onboarding: app vazio (sem contas nem trades) e nunca dispensado.
  useEffect(() => {
    if (!finance || onboarding.checked) return;
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem("onboardingDone") === "1") return;
        const [accounts, trades] = await Promise.all([
          finance.ds.accounts.list(),
          finance.ds.trades.list(),
        ]);
        if (!cancelled && accounts.length === 0 && trades.length === 0) {
          setOnboarding({ checked: true, show: true });
          return;
        }
      } catch {
        /* offline/sem banco: não bloqueia */
      }
      if (!cancelled) setOnboarding((s) => ({ ...s, checked: true }));
    })();
    return () => { cancelled = true; };
  }, [finance, onboarding.checked]);

  const dismissOnboarding = useCallback(() => {
    try {
      localStorage.setItem("onboardingDone", "1");
    } catch {
      /* noop */
    }
    setOnboarding({ checked: true, show: false });
  }, []);

  // Entidades para busca global (carrega só ao abrir a palette).
  useEffect(() => {
    if (!paletteOpen || !finance) return;
    let cancelled = false;
    (async () => {
      try {
        const [accounts, trades] = await Promise.all([
          finance.ds.accounts.list(),
          finance.ds.trades.list(),
        ]);
        if (cancelled) return;
        const strategies = [...new Set(trades.map((t) => t.strategyId).filter(Boolean))];
        setEntities({ accounts, strategies });
      } catch {
        /* noop */
      }
    })();
    return () => { cancelled = true; };
  }, [paletteOpen, finance]);

  const paletteItems = useMemo(() => {
    const go = (to) => () => navigate(to);
    const items = [
      ...PALETTE_ROUTES.map((r) => ({
        id: `route:${r.to}`, label: r.label, hint: 'Página', keywords: r.keywords, run: go(r.to),
      })),
      { id: 'action:new-trade', label: 'Novo trade', hint: 'Ação', keywords: 'criar registrar journal', run: () => navigate('/journal?new=1') },
      { id: 'action:refresh-prices', label: 'Atualizar preços', hint: 'Ação', keywords: 'portfolio live cotação', run: () => navigate('/portfolio') },
      { id: 'action:recurring', label: 'Gerar recorrentes', hint: 'Ação', keywords: 'gastos despesas mensais', run: () => navigate('/expenses') },
      ...entities.accounts.map((a) => ({
        id: `account:${a.id}`, label: a.name, hint: 'Conta', keywords: `${a.kind} ${a.institution || ''}`,
        run: go('/accounts'),
      })),
      ...entities.strategies.map((s) => ({
        id: `strategy:${s}`, label: s, hint: 'Estratégia', keywords: 'setup playbook',
        run: go('/playbook'),
      })),
    ];
    return items;
  }, [navigate, entities]);

  // Atalhos globais: Ctrl/Cmd+K palette, "/" palette, "N" novo trade. Nunca em campo de texto.
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
    };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }
      if (isTyping()) return;
      if (e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        navigate('/journal?new=1');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  // Update do PWA disponível → toast com ação.
  useEffect(() => {
    if (pwa.updateReady) {
      toast('Nova versão disponível.', { action: { label: 'Atualizar', run: () => pwa.applyUpdate() }, durationMs: 12000 });
    }
  }, [pwa.updateReady, pwa.applyUpdate, toast]);

  const handleInstall = useCallback(async () => {
    const res = await pwa.install();
    if (res === 'manual') {
      toast(pwa.isIOS
        ? 'No iPhone: Compartilhar → Adicionar à Tela de Início.'
        : 'Use o menu do navegador → Instalar app.', { durationMs: 8000 });
    }
  }, [pwa, toast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initGoogleDrive();
        if (!mounted) return;
        setDriveReady(true);
        onSignChange(() => {
          if (!mounted) return;
        });
      } catch (err) {
        console.error("Falha ao inicializar Google Drive:", err);
        setDriveReady(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleTogglePin = () => {
    setSidebarPinned((p) => {
      const next = !p;
      localStorage.setItem("sidebarPinned", String(next));
      return next;
    });
  };

  return (
    <div className={`app-shell${sidebarPinned ? " sidebar-pinned" : ""}`}>
      <Navbar isPinned={sidebarPinned} onTogglePin={handleTogglePin} />
      {!pwa.online && (
        <div role="alert" style={{ background: 'rgba(225,177,44,0.12)', borderBottom: '1px solid rgba(225,177,44,0.3)', color: 'var(--yellow,#e1b12c)', fontSize: 12, padding: '8px 16px', textAlign: 'center' }}>
          Offline — mostrando dados locais.
        </div>
      )}
      {(pwa.canInstall || (pwa.isIOS && !pwa.installed)) && (
        <button
          type="button"
          onClick={handleInstall}
          aria-label="Instalar aplicativo"
          style={{ position: 'fixed', right: 16, bottom: 76, zIndex: 9998, background: 'var(--brand,#7c5cff)', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        >
          Instalar app
        </button>
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
      <Onboarding open={onboarding.show} onDone={dismissOnboarding} onGo={(to) => navigate(to)} />
      <main className="main-content">
        <div className="container">
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Command Center (novo, motor-driven) */}
            <Route path="/" element={<HomePage />} />
            <Route path="/dinheiro" element={<MoneyDashboardPage />} />
            <Route path="/contas" element={<AccountsDashboardPage />} />
            <Route path="/trading" element={<TradingDashboardPage />} />
            <Route path="/investimentos" element={<InvestmentsDashboardPage />} />
            <Route path="/planejamento" element={<PlanningDashboardPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/actions" element={<ActionCenterPage />} />
            <Route path="/risk" element={<RiskPage />} />
            <Route path="/networth" element={<NetWorthPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/positions" element={<PositionsManagePage />} />
            <Route path="/goals" element={<GoalsManagePage />} />
            <Route path="/wallets" element={<WalletsPage />} />
            <Route path="/tax" element={<TaxPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/firms" element={<FirmPnlPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/journal-events" element={<FinancialJournalPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/import" element={<DataPage />} />
            <Route path="/quantower" element={<QuantowerPage />} />

            {/* Trading Journal (engine-driven — parte do Command, sem reload) */}
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/journal/*" element={<JournalPage />} />
            <Route path="/playbook" element={<PlaybookPage />} />

            {/* Money OS (engine-driven) */}
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/payouts" element={<PayoutsPage />} />
            <Route path="/payout-center" element={<PayoutCenterPage />} />

            {/* Legado */}
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
