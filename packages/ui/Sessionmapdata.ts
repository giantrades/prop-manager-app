// Dados e layout do mapa de sessões (apresentação pura — nenhuma fórmula financeira aqui).
//  • Normaliza trades da store E posições ao vivo (usePlatform) para o mesmo formato de desenho.
//  • Decide, para cada trade, em que FAIXA (sessão) ficam a bolinha de abertura e a de
//    fechamento, seguindo a regra do motor (`sessionAttribution`): a primeira sessão, na
//    ordem, que contém a hora; sem sessão correspondente → a última (fallback).
//  • Empilha bolinhas que caem juntas na mesma faixa (linhas internas).
// Posição ao vivo NUNCA vira Trade nem entra em soma de PnL: `pnl` dela é só exibição.
import type { Trade, SessionDef } from '@apps/lib/db';
import { parseDate, sessionContains, tradeNetPnl } from '@apps/lib/db';

/** Posição aberta como vem do adapter (quantowerAdapter.getPositions / usePlatform). */
export interface OpenPosition {
  platformPositionId?: string;
  symbol: string;
  side?: string; // 'Long' | 'Short'
  quantity?: number;
  openPrice?: number;
  currentPrice?: number;
  openTime?: string; // ISO
  entryPrice?: number;
  entryTime?: string; // ISO
  netPnl?: number; // PnL em aberto (não realizado)
  accountName?: string;
}

