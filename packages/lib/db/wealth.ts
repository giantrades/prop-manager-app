// STAGE 5 — Wealth OS (domain). Portfolio cost-basis (FIFO) + Net Worth derivado +
// Forecast 30/60/90 + Safe Available + Goals 2.0 + Financial Journal.
//
// Fonte: DOCS/06_STAGE5_WEALTH_OS/00-produto.md + 01-tasks.md
// Fórmulas: DOCS/02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md
//
// Regras duras:
//  - Net Worth / Goal progress / Portfolio value são DERIVADOS, nunca escritos direto.
//  - Cost Basis = FIFO (declarado), nunca LIFO (número diferente).
//  - Posição com `lastMarkAt` velho entra no Net Worth mas some do "atualizado agora"
//    (proveniência) — ver FINANCIAL_FORMULAS.md.
//  - Goals 2.0: NUNCA reintroduzir `Σ volume` como denominador (bug do Goals.jsx antigo).
//  - `rate=0` PROIBIDO.

import type { DataService } from './DataService';
import type {
  Account,
  Goal,
  GoalKind,
  Payout,
  Position,
  SnapshotNetworth,
  Transaction,
} from './types';
import { nowIso, parseDate, compareIso, daysBetween } from './dateUtils';
import { computeAccountBalance } from './money';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Idade máxima (dias) do `lastMarkAt` pra posição contar como "atualizada agora". */
export const NET_WORTH_MARK_MAX_AGE_DAYS = 7;

/** Kinds de conta que representam caixa (saldo = Σ transactions). */
const CASH_LIKE_KINDS: ReadonlySet<Account['kind']> = new Set(['bank', 'wallet', 'cash']);

/** Kinds de conta que representam ativos (valor = positions mark-to-market). */
const ASSET_KINDS: ReadonlySet<Account['kind']> = new Set(['investment', 'crypto']);

/** Round pra 2 casas, evitando drift de floating point. */
function r2(v: number): number {
  return Number(v.toFixed(2));
}

// ---------------------------------------------------------------------------
// FIFO Cost Basis (declarado)
// ---------------------------------------------------------------------------

export interface LotEvent {
  date: string; // ISO 8601 com timezone
  type: 'buy' | 'sell';
  qty: number;
  price: number;
}

export interface FifoLot {
  date: string;
  qty: number;
  price: number;
}

export interface FifoResult {
  /** Lotes remanescentes (posição aberta) — o que ainda não foi vendido. */
  lots: FifoLot[];
  /** Qtd total remanescente. */
  qty: number;
  /** Cost Basis = Σ qty×price dos lotes remanescentes (investido na posição). */
  costBasis: number;
  /** Preço médio dos lotes remanescentes. */
  avgCost: number;
  /** PnL realizado = Σ (proceeds da venda - custo dos lotes consumidos). */
  realizedPnl: number;
  /** Custo dos lotes consumidos nas vendas. */
  costOfSold: number;
}

/**
 * Cost Basis FIFO (declarado explicitamente — LIFO daria número diferente e é
 * ambíguo). Processa buys/sells em ordem cronológica; vendas consomem do lote mais
 * antigo. `rate=0`/qty<=0 são ignorados.
 */
export function computeFifoLots(events: LotEvent[]): FifoResult {
  const sorted = [...events]
    .filter((e) => Number(e.qty) > 0 && Number(e.price) >= 0)
    .sort((a, b) => {
      const c = compareIso(a.date, b.date);
      if (c !== 0) return c;
      // Empates: buy antes de sell (não vende lot que compra no mesmo timestamp).
      return a.type === 'buy' ? -1 : 1;
    });

  const queue: FifoLot[] = [];
  let proceedsOfSold = 0;
  let costOfSold = 0;

  for (const ev of sorted) {
    if (ev.type === 'buy') {
      queue.push({ date: ev.date, qty: ev.qty, price: ev.price });
      continue;
    }
    // sell: consome do lote mais antigo (FIFO).
    let remaining = ev.qty;
    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0];
      const take = Math.min(lot.qty, remaining);
      costOfSold += take * lot.price;
      proceedsOfSold += take * ev.price;
      lot.qty -= take;
      remaining -= take;
      if (lot.qty <= 0.000001) queue.shift();
    }
    // Se sobra (vendeu mais do que tinha), o excesso é vendido sem cost basis
    // (posição short/descoberta) — não alteramos o cost basis das posições abertas.
  }

  const openLots = queue.filter((l) => l.qty > 0.000001);
  const qty = r2(openLots.reduce((s, l) => s + l.qty, 0));
  const costBasis = r2(openLots.reduce((s, l) => s + l.qty * l.price, 0));
  const avgCost = qty > 0 ? r2(costBasis / qty) : 0;
  const realizedPnl = r2(proceedsOfSold - costOfSold);

  return {
    lots: openLots,
    qty,
    costBasis,
    avgCost,
    realizedPnl,
    costOfSold: r2(costOfSold),
  };
}

export interface StockSaleGain {
  symbol: string;
  date: string;
  qty: number;
  proceeds: number;
  cost: number;
  gain: number | null; // null = sem dados FIFO (venda sem asset)
}

export interface StockSalesResult {
  sales: StockSaleGain[];
  monthGain: number;
}

/**
 * A4 — base tributável de vendas de ativos no mês (FIFO por símbolo).
 * Usa `asset` das transactions buy/sell. Venda sem asset entra com gain null
 * (não inventa custo). Só sugere — nunca lança imposto sozinho.
 */
