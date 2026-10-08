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
  LineChart,
  ListOrdered,
  Sigma,
  Database,
  Receipt,
  Zap,
  FileText,
  PiggyBank,
  Sparkles,
  Tag,
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
      { to: "/journal", label: "Journal", icon: BookOpen, keywords: "journal review heatmap desempenho analise" },
      { to: "/trades", label: "Trades", icon: ListOrdered, keywords: "trades lista tabela importar exportar csv editar excluir" },
      { to: "/options", label: "Opções", icon: Sigma, keywords: "opções options chain gregas delta gamma theta vega payoff strike calls puts renda covered call analyzer" },
      { to: "/live-positions", label: "Positions & Orders", icon: TrendingUp, keywords: "posições abertas ordens live stoploss takeprofit fechar cancelar" },
    ],
  },
  {
    id: "gastos",
    label: "Gastos",
    icon: Receipt,
    dashboard: "/gastos",
    children: [
      { to: "/gastos", label: "Resumo", icon: Receipt, end: true, keywords: "gastos dashboard resumo mobills" },
      { to: "/expenses", label: "Lançamentos", icon: Receipt, keywords: "despesas mobills lançamentos extrato" },
      { to: "/gastos/orcamento", label: "Orçamento", icon: PiggyBank, keywords: "orçamento metas limite mensal quanto posso gastar" },
      { to: "/gastos/categorias", label: "Categorias", icon: Tag, keywords: "categorias subcategorias ícones cores mesclar" },
      { to: "/forecast", label: "Forecast", icon: LineChart, keywords: "previsão fluxo caixa" },
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
      { to: "/payouts", label: "Payouts e Withdrawals", icon: ArrowDownToLine, keywords: "saques pagamentos withdrawals alocar" },
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
      { to: "/import", label: "Dados Teste", icon: Database, keywords: "demo dados teste" },
    ],
  },
];

/* Rotas de workspace que NÃO viram aba (continuam no Cmd+K). Hoje vazio. */
export const EXTRA_ROUTES = [];

export const PALETTE_ROUTES = [
  ...MODULES.flatMap((m) =>
    m.children.map(({ to, label, keywords }) => ({ to, label, keywords: keywords ?? label })),
  ),
  ...EXTRA_ROUTES,
];
