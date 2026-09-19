// WorldSessionMap — "session map" estilo fxblue + qorix, na nossa identidade:
//  (1) mapa-múndi PONTILHADO em proporção real (grade lat/lon equiretangular), com uma barra translúcida
//      por mercado (centrada na latitude/longitude).
//  (2) lista de mercados (ícone, nome, relógio local, aberto/fechado);
//  (3) gráfico de VOLUME por hora com as faixas das sessões ao fundo (alinhado 1:1 com o mapa).
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

// Mapa-múndi ASCII (72x36), cada caractere = bloco de 5x5 graus.
const WORLD_MAP = [
 "                                                                        ",
 "                                                                        ",
 "                             xxxxxxxxx                                  ",
 "      xxxx                  xxxxxxxxxxx         xxxxxxxxxxxxxxxxxxxx    ",
 "    xxxxxxx    xxxxxxxx     xxxxxxxxxxx       xxxxxxxxxxxxxxxxxxxxxx    ",
 "   xxxxxxxxxxxxxxxxxxxx     xxxxxxxxxx       xxxxxxxxxxxxxxxxxxxxxxx    ",
 "   xxxxxxxxxxxxxxxxxxx       xxxxxxxx        xxxxxxxxxxxxxxxxxxxxxxx    ",
 "    xxxxxxxxxxxxxxxxxx            x          xxxxxxxxxxxxxxxxxxxxxxx    ",
 "      xxxxxxxxxxxxxxx           xx    xxxx   xxxxxxxxxxxxxxxxxxxxxxx    ",
 "       xxxxxxxxxxxxxx          xxxx  xxxxxx  xxxxxxxxxxxxxxxxxxxxxxx    ",
 "        xxxxxxxxxxxxx          xxxx  xxxxxx  xxxxxxxxxxxxxxxxxxxxxx     ",
 "         xxxxxxxxxxxx           xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx      ",
 "          xxxxxxxxxxx            xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx      ",
 "           xxxxxxxxxx            xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx      ",
 "             xxxxxxx              xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx       ",
 "              xxxx                xxxxxxxxxxxxxxxxxxxxxxxxxxxxx         ",
 "               xx                  xxxxxxxxxxxxxxxxxxxxxxxxxxx          ",
 "               xx                  xxxxxxxxxxxxxxxxxxxxxxxxxx           ",
 "               xxx                 xxxxxxxxxxxxxxxx   xxxxxxx           ",
 "               xxxx                 xxxxxxxxxxxxxx     xxxxx            ",
 "                xxxx                xxxxxxxxxxxxx       xxx             ",
 "                xxxxx               xxxxxxxxxxxx                        ",
 "                 xxxx               xxxxxxxxxx        xxxxxxxxx         ",
 "                 xxxx               xxxxxxxxx         xxxxxxxxxx        ",
 "                  xxx                xxxxxxx          xxxxxxxxxxx       ",
 "                  xxx                 xxxxx            xxxxxxxxx        ",
 "                   xx                  xxx              xxxxxx  xx      ",
 "                   x                                             x      ",
 "                   x                                                    ",
 "                                                                        ",
 "                                                                        ",
 "                                                                        ",
 "                                                                        ",
 "                                                                        ",
 "                                                                        ",
 "                                                                        ",
];