export function stockSalesTaxBase(transactions: Transaction[], yearMonth: string): StockSalesResult {
  const bySymbol = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if ((t.kind !== 'buy' && t.kind !== 'sell') || !t.asset) continue;
    const list = bySymbol.get(t.asset.symbol) ?? [];
    list.push(t);
    bySymbol.set(t.asset.symbol, list);
  }
  const sales: StockSaleGain[] = [];
  for (const [symbol, list] of bySymbol) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < ordered.length; i += 1) {
      const s = ordered[i];
      if (s.kind !== 'sell' || s.date.slice(0, 7) !== yearMonth) continue;
      const toEvent = (t: Transaction): LotEvent => ({
        date: t.date,
        type: t.kind as 'buy' | 'sell',
        qty: t.asset?.qty ?? 0,
        price: t.asset?.price ?? 0,
      });
      const before = computeFifoLots(ordered.slice(0, i).map(toEvent));
      const after = computeFifoLots(ordered.slice(0, i + 1).map(toEvent));
      sales.push({
        symbol,
        date: s.date,
        qty: s.asset?.qty ?? 0,
        proceeds: r2((s.asset?.qty ?? 0) * (s.asset?.price ?? 0)),
        cost: r2(after.costOfSold - before.costOfSold),
        gain: r2(after.realizedPnl - before.realizedPnl),
      });
    }
  }
  // Vendas sem asset: lista para o usuário completar (gain null).
  for (const t of transactions) {
    if (t.kind !== 'sell' || t.asset || t.date.slice(0, 7) !== yearMonth) continue;
    sales.push({ symbol: '(sem ativo)', date: t.date, qty: 0, proceeds: Math.abs(t.amount), cost: 0, gain: null });
  }
  sales.sort((a, b) => a.date.localeCompare(b.date));
  return { sales, monthGain: r2(sales.reduce((s, x) => s + (x.gain ?? 0), 0)) };
}

// ---------------------------------------------------------------------------
// Mark-to-market (manual) — provenance de preço
// ---------------------------------------------------------------------------

/** Preço de marcação de uma position: `lastMarkPrice` fresco, senão `avgPrice`. */
export function markPriceOf(position: Position, maxAgeDays = NET_WORTH_MARK_MAX_AGE_DAYS, now = nowIso()): number {
  if (isMarkFresh(position, maxAgeDays, now)) {
    return position.lastMarkPrice ?? position.avgPrice;
  }
  // Sem marcação recente: cai pro custo (não inventa preço).
  return position.avgPrice;
}

/** A marcação (`lastMarkPrice`) é fresca se existe e `lastMarkAt` <= maxAgeDays. */
export function isMarkFresh(position: Position, maxAgeDays = NET_WORTH_MARK_MAX_AGE_DAYS, now = nowIso()): boolean {
  if (position.lastMarkPrice == null || position.lastMarkAt == null) return false;
  const ageDays = daysBetween(parseDate(position.lastMarkAt), parseDate(now));
  return ageDays <= maxAgeDays;
}

/** Idade (em dias) da última marcação. `null` se nunca marcada. */
export function markAgeDays(position: Position, now = nowIso()): number | null {
  if (position.lastMarkAt == null) return null;
  return Math.max(0, daysBetween(parseDate(position.lastMarkAt), parseDate(now)));
}

// ---------------------------------------------------------------------------
// Portfolio (cost-basis + DCA + alocação/concentração)
// ---------------------------------------------------------------------------

export interface PortfolioRow {
  id: string;
  accountId: string;
  symbol: string;
  accountName?: string;
  kind?: Account['kind'];
  qty: number;
  avgPrice: number;
  markPrice: number;
  costBasis: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  staleMark: boolean;
  markedAt?: string;
  ageDays?: number | null;
  // A5 — moeda da posição + conversão. Totais sempre em BRL.
  currency: 'BRL' | 'USD';
  converted: boolean;
  // A1 — proventos da posição + yield on cost ((pnl + div) / custo).
  dividends: number;
  yieldOnCost: number;
  // A8 — juros acumulados (renda fixa pré; 0 nos demais).
  accruedInterest: number;
  assetKind: 'equity' | 'fixed' | 'other';
  // A2 — alertas da posição (para UI gerenciar; avaliação no priceService).
  alerts: Array<{ id: string; dir: 'above' | 'below'; price: number }>;
}

export interface PortfolioResult {
  rows: PortfolioRow[];
  totalCost: number;
  totalValue: number;
  totalPnl: number;
  pnlPercent: number;
  staleCount: number;
  // A5
  fxUSD: number | null; // BRL por USD usado (null = sem taxa)
  unconverted: number; // posições USD sem taxa (fora dos totais)
  // A1
  dividendsTotal: number; // Σ proventos (não entra no cost basis)
}

export interface PortfolioOptions {
  accounts?: Account[];
  markPriceMaxAgeDays?: number;
  now?: string;
  /** A5 — BRL por USD. Converte posições USD para os totais (sempre BRL). */
  fxUSD?: number;
  /** A1 — proventos por position id (somam no PnL/yield, nunca no cost basis). */
  dividends?: Record<string, number>;
}

/** Chave meta da taxa USD→BRL (manual, com data — ver A5). */
export const FX_USD_META_KEY = 'fx:USDBRL';

/** Chave meta da série CDI mensal manual (ver A3). */
export const CDI_META_KEY = 'benchmark:cdi';

export interface CdiPoint {
  ym: string; // "YYYY-MM"
  pct: number; // decimal mensal (ex.: 0.0087)
}

export async function getCdiSeries(ds: DataService): Promise<CdiPoint[]> {
  const rec = await ds.meta.getKey(CDI_META_KEY);
  const v = rec?.value;
  if (!Array.isArray(v)) return [];
  return (v as CdiPoint[])
    .filter((p) => p && /^\d{4}-\d{2}$/.test(p.ym) && typeof p.pct === 'number' && p.pct >= 0)
    .sort((a, b) => (a.ym < b.ym ? -1 : 1));
}

