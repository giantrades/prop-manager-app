// STAGE 6 — financialIntelligence (camada AI LEITURA-ONLY).
//
// SÓ narra números que os motores das fases 2/3/4 expõem. Todo insight cita a
// query/fonte exata. NUNCA inventa número novo, NUNCA calcula uma fórmula que não
// esteja em `02-FINANCIAL_FORMULAS.md`. Qualquer razão/percentual aqui é derivado
// de números já expostos pelos motores, e a fonte cita esses números.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (AI como camada, não página) + 01-tasks.md (T6.4).

import type { DataService } from './DataService';
import type { MoneyService } from './money';
import type { WealthService } from './wealth';
import type { RiskService } from './risk';
import type { RiskSnapshot } from './risk';
import type {
  NetWorthResult,
  PortfolioResult,
  GoalProgressResult,
  ForecastResult,
} from './wealth';
import type { FirmPnlResult, FreeCashResult, TaxCockpitResult, WalletSummaryRow } from './money';
import type { StrategyMetrics } from './strategies';
import { allStrategyMetrics, MIN_SAMPLE } from './strategies';
import { computeFirmPnl, monthlySeries, expensesByCategory, listCategories } from './money';
import { nowIso } from './dateUtils';
import type { Payout, Trade, Transaction } from './types';

// ---------------------------------------------------------------------------
// FinanceServices — contratos dos motores consumidos (injetados, não criados aqui)
// ---------------------------------------------------------------------------

export interface FinanceServices {
  ds: DataService;
  money: MoneyService;
  wealth: WealthService;
  risk: RiskService;
}

// ---------------------------------------------------------------------------
// CommandSnapshot — agregação LEITURA-ONLY dos motores (nenhum número novo)
// ---------------------------------------------------------------------------

export interface CommandSnapshot {
  netWorth: NetWorthResult;
  risk: RiskSnapshot;
  goals: GoalProgressResult[];
  walletSummary: WalletSummaryRow[];
  firmPnl: FirmPnlResult[];
  forecast: ForecastResult;
  safeAvailable: number;
  portfolio: PortfolioResult;
  pendingPayouts: Payout[];
  priceAlerts: Array<{ alertId: string; positionId: string; symbol: string; dir: 'above' | 'below'; price: number; current: number; firedAt: string }>;
  freeCash: FreeCashResult;
  taxCockpit: TaxCockpitResult;
  strategies: StrategyMetrics[];
  tradesToday: { win: number; loss: number };
  /** Home — séries principais dos módulos (composição pura, sem número novo). */
  cashflowSeries: Array<{ ym: string; income: number; expenses: number; balance: number }>;
  portfolioHistory: Array<{ at: string; value: number; cost: number }>;
  tradingSeries: Array<{ ym: string; pnl: number }>;
  /** Eventos de payout/withdrawal (pontos no gráfico de PnL). */
  payoutEvents: Array<{ date: string; net: number }>;
  /** Gastos por categoria no mês corrente. */
  expensesByCategory: Array<{ categoryId: string; total: number; count: number }>;
  /** Categorias (id/name/icon/color) para a Home pintar os gráficos. */
  categories: Array<{ id: string; name: string; icon: string; color: string }>;
  /** PnL por conta (trading + investimentos), ordenado por total. */
  accountPnl: Array<{ accountId: string; name: string; trading: number; invest: number; total: number }>;
  generatedAt: string;
}

/** Mês corrente "YYYY-MM" (usado pro Tax Cockpit / Free Cash). */
function currentYearMonth(): string {
  return nowIso().slice(0, 7);
}

/**
 * Agrega num único snapshot tudo o que os motores expõem. Cada campo vem de UMA
 * query de um motor (citada em `source` nos insights). Nada aqui calcula um número
 * financeiro novo — só lê e agrupa.
 */