export interface MapTrade {
  key: string;
  symbol: string;
  direction: 'long' | 'short';
  qty: number | null;
  entryMs: number;
  exitMs: number | null; // null = aberto
  entryPrice: number | null;
  exitPrice: number | null;
  currentPrice: number | null; // só posição ao vivo
  pnl: number | null; // fechado: realizado · ao vivo: NÃO realizado · aberto na store: null
  r: number | null;
  live: boolean; // veio de livePositions (não está na store)
  account: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : v == null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Trade da store → item do mapa. Fechado = tem `exitDatetime` (mesma regra do SessionTradeMap). */
export function tradeToMapTrade(t: Trade): MapTrade | null {
  const entryMs = t.entryDatetime ? parseDate(t.entryDatetime).getTime() : NaN;
  if (!Number.isFinite(entryMs)) return null;
  const exitRaw = t.exitDatetime ? parseDate(t.exitDatetime as string).getTime() : NaN;
  const closed = Number.isFinite(exitRaw);
  const qty = num(t.qty);
  return {
    key: String(t.id),
    symbol: String(t.symbol ?? ''),
    direction: t.direction === 'short' ? 'short' : 'long',
    qty: qty === 0 ? null : qty,
    entryMs,
    exitMs: closed ? exitRaw : null,
    entryPrice: num(t.entryPrice),
    exitPrice: num(t.exitPrice),
    currentPrice: null,
    pnl: closed ? tradeNetPnl(t) : null,
    r: num(t.resultR),
    live: false,
    account: null,
  };
}

/** Posição ao vivo → item do mapa (sempre aberto). Sem `openTime` válido, cai em "agora". */
export function positionToMapTrade(p: OpenPosition, nowMs: number): MapTrade {
  const raw = p.openTime || p.entryTime;
  const parsed = raw ? parseDate(raw).getTime() : NaN;
  const entryMs = Number.isFinite(parsed) ? parsed : nowMs;
  const qty = num(p.quantity);
  return {
    key: `live:${p.platformPositionId ?? `${p.symbol}:${entryMs}`}`,
    symbol: String(p.symbol ?? ''),
    direction: String(p.side ?? '').toLowerCase() === 'short' ? 'short' : 'long',
    qty: qty === 0 ? null : qty,
    entryMs,
    exitMs: null,
    entryPrice: num(p.openPrice) ?? num(p.entryPrice),
    exitPrice: null,
    currentPrice: num(p.currentPrice),
    pnl: num(p.netPnl),
    r: null,
    live: true,
    account: p.accountName ?? null,
  };
}

/** Hora local (fracionária) de um instante — as sessões (SessionDef) são em hora LOCAL. */
export function localHourOf(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60;
}

/** Índice (na ordem ORIGINAL de `sessions`) da sessão que "dona" da hora: primeira que a contém,
 *  senão a última — exatamente a regra de `sessionAttribution`. -1 se não há sessões. */
export function sessionIndexAt(sessions: SessionDef[], localHour: number): number {
  if (sessions.length === 0) return -1;
  const hit = sessions.findIndex((d) => sessionContains(d, localHour));
  return hit >= 0 ? hit : sessions.length - 1;
}

export interface DotPos {
  lane: number; // posição da faixa (0 = topo)
  x: number; // horas no eixo do dia (0–24)
  row: number; // linha interna da faixa (empilhamento)
}

export interface PlacedTrade {
  t: MapTrade;
  x0: number; // horas desde 00:00 do dia exibido (pode ser < 0)
  x1: number; // idem (pode ser > 24); aberto = "agora"
  a: number; // x0 recortado em 0–24
  b: number; // x1 recortado em 0–24
  startsBefore: boolean; // abriu antes deste dia
  endsAfter: boolean; // fecha (ou continua aberto) depois deste dia
  laneStart: number;
  laneEnd: number;
  openDot: DotPos | null; // abertura (null se abriu em dia anterior)
  endDot: DotPos | null; // fechamento; p/ aberto = marcador "agora"
}

export interface DayLayout {
  placed: PlacedTrade[];
  rowsInLane: number[];
}

export interface LayoutInput {
  trades: MapTrade[];
  dayStartMs: number;
  nowMs: number;
  sessions: SessionDef[];
  /** índice original da sessão → posição da faixa no mapa */
  laneOfSession: number[];
  /** Resolve a faixa de um instante (ms). Quando presente, ignora `sessions`/`laneOfSession`
   *  — usado pelo caminho DST-proof (`marketOpenAt`). */
  laneForMs?: (ms: number) => number;
}

const HOUR_MS = 3600000;
/** Distância mínima (h) entre duas bolinhas na MESMA linha da faixa antes de empilhar. */
export const DOT_GAP_H = 0.7;
export const MAX_ROWS = 5;

export function layoutDayTrades(input: LayoutInput, laneCount: number): DayLayout {
  const { trades, dayStartMs, nowMs, sessions, laneOfSession, laneForMs } = input;
  const nowH = (nowMs - dayStartMs) / HOUR_MS;
  const laneFor = laneForMs ?? ((ms: number): number => {
    const idx = sessionIndexAt(sessions, localHourOf(ms));
    return idx < 0 ? 0 : (laneOfSession[idx] ?? 0);
  });
  const clamp = (h: number) => Math.min(24, Math.max(0, h));

  const placed: PlacedTrade[] = [];
  for (const t of trades) {
    const x0 = (t.entryMs - dayStartMs) / HOUR_MS;
    let x1 = t.exitMs !== null ? (t.exitMs - dayStartMs) / HOUR_MS : nowH;
    if (x1 < x0) x1 = x0;
    if (x1 <= 0 || x0 >= 24) continue; // não toca este dia
    const startsBefore = x0 < 0;
    const endsAfter = x1 > 24;
    const laneStart = laneFor(t.entryMs);
    const laneEnd = laneFor(t.exitMs ?? nowMs);
    const a = clamp(x0);
    const b = clamp(x1);
    placed.push({
      t, x0, x1, a, b, startsBefore, endsAfter, laneStart, laneEnd,
      openDot: startsBefore ? null : { lane: laneStart, x: a, row: 0 },
      endDot: endsAfter ? null : { lane: laneEnd, x: b, row: 0 },
    });
  }

  // Empilhamento: por faixa, da esquerda p/ direita, primeira linha interna livre.
  // Um trade que abre e fecha na MESMA faixa é um item só (bolinhas na mesma linha, linha
  // horizontal, e a linha interna fica reservada até o fechamento); se abre numa faixa e
  // fecha em outra, cada bolinha é empilhada separadamente.
  interface Item { dots: DotPos[]; lane: number; start: number; end: number }
  const items: Item[] = [];
  for (const p of placed) {
    const ds = [p.openDot, p.endDot].filter((d): d is DotPos => d !== null);
    if (ds.length === 0) continue;
    if (p.laneStart === p.laneEnd) items.push({ dots: ds, lane: ds[0].lane, start: p.a, end: p.b });
    else for (const d of ds) items.push({ dots: [d], lane: d.lane, start: d.x, end: d.x });
  }
  items.sort((i1, i2) => i1.start - i2.start);
  const rowEnds: number[][] = Array.from({ length: Math.max(1, laneCount) }, () => []);
  for (const it of items) {
    const ends = rowEnds[it.lane] ?? (rowEnds[it.lane] = []);
    let row = ends.findIndex((e) => it.start - e >= DOT_GAP_H);
    if (row === -1) {
      if (ends.length < MAX_ROWS) {
        row = ends.length;
        ends.push(it.end);
      } else {
        row = ends.indexOf(Math.min(...ends)); // sem espaço: sobrepõe na linha mais "velha"
        ends[row] = it.end;
      }
    } else {
      ends[row] = it.end;
    }
    for (const d of it.dots) d.row = row;
  }
  return { placed, rowsInLane: rowEnds.map((r) => r.length) };
}

/** Centro (% da altura do mapa) de uma faixa. */
export function laneCenterPct(lane: number, laneCount: number): number {
  return ((lane + 0.5) / Math.max(1, laneCount)) * 100;
}

/** Deslocamento vertical (% da altura) da linha interna `row` de uma faixa com `rows` linhas. */
export function rowOffsetPct(row: number, rows: number, laneCount: number): number {
  if (rows <= 1) return 0;
  const usable = (100 / Math.max(1, laneCount)) * 0.5;
  const step = usable / (rows - 1);
  return (row - (rows - 1) / 2) * step;
}