export async function saveCdiPoint(ds: DataService, ym: string, pct: number): Promise<CdiPoint[]> {
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('mês inválido (use YYYY-MM)');
  if (!(pct >= 0)) throw new Error('pct inválido');
  const series = await getCdiSeries(ds);
  const next = series.filter((p) => p.ym !== ym).concat([{ ym, pct }]);
  next.sort((a, b) => (a.ym < b.ym ? -1 : 1));
  await ds.meta.setKey(CDI_META_KEY, next);
  return next;
}

export interface BenchmarkPoint {
  at: string;
  index: number; // base 100 no primeiro ponto
}

/**
 * A3 — aplica o CDI acumulado sobre o histórico do portfolio.
 * Índice base 100 no primeiro ponto; compõe (1+pct) mês a mês; mês sem dado
 * segura o índice (flat) em vez de inventar. Sem série, retorna [] (chart inalterado).
 */
export function applyBenchmark(
  history: Array<{ at: string; value: number; cost: number }>,
  cdi: CdiPoint[],
): BenchmarkPoint[] {
  if (!history.length || !cdi.length) return [];
  const byYm = new Map(cdi.map((p) => [p.ym, p.pct]));
  const out: BenchmarkPoint[] = [];
  let idx = 100;
  let prevYm = '';
  history.forEach((h, i) => {
    const ym = String(h.at).slice(0, 7);
    if (i === 0) {
      prevYm = ym;
      out.push({ at: h.at, index: 100 });
      return;
    }
    // Compõe todos os meses entre o ponto anterior e este.
    let [y, m] = prevYm.split('-').map(Number);
    const [ey, em] = ym.split('-').map(Number);
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard < 1200) {
      guard += 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (key !== prevYm) idx = idx * (1 + (byYm.get(key) ?? 0));
      if (y === ey && m === em) break;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    prevYm = ym;
    out.push({ at: h.at, index: Number(idx.toFixed(2)) });
  });
  return out;
}

export interface FxRate {
  rate: number;
  at: string;
}

export async function getFxUSD(ds: DataService): Promise<FxRate | null> {
  const rec = await ds.meta.getKey(FX_USD_META_KEY);
  const v = rec?.value as FxRate | undefined;
  if (!v || typeof v.rate !== 'number' || !(v.rate > 0)) return null;
  return { rate: v.rate, at: typeof v.at === 'string' ? v.at : '' };
}

export async function saveFxUSD(ds: DataService, rate: number): Promise<FxRate> {
  if (!(rate > 0)) throw new Error('taxa <= 0 PROIBIDA (não inventa câmbio)');
  const v: FxRate = { rate: Number(rate), at: nowIso() };
  await ds.meta.setKey(FX_USD_META_KEY, v);
  return v;
}

/** B1 — provento anunciado (data-com). Vira `dividend` via "marcar como recebido". */
export const DIVIDENDS_ANNOUNCED_KEY = 'dividends:announced';

export interface DividendEvent {
  id: string;
  symbol: string;
  positionId?: string;
  exDate: string; // YYYY-MM-DD
  amountPerShare?: number;
  note?: string;
}

export async function getAnnouncedDividends(ds: DataService): Promise<DividendEvent[]> {
  const rec = await ds.meta.getKey(DIVIDENDS_ANNOUNCED_KEY);
  const v = rec?.value;
  if (!Array.isArray(v)) return [];
  return (v as DividendEvent[]).filter(
    (e) => e && typeof e.id === 'string' && typeof e.symbol === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.exDate ?? ''),
  );
}

export async function saveAnnouncedDividend(ds: DataService, ev: DividendEvent): Promise<DividendEvent[]> {
  if (!ev || typeof ev.id !== 'string' || !ev.id) throw new Error('id obrigatório');
  if (!ev.symbol?.trim()) throw new Error('símbolo obrigatório');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.exDate ?? '')) throw new Error('exDate inválida (use YYYY-MM-DD)');
  if (ev.amountPerShare != null && !(ev.amountPerShare >= 0)) throw new Error('valor inválido');
  const list = await getAnnouncedDividends(ds);
  const next = [...list.filter((x) => x.id !== ev.id), { ...ev, symbol: ev.symbol.trim().toUpperCase() }];
  next.sort((a, b) => (a.exDate < b.exDate ? -1 : 1));
  await ds.meta.setKey(DIVIDENDS_ANNOUNCED_KEY, next);
  return next;
}

export async function removeAnnouncedDividend(ds: DataService, id: string): Promise<DividendEvent[]> {
  const list = await getAnnouncedDividends(ds);
  const next = list.filter((x) => x.id !== id);
  await ds.meta.setKey(DIVIDENDS_ANNOUNCED_KEY, next);
  return next;
}

/** Anunciados com exDate >= hoje (ordenados). Passados somem da lista. */
export function upcomingDividends(events: DividendEvent[], now?: string): DividendEvent[] {
  const today = (now ?? nowIso()).slice(0, 10);
  return events
    .filter((e) => e.exDate >= today)
    .sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));
}

/**
 * Portfolio = posições com cost basis (qty×avgPrice) + mark-to-market manual.
 * `totalValue` usa `markPriceOf` (lastMark fresco, senão avgPrice). Posições com
 * marcação velha são sinalizadas em `staleMark` (proveniência).
 */
