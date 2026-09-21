// WorldSessionMap — mapa de sessões estilo fxblue + qorix, na nossa identidade.
//  • Eixo X = HORA DO DIA (local ou UTC). O mapa-múndi pontilhado (Natural Earth 50m,
//    domínio público, embutido como bitmap base64 — sem fetch) é o fundo.
//  • Cada sessão é uma FAIXA do início ao fim (quebra na meia-noite); a parte já percorrida
//    fica mais forte e a faixa brilha enquanto o mercado está aberto.
//  • Linha vermelha "agora" cruza o mapa e o gráfico e anda sozinha (atualiza a cada 60 s).
//  • Trades: bolinha cheia na abertura (verde long / vermelha short), linha até a bolinha
//    cheia (com anel branco) do fechamento — cada bolinha na faixa da sessão daquela hora. Posição aberta
//    (ao vivo) = linha tracejada até "agora". Hover/toque mostra os dados.
//  • "Trades abertos por hora": curva suave no mesmo eixo X do mapa.
// Apresentação pura: usa `marketStatus`, `sessionContains`, `tradeNetPnl`. Posição ao vivo
// nunca entra em soma de PnL (o valor dela é só exibição).
import React, { useMemo, useState } from 'react';
import type { Trade, SessionDef, EconomicEvent } from '@apps/lib/db';
import { marketStatus, marketSessionWindowsForDate, marketOpenAt, MARKET_HOURS, parseDate, sessionContains } from '@apps/lib/db';
import { sessionDisplaySegments, pct, fmtHM, mod24, dayKeyOfMs, dayStartMs } from './sessionTime';
import { sessionIconFor, SESSION_COLORS } from './sessionIcons';
import { fmtMoney } from './currency';
import { useNowTick } from './Usenowtick';
import {
  tradeToMapTrade, positionToMapTrade, layoutDayTrades, laneCenterPct, rowOffsetPct,
  type MapTrade, type OpenPosition, type PlacedTrade, type DotPos,
} from './Sessionmapdata';

interface Props {
  trades?: Trade[];
  /** Posições abertas ao vivo (usePlatform). Só desenho — nunca entram em PnL. */
  openPositions?: OpenPosition[];
  sessions: SessionDef[];
  /** true = usa as janelas reais de mercado (DST-exato, resolvidas por dia). false = sessões
   *  custom no relógio do aparelho (comportamento fixo). */
  marketSessions?: boolean;
  zone?: 'local' | 'utc';
  /** Congela o "agora" (teste). Sem ele, atualiza sozinho a cada 60 s. */
  now?: Date;
  currency?: string;
  /** Dia exibido ('YYYY-MM-DD' no fuso do eixo); null/undefined = hoje. Controlado se `onDayChange` existir. */
  day?: string | null;
  onDayChange?: (day: string | null) => void;
  /** Notícias econômicas (high impact) para a trilha inferior. Só desenho. */
  events?: EconomicEvent[];
  eventsLoading?: boolean;
  eventsError?: boolean;
}

// Nome curto + latitude (só para ORDENAR as faixas de cima p/ baixo: Londres … Sydney).
const CITY: Record<string, { lat: number; label: string }> = {
  sydney: { lat: -33.9, label: 'Sydney' },
  tokyo: { lat: 35.7, label: 'Tóquio' },
  london: { lat: 51.5, label: 'Londres' },
  newyork: { lat: 40.7, label: 'Nova York' },
};

const HOUR_LABELS = [0, 6, 12, 18, 24];

