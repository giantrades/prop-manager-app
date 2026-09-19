// WorldSessionMap — "session map" estilo fxblue + qorix, na nossa identidade:
//  (1) mapa-múndi PONTILHADO com uma barra por mercado (na latitude dele) e a linha do "agora";
//  (2) gráfico de VOLUME por hora com as faixas das sessões ao fundo.
// Apresentação pura: usa `marketStatus` (hora local/aberto por mercado) e a hora de entrada
// dos trades para o volume. Sem cálculo financeiro.
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

/** Lat/lon dos centros de mercado. */
const CITY: Record<string, { lat: number; lon: number }> = {
  sydney: { lat: -33.9, lon: 151.2 },
  tokyo: { lat: 35.7, lon: 139.7 },
  london: { lat: 51.5, lon: -0.1 },
  newyork: { lat: 40.7, lon: -74 },
};
/** Duração (h) padrão por mercado — fallback se a sessão não estiver configurada. */
const DUR: Record<string, number> = { sydney: 9, tokyo: 9, london: 9, newyork: 6.5 };

// Continentes como anéis [lon,lat] — usados para gerar os pontos do mapa.
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
  'rgba(124, 92, 255, 0.22)',
  'rgba(52, 152, 219, 0.22)',
  'rgba(46, 204, 113, 0.20)',
  'rgba(241, 196, 15, 0.20)',
  'rgba(231, 76, 60, 0.20)',
];

function mod24(h: number): number {
  return ((h % 24) + 24) % 24;
}
function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Mapa pontilhado — memoizado (não recalcula nem redesenha a cada render).
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
    <g fill="rgba(124, 92, 255, 0.42)">
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={0.9} />)}
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

  // Volume por hora (entrada) no fuso exibido.
  const hours = useMemo(() => {
    const arr = new Array(24).fill(0) as number[];
    for (const t of trades) {
      if (!t.entryDatetime) continue;
      const d = parseDate(t.entryDatetime);
      const h = zone === 'utc' ? d.getUTCHours() : d.getHours();
      arr[h] += 1;
    }
    return arr;
  }, [trades, zone]);
  const hourMax = Math.max(1, ...hours);

  return (
    <div className="wsm-root">
      <div className="wsm-mapwrap">
        <svg className="wsm-svg" viewBox="0 0 360 180" preserveAspectRatio="none" aria-label="Mapa-múndi das sessões de mercado">
          <Dots />
          {status.map((m) => {
            const city = CITY[m.id];
            if (!city) return null;
            const s = sessionById.get(m.id);
            const i = s ? s.i : 0;
            const dur = s ? mod24(s.def.endH - s.def.startH) : (DUR[m.id] ?? 8);
            const w = Math.min(150, Math.max(20, dur * 15));
            const x = city.lon + 180 - w / 2;
            const y = 90 - city.lat;
            const color = SESSION_COLORS[i % SESSION_COLORS.length];
            return (
              <g key={m.id} opacity={m.open ? 1 : 0.55}>
                <rect x={x} y={y - 6} width={w} height={12} rx={6} fill={color} fillOpacity={m.open ? 0.55 : 0.3} stroke={color} strokeWidth={m.open ? 1.1 : 0.6} />
                <text x={city.lon + 180} y={y + 3} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#0b0f1a">{m.label}</text>
              </g>
            );
          })}
          <line x1={(nowH / 24) * 360} y1={0} x2={(nowH / 24) * 360} y2={180} stroke="var(--red, #e74c3c)" strokeWidth={1} />
        </svg>
        <span className="wsm-clock" style={{ left: `${(nowH / 24) * 100}%` }}>{nowLabel} {zone === 'utc' ? 'UTC' : 'local'}</span>
      </div>

      <div className="wsm-cards">
        {status.map((m) => {
          const s = sessionById.get(m.id);
          const i = s ? s.i : 0;
          const color = SESSION_COLORS[i % SESSION_COLORS.length];
          const Icon = sessionIconFor(m.id);
          return (
            <span key={m.id} className={`wsm-card${m.open ? ' is-open' : ''}`}>
              <Icon size={13} style={{ color }} />
              <b>{m.label}</b>
              <span className="wsm-time">{fmtMin(m.localMinutes)}</span>
              <i className={`wsm-dot${m.open ? ' on' : ''}`} title={m.open ? 'aberto' : 'fechado'} />
            </span>
          );
        })}
      </div>

      <div className="wsm-vol">
        <div className="wsm-vol-title">Volume por hora <span className="wsm-vol-sub">(trades que abriram em cada hora)</span></div>
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
                style={{ left: pct(h), width: `calc(${100 / 24}% - 1px)`, height: `${(n / hourMax) * 100}%`, background: color, opacity: n ? 0.85 : 0 }}
                title={`${h}h · ${n} trade(s)`}
              />
            );
          })}
          <span className="wsm-vol-now" style={{ left: `${(nowH / 24) * 100}%` }} />
        </div>
      </div>
      <p className="wsm-hint">Barras = cada mercado na sua latitude (acesa quando aberto agora). Linha vermelha = agora. Volume = trades por hora de abertura.</p>
    </div>
  );
}

const WSM_CSS = `
.wsm-root { display: flex; flex-direction: column; gap: 8px; }
.wsm-mapwrap { position: relative; width: 100%; border-radius: 10px; overflow: hidden; background: rgba(17,22,35,0.9); border: 1px solid rgba(255,255,255,0.07); }
.wsm-svg { display: block; width: 100%; height: 156px; }
.wsm-clock { position: absolute; top: 4px; transform: translateX(-50%); font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; color: #fff; background: var(--red, #e74c3c); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.wsm-cards { display: flex; flex-wrap: wrap; gap: 6px; }
.wsm-card { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text, #e7eaf0); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 3px 9px; }
.wsm-card.is-open { border-color: rgba(46,204,113,0.4); }
.wsm-time { font-variant-numeric: tabular-nums; color: var(--muted, #a1a7b3); }
.wsm-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.2); }
.wsm-dot.on { background: var(--green, #2ecc71); box-shadow: 0 0 6px var(--green, #2ecc71); }
.wsm-vol { display: flex; flex-direction: column; gap: 5px; margin-top: 4px; }
.wsm-vol-title { font-size: 11px; font-weight: 700; color: var(--text, #e7eaf0); }
.wsm-vol-sub { font-weight: 400; color: var(--muted, #a1a7b3); }
.wsm-axis { position: relative; height: 14px; }
.wsm-hour { position: absolute; transform: translateX(-50%); font-size: 10px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.wsm-hour:first-child { transform: translateX(0); }
.wsm-hour:last-child { transform: translateX(-100%); }
.wsm-vol-plot { position: relative; height: 72px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); overflow: hidden; }
.wsm-vol-band { position: absolute; top: 0; bottom: 0; }
.wsm-vol-bar { position: absolute; bottom: 0; border-radius: 2px 2px 0 0; }
.wsm-vol-now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--red, #e74c3c); box-shadow: 0 0 6px var(--red, #e74c3c); z-index: 2; }
.wsm-hint { margin: 0; font-size: 10px; color: var(--muted, #a1a7b3); }
@media (max-width: 380px) { .wsm-svg { height: 132px; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('wsm-styles')) {
  const style = document.createElement('style');
  style.id = 'wsm-styles';
  style.textContent = WSM_CSS;
  document.head.appendChild(style);
}