export function computePortfolio(positions: Position[], opts: PortfolioOptions = {}): PortfolioResult {
  const maxAge = opts.markPriceMaxAgeDays ?? NET_WORTH_MARK_MAX_AGE_DAYS;
  const now = opts.now ?? nowIso();
  const accountMap = new Map((opts.accounts ?? []).map((a) => [a.id, a]));
  // A5 — conversão USD→BRL para os totais (sempre BRL). Sem taxa: USD fica fora
  // dos totais (nunca converte "no olho") e conta em `unconverted`.
  const fxUSD = opts.fxUSD != null && opts.fxUSD > 0 ? opts.fxUSD : null;
  // A1 — proventos por position id (somam no PnL/yield, nunca no cost basis).
  const dividends = opts.dividends ?? {};

  let totalCost = 0;
  let totalValue = 0;
  let staleCount = 0;
  let unconverted = 0;
  let dividendsTotal = 0;

  const rows: PortfolioRow[] = positions.map((p) => {
    const currency = p.currency ?? 'BRL';
    const fresh = isMarkFresh(p, maxAge, now);
    let markPrice = markPriceOf(p, maxAge, now);
    // A8 — renda fixa pré com taxa: accrual desde a última marca/criação.
    // Aproximação honesta: juros compostos a.a./365 em dias corridos.
    let accruedInterest = 0;
    if (p.assetKind === 'fixed' && p.yieldType !== 'pos' && p.yieldType !== 'ipca'
      && typeof p.yieldRate === 'number' && p.yieldRate > 0 && p.qty > 0 && p.avgPrice > 0) {
      const start = p.lastMarkAt || p.updatedAt;
      const days = Math.max(0, (parseDate(now).getTime() - parseDate(start).getTime()) / 86400000);
      const grown = p.avgPrice * (1 + p.yieldRate) ** (days / 365);
      accruedInterest = r2(Math.max(0, grown - p.avgPrice) * p.qty);
      markPrice = r2(grown);
    }
    const costBasis = r2(p.qty * p.avgPrice);
    const marketValue = r2(p.qty * markPrice);
    const pnl = r2(marketValue - costBasis);
    const pnlPercent = costBasis > 0 ? Number((pnl / costBasis).toFixed(6)) : 0;
    const div = r2(dividends[p.id] ?? 0);
    // yield on cost = (valorização + proventos) / custo. Sem custo, 0 (nunca NaN).
    const allIn = costBasis > 0 ? Number(((pnl + div) / costBasis).toFixed(6)) : 0;
    if (!fresh) staleCount += 1;
    const converted = currency === 'BRL' || fxUSD != null;
    if (converted) {
      const fx = currency === 'USD' ? (fxUSD as number) : 1;
      totalCost = r2(totalCost + costBasis * fx);
      totalValue = r2(totalValue + marketValue * fx);
      dividendsTotal = r2(dividendsTotal + div * fx);
    } else {
      unconverted += 1;
    }
    const account = accountMap.get(p.accountId);
    return {
      id: p.id,
      accountId: p.accountId,
      symbol: p.symbol,
      accountName: account?.name,
      kind: account?.kind,
      qty: p.qty,
      avgPrice: p.avgPrice,
      markPrice: r2(markPrice),
      costBasis,
      marketValue,
      pnl,
      pnlPercent,
      staleMark: !fresh,
      markedAt: p.lastMarkAt,
      ageDays: markAgeDays(p, now),
      currency,
      converted,
      dividends: div,
      yieldOnCost: allIn,
      accruedInterest,
      assetKind: p.assetKind === 'fixed' ? 'fixed' : p.assetKind === 'other' ? 'other' : 'equity',
      alerts: Array.isArray(p.alerts) ? p.alerts : [],
    };
  });

  const totalPnl = r2(totalValue - totalCost);
  const pnlPercent = totalCost > 0 ? Number((totalPnl / totalCost).toFixed(6)) : 0;
  return { rows, totalCost: r2(totalCost), totalValue: r2(totalValue), totalPnl, pnlPercent, staleCount, fxUSD, unconverted, dividendsTotal };
}

export interface DcaMonth {
  month: string; // "YYYY-MM"
  amount: number;
}

/**
 * DCA = aportes por mês. Soma os `buy` do ledger (kind='buy') agrupados por mês.
 * `amount` é o valor investido no mês (magnitude). Se `opts.symbol` for informado,
 * filtra só compras cujo `note` mencione o símbolo (dados de aporte por ativo).
 */
export function computeDcaFromTransactions(transactions: Transaction[], opts?: { symbol?: string }): DcaMonth[] {
  const byMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'buy') continue;
    if (opts?.symbol && !t.note?.includes(opts.symbol)) continue;
    const ym = t.date.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + Math.abs(t.amount));
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, amount]) => ({ month, amount: r2(amount) }));
}

export interface AllocationRow {
  label: string;
  value: number;
  pct: number;
}

export interface AllocationResult {
  bySymbol: AllocationRow[];
  byAccount: AllocationRow[];
  /** Concentração: maior posição (%). > 0.5 = alta concentração. */
  topSymbol: string | null;
  topPct: number;
  count: number;
}

/**
 * Alocação / concentração do portfolio por símbolo e por conta.
 * `pct` = value / totalValue. Concentração = maior holding.
 */
export function computeAllocation(positions: Position[], opts: PortfolioOptions = {}): AllocationResult {
  const portfolio = computePortfolio(positions, opts);
  const total = portfolio.totalValue;
  const bySymbol = new Map<string, number>();
  const byAccount = new Map<string, number>();

  for (const r of portfolio.rows) {
    bySymbol.set(r.symbol, (bySymbol.get(r.symbol) ?? 0) + r.marketValue);
    byAccount.set(r.accountName ?? r.accountId, (byAccount.get(r.accountName ?? r.accountId) ?? 0) + r.marketValue);
  }

  const toRows = (map: Map<string, number>): AllocationRow[] =>
    [...map.entries()]
      .map(([label, value]) => ({ label, value: r2(value), pct: total > 0 ? Number((value / total).toFixed(6)) : 0 }))
      .sort((a, b) => b.value - a.value);

  const bySymbolRows = toRows(bySymbol);
  const top = bySymbolRows[0];
  return {
    bySymbol: bySymbolRows,
    byAccount: toRows(byAccount),
    topSymbol: top?.label ?? null,
    topPct: top?.pct ?? 0,
    count: bySymbolRows.length,
  };
}