export async function buildCommandSnapshot(finance: FinanceServices): Promise<CommandSnapshot> {
  const { ds, money, wealth, risk } = finance;

  const ym = currentYearMonth();
  const [netWorth, riskSnap, goals, walletSummary, forecast, safeAvailable, portfolio, taxCockpit, freeCash, pendingPayouts, trades] =
    await Promise.all([
      wealth.netWorth(),
      risk.snapshot(),
      wealth.goals(),
      money.walletSummary(),
      wealth.forecast(),
      wealth.safeAvailable(),
      wealth.portfolio(),
      money.taxCockpit(ym),
      money.freeCash(ym),
      ds.payouts.list(),
      ds.trades.list(),
    ]);

  // Firm P&L: agrupa transactions por firmId e usa `computeFirmPnl` (fórmula única).
  const transactions = await ds.transactions.list();
  const firmPnl = firmPnlByFirm(transactions);

  // Estratégias: métricas derivadas pelo engine (n<20 => "sem amostra").
  const strategies = allStrategyMetrics(trades);

  // Home — séries p/ os gráficos principais de cada módulo.
  const cashflowSeries = monthlySeries(transactions, 6, ym);
  const histRec = await ds.meta.getKey('portfolio:history');
  const portfolioHistory = Array.isArray(histRec?.value) ? (histRec.value as Array<{ at: string; value: number; cost: number }>).slice(-12) : [];
  const byMonth = new Map<string, number>();
  for (const t of trades) {
    if (t.exitPrice == null) continue;
    const stamp = t.exitDatetime || t.entryDatetime;
    if (!stamp) continue;
    const key = stamp.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + (Number(t.resultNet) || 0));
  }
  let cum = 0;
  const tradingSeries = [...byMonth.keys()].sort().slice(-12).map((k) => { cum += byMonth.get(k) ?? 0; return { ym: k, pnl: Number(cum.toFixed(2)) }; });

  // Home — payout events, gastos por categoria e PnL por conta.
  const payoutEvents = [...pendingPayouts]
    .map((p) => ({ date: p.date || p.updatedAt, net: Number(p.net) || 0 }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const [accountsList, categories] = await Promise.all([ds.accounts.list(), listCategories(ds)]);
  const expenseGroups = expensesByCategory(transactions, ym, categories);
  const investByAccount = new Map<string, number>();
  for (const row of portfolio.rows ?? []) investByAccount.set(row.accountId, (investByAccount.get(row.accountId) ?? 0) + (row.pnl ?? 0));
  const tradeByAccount = new Map<string, number>();
  for (const t of trades) {
    if (t.exitPrice == null) continue;
    tradeByAccount.set(t.accountId, (tradeByAccount.get(t.accountId) ?? 0) + (Number(t.resultNet) || 0));
  }
  const accountPnl = accountsList
    .map((a) => {
      const tradingPnl = Number((tradeByAccount.get(a.id) ?? 0).toFixed(2));
      const investPnl = Number((investByAccount.get(a.id) ?? 0).toFixed(2));
      return { accountId: a.id, name: a.name, trading: tradingPnl, invest: investPnl, total: Number((tradingPnl + investPnl).toFixed(2)) };
    })
    .filter((r) => r.trading !== 0 || r.invest !== 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  return {
    netWorth,
    risk: riskSnap,
    goals,
    walletSummary,
    firmPnl,
    forecast,
    safeAvailable,
    portfolio,
    pendingPayouts: pendingPayouts.filter((p) => p.status === 'Pending'),
    freeCash,
    taxCockpit,
    strategies,
    tradesToday: riskSnap.tradesToday,
    cashflowSeries,
    portfolioHistory,
    tradingSeries,
    payoutEvents,
    expensesByCategory: expenseGroups,
    categories,
    accountPnl,
    generatedAt: nowIso(),
    priceAlerts: await getFiredPriceAlerts(ds),
  };
}

/** A2 — alertas de preço disparados (lidos do meta; rearme remove). */
async function getFiredPriceAlerts(ds: FinanceServices['ds']) {
  try {
    const { getFiredAlerts } = await import('./priceService');
    return getFiredAlerts(ds);
  } catch {
    return [];
  }
}

/** Agrupa transactions por firmId e calcula Firm P&L de cada uma (fórmula única). */
export function firmPnlByFirm(transactions: Transaction[]): FirmPnlResult[] {
  const byFirm = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.firmId) continue;
    const arr = byFirm.get(t.firmId);
    if (arr) arr.push(t);
    else byFirm.set(t.firmId, [t]);
  }
  return [...byFirm.entries()]
    .map(([firmId, txs]) => computeFirmPnl(txs, firmId))
    .sort((a, b) => b.payouts - a.payouts);
}

// ---------------------------------------------------------------------------
// Insights (AI leitura-only) — cada um cita a query/fonte exata
// ---------------------------------------------------------------------------

export type InsightKind = 'growth' | 'cash' | 'edge' | 'projection' | 'action' | 'info';

export interface Insight {
  id: string;
  kind: InsightKind;
  text: string;
  /** Query/fonte exata que sustenta o(s) número(s) citado(s). */
  source: string;
  /** Números usados no insight (todos expostos pelos motores). */
  data: Record<string, number | string | null>;
  /** Prioridade de exibição (0..1) — UI pode ordenar por isso. */
  priority: number;
}