const Dots = React.memo(function Dots() {
  const dots: Array<{x: number, y: number}> = [];
  for (let r = 0; r < WORLD_MAP.length; r++) {
    for (let c = 0; c < WORLD_MAP[r].length; c++) {
      if (WORLD_MAP[r][c] === 'x') {
        dots.push({ x: c * 5 + 2.5, y: r * 5 + 2.5 });
      }
    }
  }
  return (
    <g fill="var(--muted, rgba(161, 167, 179, 0.5))" opacity={0.4}>
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={1.5} />)}
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
      <div className="wsm-view">
        <div className="wsm-mapwrap" aria-label="Mapa-múndi das sessões de mercado">
          <svg className="wsm-svg" viewBox="0 0 360 180" role="img" preserveAspectRatio="xMidYMid meet">
            <Dots />
          </svg>

          {status.map((m) => {
            const city = CITY[m.id];
            if (!city) return null;
            const s = sessionById.get(m.id);
            const i = s ? s.i : 0;
            const color = SESSION_COLORS[i % SESSION_COLORS.length];
            
            const leftPct = ((city.lon + 180) / 360) * 100;
            const topPct = ((90 - city.lat) / 180) * 100;

            return (
              <div 
                key={m.id} 
                className={`wsm-market-bar ${m.open ? 'is-open' : ''}`}
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  '--theme-color': color,
                } as any}
              >
                {m.open && <span className="wsm-market-glow" />}
                {m.label}
              </div>
            );
          })}
        </div>

        <div className="wsm-vol">
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
          </div>
          <div className="wsm-axis">
            {HOUR_LABELS.map((h) => <span key={h} className="wsm-hour" style={{ left: pct(h) }}>{h}h</span>)}
          </div>
        </div>
        
        <div className="wsm-now-line" style={{ left: `${(nowH / 24) * 100}%` }}>
          <span className="wsm-clock">{nowLabel} {zone === 'utc' ? 'UTC' : 'local'}</span>
        </div>
      </div>

      <div className="wsm-vol-title">
        Volume por hora
        <span className="wsm-vol-sub">{totalTrades} trade(s) por hora de abertura</span>
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

      <p className="wsm-hint">Barras no mapa indicam a latitude/longitude do mercado. Ficam acesas quando abertos agora.</p>
    </div>
  );
}

const WSM_CSS = `
.wsm-root { display: flex; flex-direction: column; gap: 12px; }
.wsm-view { position: relative; background: rgba(17,22,35,0.9); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding-bottom: 8px; margin-top: 10px; }
.wsm-mapwrap { position: relative; width: 100%; border-bottom: 1px solid rgba(255,255,255,0.04); overflow: hidden; border-radius: 10px 10px 0 0; }
.wsm-svg { display: block; width: 100%; height: auto; aspect-ratio: 2 / 1; }
.wsm-now-line { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--red, #e74c3c); transform: translateX(-50%); box-shadow: 0 0 8px var(--red, #e74c3c); pointer-events: none; z-index: 10; }
.wsm-clock { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: #fff; background: var(--red, #e74c3c); border-radius: 999px; padding: 2px 8px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.5); }

.wsm-market-bar {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 2px 10px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted, #a1a7b3);
  border: 1px solid rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  pointer-events: none;
  transition: all 0.3s ease;
  z-index: 5;
}
.wsm-market-bar.is-open {
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-color: var(--theme-color);
  box-shadow: 0 2px 12px rgba(0,0,0,0.5), inset 0 0 8px rgba(255,255,255,0.1);
  z-index: 6;
}
.wsm-market-glow {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-color);
  box-shadow: 0 0 6px var(--theme-color), 0 0 12px var(--theme-color);
}

.wsm-markets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.wsm-market { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); transition: all 0.2s ease; }
.wsm-market.is-open { border-color: rgba(46,204,113,0.3); background: rgba(46,204,113,0.05); }
.wsm-market-name { font-size: 13px; font-weight: 700; color: var(--text, #e7eaf0); }
.wsm-market-time { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--muted, #a1a7b3); }
.wsm-market-state { grid-column: 2 / 4; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); font-weight: 600; }
.wsm-market-state.on { color: var(--green, #2ecc71); }

.wsm-vol { display: flex; flex-direction: column; padding: 0; width: 100%; }
.wsm-vol-title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 12px; font-weight: 700; color: var(--text, #e7eaf0); padding: 0 4px; }
.wsm-vol-sub { font-weight: 400; font-size: 11px; color: var(--muted, #a1a7b3); }
.wsm-axis { position: relative; height: 18px; margin-top: 4px; }
.wsm-hour { position: absolute; transform: translateX(-50%); font-size: 10px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.wsm-hour:first-child { transform: translateX(0); }
.wsm-hour:last-child { transform: translateX(-100%); }
.wsm-vol-plot { position: relative; height: 48px; background: rgba(255,255,255,0.01); overflow: hidden; }
.wsm-vol-band { position: absolute; top: 0; bottom: 0; }
.wsm-vol-bar { position: absolute; bottom: 0; border-radius: 2px 2px 0 0; }
.wsm-hint { margin: 0; font-size: 11px; color: var(--muted, #a1a7b3); padding: 0 4px; }
@media (max-width: 480px) {
  .wsm-markets { grid-template-columns: 1fr; }
  .wsm-vol-plot { height: 64px; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('wsm-styles')) {
  const style = document.createElement('style');
  style.id = 'wsm-styles';
  style.textContent = WSM_CSS;
  document.head.appendChild(style);
}