// ---------------------------------------------------------------------------
// Net Worth (DERIVADO — nunca fonte primária)
// ---------------------------------------------------------------------------

export interface StalePositionInfo {
  symbol: string;
  accountId: string;
  qty: number;
  avgPrice: number;
  value: number; // qty × avgPrice (fallback de custo)
  markedAt?: string;
  ageDays?: number | null;
}

export interface NetWorthInput {
  accounts: Account[];
  transactions: Transaction[];
  positions: Position[];
  payouts: Payout[];
  /** Passivos (ex.: dívida). Default 0 — reconciliável com soma Accounts+Positions+Payouts. */
  liabilities?: number;
  markPriceMaxAgeDays?: number;
  now?: string;
}

export interface NetWorthComponents {
  cash: number;
  /** Posições com marcação fresca (o "atualizado agora"). */
  investmentsFresh: number;
  /** Posições com marcação velha (entram no net worth, somem do "atualizado agora"). */
  investmentsStale: number;
  /** Total de posições (fresh + stale). */
  investments: number;
  /** Recebíveis = payouts pendentes (net). */
  receivables: number;
  liabilities: number;
}

export interface NetWorthResult {
  netWorth: number;
  updatedAt: string;
  components: NetWorthComponents;
  /** Proveniência: posições com preço velho (não contam no "atualizado agora"). */
  stalePositions: StalePositionInfo[];
}

/**
 * Net Worth = Σ Accounts(cash-like) + Σ Positions(mark-to-market) + receivables
 * (payouts pendentes) - liabilities. Tudo derivado do ledger/positions/payouts;
 * NUNCA digitado.
 *
 * Proveniência: posição com `lastMarkAt` velho entra no Net Worth (via avgPrice)
 * mas é sinalizada em `stalePositions` e some de `investmentsFresh`.
 */
export function computeNetWorth(input: NetWorthInput): NetWorthResult {
  const liabilities = input.liabilities ?? 0;
  const maxAge = input.markPriceMaxAgeDays ?? NET_WORTH_MARK_MAX_AGE_DAYS;
  const now = input.now ?? nowIso();

  // Caixa: saldo (Σ transactions) das contas bank/wallet/cash.
  let cash = 0;
  for (const acc of input.accounts) {
    if (CASH_LIKE_KINDS.has(acc.kind)) {
      // Saldo do ledger; conta ligada à ponte sem lançamentos usa o saldo da PLATAFORMA.
      const ledger = computeAccountBalance(input.transactions, acc.id);
      cash += ledger || Number(acc.platformBalance) || 0;
    }
  }

  // Ativos: posições mark-to-market (fresh vs stale).
  let investmentsFresh = 0;
  let investmentsStale = 0;
  const stalePositions: StalePositionInfo[] = [];
  for (const p of input.positions) {
    if (isMarkFresh(p, maxAge, now)) {
      investmentsFresh += (p.lastMarkPrice ?? p.avgPrice) * p.qty;
    } else {
      const value = p.avgPrice * p.qty;
      investmentsStale += value;
      stalePositions.push({
        symbol: p.symbol,
        accountId: p.accountId,
        qty: p.qty,
        avgPrice: p.avgPrice,
        value: r2(value),
        markedAt: p.lastMarkAt,
        ageDays: markAgeDays(p, now),
      });
    }
  }

  // Recebíveis: payouts pendentes (net).
  const receivables = input.payouts
    .filter((p) => p.status === 'Pending')
    .reduce((s, p) => s + (p.net ?? 0), 0);

  const investments = r2(investmentsFresh + investmentsStale);
  cash = r2(cash);
  const netWorth = r2(cash + investments + receivables - liabilities);

  return {
    netWorth,
    updatedAt: now,
    components: {
      cash,
      investmentsFresh: r2(investmentsFresh),
      investmentsStale: r2(investmentsStale),
      investments,
      receivables: r2(receivables),
      liabilities: r2(liabilities),
    },
    stalePositions,
  };
}

// ---------------------------------------------------------------------------
// Forecast 30/60/90 + Safe Available
// ---------------------------------------------------------------------------

export interface ForecastInput {
  /** Caixa líquido hoje (TODAY). */
  currentCash: number;
  /** Recebíveis / payouts esperados (caem nos próximos 30d). */
  expectedPayouts: number;
  /** Salário / renda recorrente por mês. */
  monthlyIncome: number;
  /** Contas fixas por mês. */
  monthlyBills: number;
  /** Reserva de imposto por mês. */
  monthlyTaxReserve: number;
  /** Aportes (investimento) por mês. */
  monthlyContributions: number;
  now?: string;
}

export interface ForecastResult {
  today: number;
  d30: number;
  d60: number;
  d90: number;
  /** Fluxo mensal líquido (income - bills - tax - contributions). */
  netMonthly: number;
}

/**
 * TODAY + payouts esperados + salário - contas - imposto - aportes = 30/60/90d.
 * Assume que os payouts esperados chegam nos primeiros 30 dias; a partir daí o
 * saldo cresce linearmente pelo fluxo mensal líquido.
 */
export function computeForecast(input: ForecastInput): ForecastResult {
  const netMonthly = r2(
    input.monthlyIncome - input.monthlyBills - input.monthlyTaxReserve - input.monthlyContributions,
  );
  const base = r2(input.currentCash + input.expectedPayouts);
  return {
    today: r2(input.currentCash),
    d30: r2(base + netMonthly * 1),
    d60: r2(base + netMonthly * 2),
    d90: r2(base + netMonthly * 3),
    netMonthly,
  };
}

