// WorldSessionMap — "session map" estilo fxblue + qorix, na nossa identidade:
//  (1) mapa-múndi PONTILHADO em proporção real, com uma barra por mercado (na latitude dele)
//      e a linha do "agora". Sem texto dentro do mapa (evita fonte minúscula);
//  (2) lista de mercados (ícone, nome, relógio local, aberto/fechado);
//  (3) gráfico de VOLUME por hora com as faixas das sessões ao fundo.
// Apresentação pura: usa `marketStatus` e a hora de entrada dos trades.
import React, { useMemo } from 'react';
import type { Trade, SessionDef } from '@apps/lib/db';
import { marketStatus, parseDate, sessionContains } from '@apps/lib/db';
import { sessionDisplaySegments, pct } from './sessionTime';
import { sessionIconFor, SESSION_COLORS } from './sessionIcons';

interface Props {
  trades?: Trade[];
  sessions: SessionDef[];
  zone?: 'local' | 'utc';
  now?: Date;
}

const CITY: Record<string, { lat: number; lon: number }> = {
  sydney: { lat: -33.9, lon: 151.2 },
  tokyo: { lat: 35.7, lon: 139.7 },
  london: { lat: 51.5, lon: -0.1 },
  newyork: { lat: 40.7, lon: -74 },
};
const DUR: Record<string, number> = { sydney: 9, tokyo: 9, london: 9, newyork: 6.5 };

// Continentes como anéis [lon,lat] — geram os pontos do mapa.
const LAND: number[][][] = [
  [[-165, 60], [-140, 68], [-100, 70], [-70, 60], [-55, 48], [-65, 45], [-80, 25], [-97, 26], [-105, 22], [-115, 30], [-125, 42], [-135, 58]],
  [[-45, 82], [-18, 82], [-22, 68], [-50, 60]],
  [[-78, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-55, -35], [-70, -52], [-76, -45], [-72, -20], [-80, -5]],
  [[-10, 58], [5, 62], [30, 70], [40, 62], [30, 45], [15, 38], [0, 40], [-10, 45]],
  [[-17, 35], [10, 37], [35, 30], [50, 10], [42, -5], [35, -22], [25, -34], [15, -35], [0, -5], [-8, 5], [-17, 15]],
  [[40, 68], [70, 75], [100, 78], [140, 72], [170, 68], [180, 60], [180, 20], [140, 10], [120, 2], [100, 5], [80, 10], [70, 25], [55, 25], [45, 40], [40, 55]],
  [[68, 25], [72, 20], [80, 8], [88, 22]],
  [[95, 5], [120, 0], [135, -5], [110, -8], [100, -3]],
  [[113, -22], [130, -12], [142, -11], [153, -28], [145, -38], [130, -32], [115, -35]],
  [[166, -34], [178, -37], [174, -46], [168, -44]],
  [[130, 32], [142, 40], [145, 44], [140, 36]],
  [[43, -15], [50, -16], [48, -25], [44, -22]],
];

function inPoly(lon: number, lat: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const HOUR_LABELS = [0, 6, 12, 18, 24];
const BAND_FILLS = [
  'rgba(124, 92, 255, 0.20)',
  'rgba(52, 152, 219, 0.20)',
  'rgba(46, 204, 113, 0.18)',
  'rgba(241, 196, 15, 0.18)',
  'rgba(231, 76, 60, 0.18)',
];

function mod24(h: number): number {
  return ((h % 24) + 24) % 24;
}
function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

const Dots = React.memo(function Dots() {
  const dots = useMemo(() => {
    const out: Array<{ x: number; y: number }> = [];
    for (let lon = -180; lon <= 180; lon += 4) {
      for (let lat = -56; lat <= 76; lat += 4) {
        if (LAND.some((poly) => inPoly(lon, lat, poly))) out.push({ x: lon + 180, y: 90 - lat });
      }
    }
    return out;
  }, []);
  return (
    <g fill="rgba(124, 92, 255, 0.5)">
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={1} />)}
    </g>
  );
});

