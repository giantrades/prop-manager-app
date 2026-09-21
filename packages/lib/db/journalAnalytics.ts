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
    if (!isClosed(t)) continue;
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

/**
 * Trade FECHADO — critério ÚNICO para todo o journal: tem saída (`exitDatetime`) OU preço
 * de saída. Antes era só `exitPrice != null`, enquanto o card do Trading usava
 * `exitDatetime`: um trade com saída registrada mas sem exitPrice aparecia no card e
 * DESAPARECIA do calendário/heat/review — os totais divergiam entre widgets.
 */
function isClosed(t: Trade): boolean {
  return t.exitDatetime != null || t.exitPrice != null;
}

function closedTrades(trades: Trade[]): Trade[] {
  return trades.filter(isClosed);
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

/** Fuso em que a hora (`startH`/`endH`) é interpretada: 'utc' (default, back-compat J7)
 *  ou 'local' (relógio do aparelho — usado pelo journal, onde o trader pensa em hora local). */
export type SessionZone = 'utc' | 'local';

export interface SessionDef {
  id: string;
  label: string;
  startH: number; // 0–24, inclusivo (no fuso `zone`)
  endH: number; // 0–24, exclusivo (no fuso `zone`)
}

/** Buckets padrão (comportamento histórico quando sem config). Disjuntos de propósito:
 *  evita que um trade seja contado em duas sessões. Ver `MARKET_SESSIONS` p/ o modelo real. */
export const DEFAULT_SESSIONS: SessionDef[] = [
  { id: 'Asian', label: 'Asian 00–07', startH: 0, endH: 8 },
  { id: 'London', label: 'London 08–12', startH: 8, endH: 13 },
  { id: 'NewYork', label: 'New York 13–20', startH: 13, endH: 21 },
  { id: 'Off', label: 'Off 21–23', startH: 21, endH: 24 },
];

/**
 * Sessões reais de mercado em UTC (aproximadas) — **se sobrepõem** (Tokyo∩London 07–09,
 * London∩NY 12–16) e a de Sydney **cruza a meia-noite** (21→06). Constante de referência;
 * o journal usa `marketSessionsInLocalZone()` para ver no relógio do aparelho.
 */
export const MARKET_SESSIONS: SessionDef[] = [
  { id: 'sydney', label: 'Sydney 21–06', startH: 21, endH: 6 },
  { id: 'tokyo', label: 'Tokyo 00–09', startH: 0, endH: 9 },
  { id: 'london', label: 'London 07–16', startH: 7, endH: 16 },
  { id: 'newyork', label: 'New York 12–21', startH: 12, endH: 21 },
];

/** Horário local de referência de cada mercado (fuso IANA + horário comercial local). */
export interface MarketHoursDef {
  id: string;
  label: string;
  tz: string;
  startH: number; // hora local do mercado (0–24)
  endH: number;
}
export const MARKET_HOURS: MarketHoursDef[] = [
  { id: 'sydney', label: 'Sydney', tz: 'Australia/Sydney', startH: 7, endH: 16 },
  { id: 'tokyo', label: 'Tokyo', tz: 'Asia/Tokyo', startH: 9, endH: 18 },
  { id: 'london', label: 'London', tz: 'Europe/London', startH: 8, endH: 17 },
  { id: 'newyork', label: 'New York', tz: 'America/New_York', startH: 9.5, endH: 16 },
];

/** Offset (minutos, leste positivo) de um fuso IANA numa data. Usa a base IANA do navegador. */
function tzOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) if (part.type !== 'literal') p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