/** Soma de `amount` (magnitude) de uma lista de payouts (já é net nos Payout). */
function sumNet(values: Array<{ net: number }>): number {
  return Number(values.reduce((s, v) => s + (v.net ?? 0), 0).toFixed(2));
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

/**
 * Gera insights que SÓ narram números expostos pelos motores. Cada insight:
 *  - `source` = query/fonte exata (ex.: `wealth.netWorth()`, `risk.snapshot()`).
 *  - Números citados vêm do `CommandSnapshot`, nunca calculados por fórmula nova.
 */
export function generateInsights(s: CommandSnapshot): Insight[] {
  const insights: Insight[] = [];

  // 1) Origem do crescimento de payouts (por firm) — fonte: money.firmPnl(firmId).
  const totalPayouts = sumNet(s.firmPnl.map((f) => ({ net: f.payouts })));
  const topFirm = s.firmPnl[0];
  if (totalPayouts > 0 && topFirm) {
    const share = pct(topFirm.payouts, totalPayouts);
    insights.push({
      id: 'insight:growth:top-firm',
      kind: 'growth',
      text: `${share}% dos payouts recebidos (${fmtMoney(totalPayouts)}) vieram de ${topFirm.firmId}.`,
      source: `money.firmPnl(firmId=${topFirm.firmId}) + Σ firmPnl[].payouts`,
      data: { share, topFirmPayouts: topFirm.payouts, totalPayouts },
      priority: 0.55,
    });
  }

  // 2) Caixa parado — fonte: wealth.netWorth().
  const cash = s.netWorth.components.cash;
  const nw = s.netWorth.netWorth;
  if (nw > 0) {
    const cashPct = pct(cash, nw);
    insights.push({
      id: 'insight:cash:idle',
      kind: 'cash',
      text:
        cashPct >= 30
          ? `${cashPct}% do patrimônio (${fmtMoney(cash)}) está parado em caixa sem rendimento.`
          : `${cashPct}% do patrimônio (${fmtMoney(cash)}) está em caixa.`,
      source: `wealth.netWorth() → components.cash / netWorth`,
      data: { cash, netWorth: nw, cashPct },
      priority: cashPct >= 30 ? 0.7 : 0.4,
    });
  }

  // 3) Edge por setup — fonte: strategies.strategyMetrics (n<20 => sem amostra).
  const withSample = s.strategies.filter((st) => st.sampleSufficient);
  if (withSample.length >= 2) {
    const best = [...withSample].sort((a, b) => b.avgR - a.avgR)[0];
    const worst = [...withSample].sort((a, b) => a.avgR - b.avgR)[0];
    if (best && worst && best.strategyId !== worst.strategyId) {
      insights.push({
        id: 'insight:edge:compare',
        kind: 'edge',
        text: `Setup "${best.strategyId}" tem ${best.avgR.toFixed(2)}R vs "${worst.strategyId}" com ${worst.avgR.toFixed(2)}R (n≥${MIN_SAMPLE}).`,
        source: `strategies.allStrategyMetrics(trades) → strategyMetrics(strategyId, n≥${MIN_SAMPLE})`,
        data: { bestAvgR: best.avgR, worstAvgR: worst.avgR, bestId: best.strategyId, worstId: worst.strategyId },
        priority: 0.5,
      });
    }
  } else if (withSample.length === 1) {
    const only = withSample[0];
    insights.push({
      id: 'insight:edge:single',
      kind: 'edge',
      text: `Setup "${only.strategyId}" tem ${only.avgR.toFixed(2)}R e PF ${renderPF(only.profitFactor)} (n=${only.n}).`,
      source: `strategies.allStrategyMetrics(trades) → strategyMetrics(${only.strategyId})`,
      data: { avgR: only.avgR, n: only.n, pf: only.profitFactor },
      priority: 0.4,
    });
  }

  // 4) Projeção — fonte: wealth.forecast().
  const netMonthly = s.forecast.netMonthly;
  const projected = s.forecast.d90;
  if (netMonthly > 0) {
    insights.push({
      id: 'insight:projection:90d',
      kind: 'projection',
      text: `No ritmo atual (fluxo líquido ${fmtMoney(netMonthly)}/mês), o patrimônio projeta ${fmtMoney(projected)} em 90 dias.`,
      source: `wealth.forecast() → netMonthly / d90`,
      data: { netMonthly, projected90: projected, today: s.forecast.today },
      priority: 0.5,
    });
  }

  // 5) Ação de risco — fonte: risk.snapshot().
  const warnCount = s.risk.counts.WARN + s.risk.counts.STOP;
  if (warnCount > 0) {
    insights.push({
      id: 'insight:action:risk',
      kind: 'action',
      text: `${warnCount} conta(s) com risco ${s.risk.counts.STOP > 0 ? 'STOP' : 'WARN'} — revise drawdown antes de operar.`,
      source: `risk.snapshot() → counts{WARN,STOP}`,
      data: { warn: s.risk.counts.WARN, stop: s.risk.counts.STOP },
      priority: 0.85,
    });
  }

  return insights.sort((a, b) => b.priority - a.priority);
}

// ---------------------------------------------------------------------------
// Action Center — flags de ações (só leitura de booleans expostos pelos motores)
// ---------------------------------------------------------------------------

export type ActionKind = 'risk' | 'goal' | 'payout' | 'tax' | 'price';
export type ActionSeverity = 'warn' | 'info' | 'good';

export interface ActionItem {
  id: string;
  kind: ActionKind;
  severity: ActionSeverity;
  title: string;
  detail: string;
  /** Query/fonte exata que sustenta a ação. */
  source: string;
}

/**
 * Deriva as ações do Command Center a partir de flags que os motores JÁ expõem
 * (status de risco, `completed` do goal, `status === 'Pending'` do payout,
 * `prepareDarf` do tax cockpit). Nada aqui calcula número novo.
 */
export function buildActions(s: CommandSnapshot): ActionItem[] {
  const actions: ActionItem[] = [];

  // risk:warning
  for (const row of s.risk.rows) {
    if (row.status.status === 'WARN' || row.status.status === 'STOP') {
      actions.push({
        id: `action:risk:${row.account.id}`,
        kind: 'risk',
        severity: row.status.status === 'STOP' ? 'warn' : 'info',
        title: `Risco ${row.status.status} — ${row.account.name}`,
        detail: row.status.reason,
        source: `risk.snapshot() → row(status=${row.status.status})`,
      });
    }
  }

  // goal:completed
  for (const g of s.goals) {
    if (g.completed) {
      actions.push({
        id: `action:goal:${g.goal.id}`,
        kind: 'goal',
        severity: 'good',
        title: `Meta concluída: ${g.goal.kind}`,
        detail: `${fmtMoney(g.current)} atingiu ${fmtMoney(g.target)}.`,
        source: `wealth.goals() → goal(id=${g.goal.id}, completed=true)`,
      });
    }
  }

  // payout disponível
  for (const p of s.pendingPayouts) {
    actions.push({
      id: `action:payout:${p.id}`,
      kind: 'payout',
      severity: 'info',
      title: `Payout disponível: ${fmtMoney(p.net)}`,
      detail: `Status ${p.status} — net ${fmtMoney(p.net)} (fee ${fmtMoney(p.fee)}).`,
      source: `ds.payouts.list() → status='Pending'`,
    });
  }
  for (const row of s.risk.rows) {
    if (row.metrics.eligible) {
      actions.push({
        id: `action:payout:eligible:${row.account.id}`,
        kind: 'payout',
        severity: 'good',
        title: `Payout elegível — ${row.account.name}`,
        detail: 'Equity ≥ target e drawdown dentro do limite.',
        source: `risk.snapshot() → metrics.eligible=true`,
      });
    }
  }

  // A2 — alertas de preço disparados (com fonte citável).
  for (const a of s.priceAlerts ?? []) {
    actions.push({
      id: `action:price:${a.alertId}`,
      kind: 'price',
      severity: 'info',
      title: `Alerta de preço: ${a.symbol} ${a.dir === 'above' ? '≥' : '≤'} ${a.price}`,
      detail: `Atual ${a.current} (disparado em ${String(a.firedAt).slice(0, 10)}).`,
      source: `priceService.checkPriceAlerts ⇢ meta price:alerts:fired`,
    });
  }

  // DARF prazo
  if (s.taxCockpit.prepareDarf && s.taxCockpit.darfDeadline) {
    actions.push({
      id: 'action:tax:darf',
      kind: 'tax',
      severity: 'warn',
      title: `Preparar DARF (${s.taxCockpit.darfDeadline.slice(0, 10)})`,
      detail: `Imposto estimado ${fmtMoney(s.taxCockpit.estTax)} (day 20% / swing 15%).`,
      source: `money.taxCockpit(${currentYearMonth()}) → prepareDarf=true, darfDeadline`,
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Formatters (exibição — não são cálculo financeiro)
// ---------------------------------------------------------------------------

function fmtMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function renderPF(pf: number | 'n/a' | 'infinity'): string {
  if (pf === 'infinity') return '∞';
  if (pf === 'n/a') return 'n/a';
  return Number(pf).toFixed(2);
}

/** Re-export de tipos úteis pra UI não importar de módulo profundo. */
export type { NetWorthResult, RiskSnapshot, StrategyMetrics, Trade };