export interface SafeAvailableInput {
  currentCash: number;
  next30dBills: number;
  taxReserve: number;
  expectedPayouts: number;
}

/**
 * Safe Available = líquido - 30d contas - reserva imposto + payouts esperados.
 * Responde "posso comprar isso?" sem comprometer o caixa operacional.
 */
export function computeSafeAvailable(input: SafeAvailableInput): number {
  return r2(input.currentCash - input.next30dBills - input.taxReserve + input.expectedPayouts);
}

// ---------------------------------------------------------------------------
// Goals 2.0 (progresso DERIVADO, nunca digitado)
// ---------------------------------------------------------------------------

export interface GoalProgressContext {
  netWorth: number;
  cash: number;
  portfolioValue: number;
  /** Fundo pro imóvel (entrada/apê). Default 0. */
  propertyFund?: number;
  /** Σ payouts (payout_in) na janela do goal. */
  payoutsInWindow: number;
  now?: string;
}

export interface GoalProgressResult {
  goal: Goal;
  current: number;
  target: number;
  /** Fração 0..1 (não capa em 1 — UI decide mostrar "100%+"). */
  progress: number;
  pct: number;
  completed: boolean;
  remaining: number;
  window?: Goal['windowType'];
}

/**
 * Progresso de um goal, derivado do patrimônio — NUNCA digitado. Cada kind tem
 * fonte própria:
 *  - emergency  -> cash (reserva)
 *  - networth   -> netWorth
 *  - property   -> propertyFund (entrada do apê)
 *  - payout_year-> Σ payouts na janela (calendar_year | rolling_12m)
 *  - portfolio  -> portfolioValue
 * Proibido usar `Σ volume` (lotes) como denominador (bug do Goals.jsx antigo).
 */
export function computeGoalProgress(goal: Goal, ctx: GoalProgressContext): GoalProgressResult {
  let current: number;
  switch (goal.kind) {
    case 'emergency':
      current = ctx.cash;
      break;
    case 'networth':
      current = ctx.netWorth;
      break;
    case 'property':
      current = ctx.propertyFund ?? 0;
      break;
    case 'payout_year':
      current = ctx.payoutsInWindow;
      break;
    case 'portfolio':
      current = ctx.portfolioValue;
      break;
    default:
      current = 0;
  }
  const currentR = r2(current);
  const target = goal.targetValue;
  const progress = target > 0 ? currentR / target : 0;
  return {
    goal,
    current: currentR,
    target,
    progress: Number(progress.toFixed(6)),
    pct: Number((progress * 100).toFixed(1)),
    completed: currentR >= target,
    remaining: r2(Math.max(0, target - currentR)),
    window: goal.windowType,
  };
}

/**
 * Soma dos payouts (kind='payout_in') numa janela. `calendar_year` = ano corrente;
 * `rolling_12m` = últimos 12 meses (de `now`). Ignora transações fora da janela.
 */
export function sumPayoutsInWindow(
  transactions: Transaction[],
  windowType: 'calendar_year' | 'rolling_12m',
  now = nowIso(),
): number {
  const nowDate = parseDate(now);
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== 'payout_in') continue;
    const d = parseDate(t.date);
    if (windowType === 'calendar_year') {
      if (d.getUTCFullYear() !== nowDate.getUTCFullYear()) continue;
    } else {
      const cutoff = new Date(nowDate);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
      if (d.getTime() < cutoff.getTime()) continue;
    }
    total += t.amount;
  }
  return r2(total);
}

// ---------------------------------------------------------------------------
// Financial Journal (eventos de vida ligados ao patrimônio)
// ---------------------------------------------------------------------------

export type JournalEventType =
  | 'first_payout'
  | 'payout_milestone'
  | 'networth_milestone'
  | 'investment'
  | 'monthly_income'
  | 'custom';

export interface JournalEvent {
  id: string;
  date: string;
  type: JournalEventType;
  title: string;
  amount?: number;
  note?: string;
  /** Automático sempre nasce não-confirmado; UI pede confirmação antes de salvar. */
  confirmed: boolean;
}

export interface JournalDeriveInput {
  transactions: Transaction[];
  networthSeries?: SnapshotNetworth[];
  positions?: Position[];
}

const PAYOUT_MILESTONES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const NETWORTH_MILESTONES = [100_000, 250_000, 500_000, 1_000_000, 5_000_000];

/**
 * Deriva eventos de vida a partir do patrimônio: primeiro payout, marcos de payout
 * acumulado, marcos de net worth (snapshots), primeira compra. Cada candidato nasce
 * `confirmed: false` — a UI SEMPRE pede confirmação antes de persistir.
 */