function fmtHour(h: number): string {
  const total = Math.round(((h % 24) + 24) % 24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Converte os horários REAIS de cada mercado (fuso próprio, com DST) para o **relógio do
 * aparelho** na data `ref`. Resultado fica “fixo” no seu fuso (o trader ajusta se quiser),
 * e é o padrão do journal. Usa `Intl` (base IANA), sem dependência nova.
 */
export function marketSessionsInLocalZone(ref: Date = new Date()): SessionDef[] {
  return MARKET_HOURS.map((m) => {
    const off = tzOffsetMinutes(m.tz, ref);
    const [y, mo, d] = new Intl.DateTimeFormat('en-CA', { timeZone: m.tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(ref).split('-').map(Number);
    const toLocal = (h: number) => {
      const utcMs = Date.UTC(y, mo - 1, d, Math.floor(h), Math.round((h % 1) * 60)) - off * 60000;
      const inst = new Date(utcMs);
      return Math.round((inst.getHours() + inst.getMinutes() / 60) * 100) / 100;
    };
    const startH = toLocal(m.startH);
    const endH = toLocal(m.endH);
    return { id: m.id, label: `${m.label} ${fmtHour(startH)}–${fmtHour(endH)}`, startH, endH };
  });
}

export interface MarketStatus {
  id: string;
  label: string;
  tz: string;
  /** Minutos desde 00:00 no fuso do mercado (para exibir o relógio local). */
  localMinutes: number;
  /** A sessão do mercado está aberta agora? (usa o horário comercial local + dia útil). */
  open: boolean;
}

/**
 * Estado de cada mercado AGORA: relógio local (no fuso dele, já com DST) e se está aberto.
 * Usado pelo mapa mundial (pino + relógio + bolinha aberto/fechado).
 */
export function marketStatus(ref: Date = new Date()): MarketStatus[] {
  return MARKET_HOURS.map((m) => {
    const off = tzOffsetMinutes(m.tz, ref);
    const wall = new Date(ref.getTime() + off * 60000); // relógio local do mercado
    const h = wall.getUTCHours() + wall.getUTCMinutes() / 60;
    const dow = wall.getUTCDay(); // 0=dom
    const def: SessionDef = { id: m.id, label: m.label, startH: m.startH, endH: m.endH };
    const weekday = dow >= 1 && dow <= 5;
    return {
      id: m.id,
      label: m.label,
      tz: m.tz,
      localMinutes: wall.getUTCHours() * 60 + wall.getUTCMinutes(),
      open: weekday && sessionContains(def, h),
    };
  });
}

// ---------------------------------------------------------------------------
// DST-exato: as janelas de sessão são resolvidas a partir do horário de parede
// de cada mercado (fuso IANA) para uma dado DIA, com offset por borda. É o que
// mantém faixas, "agora" e atribuição de PnL corretos quando o horário muda.
// ---------------------------------------------------------------------------

function dayKeyParts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

function addDaysIso(key: string, days: number): string {
  const [y, m, d] = dayKeyParts(key);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * Horário de parede (no fuso IANA `tz`, na data `dateKey`, hora fracionária `hourFrac`)
 * → instante UTC (ms). DST-exato: resolve o offset **no instante-alvo** com 2 passadas,
 * então acerta tanto o dia da virada quanto horários fora de 0–24 (`hourFrac` > 24 avança o dia).
 */
function marketWallToUtc(tz: string, dateKey: string, hourFrac: number): number {
  const [y, m, d] = dayKeyParts(dateKey);
  const dayExtra = Math.floor(hourFrac / 24);
  const h = hourFrac - dayExtra * 24;
  const hh = Math.floor(h);
  const mi = Math.round((h - hh) * 60);
  const base = Date.UTC(y, m - 1, d + dayExtra, hh, mi);
  let utc = base - tzOffsetMinutes(tz, new Date(base)) * 60000;
  utc = base - tzOffsetMinutes(tz, new Date(utc)) * 60000;
  return utc;
}

/** Segmento de sessão (de um mercado) recortado no dia do eixo, em horas fracionárias 0–24. */
export interface SessionWindow {
  id: string;
  label: string;
  index: number; // posição em MARKET_HOURS (define a cor, igual aos cards de mercado)
  startH: number; // 0–24 no eixo (inclusivo)
  endH: number; // 0–24 no eixo (exclusivo)
}

/**
 * Janelas das 4 sessões de mercado que aparecem no dia `dateKey` no eixo pedido
 * ('local' = relógio do aparelho, 'utc'). Resolve início e fim **separadamente** (offset
 * por borda) e recorta no dia do eixo, então a sessão que atravessa a meia-noite aparece
 * dividida (parte do dia anterior + parte deste). DST-exato por construção.
 */
export function marketSessionWindowsForDate(dateKey: string, zone: SessionZone): SessionWindow[] {
  const [y, m, d] = dayKeyParts(dateKey);
  const dayStart = zone === 'utc'
    ? Date.UTC(y, m - 1, d, 0, 0, 0)
    : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const dayEnd = dayStart + 86400000;
  const hourInAxis = (utcMs: number): number => {
    const dd = new Date(utcMs);
    return zone === 'utc'
      ? dd.getUTCHours() + dd.getUTCMinutes() / 60
      : dd.getHours() + dd.getMinutes() / 60;
  };
  const out: SessionWindow[] = [];
  MARKET_HOURS.forEach((mk, index) => {
    const dur = ((mk.endH - mk.startH) % 24 + 24) % 24;
    if (dur === 0) return;
    for (const off of [-1, 0, 1]) {
      const wallDate = addDaysIso(dateKey, off);
      const startUtc = marketWallToUtc(mk.tz, wallDate, mk.startH);
      const endUtc = marketWallToUtc(mk.tz, wallDate, mk.startH + dur);
      const s = Math.max(startUtc, dayStart);
      const e = Math.min(endUtc, dayEnd);
      if (e <= s) continue;
      out.push({
        id: mk.id,
        label: mk.label,
        index,
        startH: s <= dayStart ? 0 : hourInAxis(s),
        endH: e >= dayEnd ? 24 : hourInAxis(e),
      });
    }
  });
  return out;
}

/** Primeiro mercado aberto no instante `ms` (relógio local do mercado + dia útil); null se nenhum. */
export function marketOpenAt(ms: number): string | null {
  const ref = new Date(ms);
  for (const m of MARKET_HOURS) {
    const off = tzOffsetMinutes(m.tz, ref);
    const wall = new Date(ref.getTime() + off * 60000);
    const h = wall.getUTCHours() + wall.getUTCMinutes() / 60;
    const dow = wall.getUTCDay();
    if (dow >= 1 && dow <= 5 && sessionContains({ id: m.id, label: m.label, startH: m.startH, endH: m.endH }, h)) {
      return m.id;
    }
  }
  return null;
}

/**
 * Atribuição DST-proof das sessões de mercado: cada trade pertence ao primeiro mercado
 * **aberto no instante da entrada** (relógio local do mercado), não à hora do aparelho.
 * Usa a mesma regra do `sessionAttribution` (1x, sem inflar; fallback = último mercado).
 */
export function marketSessionAttribution(trades: Trade[]): SessionStat[] {
  const closed = closedTrades(trades);
  const buckets = new Map<string, Trade[]>();
  for (const m of MARKET_HOURS) buckets.set(m.id, []);
  const fallbackId = MARKET_HOURS[MARKET_HOURS.length - 1].id;
  for (const t of closed) {
    const ms = parseDate(t.entryDatetime).getTime();
    const id = marketOpenAt(ms) ?? fallbackId;
    (buckets.get(id) ?? []).push(t);
  }
  return MARKET_HOURS.map((m) => ({
    session: m.id,
    label: `${m.label} ${fmtHour(m.startH)}–${fmtHour(m.endH)}`,
    ...groupStat(buckets.get(m.id) ?? []),
  }));
}

/**
 * A hora `h` (0–24, fracionária) pertence à sessão? Suporta sessões que cruzam a
 * meia-noite (`endH <= startH`, ex.: Sydney 21→06).
 */
export function sessionContains(def: SessionDef, h: number): boolean {
  const s = def.startH;
  const e = def.endH;
  if (e === s) return false;
  if (s < e) return h >= s && h < e;
  return h >= s || h < e; // wrap na meia-noite
}

/** Hora do trade no fuso pedido (fracionária, com minutos). */
function tradeHour(t: Trade, zone: SessionZone): number {
  const d = parseDate(t.entryDatetime);
  return zone === 'local'
    ? d.getHours() + d.getMinutes() / 60
    : d.getUTCHours() + d.getUTCMinutes() / 60;
}

/**
 * J7/A3 — Sessão/hora da entrada. `sessions` opcional (config salva no journal); sem config
 * usa `DEFAULT_SESSIONS`. `opts.zone`: 'utc' (default, back-compat) ou 'local' (relógio do
 * aparelho — journal). Um trade na sobreposição entra em TODAS as sessões que contêm a hora.
 */
export function sessionAnalysis(
  trades: Trade[],
  sessions: SessionDef[] = DEFAULT_SESSIONS,
  opts?: { zone?: SessionZone },
): SessionStat[] {
  const zone: SessionZone = opts?.zone ?? 'utc';
  const closed = closedTrades(trades);
  const defs = sessions.length > 0 ? sessions : DEFAULT_SESSIONS;
  const buckets = new Map<string, { def: SessionDef; list: Trade[] }>();
  for (const def of defs) buckets.set(def.id, { def, list: [] });
  const fallback = buckets.get(defs[defs.length - 1].id);
  for (const t of closed) {
    const h = tradeHour(t, zone);
    const hits = defs.filter((d) => sessionContains(d, h));
    if (hits.length === 0) fallback?.list.push(t);
    else for (const hit of hits) buckets.get(hit.id)?.list.push(t);
  }
  return defs.map((def) => ({
    session: def.id,
    label: def.label,
    ...groupStat(buckets.get(def.id)?.list ?? []),
  }));
}

/** J2 — Heatmap por sessão (mesma base do J7, para intensidade de cor). */
export function heatmapBySession(
  trades: Trade[],
  sessions?: SessionDef[],
  opts?: { zone?: SessionZone },
): SessionStat[] {
  return sessionAnalysis(trades, sessions, opts);
}

/**
 * Atribuição por ABERTURA: cada trade pertence a UMA única sessão — a primeira, na ordem,
 * que contém a hora de ENTRADA. Assim a soma por sessão = total (nunca infla), ao contrário
 * do `sessionAnalysis` (J7), que coloca o trade em TODAS as sessões que o contêm.
 * Sem sessão correspondente → última (fallback), como no J7.
 */
export function sessionAttribution(
  trades: Trade[],
  sessions: SessionDef[] = DEFAULT_SESSIONS,
  opts?: { zone?: SessionZone },
): SessionStat[] {
  const zone: SessionZone = opts?.zone ?? 'utc';
  const closed = closedTrades(trades);
  const defs = sessions.length > 0 ? sessions : DEFAULT_SESSIONS;
  const buckets = new Map<string, Trade[]>();
  for (const def of defs) buckets.set(def.id, []);
  const fallbackId = defs[defs.length - 1].id;
  for (const t of closed) {
    const h = tradeHour(t, zone);
    const hit = defs.find((d) => sessionContains(d, h));
    (buckets.get(hit?.id ?? fallbackId) ?? []).push(t);
  }
  return defs.map((def) => ({
    session: def.id,
    label: def.label,
    ...groupStat(buckets.get(def.id) ?? []),
  }));
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
    // Dia LOCAL (igual ao calendário) — nunca slice() em ISO UTC.
    const date = formatDate(parseDate(stamp), 'yyyy-MM-dd');
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
      date: formatDate(parseDate(closed[i].exitDatetime || (closed[i].entryDatetime as string)), 'yyyy-MM-dd'),
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
    const d = parseDate(stamp);
    if (Number.isNaN(d.getTime())) continue;
    // Dia da semana LOCAL do trader (antes era getUTCDay → trade de segunda à noite
    // aparecia na terça, sem nenhum dado de terça existir).
    const wd = d.getDay();
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
