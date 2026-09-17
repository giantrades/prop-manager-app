// J1 — journalAnalytics: análises do Trading Journal (MOTOR). A UI nunca calcula;
// só compõe estes selectors. Usa SÓ financialFormulas.ts (tradePnl) + dateUtils.
// Sem fórmula financeira nova. Dia = dia local do trader (fuso do navegador).
//
// Fonte: DOCS/10_MODULES/00-trading-journal.md (J1–J7).

import type { Trade } from './types';
import { tradeNetPnl, winrate, profitFactor, type ProfitFactor } from './financialFormulas';
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
    const pnl = tradeNetPnl(t);
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
  const wins = week.filter((t) => tradeNetPnl(t) > 0).length;
  const losses = week.filter((t) => tradeNetPnl(t) < 0).length;
  const byDate = new Map<string, DayPnl>();
  for (const t of week) {
    const stamp = (t.exitDatetime || t.entryDatetime) as string;
    const key = formatDate(parseDate(stamp), 'yyyy-MM-dd');
    const pnl = tradeNetPnl(t);
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
    pnl: r2(week.reduce((s, t) => s + tradeNetPnl(t), 0)),
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

export interface ReplayPoint {
  at: string; // ISO (entry/exit/fill)
  label: string; // 'Entrada' | 'Fill N' | 'Saída'
  price: number;
  kind: 'entry' | 'fill' | 'exit';
}

export interface TradeReplay {
  points: ReplayPoint[];
  mae: number | null;
  mfe: number | null;
  notes: string;
}

/**
 * B1 — Replay do trade: sequência temporal entrada → fills → saída + contexto
 * MAE/MFE (reuso de `maeMfe()`) + notas. Sem fills, mostra entry→exit.
 * Puro (UI só renderiza).
 */
export function tradeReplay(trade: Trade): TradeReplay {
  const fills = (trade.executions || [])
    .filter((x) => x && typeof x.price === 'number' && !Number.isNaN(x.price))
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  const points: ReplayPoint[] = [
    { at: trade.entryDatetime, label: 'Entrada', price: trade.entryPrice, kind: 'entry' },
  ];
  fills.forEach((f, i) => {
    points.push({
      at: f.timestamp || trade.entryDatetime,
      label: `Fill ${i + 1} (${f.side})`,
      price: f.price,
      kind: 'fill',
    });
  });
  if (trade.exitPrice != null && trade.exitDatetime) {
    points.push({ at: trade.exitDatetime, label: 'Saída', price: trade.exitPrice, kind: 'exit' });
  }
  const { mae, mfe } = maeMfe(trade);
  return { points, mae, mfe, notes: trade.notes ?? '' };
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

/** Expectancy = WR*avgW − LR*avgL sobre o PnL realizado (tradeNetPnl). */
function expectancyOf(trades: Trade[]): number {
  const wins = trades.filter((t) => tradeNetPnl(t) > 0);
  const losses = trades.filter((t) => tradeNetPnl(t) < 0);
  const n = wins.length + losses.length;
  if (!n) return 0;
  const avgW = wins.reduce((s, t) => s + tradeNetPnl(t), 0) / Math.max(wins.length, 1);
  const avgL = Math.abs(losses.reduce((s, t) => s + tradeNetPnl(t), 0)) / Math.max(losses.length, 1);
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
  const wins = trades.filter((t) => tradeNetPnl(t) > 0).length;
  const losses = trades.filter((t) => tradeNetPnl(t) < 0).length;
  return {
    trades: trades.length,
    wins,
    losses,
    pnl: r2(trades.reduce((s, t) => s + tradeNetPnl(t), 0)),
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

// ---------------------------------------------------------------------------
// Drawdown (an�lise) � curva de equity dos trades + detec��o de drawdowns.
// F�rmula de risco vem do motor; aqui � agrega��o/s�rie. Nunca calculado na UI.
// ---------------------------------------------------------------------------

export interface EquityPointLite { at: string; equity: number }
export interface DrawdownInfo {
  id: number;
  startDate: string;
  troughDate: string;
  recoveryDate: string | null;
  drawdownAbs: number;
  drawdownPct: number;
  durationDays: number;
  recoveryDays: number | null;
  recovered: boolean;
}
export interface DrawdownAnalysis {
  series: Array<{ at: string; label: string; equity: number }>;
  underwater: Array<{ label: string; dd: number }>;
  drawdowns: DrawdownInfo[];
  maxDD: { drawdownAbs: number; drawdownPct: number };
  avgDD: number;
  avgRecoveryDays: number | null;
  recoveryRate: number;
  significant: number;
  atPeak: boolean;
}

const r2dd = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));

/** S�rie de equity a partir dos trades fechados + capital inicial. */
export function drawdownAnalysis(trades: Trade[], initialFunding: number): DrawdownAnalysis {
  const start = initialFunding > 0 ? initialFunding : 0;
  const sorted = trades
    .filter((t) => t.exitDatetime || t.entryDatetime)
    .slice()
    .sort((a, b) => String(a.exitDatetime || a.entryDatetime).localeCompare(String(b.exitDatetime || b.entryDatetime)));
  const firstAt = (sorted[0]?.exitDatetime || sorted[0]?.entryDatetime) as string | undefined;
  let eq = start;
  const series: Array<{ at: string; label: string; equity: number }> = [];
  // Capital inicial como 1º ponto da curva: sem ele o pico começava na equity do 1º
  // trade e um drawdown já no começo não era detectado (nem o %).
  if (firstAt) series.push({ at: firstAt, label: 'início', equity: r2dd(start) });
  for (const t of sorted) {
    eq += tradeNetPnl(t);
    const at = (t.exitDatetime || t.entryDatetime) as string;
    const d = parseDate(at);
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    series.push({ at, label, equity: r2dd(eq) });
  }

  const drawdowns: DrawdownInfo[] = [];
  if (series.length > 0) {
    let peak = series[0].equity; let peakIdx = 0; let troughIdx = 0; let inDD = false;
    const push = (endIdx: number, recovered: boolean) => {
      const s = series[peakIdx]; const tr = series[troughIdx];
      const abs = r2dd(s.equity - tr.equity);
      const pct = s.equity > 0 ? r2dd((abs / s.equity) * 100) : 0;
      const end = series[endIdx];
      drawdowns.push({
        id: drawdowns.length + 1,
        startDate: s.label, troughDate: tr.label, recoveryDate: recovered ? end.label : null,
        drawdownAbs: abs, drawdownPct: pct,
        durationDays: daysBetween(s.at, end.at),
        recoveryDays: recovered ? daysBetween(tr.at, end.at) : null,
        recovered,
      });
    };
    for (let i = 1; i < series.length; i++) {
      const val = series[i].equity;
      if (val >= peak) {
        if (inDD) push(i, true);
        peak = val; peakIdx = i; inDD = false;
      } else if (!inDD || val < series[troughIdx].equity) {
        inDD = true; troughIdx = i;
      }
    }
    if (inDD) push(series.length - 1, false);
  }

  const drawdownsSorted = drawdowns.slice().sort((a, b) => b.drawdownPct - a.drawdownPct);
  const maxDD = drawdownsSorted[0] ?? { drawdownAbs: 0, drawdownPct: 0 };
  const avgDD = drawdowns.length ? r2dd(drawdowns.reduce((s, d) => s + d.drawdownAbs, 0) / drawdowns.length) : 0;
  const recovered = drawdowns.filter((d) => d.recovered);
  const avgRecoveryDays = recovered.length ? Math.round(recovered.reduce((s, d) => s + (d.recoveryDays || 0), 0) / recovered.length) : null;

  let peak = -Infinity;
  const underwater = series.map((p) => {
    peak = Math.max(peak, p.equity);
    return { label: p.label, dd: peak > 0 ? r2dd(((p.equity - peak) / peak) * 100) : 0 };
  });

  const last = series.at(-1)?.equity ?? 0;
  return {
    series,
    underwater,
    drawdowns: drawdownsSorted,
    maxDD: { drawdownAbs: maxDD.drawdownAbs ?? 0, drawdownPct: maxDD.drawdownPct ?? 0 },
    avgDD,
    avgRecoveryDays,
    recoveryRate: drawdowns.length ? Math.round((recovered.length / drawdowns.length) * 100) : 0,
    significant: drawdowns.filter((d) => d.drawdownPct >= 5).length,
    atPeak: Math.abs(last - Math.max(...series.map((s) => s.equity), start)) < 1e-6,
  };
}

// ---------------------------------------------------------------------------
// P1 — Analytics adicionais (daily PnL, expectancy móvel, R box, heatmap dia)
// ---------------------------------------------------------------------------

/** PnL líquido por dia (barras). */
export interface DailyPnl {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

export function dailyPnlSeries(trades: Trade[]): DailyPnl[] {
  const map = new Map<string, DailyPnl>();
  for (const t of closedTrades(trades)) {
    const stamp = t.exitDatetime || t.entryDatetime;
    if (!stamp) continue;
    const date = String(stamp).slice(0, 10);
    const e = map.get(date) ?? { date, pnl: 0, trades: 0, wins: 0, losses: 0 };
    const net = tradeNetPnl(t);
    e.pnl += net;
    e.trades += 1;
    if (net > 0) e.wins += 1;
    else if (net < 0) e.losses += 1;
    map.set(date, e);
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ ...e, pnl: Number(e.pnl.toFixed(2)) }));
}

/** Expectancy móvel (média de R em janela de N trades). */
export interface ExpectancyPoint {
  index: number;
  date: string;
  expectancy: number;
}

export function rollingExpectancy(trades: Trade[], window = 20): ExpectancyPoint[] {
  const closed = closedTrades(trades).filter((t) => t.resultR != null && !Number.isNaN(t.resultR));
  if (closed.length < window) return [];
  const out: ExpectancyPoint[] = [];
  for (let i = window - 1; i < closed.length; i += 1) {
    let sum = 0;
    for (let j = i - window + 1; j <= i; j += 1) sum += closed[j].resultR as number;
    out.push({
      index: i + 1,
      date: String(closed[i].exitDatetime || closed[i].entryDatetime || '').slice(0, 10),
      expectancy: Number((sum / window).toFixed(3)),
    });
  }
  return out;
}

/** Estatística de caixa da distribuição de R (min, quartis, mediana, máx). */
export interface RBoxStats {
  count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  outliers: number[];
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function rBoxStats(trades: Trade[]): RBoxStats | null {
  const rs = closedTrades(trades)
    .map((t) => t.resultR)
    .filter((r): r is number => r != null && !Number.isNaN(r))
    .sort((a, b) => a - b);
  if (!rs.length) return null;
  const q1 = quantile(rs, 0.25);
  const q3 = quantile(rs, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return {
    count: rs.length,
    min: rs[0],
    q1: Number(q1.toFixed(2)),
    median: Number(quantile(rs, 0.5).toFixed(2)),
    q3: Number(q3.toFixed(2)),
    max: rs[rs.length - 1],
    mean: Number((rs.reduce((s, r) => s + r, 0) / rs.length).toFixed(2)),
    outliers: rs.filter((r) => r < lo || r > hi).map((r) => Number(r.toFixed(2))),
  };
}

/** Heatmap por dia da semana (PnL, nº trades, winrate, R médio). */
export interface WeekdayStat {
  weekday: number;
  label: string;
  trades: number;
  pnl: number;
  winrate: number | null;
  avgR: number | null;
}

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function heatmapByWeekday(trades: Trade[]): WeekdayStat[] {
  const map = new Map<number, { trades: number; pnl: number; wins: number; rSum: number; rCount: number }>();
  for (const t of closedTrades(trades)) {
    const stamp = t.exitDatetime || t.entryDatetime;
    if (!stamp) continue;
    const d = new Date(stamp);
    if (Number.isNaN(d.getTime())) continue;
    const wd = d.getUTCDay();
    const e = map.get(wd) ?? { trades: 0, pnl: 0, wins: 0, rSum: 0, rCount: 0 };
    const net = tradeNetPnl(t);
    e.trades += 1;
    e.pnl += net;
    if (net > 0) e.wins += 1;
    if (t.resultR != null && !Number.isNaN(t.resultR)) { e.rSum += t.resultR; e.rCount += 1; }
    map.set(wd, e);
  }
  return [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const e = map.get(wd);
    return {
      weekday: wd,
      label: WEEKDAYS_PT[wd],
      trades: e?.trades ?? 0,
      pnl: Number((e?.pnl ?? 0).toFixed(2)),
      winrate: e && e.trades > 0 ? Number(((e.wins / e.trades) * 100).toFixed(1)) : null,
      avgR: e && e.rCount > 0 ? Number((e.rSum / e.rCount).toFixed(2)) : null,
    };
  });
}

/** Resumo MAE/MFE (em unidades de preço) — médias e razão MFE/MAE. */
export interface MaeMfeSummary {
  count: number;
  avgMae: number | null;
  avgMfe: number | null;
  ratio: number | null;
}

export function maeMfeSummary(trades: Trade[]): MaeMfeSummary {
  let maeSum = 0;
  let mfeSum = 0;
  let n = 0;
  for (const t of closedTrades(trades)) {
    const { mae, mfe } = maeMfe(t);
    if (mae == null && mfe == null) continue;
    maeSum += Math.abs(mae ?? 0);
    mfeSum += mfe ?? 0;
    n += 1;
  }
  if (!n) return { count: 0, avgMae: null, avgMfe: null, ratio: null };
  const avgMae = Number((maeSum / n).toFixed(4));
  const avgMfe = Number((mfeSum / n).toFixed(4));
  return { count: n, avgMae, avgMfe, ratio: avgMae > 0 ? Number((avgMfe / avgMae).toFixed(2)) : null };
}

/** P1-08 � Rule Adherence: ader�ncia ao checklist por dia � resultado do dia. */
export interface AdherenceGroup {
  days: number;
  avgPnl: number;
  winDays: number;
}

export interface AdherenceResult {
  overall: number | null;
  compliant: AdherenceGroup;
  nonCompliant: AdherenceGroup;
  threshold: number;
}

export function ruleAdherence(
  days: Array<{ date: string; adherence: number; pnl: number }>,
  threshold = 0.8,
): AdherenceResult {
  const comp: number[] = [];
  const non: number[] = [];
  let sumAdh = 0;
  let winC = 0;
  let winN = 0;
  for (const d of days) {
    const a = Number(d.adherence) || 0;
    sumAdh += a;
    if (a >= threshold) {
      comp.push(d.pnl);
      if (d.pnl > 0) winC += 1;
    } else {
      non.push(d.pnl);
      if (d.pnl > 0) winN += 1;
    }
  }
  const avg = (arr: number[]) => (arr.length ? Number((arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(2)) : 0);
  return {
    overall: days.length ? Number((sumAdh / days.length).toFixed(3)) : null,
    compliant: { days: comp.length, avgPnl: avg(comp), winDays: winC },
    nonCompliant: { days: non.length, avgPnl: avg(non), winDays: winN },
    threshold,
  };
}