export function deriveJournalEvents(input: JournalDeriveInput): JournalEvent[] {
  const events: JournalEvent[] = [];

  const payouts = input.transactions
    .filter((t) => t.kind === 'payout_in')
    .sort((a, b) => compareIso(a.date, b.date));

  // Primeiro payout.
  const first = payouts[0];
  if (first) {
    events.push({
      id: `journal:first_payout:${first.id}`,
      date: first.date,
      type: 'first_payout',
      title: 'Primeiro payout recebido',
      amount: r2(first.amount),
      note: 'Marco de vida: o primeiro dinheiro que saiu da conta prop.',
      confirmed: false,
    });
  }

  // Marcos de payout acumulado.
  let cumulative = 0;
  for (const p of payouts) {
    cumulative += p.amount;
    for (const m of PAYOUT_MILESTONES) {
      if (cumulative >= m && cumulative - p.amount < m) {
        events.push({
          id: `journal:payout_milestone:${m}:${p.id}`,
          date: p.date,
          type: 'payout_milestone',
          title: `Payout acumulado de ${m.toLocaleString('pt-BR')}`,
          amount: r2(p.amount),
          note: `Você ultrapassou ${m.toLocaleString('pt-BR')} em payouts.`,
          confirmed: false,
        });
      }
    }
  }

  // Marcos de net worth (a partir dos snapshots).
  const snapshots = [...(input.networthSeries ?? [])].sort((a, b) => compareIso(a.snapshotAt, b.snapshotAt));
  let prev = 0;
  for (const s of snapshots) {
    for (const m of NETWORTH_MILESTONES) {
      if (s.netWorth >= m && prev < m) {
        events.push({
          id: `journal:networth_milestone:${m}:${s.snapshotAt}`,
          date: s.snapshotAt,
          type: 'networth_milestone',
          title: `Patrimônio de ${m.toLocaleString('pt-BR')}`,
          amount: r2(s.netWorth),
          note: 'Marco de patrimônio líquido.',
          confirmed: false,
        });
      }
    }
    prev = s.netWorth;
  }

  // Primeira compra (investimento).
  const buys = input.transactions
    .filter((t) => t.kind === 'buy')
    .sort((a, b) => compareIso(a.date, b.date));
  const firstBuy = buys[0];
  if (firstBuy) {
    events.push({
      id: `journal:investment:${firstBuy.id}`,
      date: firstBuy.date,
      type: 'investment',
      title: 'Primeiro aporte em investimento',
      amount: r2(Math.abs(firstBuy.amount)),
      note: firstBuy.note,
      confirmed: false,
    });
  }

  // Renda mensal estável: se houver payout todo mês nos últimos 3 meses.
  const months = new Set(payouts.map((p) => p.date.slice(0, 7)));
  if (months.size >= 3) {
    const last = payouts[payouts.length - 1];
    events.push({
      id: `journal:monthly_income:${last.date.slice(0, 7)}`,
      date: last.date,
      type: 'monthly_income',
      title: 'Renda mensal recorrente',
      amount: r2(last.amount),
      note: 'Payouts mensais consistentes (3+ meses).',
      confirmed: false,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// WealthService — orquestra leitura derivada no DataService (único writer)
// ---------------------------------------------------------------------------

export interface WealthServiceOptions {
  markPriceMaxAgeDays?: number;
  /** Fonte de "agora" (injetável em teste). Default nowIso. */
  now?: () => string;
  defaultCurrency?: string;
}

export interface MonthlyInputs {
  monthlyIncome: number;
  monthlyBills: number;
  monthlyTaxReserve: number;
  monthlyContributions: number;
  next30dBills: number;
  taxReserve: number;
}

const META_MONTHLY_INPUTS = 'wealth:monthlyInputs';

export class WealthService {
  private readonly ds: DataService;
  private readonly opts: WealthServiceOptions;

  constructor(ds: DataService, opts: WealthServiceOptions = {}) {
    this.ds = ds;
    this.opts = opts;
  }

  private now(): string {
    return this.opts.now ? this.opts.now() : nowIso();
  }

  private maxAge(): number {
    return this.opts.markPriceMaxAgeDays ?? NET_WORTH_MARK_MAX_AGE_DAYS;
  }

  // -------- leitura derivada --------

  async portfolio(opts: { fxUSD?: number } = {}): Promise<PortfolioResult> {
    const [positions, accounts, transactions] = await Promise.all([
      this.ds.positions.list(),
      this.ds.accounts.list(),
      this.ds.transactions.list(),
    ]);
    // A1 — proventos por position id (ref.investmentId).
    const dividends: Record<string, number> = {};
    for (const t of transactions) {
      if (t.kind !== 'dividend' || !t.ref || (t.ref as { type?: string }).type !== 'investmentId') continue;
      const pid = (t.ref as { id?: string }).id;
      if (!pid) continue;
      dividends[pid] = Number((((dividends[pid] ?? 0) + t.amount)).toFixed(2));
    }
    return computePortfolio(positions, {
      accounts,
      markPriceMaxAgeDays: this.maxAge(),
      now: this.now(),
      fxUSD: opts.fxUSD,
      dividends,
    });
  }

  async allocation(): Promise<AllocationResult> {
    const positions = await this.ds.positions.list();
    return computeAllocation(positions, { markPriceMaxAgeDays: this.maxAge(), now: this.now() });
  }

  async netWorth(): Promise<NetWorthResult> {
    const [accounts, transactions, positions, payouts] = await Promise.all([
      this.ds.accounts.list(),
      this.ds.transactions.list(),
      this.ds.positions.list(),
      this.ds.payouts.list(),
    ]);
    return computeNetWorth({
      accounts,
      transactions,
      positions,
      payouts,
      markPriceMaxAgeDays: this.maxAge(),
      now: this.now(),
    });
  }

  async forecast(input?: MonthlyInputs): Promise<ForecastResult> {
    const inputs = input ?? (await this.monthlyInputs());
    const nw = await this.netWorth();
    return computeForecast({
      currentCash: nw.components.cash,
      expectedPayouts: nw.components.receivables,
      monthlyIncome: inputs.monthlyIncome,
      monthlyBills: inputs.monthlyBills,
      monthlyTaxReserve: inputs.monthlyTaxReserve,
      monthlyContributions: inputs.monthlyContributions,
      now: this.now(),
    });
  }

  async safeAvailable(input?: Partial<SafeAvailableInput>): Promise<number> {
    const defaults = await this.monthlyInputs();
    const nw = await this.netWorth();
    const resolved: SafeAvailableInput = {
      currentCash: input?.currentCash ?? nw.components.cash,
      next30dBills: input?.next30dBills ?? defaults.next30dBills,
      taxReserve: input?.taxReserve ?? defaults.taxReserve,
      expectedPayouts: input?.expectedPayouts ?? nw.components.receivables,
    };
    return computeSafeAvailable(resolved);
  }

  /** Progresso de TODOS os goals (derivado do patrimônio). */
  async goals(): Promise<GoalProgressResult[]> {
    const [goals, nw, portfolio, transactions] = await Promise.all([
      this.ds.goals.list(),
      this.netWorth(),
      this.portfolio(),
      this.ds.transactions.list(),
    ]);
    const ctx: GoalProgressContext = {
      netWorth: nw.netWorth,
      cash: nw.components.cash,
      portfolioValue: portfolio.totalValue,
      propertyFund: 0,
      payoutsInWindow: 0,
      now: this.now(),
    };
    return goals.map((g) => {
      const payoutsInWindow = sumPayoutsInWindow(transactions, g.windowType ?? 'calendar_year', this.now());
      const fullCtx: GoalProgressContext = {
        ...ctx,
        payoutsInWindow,
      };
      return computeGoalProgress(g, fullCtx);
    });
  }

  /** Progresso de UM goal. */
  async goalProgress(goal: Goal): Promise<GoalProgressResult> {
    const all = await this.goals();
    return all.find((g) => g.goal.id === goal.id) ?? computeGoalProgress(goal, {
      netWorth: 0,
      cash: 0,
      portfolioValue: 0,
      payoutsInWindow: 0,
      now: this.now(),
    });
  }

  // -------- snapshots_networth (só histórico) --------

  async captureNetWorthSnapshot(): Promise<SnapshotNetworth> {
    const nw = await this.netWorth();
    const snapshot: SnapshotNetworth = {
      id: `snapshot:${nw.updatedAt}`,
      netWorth: nw.netWorth,
      totalAccounts: nw.components.cash,
      totalPositions: nw.components.investments,
      liabilities: nw.components.liabilities,
      snapshotAt: nw.updatedAt,
      updatedAt: nw.updatedAt,
      deviceId: this.ds.deviceId,
      version: 0,
    };
    await this.ds.snapshotsNetworth.put(snapshot, { source: 'local' });
    return snapshot;
  }

  async netWorthSeries(): Promise<SnapshotNetworth[]> {
    const all = await this.ds.snapshotsNetworth.list();
    return all.sort((a, b) => compareIso(a.snapshotAt, b.snapshotAt));
  }

  // -------- Financial Journal --------

  async suggestJournalEvents(): Promise<JournalEvent[]> {
    const [transactions, snapshots, positions] = await Promise.all([
      this.ds.transactions.list(),
      this.ds.snapshotsNetworth.list(),
      this.ds.positions.list(),
    ]);
    return deriveJournalEvents({ transactions, networthSeries: snapshots, positions });
  }

  async confirmJournalEvent(event: JournalEvent): Promise<JournalEvent> {
    const confirmed: JournalEvent = { ...event, confirmed: true };
    await this.ds.meta.setKey(`journal:${event.id}`, confirmed);
    return confirmed;
  }

  /** Cria um marco manual (type 'custom' ou informado). Sempre confirmado. */
  async createJournalEvent(input: {
    date: string;
    title: string;
    amount?: number;
    note?: string;
    type?: JournalEventType;
  }): Promise<JournalEvent> {
    const id = `je-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const event: JournalEvent = {
      id,
      date: input.date,
      type: input.type ?? 'custom',
      title: input.title.trim(),
      amount: input.amount,
      note: input.note,
      confirmed: true,
    };
    await this.ds.meta.setKey(`journal:${id}`, event);
    return event;
  }

  /** Remove um marco (confirmado ou sugerido descartado). */
  async removeJournalEvent(id: string): Promise<void> {
    await this.ds.meta.remove(`meta:journal:${id}`);
  }

  async listJournalEvents(): Promise<JournalEvent[]> {
    const all = await this.ds.meta.list();
    const events: JournalEvent[] = [];
    for (const m of all) {
      if (m.key.startsWith('journal:')) {
        events.push(m.value as JournalEvent);
      }
    }
    return events.sort((a, b) => compareIso(a.date, b.date));
  }

  // -------- inputs mensais (meta) --------

  async monthlyInputs(): Promise<MonthlyInputs> {
    const rec = await this.ds.meta.getKey(META_MONTHLY_INPUTS);
    if (rec?.value) return rec.value as MonthlyInputs;
    return {
      monthlyIncome: 0,
      monthlyBills: 0,
      monthlyTaxReserve: 0,
      monthlyContributions: 0,
      next30dBills: 0,
      taxReserve: 0,
    };
  }

  async setMonthlyInputs(inputs: MonthlyInputs): Promise<void> {
    await this.ds.meta.setKey(META_MONTHLY_INPUTS, inputs);
  }

  // -------- escrita de position (mark-to-market manual) --------

  /** Atualiza a marcação de uma position (preço manual). */
  async markPosition(id: string, price: number): Promise<Position> {
    if (price <= 0) throw new Error('mark price <= 0 PROIBIDO (não inventa preço)');
    const pos = await this.ds.positions.get(id);
    if (!pos) throw new Error(`Position não encontrada: ${id}`);
    const updated: Position = {
      ...pos,
      lastMarkPrice: price,
      lastMarkAt: this.now(),
    };
    return this.ds.positions.put(updated, { source: 'local' });
  }
}

/** P1-16 � Performance relativa: portf�lio vs CDI, ambos com base 100 no 1� ponto. */
export interface RelativePoint {
  at: string;
  portfolio: number;
  cdi: number;
}

export function relativeSeries(
  history: Array<{ at: string; value: number; cost: number }>,
  cdi: CdiPoint[],
): RelativePoint[] {
  if (!history.length) return [];
  const bench = applyBenchmark(history, cdi);
  const base = history[0].value || 1;
  return history.map((h, i) => ({
    at: String(h.at).slice(0, 7),
    portfolio: Number((((h.value || 0) / base) * 100).toFixed(2)),
    cdi: bench[i]?.index ?? 100,
  }));
}
