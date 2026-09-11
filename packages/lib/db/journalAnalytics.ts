// J1 — journalAnalytics: análises do Trading Journal (MOTOR). A UI nunca calcula;
// só compõe estes selectors. Usa SÓ financialFormulas.ts (tradePnl) + dateUtils.
// Sem fórmula financeira nova. Dia = dia local do trader (fuso do navegador).
//
// Fonte: DOCS/10_MODULES/00-trading-journal.md (J1–J7).

import type { Trade } from './types';
import { tradePnl, winrate, profitFactor, type ProfitFactor } from './financialFormulas';
import { parseDate, formatDate } from './dateUtils';
import { MIN_SAMPLE } from './strategies';

export interface DayPnl {
  date: string; // 'YYYY-MM-DD' (dia local)
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface MonthPnl {
  year: number;
  month: number; // 1-12
  days: DayPnl[]; // só dias com trade, ordenados
  monthPnl: number;
  monthTrades: number;
  monthWins: number;
  monthLosses: number;
  bestDay: DayPnl | null;
  worstDay: DayPnl | null;
}

function r2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * J1 — PnL por dia para o calendário mensal do journal.
 * Só trades fechados (exitPrice != null). Agrupa pelo dia local do exit
 * (fallback: entry). Ignora trades de outros meses. Breakeven (pnl 0) conta
 * como trade, mas nem win nem loss (mesma regra do winrate).
 */
export function calendarPnl(trades: Trade[], year: number, month: number): MonthPnl {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const byDate = new Map<string, DayPnl>();
  for (const t of trades) {
    if (t.exitPrice == null) continue;
    const stamp = t.exitDatetime || t.entryDatetime;
    if (!stamp) continue;
    const key = formatDate(parseDate(stamp), 'yyyy-MM-dd');
    if (!key.startsWith(prefix)) continue;
    const pnl = tradePnl(t);
    const d = byDate.get(key) ?? { date: key, pnl: 0, trades: 0, wins: 0, losses: 0 };
    d.pnl = r2(d.pnl + pnl);
    d.trades += 1;
    if (pnl > 0) d.wins += 1;
    else if (pnl < 0) d.losses += 1;
    byDate.set(key, d);
  }
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const monthPnl = r2(days.reduce((s, d) => s + d.pnl, 0));
  const monthTrades = days.reduce((s, d) => s + d.trades, 0);
  const monthWins = days.reduce((s, d) => s + d.wins, 0);
  const monthLosses = days.reduce((s, d) => s + d.losses, 0);
  const bestDay = days.reduce<DayPnl | null>((best, d) => (!best || d.pnl > best.pnl ? d : best), null);
  const worstDay = days.reduce<DayPnl | null>((worst, d) => (!worst || d.pnl < worst.pnl ? d : worst), null);
  return { year, month, days, monthPnl, monthTrades, monthWins, monthLosses, bestDay, worstDay };
}

/** Trades fechados (com exitPrice). Base de todas as análises abaixo. */
function closedTrades(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.exitPrice != null);
}

