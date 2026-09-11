// FONTE ÚNICA de navegação — sidebar (Navbar) + palette (App) + restore (Navbar).
// Antes os labels viviam em 2 lugares (MODULES no Navbar + PALETTE_ROUTES no App)
// e divergiam. Nova rota: adicionar 1x aqui (módulo + keywords). Rotas fora da
// sidebar (workspaces por aba) entram em EXTRA_ROUTES p/ continuarem no Cmd+K.
//
// Fonte: DOCS/10_MODULES/README.md (módulos) + shell-ux-foundation.md (Batch D).
import {
  LayoutDashboard,
  Wallet,
  ArrowDownToLine,
  Target,
  Building2,
  Settings,
  BookOpen,
  Activity,
  CalendarDays,
  Bell,
  ShieldAlert,
  TrendingUp,
  Landmark,
  LineChart,
  Database,
  Receipt,
  Zap,
  FileText,
  PiggyBank,
  Banknote,
  Sparkles,
} from "lucide-react";

/* 7 âncoras do visao-produto.md (resto é drill-down por abas) + grupo Sistema
   (utilidades: Settings/Quantower/Importar — desvio intencional documentado).
   Ver DOCS/00_VISAO/visao-produto.md + DOCS/10_MODULES/README.md. */
export const MODULES = [
  {
    id: "home",
    label: "Home",
    icon: LayoutDashboard,
    dashboard: "/",
    children: [
      { to: "/", label: "Home", icon: LayoutDashboard, end: true, keywords: "command dashboard início" },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, keywords: "calendário financeiro" },
      { to: "/actions", label: "Actions", icon: Bell, keywords: "alertas ações pendentes" },
    ],
  },
  {
    id: "contas",
    label: "Contas",
    icon: Wallet,
    dashboard: "/contas",
    children: [
      { to: "/contas", label: "Resumo", icon: Wallet, end: true, keywords: "contas dashboard resumo" },
      { to: "/accounts", label: "Contas", icon: Wallet, keywords: "contas prop banco carteira investimento" },
      { to: "/firms", label: "Firms", icon: Building2, keywords: "empresas corretoras firm proprfirm cadastro" },
    ],
  },
  {
    id: "trading",
    label: "Trading",
    icon: Activity,
    dashboard: "/trading",
    children: [
      { to: "/trading", label: "Resumo", icon: Activity, end: true, keywords: "trading dashboard resumo" },
      { to: "/journal", label: "Trading Journal", icon: BookOpen, keywords: "trades journal" },
      { to: "/playbook", label: "Playbook", icon: Target, keywords: "estratégias setup checklist" },
      { to: "/risk", label: "Risk", icon: ShieldAlert, keywords: "risco drawdown headroom" },
    ],
  },
  {
    id: "dinheiro",
    label: "Dinheiro",
    icon: Banknote,
    dashboard: "/dinheiro",
    children: [
      { to: "/dinheiro", label: "Resumo", icon: Banknote, end: true, keywords: "dinheiro dashboard resumo" },
      { to: "/wallets", label: "Wallets", icon: Wallet, keywords: "carteiras bancos dinheiro" },
      { to: "/tax", label: "Tax", icon: Landmark, keywords: "imposto darf fiscal" },
      { to: "/payouts", label: "Payouts e Withdrawals", icon: ArrowDownToLine, keywords: "saques pagamentos withdrawals" },
      { to: "/payout-center", label: "Alocar", icon: ArrowDownToLine, keywords: "alocar saque tax living invest" },
    ],
  },
  {
    id: "gastos",
    label: "Gastos",
    icon: Receipt,
    dashboard: "/gastos",
    children: [
      { to: "/gastos", label: "Resumo", icon: Receipt, end: true, keywords: "gastos dashboard resumo mobills" },
      { to: "/expenses", label: "Lançamentos", icon: Receipt, keywords: "despesas mobills orçamento extratos" },
    ],
  },
  {
    id: "investimentos",
    label: "Investimentos",
    icon: PiggyBank,
    dashboard: "/investimentos",
    children: [
      { to: "/investimentos", label: "Resumo", icon: PiggyBank, end: true, keywords: "investimentos dashboard resumo" },
      { to: "/portfolio", label: "Portfolio", icon: TrendingUp, keywords: "investimentos ações cripto" },
      { to: "/networth", label: "Net Worth", icon: Wallet, keywords: "patrimônio total" },
      { to: "/positions", label: "Holdings", icon: TrendingUp, keywords: "posições abertas investimentos" },
    ],
  },
  {
    id: "planejamento",
    label: "Planejamento",
    icon: Target,
    dashboard: "/planejamento",
    children: [
      { to: "/planejamento", label: "Resumo", icon: Target, end: true, keywords: "planejamento dashboard resumo" },
      { to: "/goals", label: "Goals", icon: Target, keywords: "metas objetivos" },
      { to: "/forecast", label: "Forecast", icon: LineChart, keywords: "previsão fluxo caixa" },
      { to: "/journal-events", label: "Marcos", icon: Sparkles, keywords: "marcos linha do tempo eventos vida" },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: FileText,
    dashboard: "/reports",
    children: [
      { to: "/reports", label: "Relatórios", icon: FileText, keywords: "relatórios fechamento mensal exportar" },
    ],
  },
  {
    id: "system",
    label: "Sistema",
    icon: Settings,
    dashboard: "/settings",
    children: [
      { to: "/settings", label: "Settings", icon: Settings, keywords: "configurações moeda backup" },
      { to: "/quantower", label: "Quantower", icon: Zap, keywords: "sync bridge live" },
      { to: "/import", label: "Importar", icon: Database, keywords: "csv dados" },
    ],
  },
];

/* Rotas de workspace que NÃO viram aba (continuam no Cmd+K). Vazio hoje:
   `/positions` e `/payout-center` são abas dos seus módulos. */
export const EXTRA_ROUTES = [];

export const PALETTE_ROUTES = [
  ...MODULES.flatMap((m) =>
    m.children.map(({ to, label, keywords }) => ({ to, label, keywords: keywords ?? label })),
  ),
  ...EXTRA_ROUTES,
];