export default function WorldSessionMap({ trades = [], sessions, zone = 'local', now }: Props) {
  const ref = now ?? new Date();
  const status = useMemo(() => marketStatus(ref), [ref]);
  const offsetHours = -ref.getTimezoneOffset() / 60;
  const delta = zone === 'utc' ? -offsetHours : 0;
  const utcH = ref.getUTCHours() + ref.getUTCMinutes() / 60;
  const nowH = zone === 'utc' ? utcH : ref.getHours() + ref.getMinutes() / 60;
  const nowLabel = `${String(Math.floor(nowH)).padStart(2, '0')}:${String(Math.round((nowH % 1) * 60)).padStart(2, '0')}`;

  const sessionById = useMemo(() => {
    const m = new Map<string, { i: number; def: SessionDef }>();
    sessions.forEach((def, i) => m.set(def.id, { i, def }));
    return m;
  }, [sessions]);

  const hours = useMemo(() => {
    const arr = new Array(24).fill(0) as number[];
    for (const t of trades) {
      if (!t.entryDatetime) continue;
      const d = parseDate(t.entryDatetime);
      arr[zone === 'utc' ? d.getUTCHours() : d.getHours()] += 1;
    }
    return arr;
  }, [trades, zone]);
  const hourMax = Math.max(1, ...hours);
  const totalTrades = hours.reduce((a, b) => a + b, 0);

  return (
    <div className="wsm-root">
      <div className="wsm-mapwrap">
        <svg className="wsm-svg" viewBox="0 0 360 180" role="img" aria-label="Mapa-múndi das sessões de mercado">
          <Dots />
          {status.map((m) => {
            const city = CITY[m.id];
            if (!city) return null;
            const s = sessionById.get(m.id);
            const i = s ? s.i : 0;
            const dur = s ? mod24(s.def.endH - s.def.startH) : (DUR[m.id] ?? 8);
            const w = Math.min(150, Math.max(26, dur * 13));
            const x = city.lon + 180 - w / 2;
            const y = 90 - city.lat;
            const color = SESSION_COLORS[i % SESSION_COLORS.length];
            return (
              <rect
                key={m.id}
                x={x} y={y - 5} width={w} height={10} rx={5}
                fill={color} fillOpacity={m.open ? 0.7 : 0.28}
                stroke={color} strokeWidth={m.open ? 1.2 : 0.6}
              />
            );
          })}
          <line x1={(nowH / 24) * 360} y1={0} x2={(nowH / 24) * 360} y2={180} stroke="var(--red, #e74c3c)" strokeWidth={1.4} />
        </svg>
        <span className="wsm-clock" style={{ left: `${(nowH / 24) * 100}%` }}>{nowLabel} {zone === 'utc' ? 'UTC' : 'local'}</span>
      </div>

      <div className="wsm-markets">
        {status.map((m) => {
          const s = sessionById.get(m.id);
          const i = s ? s.i : 0;
          const color = SESSION_COLORS[i % SESSION_COLORS.length];
          const Icon = sessionIconFor(m.id);
          return (
            <div key={m.id} className={`wsm-market${m.open ? ' is-open' : ''}`}>
              <Icon size={16} style={{ color }} />
              <span className="wsm-market-name">{m.label}</span>
              <span className="wsm-market-time">{fmtMin(m.localMinutes)}</span>
              <span className={`wsm-market-state${m.open ? ' on' : ''}`}>{m.open ? 'aberto' : 'fechado'}</span>
            </div>
          );
        })}
      </div>

      <div className="wsm-vol">
        <div className="wsm-vol-title">
          Volume por hora
          <span className="wsm-vol-sub">{totalTrades} trade(s) por hora de abertura</span>
        </div>
        <div className="wsm-axis">
          {HOUR_LABELS.map((h) => <span key={h} className="wsm-hour" style={{ left: pct(h) }}>{h}h</span>)}
        </div>
        <div className="wsm-vol-plot">
          {sessions.map((def, i) => sessionDisplaySegments(def, delta).map((sg) => (
            <span key={`${def.id}-${sg.start}`} className="wsm-vol-band" style={{ left: pct(sg.start), width: pct(sg.end - sg.start), background: BAND_FILLS[i % BAND_FILLS.length] }} />
          )))}
          {hours.map((n, h) => {
            const hitIdx = sessions.findIndex((d) => sessionContains(d, h));
            const color = hitIdx >= 0 ? SESSION_COLORS[hitIdx % SESSION_COLORS.length] : 'rgba(255,255,255,0.25)';
            return (
              <span
                key={h}
                className="wsm-vol-bar"
                style={{ left: pct(h), width: `calc(${100 / 24}% - 1px)`, height: n ? `${Math.max(6, (n / hourMax) * 100)}%` : '0', background: color }}
                title={`${h}h · ${n} trade(s)`}
              />
            );
          })}
          <span className="wsm-vol-now" style={{ left: `${(nowH / 24) * 100}%` }} />
        </div>
      </div>
      <p className="wsm-hint">Barras no mapa = cada mercado na sua latitude (acesa quando aberto agora). Linha vermelha = agora.</p>
    </div>
  );
}

const WSM_CSS = `
.wsm-root { display: flex; flex-direction: column; gap: 10px; }
.wsm-mapwrap { position: relative; width: 100%; border-radius: 10px; overflow: hidden; background: rgba(17,22,35,0.9); border: 1px solid rgba(255,255,255,0.07); }
.wsm-svg { display: block; width: 100%; height: auto; aspect-ratio: 2 / 1; }
.wsm-clock { position: absolute; top: 6px; transform: translateX(-50%); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: #fff; background: var(--red, #e74c3c); border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
.wsm-markets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.wsm-market { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
.wsm-market.is-open { border-color: rgba(46,204,113,0.4); background: rgba(46,204,113,0.06); }
.wsm-market-name { font-size: 13px; font-weight: 700; color: var(--text, #e7eaf0); }
.wsm-market-time { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--muted, #a1a7b3); }
.wsm-market-state { grid-column: 2 / 4; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.wsm-market-state.on { color: var(--green, #2ecc71); }
.wsm-vol { display: flex; flex-direction: column; gap: 5px; }
.wsm-vol-title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 12px; font-weight: 700; color: var(--text, #e7eaf0); }
.wsm-vol-sub { font-weight: 400; font-size: 10px; color: var(--muted, #a1a7b3); }
.wsm-axis { position: relative; height: 15px; }
.wsm-hour { position: absolute; transform: translateX(-50%); font-size: 10px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.wsm-hour:first-child { transform: translateX(0); }
.wsm-hour:last-child { transform: translateX(-100%); }
.wsm-vol-plot { position: relative; height: 78px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); overflow: hidden; }
.wsm-vol-band { position: absolute; top: 0; bottom: 0; }
.wsm-vol-bar { position: absolute; bottom: 0; border-radius: 3px 3px 0 0; }
.wsm-vol-now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--red, #e74c3c); box-shadow: 0 0 6px var(--red, #e74c3c); z-index: 2; }
.wsm-hint { margin: 0; font-size: 10px; color: var(--muted, #a1a7b3); }
@media (max-width: 420px) {
  .wsm-markets { grid-template-columns: 1fr; }
  .wsm-vol-plot { height: 92px; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('wsm-styles')) {
  const style = document.createElement('style');
  style.id = 'wsm-styles';
  style.textContent = WSM_CSS;
  document.head.appendChild(style);
}