export interface WeeklyReview {
  weekStart: string; // YYYY-MM-DD (segunda-feira, dia local)
  weekEnd: string; // YYYY-MM-DD (domingo, dia local)
  trades: number;
  pnl: number;
  wins: number;
  losses: number;
  winrate: number;
  avgR: number | null;
  bestDay: DayPnl | null;
  worstDay: DayPnl | null;
  bestSymbol: string | null;
  worstSymbol: string | null;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * J11 — Review semanal (segunda–domingo, dia local, contendo `refDate` ou hoje).
 * Resume a semana: PnL, n, WR, avgR, melhor/pior dia e símbolo. Texto de ação
 * (meta da próxima semana) é manual na UI — o motor só entrega os fatos.
 */
export function weeklyReview(trades: Trade[], refDate?: string | Date): WeeklyReview {
  const ref = refDate ? parseDate(refDate) : new Date();
  const base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dowMon0 = (base.getDay() + 6) % 7; // 0 = segunda
  const start = new Date(base);
  start.setDate(base.getDate() - dowMon0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startKey = localDayKey(start);
  const endKey = localDayKey(end);
  const week = closedTrades(trades).filter((t) => {
    const stamp = t.exitDatetime || t.entryDatetime;
    if (!stamp) return false;
    const key = formatDate(parseDate(stamp), 'yyyy-MM-dd');
    return key >= startKey && key <= endKey;
  });
  const wins = week.filter((t) => (t.resultNet ?? tradePnl(t)) > 0).length;
  const losses = week.filter((t) => (t.resultNet ?? tradePnl(t)) < 0).length;
  const byDate = new Map<string, DayPnl>();
  for (const t of week) {
    const stamp = (t.exitDatetime || t.entryDatetime) as string;
    const key = formatDate(parseDate(stamp), 'yyyy-MM-dd');
    const pnl = tradePnl(t);
    const d = byDate.get(key) ?? { date: key, pnl: 0, trades: 0, wins: 0, losses: 0 };
    d.pnl = r2(d.pnl + pnl);
    d.trades += 1;
    if (pnl > 0) d.wins += 1;
    else if (pnl < 0) d.losses += 1;
    byDate.set(key, d);
  }
  const dayList = [...byDate.values()];
  const symbols = symbolBreakdown(week);
  return {
    weekStart: startKey,
    weekEnd: endKey,
    trades: week.length,
    pnl: r2(week.reduce((s, t) => s + tradePnl(t), 0)),
    wins,
    losses,
    winrate: winrate(week),
    avgR: avgRof(week),
    bestDay: dayList.reduce<DayPnl | null>((b, d) => (!b || d.pnl > b.pnl ? d : b), null),
    worstDay: dayList.reduce<DayPnl | null>((w, d) => (!w || d.pnl < w.pnl ? d : w), null),
    bestSymbol: symbols.length ? symbols[0].symbol : null,
    worstSymbol: symbols.length ? symbols[symbols.length - 1].symbol : null,
  };
}

export interface MaeMfe {
  mae: number | null;
  mfe: number | null;
}

/**
 * J10 — MAE/MFE (proxy via fills).
 * Excursão máxima adversa/favorável em $ a partir dos fills (`executions` com
 * preço): signed = (fill.price − entryPrice) × dir × qty; MFE = max(0, max),
 * MAE = min(0, min). Null quando não há fills com preço.
 * Limitação documentada: proxy — o MAE/MFE verdadeiro exige série M1 intra-trade,
 * que o schema não guarda. Com fills registrados, aproxima bem para revisão.
 */
export function maeMfe(trade: Trade): MaeMfe {
  // A2 — prefere campos reais (bridge futuro/manual) ao proxy via fills.
  if (typeof trade.mae === 'number' || typeof trade.mfe === 'number') {
    return {
      mae: typeof trade.mae === 'number' ? trade.mae : null,
      mfe: typeof trade.mfe === 'number' ? trade.mfe : null,
    };
  }
  const fills = (trade.executions || []).filter(
    (x) => x && typeof x.price === 'number' && !Number.isNaN(x.price),
  );
  if (!fills.length) return { mae: null, mfe: null };
  const dir = trade.direction === 'long' ? 1 : -1;
  const qty = Number(trade.qty) || 0;
  const signed = fills.map((x) => (x.price - trade.entryPrice) * dir * qty);
  return {
    mfe: r2(Math.max(0, ...signed)),
    mae: r2(Math.min(0, ...signed)),
  };
}

function avgRof(trades: Trade[]): number | null {
  const rs = trades.map((t) => t.resultR).filter((r): r is number => r != null && !Number.isNaN(r));
  if (!rs.length) return null;
  return Number((rs.reduce((s, r) => s + r, 0) / rs.length).toFixed(2));
}

/** Expectancy = WR*avgW − LR*avgL sobre resultNet (mesma definição do dashboard). */
function expectancyOf(trades: Trade[]): number {
  const wins = trades.filter((t) => (t.resultNet ?? 0) > 0);
  const losses = trades.filter((t) => (t.resultNet ?? 0) < 0);
  const n = wins.length + losses.length;
  if (!n) return 0;
  const avgW = wins.reduce((s, t) => s + (t.resultNet ?? 0), 0) / Math.max(wins.length, 1);
  const avgL = Math.abs(losses.reduce((s, t) => s + (t.resultNet ?? 0), 0)) / Math.max(losses.length, 1);
  return Number(((wins.length / n) * avgW - (losses.length / n) * avgL).toFixed(2));
}

export interface GroupStat {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  avgR: number | null;
  winrate: number;
  profitFactor: ProfitFactor;
  expectancy: number;
}

function groupStat(trades: Trade[]): GroupStat {
  const wins = trades.filter((t) => (t.resultNet ?? tradePnl(t)) > 0).length;
  const losses = trades.filter((t) => (t.resultNet ?? tradePnl(t)) < 0).length;
  return {
    trades: trades.length,
    wins,
    losses,
    pnl: r2(trades.reduce((s, t) => s + tradePnl(t), 0)),
    avgR: avgRof(trades),
    winrate: winrate(trades),
    profitFactor: profitFactor(trades),
    expectancy: expectancyOf(trades),
  };
}

/** J5 — Long vs Short split. */
export function directionSplit(trades: Trade[]): { long: GroupStat; short: GroupStat } {
  const closed = closedTrades(trades);
  return {
    long: groupStat(closed.filter((t) => t.direction === 'long')),
    short: groupStat(closed.filter((t) => t.direction === 'short')),
  };
}

export interface SymbolStat extends GroupStat {
  symbol: string;
  sampleOk: boolean; // n >= MIN_SAMPLE (20)
}

/** J6 — Breakdown por símbolo (ordenado por PnL desc). */
export function symbolBreakdown(trades: Trade[]): SymbolStat[] {
  const closed = closedTrades(trades);
  const bySymbol = new Map<string, Trade[]>();
  for (const t of closed) {
    const list = bySymbol.get(t.symbol) ?? [];
    list.push(t);
    bySymbol.set(t.symbol, list);
  }
  return [...bySymbol.entries()]
    .map(([symbol, list]) => ({ symbol, ...groupStat(list), sampleOk: list.length >= MIN_SAMPLE }))
    .sort((a, b) => b.pnl - a.pnl);
}

/** J2 — Heatmap por símbolo (top N por |PnL| para intensidade de cor). */
export function heatmapBySymbol(trades: Trade[], top = 12): SymbolStat[] {
  return symbolBreakdown(trades)
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, top);
}

export interface SessionStat extends GroupStat {
  session: string; // id da definição (padrão: 'Asian'|'London'|'NewYork'|'Off')
  label: string;
}

export interface SessionDef {
  id: string;
  label: string;
  startH: number; // 0–23 UTC, inclusivo
  endH: number; // 0–24 UTC, exclusivo
}

/** Buckets padrão (comportamento histórico quando sem config). */
export const DEFAULT_SESSIONS: SessionDef[] = [
  { id: 'Asian', label: 'Asian 00–07', startH: 0, endH: 8 },
  { id: 'London', label: 'London 08–12', startH: 8, endH: 13 },
  { id: 'NewYork', label: 'NewYork 13–20', startH: 13, endH: 21 },
  { id: 'Off', label: 'Off 21–23', startH: 21, endH: 24 },
];

/**
 * J7/A3 — Sessão/hora (hora UTC da entrada). `sessions` opcional: quando presente
 * (ex.: config da firm salva no journal), usa os buckets configurados; sem config,
 * comportamento idêntico ao original. `session` vira o id da definição.
 */
export function sessionAnalysis(trades: Trade[], sessions: SessionDef[] = DEFAULT_SESSIONS): SessionStat[] {
  const closed = closedTrades(trades);
  const defs = sessions.length > 0 ? sessions : DEFAULT_SESSIONS;
  const buckets = new Map<string, { def: SessionDef; list: Trade[] }>();
  for (const def of defs) buckets.set(def.id, { def, list: [] });
  const fallback = buckets.get(defs[defs.length - 1].id);
  for (const t of closed) {
    const h = parseDate(t.entryDatetime).getUTCHours();
    const hit = defs.find((d) => h >= d.startH && h < d.endH);
    (hit ? buckets.get(hit.id) : fallback)?.list.push(t);
  }
  return defs.map((def) => ({
    session: def.id,
    label: def.label,
    ...groupStat(buckets.get(def.id)?.list ?? []),
  }));
}

/** J2 — Heatmap por sessão (mesma base do J7, para intensidade de cor). */
export function heatmapBySession(trades: Trade[], sessions?: SessionDef[]): SessionStat[] {
  return sessionAnalysis(trades, sessions);
}

export interface RBucket {
  min: number;
  max: number;
  label: string;
  count: number;
}

export interface RDistribution {
  buckets: RBucket[];
  count: number;
  avg: number | null;
  median: number | null;
  std: number | null;
}

/**
 * J3 — Histograma de R (múltiplos de risco). Buckets de `bucketSize` R.
 * Usa trade.resultR (null quando sem stop — fora da distribuição).
 */
export function rDistribution(trades: Trade[], bucketSize = 0.5): RDistribution {
  const rs = closedTrades(trades)
    .map((t) => t.resultR)
    .filter((r): r is number => r != null && !Number.isNaN(r))
    .sort((a, b) => a - b);
  if (!rs.length) return { buckets: [], count: 0, avg: null, median: null, std: null };
  const lo = Math.floor(rs[0] / bucketSize) * bucketSize;
  const hi = Math.ceil(rs[rs.length - 1] / bucketSize) * bucketSize;
  const buckets: RBucket[] = [];
  for (let min = lo; min < hi || (min === lo && lo === hi); min = Number((min + bucketSize).toFixed(4))) {
    const max = Number((min + bucketSize).toFixed(4));
    buckets.push({ min, max, label: `${min}–${max}R`, count: 0 });
    if (min >= hi) break;
  }
  for (const r of rs) {
    const idx = Math.min(buckets.length - 1, Math.floor((r - lo) / bucketSize));
    buckets[Math.max(0, idx)].count += 1;
  }
  const avg = rs.reduce((s, r) => s + r, 0) / rs.length;
  const mid = Math.floor(rs.length / 2);
  const median = rs.length % 2 ? rs[mid] : (rs[mid - 1] + rs[mid]) / 2;
  const variance = rs.reduce((s, r) => s + (r - avg) ** 2, 0) / rs.length;
  return {
    buckets,
    count: rs.length,
    avg: Number(avg.toFixed(2)),
    median: Number(median.toFixed(2)),
    std: Number(Math.sqrt(variance).toFixed(2)),
  };
}

export interface DurationStats {
  count: number;
  avgMin: number | null;
  medianMin: number | null;
  minMin: number | null;
  maxMin: number | null;
  byDirection: { long: { count: number; avgMin: number | null }; short: { count: number; avgMin: number | null } };
}

function avgMinOf(minutes: number[]): number | null {
  if (!minutes.length) return null;
  return Number((minutes.reduce((s, m) => s + m, 0) / minutes.length).toFixed(1));
}

function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Number(median.toFixed(1));
}

/**
 * J4 — Duração (hold time em minutos, exit − entry). Só fechados com as duas datas.
 */
export function durationStats(trades: Trade[]): DurationStats {
  const withBoth = closedTrades(trades).filter((t) => t.exitDatetime && t.entryDatetime);
  const minutes = withBoth.map((t) => (parseDate(t.exitDatetime as string).getTime() - parseDate(t.entryDatetime).getTime()) / 60000);
  const forDir = (dir: 'long' | 'short') => {
    const list = withBoth.filter((t) => t.direction === dir);
    const mins = list.map((t) => (parseDate(t.exitDatetime as string).getTime() - parseDate(t.entryDatetime).getTime()) / 60000);
    return { count: list.length, avgMin: avgMinOf(mins) };
  };
  return {
    count: withBoth.length,
    avgMin: avgMinOf(minutes),
    medianMin: medianOf(minutes),
    minMin: minutes.length ? Number(Math.min(...minutes).toFixed(1)) : null,
    maxMin: minutes.length ? Number(Math.max(...minutes).toFixed(1)) : null,
    byDirection: { long: forDir('long'), short: forDir('short') },
  };
}
