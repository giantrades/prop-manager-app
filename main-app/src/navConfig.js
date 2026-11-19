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
  Globe2,
  Timer,
  Percent,
  Gauge,
  Search,
  Bitcoin,
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
    id: "market",
    label: "Market",
    icon: LineChart,
    dashboard: "/market",
    children: [
      { to: "/market", label: "Environment", icon: LineChart, end: true, keywords: "market mercado cross-asset índices setores juros câmbio commodities cripto painel" },
      { to: "/market/heatmap", label: "Heatmap", icon: LineChart, keywords: "heatmap mapa calor setores treemap ações" },
      { to: "/market/breadth", label: "Breadth", icon: Activity, keywords: "breadth amplitude avanços quedas distribuição volume setores" },
      { to: "/market/themes", label: "Themes", icon: Sparkles, keywords: "themes temas cestas semis biotech quantum nuclear defensiva momentum" },
      { to: "/market/factors", label: "Factors", icon: Sigma, keywords: "factors fatores growth value momentum quality size lowvol dividend" },
      { to: "/market/etf-map", label: "ETF map", icon: ListOrdered, keywords: "etf map mapa etfs categorias bonds commodities internacional" },
      { to: "/market/movers", label: "Movers", icon: TrendingUp, keywords: "movers altas baixas volume movimentos incomuns" },
    ],
  },
  {
    id: "macro",
    label: "Macro",
    icon: Globe2,
    dashboard: "/macro",
    children: [
      { to: "/macro", label: "Cross-asset", icon: Globe2, end: true, keywords: "macro cross-asset indices commodities cambio dollar cripto normalizado" },
      { to: "/macro/session-tape", label: "Session tape", icon: Timer, keywords: "macro session tape intraday sessao tempo real tape" },
      { to: "/macro/rates", label: "Rates & liquidity", icon: Percent, keywords: "macro juros rates liquidez treasury yields credito high yield" },
      { to: "/macro/vol", label: "Vol regime", icon: Gauge, keywords: "macro volatilidade vix regime contango backwardation term structure" },
      { to: "/macro/curves", label: "Curves", icon: LineChart, keywords: "macro curva juros yield curve spreads invertida 10y 2y 30y" },
      { to: "/macro/events", label: "Events", icon: CalendarDays, keywords: "macro calendario economico eventos fomc cpi payroll" },
    ],
  },
  {
    id: "live",
    label: "Live",
    icon: Zap,
    dashboard: "/live",
    children: [
      { to: "/live", label: "Setupboard", icon: Zap, end: true, keywords: "live setupboard regime trend breadth vol credito juros dolar" },
      { to: "/live/intraday-breadth", label: "Intraday breadth", icon: Activity, keywords: "live intraday breadth sessao acima open avancos quedas" },
      { to: "/live/alerts", label: "Alerts", icon: Bell, keywords: "live alertas vol spike breadth thrust curva invertida credito" },
    ],
  },
  {
    id: "scanner",
    label: "Scanner",
    icon: Search,
    dashboard: "/scanner",
    children: [
      { to: "/scanner", label: "Screener", icon: Search, end: true, keywords: "scanner screener filtro universo variacao volume busca ordenar" },
    ],
  },
  {
    id: "crypto",
    label: "Crypto",
    icon: Bitcoin,
    dashboard: "/crypto",
    children: [
      { to: "/crypto", label: "Overview", icon: Bitcoin, end: true, keywords: "crypto cripto bitcoin ethereum solana majors painel" },
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
      { to: "/gastos/orcamento", label: "Orçamento e Projeção", icon: PiggyBank, keywords: "orçamento metas limite mensal quanto posso gastar projeção fluxo caixa" },
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
      { to: "/gastos/categorias", label: "Categorias de gastos", icon: Tag, keywords: "categorias subcategorias ícones cores mesclar gastos" },
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