function fmtMin(min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${pad2(m % 60)}min` : `${m}min`;
}
function fmtPrice(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 5 });
}
function colorVars(color: string): React.CSSProperties {
  return {
    '--c': color,
    '--c-bg': `${color}22`,
    '--c-fill': `${color}55`,
    '--c-dim': `${color}66`,
    '--c-bd': `${color}e6`,
    '--c-glow': `${color}66`,
  } as React.CSSProperties;
}

// ─── MAPA-MÚNDI PONTILHADO (fundo) ───────────────────────────────────────────
// Projeção equiretangular recortada de 84°N a 60°S. 5:2 (W:H = 360:144).
const W = 1000;
const H = 400;
const LAT_TOP = 84;
const LAT_BOT = -60;

// Grade hexagonal (linhas ímpares deslocadas meia coluna). 1 bit por célula, MSB primeiro,
// linha a linha; bit = 1 → célula com terra suficiente (Natural Earth 50m).
interface DotGrid {
  b64: string;
  cols: number;
  rows: number;
  lonStep: number; // graus por coluna
  latStep: number; // graus por linha
}

// Fina: 240×111, passo 1,5°×1,3°, ≥40% de terra. Para mapas ≥ 600px de largura.
const FINE_GRID: DotGrid = {
  cols: 240, rows: 111, lonStep: 1.5, latStep: 1.3,
  b64: [
    'AAAAAAAAAAAAAAAH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///P///4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////wA',
    'AAAAAEaAAAOAAAAAAAAAAAAAAAAAAP/8D////+AAAf+AAAAAAAPQAAAAAAAAAAAAAAAGHZP8/////8AAAHsAAAAAAAAcAAAAAAAA',
    'AAAAAAHAAZ/gf////+AAACAAAAAIAAAegAAAAAAAAAAAAAA/zr/gAH///+AAAAAAAAPgAA//8AAPAAAAAAAAAAeAAOYAAD///8AA',
    'AAAAAA4AAH//4AAAAAAAAAAAAAf6zu/4AB///4AAAAAAABwDA/////wDAAAAAAAAAAb/xo//AB///4AAAAAAADgHf/////yv8AAA',
    'AA/8AAA/8Of/4A///4AAAAHwAAAH/////////+AAAD//////42uH4Af//gAAAB//AID3f///////////4D/////////F+A//wAAA',
    'AD//5v//v////////////F////////8D/A//gAgAAP//9///////////////GH////////+P9Af4AH4AAP7+P///////////////',
    'AA////////OB8AfwAHgAA/n////////////////+AD///////+CIcAPwAAAAD/P////////////////+AH///////4AfAAHgAAAA',
    'H+P//////////////y/gAD/Y/////4APyAAgAAAAH/Gf/////////////hwAAAeAD////4Af3AAAAAAIHeH////////////8ADAA',
    'AANAB////+AH/gAAAAAOAuP////////////4APgAAAwAA/////gP/gAAAAAMBsf////////////gAfAAAAAAAH////+f/4AAAAA2',
    'Axf////////////gAPAAAAAAAX////+f/8AAAAB3H//////////////+AcAAAAAAAD/////f/+AAAAB3n///////////////AMAA',
    'AAAAAD///////0AAAAAPf//////////////6AAAAAAAAAB//////4HAAAAAA///////////////9AAAAAAAAAA//////+PAAAAAH',
    '///////////////6AAAAAAAAAAf/////+AgAAAAB///////////////4AAAAAAAAAAf//////gAAAAAB///2/z/////////gAAAA',
    'AAAAAAf/////6AAAAAAB/z/gfj/////////jAAAAAAAAAA//////gAAAAAA/05/APj////////+HAAAAAAAAAAf/////gAAAAAA/',
    'wOfnD4////////4AAAAAAAAAAAf////8AAAAAAA/BG9//5///////3wEAAAAAAAAAAf////8AAAAAAA/AAM//4///////lgGAAAA',
    'AAAAAAP////4AAAAAAB+AMJ//x///////hwMAAAAAAAAAAH////4AAAAAAAIfgAf/////////4wcAAAAAAAAAAH////4AAAAAAAf',
    '/gAF/////////gz4AAAAAAAAAAB////wAAAAAAAf/gAA/////////wHgAAAAAAAAAAB////AAAAAAAB//4YB/////////wMAAAAA',
    'AAAAAAA////AAAAAAAB//+fP/////////4AAAAAAAAAAAAAv//OAAAAAAAB//////////////4AAAAAAAAAAAAAP/wBAAAAAAAB/',
    '/////z///////4AAAAAAAAAAAAAb/gDAAAAAAAH////9/z///////wAAAAAAAAAAAAAF/gBgAAAAAAP////+/8P//////wAAAAAA',
    'AAAAAAAF/gAAAAAAAAf////+/8gP/////oAAAAAAAAAAAAACfgAAAAAAAAf/////P/4H/////IAAAAAAAAAAAAAAfABwAAAAAA//',
    '////f/4D////4AAAAAAAAAAAAAAAPgwMAAAAAAf/////v/4B/8f/QAAAAAAAAAAAAAAAfhgBgAAAAA//////H/wA/4P8gAAAAAAA',
    'AAAAAAAAH/gJwAAAAAf/////z/wAfwH+AIAAAAAAAAAAAAAAD/gAAAAAAAf/////z/AA/gP+AIAAAAAAAAAAAAAAAX8AAAAAAAf/',
    '////7+AAfAB/AIAAAAAAAAAAAAAAAD8AAAAAAA//////7wAAeAB/AIAAAAAAAAAAAAAAAAcAAAAAAAf//////gAAPAA/gKAAAAAA',
    'AAAAAAAAAAMBAAAAAAf/////8AAAOABPACAAAAAAAAAAAAAAAAED9AAAAAP//////8AAGAAHACAAAAAAAAAAAAAAAAGn/gAAAAP/',
    '/////4AAMABEABAAAAAAAAAAAAAAAABv/4AAAAH//////4AABAAgADAAAAAAAAAAAAAAAAAP/4AAAAD//////wAABAAgBDAAAAAA',
    'AAAAAAAAAAAP//gAAAA/H////wAAAACYBgAAAAAAAAAAAAAAAAAP//gAAAAAB////gAAAACYHAAAAAAAAAAAAAAAAAAP//wAAAAA',
    'A////gAAAABoPgAAAAAAAAAAAAAAAAAf//wAAAAAA///+AAAAAB4/gAAAAAAAAAAAAAAAAA///4AAAAAA///+AAAAAA4fAAAAAAA',
    'AAAAAAAAAAA///+AAAAAB///8AAAAAA4/cGAAAAAAAAAAAAAAAA////gAAAAA///4AAAAAAefYDcAAAAAAAAAAAAAAA////8AAAA',
    'Af//wAAAAAAMCYD/AAAAAAAAAAAAAAA/////AAAAAP//wAAAAAAGAEAfhAAAAAAAAAAAAAA/////AAAAAP//wAAAAAADAAAP0AAA',
    'AAAAAAAAAAAf////gAAAAH//wAAAAAAB8AAPwAAAAAAAAAAAAAAf////AAAAAP//wAAAAAAABDAGYAAAAAAAAAAAAAAP////AAAA',
    'AH//4AAAAAAAAAAAEAAAAAAAAAAAAAAP///+AAAAAH//4AAAAAAAAAACAAAAAAAAAAAAAAAH///+AAAAAH//4IAAAAAAAAHjAAAA',
    'AAAAAAAAAAAH///8AAAAAP//4YAAAAAAABvDAAAAAAAAAAAAAAAD///8AAAAAP//4cAAAAAAAB/jgAAAAAAAAAAAAAAB///8AAAA',
    'Af//x4AAAAAAAH/3gAAAAAAAAAAAAAAAf//8AAAAAP//h4AAAAAAAH//wAACAAAAAAAAAAAAf//4AAAAAP/+BwAAAAAAAP//wAAA',
    'AAAAAAAAAAAAf//4AAAAAH/+BwAAAAAAA///4AAAAAAAAAAAAAAAf//wAAAAAH/+DwAAAAAAD///4AAAAAAAAAAAAAAAf//gAAAA',
    'AD//BwAAAAAAD///+AAAAAAAAAAAAAAA//8AAAAAAH/+BgAAAAAAH///+AAAAAAAAAAAAAAAf/8AAAAAAD/8AAAAAAAAD////AAA',
    'AAAAAAAAAAAA//4AAAAAAD/4AAAAAAAAH////AAAAAAAAAAAAAAA//8AAAAAAB/8AAAAAAAAD////AAAAAAAAAAAAAAA//wAAAAA',
    'AB/wAAAAAAAAD////AAAAAAAAAAAAAAA//wAAAAAAA/wAAAAAAAAB////AAAAAAAAAAAAAAA//gAAAAAAA/gAAAAAAAAB/D/+AAA',
    'AAAAAAAAAAAA//gAAAAAAA/AAAAAAAAAB+A/+AAAAAAAAAAAAAAB/6AAAAAAAAAAAAAAAAAABAAf8AAAAAAAAAAAAAAB/8AAAAAA',
    'AAAAAAAAAAAAAAAH8AAAAAAAAAAAAAAD/4AAAAAAAAAAAAAAAAAAAAAH4AAIAAAAAAAAAAAB/4AAAAAAAAAAAAAAAAAAAAAAQAAO',
    'AAAAAAAAAAAD/AAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAB+AAAAAAAAAAAAAAAAAAAAAAA4AAwAAAAAAAAAAAD+AAAAAAA',
    'AAAAAAAAAAAAAAAAwABgAAAAAAAAAAAB+AAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAHA',
    'AAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwIAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  ].join(''),
};

// Grossa: 120×55, passo 3°×2,6°, ≥35% de terra. Para mapas < 600px (celular).
const COARSE_GRID: DotGrid = {
  cols: 120, rows: 55, lonStep: 3, latStep: 2.6,
  b64: [
    'AAAAAP4f8AAAAAAAAAAAAAAAD////ABwAAA4AAAAAAAIL8//+ABAAAAHAAAAAAAfL4D/+AAAAwD/gGAAAAA/u+B/+AAABhf//jwA',
    'B/n/2fh/8AB+Ab//////5////54/gAD/////////T////xw8DgH/////////B///+DAcAAPf///////+B8f/8HwAAAff//////5A',
    'AQH//j8AACHf/////8DAAAD//3+AAPP//////8GAAAB///+AAD////////CAAAA///zAAD///////+AAAAAf//8AAB///////8AA',
    'AAA///AAAH947////7AAAAA///AAAHj/+////gAAAAA//+AAAOAv9///5CAAAAAf/+AAAD8B////8mAAAAAP/4AAAH8B////8QAA',
    'AAAH/4AAAH//////+AAAAAAH4IAAAf//9///8AAAAAAC8AAAAf//+///8AAAAAAA4IAAA////j//wAAAAAAAciAAA////w+fgAAA',
    'AAAAfAAAA////A4eAAAAAAAABwAAA///+AYPCAAAAAAAAwAAA///wAwPAAAAAAAAAJ8AAf//+AYBBAAAAAAAAH8AAf//8AIIBAAA',
    'AAAAAD/gAEP/8AAOMAAAAAAAAH/gAAH/4AAM4AAAAAAAAH/wAAH/wAAG6IAAAAAAAP/+AAH/gAAG0OAAAAAAAH//AAD/gAABADgA',
    'AAAAAH//AAD/gAAAgDgAAAAAAD//AAD/wAAAAAAAAAAAAD/+AAD/kAAAAZAAAAAAAB/+AAD/mAAAB9gAAAAAAA/8AAH/MAAAD/gA',
    'AAAAAA/+AAD/MAAAP/wAAAAAAA/wAAD+IAAAf/wAAAAAAA/wAAB+AAAAP/4AAAAAAA/gAAB8AAAAP/4AAAAAAA/gAAA8AAAAP/4A',
    'AAAAAB/AAAAwAAAAMHwAAAAAAB+AAAAAAAAAADwCAAAAAB4AAAAAAAAAAAACAAAAAB4AAAAAAAAAAAgEAAAAABwAAAAAAAAAAAAY',
    'AAAAABwAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  ].join(''),
};

const pathCache = new WeakMap<DotGrid, string>();
function buildLandPath(g: DotGrid): string {
  const cached = pathCache.get(g);
  if (cached !== undefined) return cached;
  let bin = '';
  try {
    bin = typeof atob === 'function'
      ? atob(g.b64)
      : (globalThis as any).Buffer.from(g.b64, 'base64').toString('binary');
  } catch {
    pathCache.set(g, '');
    return '';
  }
  const dx = (W / 360) * g.lonStep;
  const dy = (H / (LAT_TOP - LAT_BOT)) * g.latStep;
  const parts: string[] = [];
  for (let r = 0; r < g.rows; r++) {
    const y = ((r + 0.5) * dy).toFixed(1);
    const shift = r % 2 ? 0.5 : 0;
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c;
      if ((bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1) {
        const x = (c + 0.5 + shift) * dx;
        if (x < W) parts.push(`M${x.toFixed(1)} ${y}h.01`);
      }
    }
  }
  const d = parts.join('');
  pathCache.set(g, d);
  return d;
}

// Cada ponto é um traço de comprimento ~0 com ponta redonda (1 <path> por densidade).
const Dots = React.memo(function Dots() {
  const fine = useMemo(() => buildLandPath(FINE_GRID), []);
  const coarse = useMemo(() => buildLandPath(COARSE_GRID), []);
  return (
    <>
      <path className="wsm-land wsm-land-fine" d={fine} strokeWidth={2.3} />
      <path className="wsm-land wsm-land-coarse" d={coarse} strokeWidth={4.4} />
    </>
  );
});

// ─── Curva suave (Catmull-Rom → Bézier) para o gráfico de volume ─────────────
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  const cl = (v: number) => Math.min(98, Math.max(2, v));
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = cl(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = cl(p2[1] - (p3[1] - p1[1]) / 6);
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

interface Seg { start: number; end: number }
interface Lane {
  def: SessionDef;
  idx: number; // índice original (define a cor)
  color: string;
  label: string;
  segs: Seg[];
  capSeg: Seg | null; // segmento que leva o nome (o mais largo)
  timeLabel: string; // "08:00–17:00" (mercado = relógio da bolsa; custom = no eixo)
  Icon: ReturnType<typeof sessionIconFor>;
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function WorldSessionMap({
  trades = [], openPositions = [], sessions, marketSessions = true, zone = 'local', now: nowProp,
  currency = 'USD', day: dayProp, onDayChange, events = [],
}: Props) {
  const ref = useNowTick(nowProp);
  const zoneTag = zone === 'utc' ? 'UTC' : 'local';
  const status = useMemo(() => marketStatus(ref), [ref]);
  const offsetHours = -ref.getTimezoneOffset() / 60;
  const delta = zone === 'utc' ? -offsetHours : 0;
  const nowH = zone === 'utc'
    ? ref.getUTCHours() + ref.getUTCMinutes() / 60
    : ref.getHours() + ref.getMinutes() / 60;
  const localNowH = ref.getHours() + ref.getMinutes() / 60; // SessionDef é em hora LOCAL
  const nowPct = (nowH / 24) * 100;
  const nowLabel = fmtHM(nowH);

  // ── Dia exibido (null = hoje; segue a virada da meia-noite sozinho) ──
  const todayKey = dayKeyOfMs(ref.getTime(), zone);
  const [innerDay, setInnerDay] = useState<string | null>(null);
  const controlled = onDayChange !== undefined;
  const dayVal = controlled ? (dayProp ?? null) : innerDay;
  const setDay = controlled ? onDayChange : setInnerDay;
  const dayKey = dayVal ?? todayKey;
  const isToday = dayKey === todayKey;
  const pickDay = (k: string) => setDay(k === todayKey ? null : k);

  // ── Trades da store + posições ao vivo → mesmo formato de desenho ──
  const mapTrades = useMemo(() => {
    const out: MapTrade[] = [];
    for (const t of trades) {
      const m = tradeToMapTrade(t);
      if (m) out.push(m);
    }
    for (const p of openPositions) out.push(positionToMapTrade(p, ref.getTime()));
    return out;
  }, [trades, openPositions, ref]);

  // ◀/▶ pulam entre dias com trades (hoje sempre existe).
  const navDays = useMemo(() => {
    const s = new Set<string>([todayKey]);
    for (const m of mapTrades) {
      s.add(dayKeyOfMs(m.entryMs, zone));
      if (m.exitMs !== null) s.add(dayKeyOfMs(m.exitMs, zone));
    }
    return [...s].sort();
  }, [mapTrades, zone, todayKey]);
  const prevDay = useMemo(() => {
    for (let i = navDays.length - 1; i >= 0; i--) if (navDays[i] < dayKey) return navDays[i];
    return null;
  }, [navDays, dayKey]);
  const nextDay = useMemo(() => {
    for (let i = 0; i < navDays.length; i++) if (navDays[i] > dayKey) return navDays[i];
    return null;
  }, [navDays, dayKey]);
  const dayLabel = useMemo(() => {
    const [y, m, d] = dayKey.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d, 12)));
  }, [dayKey]);

  // ── Janelas reais de mercado do dia (DST-exato); null quando são sessões custom ──
  const windows = useMemo(
    () => (marketSessions ? marketSessionWindowsForDate(dayKey, zone) : null),
    [marketSessions, dayKey, zone],
  );

  // ── Faixas (uma por sessão), de cima p/ baixo por latitude; ids sem cidade por último ──
  const lanes: Lane[] = useMemo(() => {
    interface Raw { id: string; label: string; idx: number; segs: Seg[]; timeLabel: string }
    let raw: Raw[];
    if (marketSessions) {
      const byId = new Map<string, { idx: number; label: string; segs: Seg[] }>();
      for (const w of windows ?? []) {
        const e = byId.get(w.id) ?? { idx: w.index, label: w.label, segs: [] as Seg[] };
        e.segs.push({ start: w.startH, end: w.endH });
        byId.set(w.id, e);
      }
      raw = [...byId.entries()].map(([id, e]) => {
        const mk = MARKET_HOURS.find((m) => m.id === id);
        return {
          id, label: CITY[id]?.label ?? e.label, idx: e.idx,
          segs: e.segs.sort((a, b) => a.start - b.start),
          timeLabel: mk ? `${fmtHM(mk.startH)}–${fmtHM(mk.endH)}` : '',
        };
      });
    } else {
      raw = sessions.map((def, idx) => ({
        id: def.id, label: CITY[def.id]?.label ?? def.label, idx,
        segs: sessionDisplaySegments(def, delta),
        timeLabel: `${fmtHM(mod24(def.startH + delta))}–${fmtHM(mod24(def.endH + delta))}`,
      }));
    }
    // Ordena por latitude (conhecidas primeiro); ids desconhecidos por último, na ordem original.
    raw.sort((a, b) => {
      const la = CITY[a.id]?.lat;
      const lb = CITY[b.id]?.lat;
      if (la === undefined && lb === undefined) return a.idx - b.idx;
      if (la === undefined) return 1;
      if (lb === undefined) return -1;
      return lb - la;
    });
    return raw.map((b) => {
      const capSeg = b.segs.reduce<Seg | null>((best, s) => (!best || s.end - s.start > best.end - best.start ? s : best), null);
      return {
        def: { id: b.id, label: b.label, startH: 0, endH: 0 },
        idx: b.idx,
        color: SESSION_COLORS[b.idx % SESSION_COLORS.length],
        label: b.label,
        segs: b.segs, capSeg, timeLabel: b.timeLabel,
        Icon: sessionIconFor(b.id),
      };
    });
  }, [marketSessions, windows, sessions, delta]);
  const laneCount = lanes.length;
  const laneOfSession = useMemo(() => {
    const a = new Array<number>(sessions.length).fill(0);
    lanes.forEach((l, pos) => { a[l.idx] = pos; });
    return a;
  }, [lanes, sessions.length]);
  const laneOfMarketId = useMemo(() => {
    const m = new Map<string, number>();
    lanes.forEach((l, pos) => m.set(l.def.id, pos));
    return m;
  }, [lanes]);

  // ── Layout dos trades no dia exibido ──
  const dayStart = useMemo(() => dayStartMs(dayKey, zone), [dayKey, zone]);
  const layout = useMemo(
    () => layoutDayTrades({
      trades: mapTrades, dayStartMs: dayStart, nowMs: ref.getTime(), sessions, laneOfSession,
      laneForMs: marketSessions
        ? (ms: number) => {
            // Sem mercado aberto (fim de semana) → último da ordem, igual ao fallback da atribuição.
            const id = marketOpenAt(ms) ?? MARKET_HOURS[MARKET_HOURS.length - 1].id;
            return laneOfMarketId.get(id) ?? 0;
          }
        : undefined,
    }, laneCount),
    [mapTrades, dayStart, ref, sessions, laneOfSession, laneCount, marketSessions, lanes, laneOfMarketId],
  );

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pinKey, setPinKey] = useState<string | null>(null);
  const activeKey = hoverKey ?? pinKey;
  const active = layout.placed.find((p) => p.t.key === activeKey) ?? null;
  const togglePin = (k: string) => setPinKey((cur) => (cur === k ? null : k));

  // ── Notícias do dia exibido (high impact; instante absoluto → DST-correct de graça) ──
  const hourOfMs = (ms: number): number => {
    const d = new Date(ms);
    return zone === 'utc' ? d.getUTCHours() + d.getUTCMinutes() / 60 : d.getHours() + d.getMinutes() / 60;
  };
  const dayEvents = useMemo(() => {
    const out: Array<{ e: EconomicEvent; x: number }> = [];
    for (const e of events) {
      const ms = new Date(e.scheduledAt).getTime();
      if (!Number.isFinite(ms)) continue;
      if (dayKeyOfMs(ms, zone) !== dayKey) continue;
      out.push({ e, x: hourOfMs(ms) });
    }
    return out.sort((a, b) => a.x - b.x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, zone, dayKey]);
  const [newsKey, setNewsKey] = useState<string | null>(null);
  const activeNews = dayEvents.find((n) => n.e.id === newsKey) ?? null;
  const fmtNewsTime = (iso: string): string => {
    const ms = new Date(iso).getTime();
    const d = new Date(ms);
    const hh = zone === 'utc' ? d.getUTCHours() : d.getHours();
    const mi = zone === 'utc' ? d.getUTCMinutes() : d.getMinutes();
    return `${pad2(hh)}:${pad2(mi)}`;
  };

  // Reserva a parte de baixo do mapa para as plaquinhas de notícias (red folders) — as faixas e
  // bolinhas são comprimidas para cima nessa fração, então nada se sobrepõe à trilha.
  const NEWS_RESERVE = 0.14;
  const yScale = (v: number) => v * (1 - NEWS_RESERVE);
  const yOfDot = (d: DotPos) =>
    yScale(laneCenterPct(d.lane, laneCount) + rowOffsetPct(d.row, layout.rowsInLane[d.lane] ?? 1, laneCount));
  const xOfH = (h: number) => (h / 24) * 100;

  // ── Volume: trades abertos por hora do dia (só trades da store; posição ao vivo fica de fora) ──
  const hours = useMemo(() => {
    const arr = new Array(24).fill(0) as number[];
    for (const t of trades) {
      if (!t.entryDatetime) continue;
      const d = parseDate(t.entryDatetime);
      arr[zone === 'utc' ? d.getUTCHours() : d.getHours()] += 1;
    }
    return arr;
  }, [trades, zone]);
  const totalTrades = hours.reduce((a, b) => a + b, 0);
  const hourMax = Math.max(1, ...hours);
  const peakHour = hours.indexOf(Math.max(...hours));
  const yVol = (v: number) => 92 - (v / hourMax) * 78;
  const volLine = useMemo(() => {
    const pts: Array<[number, number]> = hours.map((v, h) => [h + 0.5, yVol(v)]);
    return smoothPath([[0, pts[0][1]], ...pts, [24, pts[23][1]]]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, hourMax]);
  const [volHour, setVolHour] = useState<number | null>(null);

  const sessionById = useMemo(() => {
    const m = new Map<string, { i: number; def: SessionDef }>();
    sessions.forEach((def, i) => m.set(def.id, { i, def }));
    return m;
  }, [sessions]);

  const progressOf = (sg: Seg): number => {
    if (!isToday) return dayKey < todayKey ? 1 : 0;
    return Math.min(1, Math.max(0, (nowH - sg.start) / Math.max(0.0001, sg.end - sg.start)));
  };
  const isLive = (lane: Lane): boolean => {
    if (!isToday) return false;
    const market = status.find((s) => s.id === lane.def.id);
    if (marketSessions) return market?.open ?? false; // status já é DST-exato
    return sessionContains(lane.def, localNowH) && (market ? market.open : true);
  };

  // ── Texto de horário/dado no fuso do eixo ──
  const fmtStamp = (ms: number): string => {
    const d = new Date(ms);
    const hh = zone === 'utc' ? d.getUTCHours() : d.getHours();
    const mi = zone === 'utc' ? d.getUTCMinutes() : d.getMinutes();
    const hm = `${pad2(hh)}:${pad2(mi)}`;
    if (dayKeyOfMs(ms, zone) === dayKey) return hm;
    const dd = zone === 'utc' ? d.getUTCDate() : d.getDate();
    const mo = (zone === 'utc' ? d.getUTCMonth() : d.getMonth()) + 1;
    return `${pad2(dd)}/${pad2(mo)} ${hm}`;
  };

  const renderDetail = (p: PlacedTrade) => {
    const t = p.t;
    const long = t.direction === 'long';
    const isOpen = t.exitMs === null;
    const nowMs = ref.getTime();
    const laneA = lanes[p.laneStart]?.label;
    const laneB = lanes[p.laneEnd]?.label;
    return (
      <>
        <div className="wsm-detail-row">
          <strong className="wsm-detail-sym">{t.symbol}</strong>
          <span className={long ? 'wsm-up' : 'wsm-down'}>{long ? 'LONG' : 'SHORT'}</span>
          {t.qty !== null && <span className="wsm-num">× {t.qty}</span>}
          <span className={`wsm-badge${isOpen ? ' on' : ''}`}>{isOpen ? (t.live ? 'AO VIVO' : 'ABERTO') : 'FECHADO'}</span>
          {t.account && <span className="wsm-muted">{t.account}</span>}
        </div>
        <div className="wsm-detail-row wsm-muted">
          <span className="wsm-num">Entrada {fmtStamp(t.entryMs)}{t.entryPrice !== null ? ` @ ${fmtPrice(t.entryPrice)}` : ''}</span>
          {isOpen ? (
            <span className="wsm-num">
              Agora {fmtStamp(nowMs)}{t.currentPrice !== null ? ` @ ${fmtPrice(t.currentPrice)}` : ''} · aberto há {fmtDur(nowMs - t.entryMs)}
            </span>
          ) : (
            <span className="wsm-num">
              Saída {fmtStamp(t.exitMs as number)}{t.exitPrice !== null ? ` @ ${fmtPrice(t.exitPrice)}` : ''} · {fmtDur((t.exitMs as number) - t.entryMs)}
            </span>
          )}
        </div>
        <div className="wsm-detail-row">
          {t.pnl !== null ? (
            <span className={`wsm-num ${t.pnl >= 0 ? 'wsm-up' : 'wsm-down'}`}>
              {isOpen ? 'PnL em aberto ' : 'PnL '}{fmtMoney(t.pnl, currency)}
            </span>
          ) : (
            <span className="wsm-muted">Sem PnL até fechar</span>
          )}
          {isOpen && t.pnl !== null && <span className="wsm-muted">(não realizado)</span>}
          {t.r !== null && <span className="wsm-num">{t.r.toFixed(2)}R</span>}
          {laneA && <span className="wsm-muted">{laneA === laneB || !laneB ? laneA : `${laneA} → ${laneB}`}</span>}
        </div>
      </>
    );
  };

  return (
    <div className="wsm-root">

      {/* ── Dia + legenda ── */}
      <div className="wsm-head">
        <div className="wsm-day">
          <button type="button" className="wsm-btn" onClick={() => prevDay && pickDay(prevDay)} disabled={!prevDay} aria-label="Dia anterior com trades">◀</button>
          <input
            className="wsm-date"
            type="date"
            value={dayKey}
            onChange={(e) => e.target.value && pickDay(e.target.value)}
            aria-label="Dia do mapa"
          />
          <button type="button" className="wsm-btn" onClick={() => nextDay && pickDay(nextDay)} disabled={!nextDay} aria-label="Próximo dia">▶</button>
          {!isToday && <button type="button" className="wsm-btn wsm-btn-txt" onClick={() => setDay(null)}>Hoje</button>}
        </div>
        <div className="wsm-legend" role="group" aria-label="Legenda">
          <span className="wsm-chip"><i className="wsm-lg wsm-lg-long" aria-hidden="true" />long</span>
          <span className="wsm-chip"><i className="wsm-lg wsm-lg-short" aria-hidden="true" />short</span>
          <span className="wsm-chip"><i className="wsm-lg wsm-lg-ring" aria-hidden="true" />fechamento</span>
          <span className="wsm-chip"><i className="wsm-lg-dash" aria-hidden="true" />aberto</span>
        </div>
      </div>

      {/* ── Card único: relógio + mapa + detalhe + volume (mesma largura → hora alinhada 1:1) ── */}
      <div className="wsm-stage">

        <div className="wsm-clockbar">
          {isToday ? (
            <span
              className="wsm-clock"
              style={{ left: `clamp(48px, ${nowPct}%, calc(100% - 48px))` }}
              aria-label={`Agora: ${nowLabel} ${zoneTag}`}
            >
              {nowLabel} {zoneTag}
            </span>
          ) : (
            <span className="wsm-daytag">{dayLabel} · eixo {zoneTag}</span>
          )}
        </div>

        <div
          className="wsm-map"
          role="group"
          aria-label="Mapa das sessões de mercado e trades do dia"
          style={{ '--wsm-lanes': Math.max(1, laneCount) } as React.CSSProperties}
        >
          <div className="wsm-backdrop" aria-hidden="true">
            <svg className="wsm-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
              <Dots />
            </svg>
          </div>

          {[6, 12, 18].map((h) => (
            <span key={h} className="wsm-grid" style={{ left: pct(h) }} aria-hidden="true" />
          ))}

          {/* Sessões: faixa início→fim; parte percorrida mais forte; nome acima da faixa */}
          {lanes.map((lane, pos) => {
            const y = yScale(laneCenterPct(pos, laneCount));
            const live = isLive(lane);
            const cap = lane.capSeg;
            const Icon = lane.Icon;
            return (
              <React.Fragment key={lane.def.id}>
                {lane.segs.map((sg) => (
                  <span
                    key={`${lane.def.id}-${sg.start}`}
                    className={`wsm-band${live ? ' is-live' : ''}`}
                    style={{ left: pct(sg.start), width: pct(sg.end - sg.start), top: `${y}%`, ...colorVars(lane.color) }}
                    aria-hidden="true"
                  >
                    <span className="wsm-band-fill" style={{ width: `${progressOf(sg) * 100}%` }} />
                  </span>
                ))}
                {cap && (
                  <span
                    className={`wsm-cap${live ? ' is-live' : ''}`}
                    style={{
                      // faixa na metade direita (ex.: Sydney 18→24): nome alinhado pela DIREITA da faixa,
                      // senão o texto vazaria da borda ou ficaria longe da faixa
                      ...(cap.start / 24 > 0.62 ? { right: `calc(100% - ${pct(cap.end)})` } : { left: pct(cap.start) }),
                      top: `${y}%`,
                      ...colorVars(lane.color),
                    }}
                  >
                    <span className="wsm-cap-icon"><Icon size={12} /></span>
                    <span className="wsm-cap-name">{lane.label}</span>
                    <span className="wsm-cap-time">{lane.timeLabel}</span>
                    <span className="wsm-sr">{live ? ', aberto agora' : ', fechado agora'}</span>
                  </span>
                )}
              </React.Fragment>
            );
          })}

          {/* Linhas abertura → fechamento (coordenadas em % do mapa) */}
          <svg className="wsm-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {layout.placed.map((p) => {
              const x0 = xOfH(p.a);
              const x1 = xOfH(p.b);
              const y0 = p.openDot ? yOfDot(p.openDot) : yScale(laneCenterPct(p.laneStart, laneCount));
              const y1 = p.endDot ? yOfDot(p.endDot) : yScale(laneCenterPct(p.laneEnd, laneCount));
              const k = p.t.key;
              return (
                <g
                  key={k}
                  className={`wsm-line ${p.t.direction === 'long' ? 'wsm-long' : 'wsm-short'}${p.t.exitMs === null ? ' is-open' : ''}${k === activeKey ? ' is-active' : ''}`}
                  onMouseEnter={() => setHoverKey(k)}
                  onMouseLeave={() => setHoverKey(null)}
                  onClick={() => togglePin(k)}
                >
                  <line className="wsm-line-hit" x1={x0} y1={y0} x2={x1} y2={y1} />
                  <line className="wsm-line-stroke" x1={x0} y1={y0} x2={x1} y2={y1} />
                </g>
              );
            })}
          </svg>

          {/* Bolinhas: abertura (cheia), fechamento (cheia com anel branco) e "agora" (posição aberta, vazada) */}
          {layout.placed.map((p) => {
            const t = p.t;
            const k = t.key;
            const dir = t.direction === 'long' ? 'wsm-long' : 'wsm-short';
            const isOpen = t.exitMs === null;
            const act = k === activeKey ? ' is-active' : '';
            const common = {
              onMouseEnter: () => setHoverKey(k),
              onMouseLeave: () => setHoverKey(null),
              onFocus: () => setHoverKey(k),
              onBlur: () => setHoverKey(null),
              onClick: () => togglePin(k),
              'aria-pressed': k === pinKey,
            };
            const label = `${t.symbol} ${t.direction === 'long' ? 'long' : 'short'}`;
            return (
              <React.Fragment key={k}>
                {p.startsBefore && (
                  <span className={`wsm-edge wsm-edge-l ${dir}`} style={{ top: `${yScale(laneCenterPct(p.laneStart, laneCount))}%` }} aria-hidden="true" />
                )}
                {p.openDot && (
                  <button
                    type="button"
                    className={`wsm-dot wsm-dot-open ${dir}${act}`}
                    style={{ left: `${xOfH(p.openDot.x)}%`, top: `${yOfDot(p.openDot)}%` }}
                    title={`${label} • abertura ${fmtStamp(t.entryMs)}`}
                    aria-label={`${label}, abertura ${fmtStamp(t.entryMs)}`}
                    {...common}
                  />
                )}
                {p.endsAfter && (
                  <span className={`wsm-edge wsm-edge-r ${dir}`} style={{ top: `${yScale(laneCenterPct(p.laneEnd, laneCount))}%` }} aria-hidden="true" />
                )}
                {p.endDot && (
                  <button
                    type="button"
                    className={`wsm-dot ${isOpen ? 'wsm-dot-now' : 'wsm-dot-close'} ${dir}${act}`}
                    style={{ left: `${xOfH(p.endDot.x)}%`, top: `${yOfDot(p.endDot)}%` }}
                    title={isOpen ? `${label} • aberto (agora)` : `${label} • fechamento ${fmtStamp(t.exitMs as number)}`}
                    aria-label={isOpen ? `${label}, posição aberta` : `${label}, fechamento ${fmtStamp(t.exitMs as number)}`}
                    {...common}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Linha "agora": anda sozinha (atualiza a cada minuto) */}
          {isToday && <span className="wsm-now" style={{ left: `${nowPct}%` }} aria-hidden="true" />}

          {/* Red folders: notícias de alto impacto DIRETO no mapa, no horário real (sem seção/título) */}
          {dayEvents.map(({ e, x }) => (
            <button
              key={e.id}
              type="button"
              className={`wsm-news-mark${newsKey === e.id ? ' is-active' : ''}`}
              style={{ left: `clamp(8px, ${(x / 24) * 100}%, calc(100% - 8px))` }}
              onMouseEnter={() => setNewsKey(e.id)}
              onMouseLeave={() => setNewsKey(null)}
              onFocus={() => setNewsKey(e.id)}
              onBlur={() => setNewsKey(null)}
              onClick={() => setNewsKey((cur) => (cur === e.id ? null : e.id))}
              aria-label={`${fmtNewsTime(e.scheduledAt)} ${e.eventName}${e.periodLabel ? ` (${e.periodLabel})` : ''} — impacto alto`}
            >
              <span aria-hidden="true">!</span>
            </button>
          ))}
          {activeNews && (
            <div
              className="wsm-news-tip"
              role="status"
              aria-live="polite"
              style={{ left: `clamp(120px, ${(activeNews.x / 24) * 100}%, calc(100% - 120px))` }}
            >
              <span><strong>{fmtNewsTime(activeNews.e.scheduledAt)}</strong> {activeNews.e.eventName}</span>
              {activeNews.e.periodLabel && <span className="wsm-muted">{activeNews.e.periodLabel}</span>}
              <span className="wsm-num">
                {activeNews.e.actual != null
                  ? `atual ${activeNews.e.actual}${activeNews.e.unit ? ` ${activeNews.e.unit}` : ''}`
                  : activeNews.e.forecast != null
                    ? `previsto ${activeNews.e.forecast}${activeNews.e.unit ? ` ${activeNews.e.unit}` : ''}`
                    : 'sem resultado ainda'}
              </span>
              {activeNews.e.previous != null && <span className="wsm-num wsm-muted">anterior {activeNews.e.previous}</span>}
            </div>
          )}
        </div>

        {/* Dados do trade sob o mouse / tocado */}
        <div className="wsm-detail" role="status" aria-live="polite">
          {active ? renderDetail(active) : (
            <span className="wsm-muted">
              {layout.placed.length === 0 ? 'Sem trades neste dia.' : 'Passe o mouse ou toque numa bolinha/linha para ver os dados do trade.'}
            </span>
          )}
        </div>

        {/* Trades abertos por hora (mesmo eixo X do mapa) */}
        <div className="wsm-vol-header">
          <span className="wsm-vol-title">Trades abertos por hora</span>
          <span className="wsm-vol-sub">
            {totalTrades === 0 ? 'sem trades' : `${totalTrades} trade(s) · pico às ${pad2(peakHour)}h (${hours[peakHour]})`}
          </span>
        </div>
        <div
          className="wsm-vol-plot"
          role="img"
          aria-label={totalTrades === 0 ? 'Trades abertos por hora: sem trades' : `Trades abertos por hora. Pico às ${peakHour}h com ${hours[peakHour]} trade(s).`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (r.width > 0) setVolHour(Math.min(23, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 24))));
          }}
          onPointerLeave={() => setVolHour(null)}
        >
          {lanes.map((lane) =>
            lane.segs.map((sg) => (
              <span
                key={`${lane.def.id}-${sg.start}`}
                className="wsm-vol-band"
                style={{ left: pct(sg.start), width: pct(sg.end - sg.start), background: `${lane.color}22`, borderTop: `1px solid ${lane.color}55` }}
                aria-hidden="true"
              />
            ))
          )}
          {[6, 12, 18].map((h) => (
            <span key={h} className="wsm-grid" style={{ left: pct(h) }} aria-hidden="true" />
          ))}
          <svg className="wsm-vol-svg" viewBox="0 0 24 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {totalTrades > 0 && <path className="wsm-vol-area" d={`${volLine}L24 100L0 100Z`} />}
            <path className={`wsm-vol-line${totalTrades === 0 ? ' is-empty' : ''}`} d={volLine} />
          </svg>
          {volHour !== null && (
            <>
              <span className="wsm-vol-cursor" style={{ left: `${((volHour + 0.5) / 24) * 100}%` }} aria-hidden="true" />
              <span className="wsm-vol-point" style={{ left: `${((volHour + 0.5) / 24) * 100}%`, top: `${yVol(hours[volHour])}%` }} aria-hidden="true" />
              <span className="wsm-vol-tip" style={{ left: `clamp(38px, ${((volHour + 0.5) / 24) * 100}%, calc(100% - 38px))` }}>
                {pad2(volHour)}h · {hours[volHour]} trade(s)
              </span>
            </>
          )}
          {isToday && <span className="wsm-now" style={{ left: `${nowPct}%` }} aria-hidden="true" />}
        </div>
        <div className="wsm-axis">
          {HOUR_LABELS.map((h) => (
            <span key={h} className="wsm-hour" style={{ left: pct(h) }}>{h}h</span>
          ))}
        </div>
      </div>

      {/* ── Cards de status dos mercados ── */}
      <div className="wsm-markets">
        {status.map((m) => {
          const s = sessionById.get(m.id);
          const i = s ? s.i : 0;
          const color = SESSION_COLORS[i % SESSION_COLORS.length];
          const Icon = sessionIconFor(m.id);
          return (
            <div
              key={m.id}
              className={`wsm-market${m.open ? ' is-open' : ''}`}
              style={{ '--mkt-color': color } as React.CSSProperties}
            >
              <span className="wsm-market-icon">
                <Icon size={18} style={{ color }} />
              </span>
              <span className="wsm-market-name">{m.label}</span>
              <span className="wsm-market-time">{fmtMin(m.localMinutes)}</span>
              <span className={`wsm-market-badge${m.open ? ' on' : ''}`}>
                {m.open ? 'ABERTO' : 'FECHADO'}
              </span>
            </div>
          );
        })}
      </div>

      <p className="wsm-hint">
        Eixo = hora do dia ({zone === 'utc' ? 'UTC' : 'horário local'}). Faixas = sessões do início ao fim; a parte mais forte já passou.
        Bolinha cheia = abertura, cheia com anel branco = fechamento, vazada/brilhando = posição aberta. Linha vermelha = agora (atualiza a cada minuto).
      </p>
    </div>
  );
}

// ─── CSS injetado ─────────────────────────────────────────────────────────────
const WSM_CSS = `
.wsm-root {
  --wsm-band-h: 21px;
  --wsm-bg: rgba(11, 15, 28, 0.95);
  display: flex;
  flex-direction: column;
  gap: 12px;
  container-type: inline-size;
}
.wsm-long { --dir: var(--green, #2ecc71); }
.wsm-short { --dir: var(--red, #e74c3c); }

/* ── Dia + legenda ── */
.wsm-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.wsm-day { display: flex; align-items: center; gap: 6px; flex: 1 1 220px; min-width: 0; }
.wsm-btn { min-height: 40px; min-width: 40px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); cursor: pointer; }
.wsm-btn:disabled { opacity: 0.4; cursor: default; }
.wsm-btn-txt { padding: 0 12px; font-size: 12px; font-weight: 700; }
.wsm-date { flex: 1; min-width: 0; min-height: 40px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 4px 8px; color: var(--text, #e7eaf0); font-size: 13px; font-family: inherit; color-scheme: dark; }
.wsm-legend { display: flex; flex-wrap: wrap; gap: 6px; }
.wsm-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text, #e7eaf0); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 2px 9px; }
.wsm-lg { display: inline-block; width: 9px; height: 9px; border-radius: 50%; box-sizing: border-box; }
.wsm-lg-long { background: var(--green, #2ecc71); }
.wsm-lg-short { background: var(--red, #e74c3c); }
.wsm-lg-ring { background: var(--muted, #a1a7b3); border: 2px solid #fff; }
.wsm-lg-dash { display: inline-block; width: 14px; height: 0; border-top: 2px dashed var(--muted, #a1a7b3); }

/* ── Card único (relógio + mapa + detalhe + volume) ── */
.wsm-stage {
  position: relative;
  width: 100%;
  background: var(--wsm-bg);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
}

/* ── Relógio preso à linha "agora" ── */
.wsm-clockbar { position: relative; height: 28px; }
.wsm-clock {
  position: absolute;
  top: 5px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--red, #e74c3c);
  color: white;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  z-index: 5;
  transition: left 0.6s ease;
}
.wsm-daytag { position: absolute; left: 12px; top: 6px; font-size: 11px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: capitalize; white-space: nowrap; }

/* ── Mapa ── */
.wsm-map {
  position: relative;
  width: 100%;
  aspect-ratio: 5 / 2;
  min-height: calc(var(--wsm-lanes, 4) * 38px);
}
.wsm-backdrop { position: absolute; inset: 0; overflow: hidden; }
.wsm-svg { display: block; width: 100%; height: 100%; }
.wsm-land { fill: none; stroke: var(--muted, #a1a7b3); stroke-linecap: round; }
.wsm-land-fine { stroke-opacity: 0.3; }
.wsm-land-coarse { stroke-opacity: 0.38; display: none; }
.wsm-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.06); pointer-events: none; }

/* Sessões: faixa + parte percorrida + nome acima */
.wsm-band {
  position: absolute;
  height: var(--wsm-band-h);
  margin-top: calc(var(--wsm-band-h) / -2);
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--c-dim);
  background: var(--c-bg);
  overflow: hidden;
  z-index: 1;
  pointer-events: none;
}
.wsm-band-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-fill); transition: width 0.6s ease; }
.wsm-band.is-live { border-color: var(--c-bd); box-shadow: 0 0 14px var(--c-glow); }
.wsm-cap {
  position: absolute;
  transform: translateY(-100%);
  margin-top: calc(var(--wsm-band-h) / -2 - 2px);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: Inter, system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  color: var(--muted, #a1a7b3);
  text-shadow: 0 0 3px var(--wsm-bg), 0 0 6px var(--wsm-bg);
  white-space: nowrap;
  z-index: 2;
  pointer-events: none;
}
.wsm-cap-icon { display: inline-flex; color: var(--c); }
.wsm-cap.is-live { color: var(--text, #e7eaf0); font-weight: 700; }
.wsm-cap-time { font-size: 10px; font-weight: 400; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.wsm-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Linhas dos trades */
.wsm-lines { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; overflow: visible; pointer-events: none; }
.wsm-line { pointer-events: none; }
.wsm-line-stroke { fill: none; stroke: var(--dir); stroke-width: 1.5; stroke-opacity: 0.75; stroke-linecap: round; vector-effect: non-scaling-stroke; pointer-events: none; }
.wsm-line-hit { fill: none; stroke: transparent; stroke-width: 14; vector-effect: non-scaling-stroke; pointer-events: stroke; cursor: pointer; }
.wsm-line.is-open .wsm-line-stroke { stroke-dasharray: 5 4; }
.wsm-line.is-active .wsm-line-stroke { stroke-width: 2.5; stroke-opacity: 1; }

/* Bolinhas */
.wsm-dot {
  position: absolute;
  width: 11px;
  height: 11px;
  margin: -5.5px 0 0 -5.5px;
  padding: 0;
  box-sizing: border-box;
  border-radius: 50%;
  border: 2px solid var(--dir);
  background: var(--dir);
  box-shadow: 0 0 0 2px var(--wsm-bg);
  cursor: pointer;
  z-index: 3;
}
.wsm-dot::before { content: ''; position: absolute; inset: -6px; }
.wsm-dot-close { background: var(--dir); border-color: #fff; }
.wsm-dot-now { background: var(--wsm-bg); box-shadow: 0 0 0 2px var(--wsm-bg), 0 0 10px var(--dir); }
.wsm-dot.is-active { transform: scale(1.35); z-index: 4; }
.wsm-dot:focus-visible { outline: 2px solid var(--text, #e7eaf0); outline-offset: 3px; z-index: 4; }
.wsm-edge { position: absolute; width: 0; height: 0; margin-top: -5px; border-top: 5px solid transparent; border-bottom: 5px solid transparent; z-index: 3; pointer-events: none; }
.wsm-edge-l { left: 0; border-right: 7px solid var(--dir); }
.wsm-edge-r { right: 0; border-left: 7px solid var(--dir); }

/* Linha "agora" (mapa e volume) — anda sozinha */
.wsm-now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--red, #e74c3c);
  box-shadow: 0 0 8px var(--red, #e74c3c);
  z-index: 5;
  pointer-events: none;
  transition: left 0.6s ease;
}

/* ── Dados do trade ── */
.wsm-detail {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 64px;
  padding: 8px 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 12px;
  color: var(--text, #e7eaf0);
}
.wsm-detail-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.wsm-detail-sym { font-size: 13px; }
.wsm-muted { color: var(--muted, #a1a7b3); }
.wsm-num { font-variant-numeric: tabular-nums; }
.wsm-up { color: var(--green, #2ecc71); font-weight: 700; }
.wsm-down { color: var(--red, #e74c3c); font-weight: 700; }
.wsm-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; color: var(--muted, #a1a7b3); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 1px 7px; }
.wsm-badge.on { color: var(--text, #e7eaf0); border-color: var(--text, #e7eaf0); }

/* ── Trades abertos por hora (curva) ── */
.wsm-vol-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px 6px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.wsm-vol-title { font-size: 12px; font-weight: 700; color: var(--text, #e7eaf0); }
.wsm-vol-sub { font-size: 11px; font-weight: 400; color: var(--muted, #a1a7b3); }
.wsm-vol-plot {
  position: relative;
  height: 84px;
  overflow: hidden;
  background: rgba(255,255,255,0.02);
  touch-action: pan-y;
}
.wsm-vol-band { position: absolute; top: 0; bottom: 0; pointer-events: none; }
.wsm-vol-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.wsm-vol-line { fill: none; stroke: var(--brand, #7c5cff); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.wsm-vol-line.is-empty { stroke: var(--muted, #a1a7b3); stroke-opacity: 0.4; stroke-dasharray: 4 4; }
.wsm-vol-area { fill: var(--brand, #7c5cff); fill-opacity: 0.16; stroke: none; }
.wsm-vol-cursor { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.25); pointer-events: none; }
.wsm-vol-point { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--brand, #7c5cff); box-shadow: 0 0 0 2px var(--wsm-bg); pointer-events: none; }
.wsm-vol-tip { position: absolute; top: 4px; transform: translateX(-50%); font-size: 11px; font-weight: 700; color: var(--text, #e7eaf0); background: var(--wsm-bg); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 2px 7px; white-space: nowrap; font-variant-numeric: tabular-nums; pointer-events: none; z-index: 6; }
.wsm-axis {
  position: relative;
  height: 22px;
  background: rgba(255,255,255,0.015);
  border-top: 1px solid rgba(255,255,255,0.04);
}
.wsm-hour {
  position: absolute;
  transform: translateX(-50%);
  top: 5px;
  font-size: 10px;
  color: var(--muted, #a1a7b3);
  font-variant-numeric: tabular-nums;
}
.wsm-hour:first-child { transform: translateX(0); }
.wsm-hour:last-child  { transform: translateX(-100%); }

/* ── Notícias (red folders) direto no mapa ── */
.wsm-news-mark {
  position: absolute; bottom: 3px; transform: translateX(-50%);
  width: 15px; height: 15px; padding: 0; margin: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid #b7352a; border-radius: 4px;
  background: var(--red, #e74c3c); color: #fff;
  font-size: 10px; font-weight: 800; line-height: 1;
  cursor: pointer; z-index: 4; box-shadow: 0 1px 3px rgba(0,0,0,0.6);
}
.wsm-news-mark::before { content: ''; position: absolute; inset: -7px; } /* alvo de toque ≈ 29px */
.wsm-news-mark.is-active, .wsm-news-mark:focus-visible { transform: translateX(-50%) scale(1.35); outline: 2px solid var(--text, #e7eaf0); outline-offset: 2px; z-index: 6; }
.wsm-news-tip {
  position: absolute; bottom: 24px; transform: translateX(-50%);
  z-index: 7; display: flex; flex-direction: column; gap: 1px;
  max-width: 230px; padding: 6px 9px; border-radius: 8px;
  background: var(--wsm-bg); border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
  font-size: 11px; color: var(--text, #e7eaf0); white-space: normal; word-break: break-word;
}
.wsm-news-tip strong { color: var(--red, #e74c3c); }
.wsm-news-tip .wsm-num, .wsm-news-tip .wsm-muted { font-size: 10px; }

/* ── Cards de mercado ── */
.wsm-markets {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.wsm-market {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 8px;
  row-gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  transition: border-color 0.25s, background 0.25s;
}
.wsm-market.is-open {
  background: rgba(255,255,255,0.055);
  border-color: var(--mkt-color, rgba(255,255,255,0.15));
  box-shadow: 0 0 12px rgba(0,0,0,0.3), inset 0 0 1px rgba(255,255,255,0.1);
}
.wsm-market-icon {
  grid-row: 1 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wsm-market-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text, #e7eaf0);
  line-height: 1.2;
}
.wsm-market-time {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--muted, #a1a7b3);
  font-weight: 600;
  line-height: 1.2;
}
.wsm-market-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--muted, #a1a7b3);
  grid-column: 2 / 4;
  line-height: 1.2;
}
.wsm-market-badge.on { color: var(--green, #2ecc71); }

.wsm-hint {
  margin: 0;
  font-size: 11px;
  color: var(--muted, #a1a7b3);
}

@media (prefers-reduced-motion: reduce) {
  .wsm-now, .wsm-clock, .wsm-band-fill { transition: none; }
}

/* Celular / container estreito: pontos mais grossos e sem o horário no nome da faixa */
@container (max-width: 600px) {
  .wsm-land-fine { display: none; }
  .wsm-land-coarse { display: inline; }
  .wsm-cap-time { display: none; }
}
@container (max-width: 460px) {
  .wsm-markets { grid-template-columns: 1fr; }
  .wsm-vol-plot { height: 96px; }
  .wsm-dot { width: 10px; height: 10px; margin: -5px 0 0 -5px; }
}
@media (max-width: 420px) {
  .wsm-markets { grid-template-columns: 1fr; }
  .wsm-vol-plot { height: 96px; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('wsm-styles')) {
  const style = document.createElement('style');
  style.id = 'wsm-styles';
  style.textContent = WSM_CSS;
  document.head.appendChild(style);
}