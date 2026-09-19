// WorldSessionMap — "session map" estilo fxblue + qorix, na nossa identidade:
//  (1) mapa-múndi PONTILHADO REAL: pontos lat/lon dos contornos de cada continente
//      embutidos como arrays compactos (sem GeoJSON externo).
//  (2) Barras translúcidas de sessão dentro do SVG na latitude/longitude da cidade
//      com glassmorphism + glow quando aberto + nome legível.
//  (3) Linha "agora" travessando mapa + histograma de volume alinhados 1:1.
//  (4) Lista de mercados (ícone, nome, relógio, status).
// Apresentação pura: usa `marketStatus` e hora de entrada dos trades.
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

// Coordenadas das cidades (lon, lat)
const CITY: Record<string, { lat: number; lon: number; label: string }> = {
  sydney:  { lat: -33.9, lon: 151.2, label: 'Sydney'   },
  tokyo:   { lat:  35.7, lon: 139.7, label: 'Tóquio'   },
  london:  { lat:  51.5, lon:  -0.1, label: 'Londres'  },
  newyork: { lat:  40.7, lon: -74.0, label: 'Nova York' },
};

// Duração padrão de cada sessão em horas (fallback quando não configurado)
const DUR_H: Record<string, number> = { sydney: 9, tokyo: 9, london: 8, newyork: 6.5 };

const HOUR_LABELS = [0, 6, 12, 18, 24];

function mod24(h: number): number {
  return ((h % 24) + 24) % 24;
}
function fmtMin(min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ─── PONTOS DO MAPA-MÚNDI ────────────────────────────────────────────────────
// Cada entrada é [lon, lat]. Gerados a partir de simplificações dos contornos
// reais dos continentes (Natural Earth 110m simplificado para arrays inline).
// A grade é equiretangular: x = (lon+180)/360 * W, y = (90-lat)/180 * H

// América do Norte
const NA: [number,number][] = [
  [-168,72],[-155,72],[-140,70],[-130,68],[-120,60],[-115,55],[-100,50],[-85,48],[-76,44],
  [-75,45],[-73,41],[-70,44],[-65,47],[-60,47],[-64,44],[-66,42],[-70,42],[-73,40],
  [-74,39],[-75,37],[-76,35],[-75,34],[-77,34],[-80,32],[-81,30],[-82,30],[-85,30],
  [-88,30],[-89,29],[-94,29],[-97,26],[-98,20],[-105,21],[-110,24],[-115,30],[-118,34],
  [-122,38],[-122,47],[-124,49],[-130,55],[-135,58],[-140,60],[-148,60],[-153,58],
  [-158,57],[-162,60],[-164,64],[-165,68],[-168,72],
  // Groenlândia (ilha separada)
  [-72,84],[-60,83],[-42,81],[-18,82],[0,80],[0,78],[-18,76],[-42,72],[-54,68],[-68,66],
  [-72,68],[-70,72],[-72,76],[-72,84],
];

// América Central + Caribe (simplificado)
const CA: [number,number][] = [
  [-86,20],[-90,18],[-92,17],[-92,19],[-88,20],[-86,20],
];

// América do Sul
const SA: [number,number][] = [
  [-80,10],[-76,8],[-62,12],[-62,10],[-60,6],[-52,4],[-50,2],[-48,-1],[-35,-6],
  [-35,-8],[-36,-10],[-37,-12],[-38,-14],[-39,-15],[-40,-19],[-41,-22],[-44,-23],
  [-46,-24],[-48,-26],[-50,-28],[-52,-32],[-53,-34],[-54,-34],[-58,-38],[-62,-40],
  [-65,-42],[-66,-46],[-68,-50],[-70,-52],[-72,-50],[-72,-46],[-74,-42],[-73,-38],
  [-72,-32],[-72,-26],[-70,-20],[-68,-15],[-70,-10],[-75,-6],[-78,-2],[  -80,0],
  [-80,4],[-80,8],[-80,10],
];

// Europa
const EU: [number,number][] = [
  [-8,36],[-2,36],[10,38],[14,38],[18,40],[20,38],[24,38],[28,40],[30,42],
  [36,42],[36,46],[30,46],[28,48],[24,50],[22,52],[20,54],[18,56],[16,57],
  [14,57],[12,57],[10,56],[8,56],[6,56],[4,56],[2,52],[0,52],[-2,52],
  [-4,50],[-6,48],[-4,48],[-2,46],[0,44],[2,42],[4,44],[6,44],[8,46],
  [12,48],[12,46],[10,44],[8,44],[6,42],[4,40],[2,38],[0,38],[-4,38],[-8,38],[-8,36],
  // Escandinávia
  [18,60],[20,62],[22,64],[24,66],[28,70],[30,70],[28,68],[24,65],[22,62],[18,60],
];

// África
const AF: [number,number][] = [
  [-18,16],[-16,20],[-14,24],[-12,28],[-8,30],[-4,32],[0,32],[4,32],[8,34],[12,36],
  [16,34],[20,34],[24,30],[28,26],[32,22],[34,18],[42,12],[50,12],[52,12],[44,12],
  [42,14],[42,16],[36,20],[36,22],[38,24],[40,20],[44,12],[50,4],[52,0],[44,-4],
  [40,-8],[38,-12],[36,-14],[34,-18],[32,-20],[32,-22],[30,-25],[28,-28],[26,-30],
  [24,-34],[20,-34],[18,-32],[16,-30],[12,-26],[10,-20],[8,-14],[4,-8],[0,-4],
  [-4,0],[-8,4],[-12,6],[-14,10],[-18,14],[-18,16],
];

// Ásia (sem o Japão/ilhas)
const AS: [number,number][] = [
  [26,42],[28,44],[30,48],[32,48],[36,46],[40,44],[44,42],[48,40],[52,38],[54,40],
  [56,44],[60,46],[62,50],[66,52],[70,54],[74,56],[78,58],[82,58],[86,56],[90,58],
  [94,58],[100,60],[106,62],[110,64],[114,62],[120,60],[124,58],[130,56],[136,52],
  [140,48],[140,44],[136,42],[134,38],[130,34],[128,30],[124,24],[120,22],[116,22],
  [112,24],[108,24],[104,24],[100,4],[100,2],[102,0],[104,1],[106,2],[108,2],
  [110,2],[112,0],[114,-2],[110,-4],[108,-6],[110,-8],[112,-8],[116,-8],[120,-10],
  [118,-8],[120,-6],[114,-4],[110,0],[108,2],[106,6],[104,10],[100,14],[98,18],
  [96,22],[92,24],[90,22],[88,24],[86,26],[84,28],[82,30],[80,32],[78,34],[76,36],
  [74,38],[72,36],[68,32],[64,28],[62,22],[60,22],[58,22],[56,24],[54,24],[52,28],
  [50,28],[48,32],[46,36],[42,38],[40,40],[36,42],[32,42],[28,42],[26,42],
  // Arábia
  [36,26],[38,28],[40,28],[42,20],[44,18],[50,14],[54,16],[56,20],[54,22],
  [52,24],[48,22],[46,20],[44,24],[40,24],[36,26],
  // Índia
  [68,22],[72,22],[76,20],[80,18],[80,14],[78,10],[76,8],[80,8],[82,10],
  [84,14],[86,18],[88,22],[84,26],[80,28],[76,28],[72,24],[68,22],
];

// Sibéria/Rússia norte (anel separado para não fechar mal com a Ásia principal)
const RU: [number,number][] = [
  [30,68],[40,70],[50,70],[60,72],[70,74],[80,74],[90,74],[100,74],[110,72],
  [120,70],[130,68],[140,66],[150,60],[156,56],[158,52],[154,48],[148,46],
  [140,48],[134,46],[130,42],[124,40],[120,38],[116,38],[110,40],[104,40],
  [100,50],[96,54],[90,56],[84,56],[78,56],[72,54],[66,52],[60,56],[56,58],
  [50,62],[44,64],[40,66],[36,66],[32,68],[30,68],
];

// Japão (simplificado — 2 ilhas principais)
const JP: [number,number][] = [
  [130,32],[131,34],[132,36],[134,38],[136,40],[138,42],[140,44],[141,42],
  [140,40],[139,36],[138,34],[136,32],[134,32],[132,32],[130,32],
];

// Austrália
const AU: [number,number][] = [
  [114,-22],[116,-20],[118,-18],[122,-16],[126,-14],[130,-12],[134,-12],
  [136,-12],[140,-14],[142,-12],[144,-14],[146,-16],[148,-18],[150,-22],
  [152,-24],[152,-26],[150,-28],[148,-30],[146,-32],[144,-36],[142,-38],
  [140,-38],[138,-36],[136,-34],[132,-32],[130,-32],[126,-34],[122,-34],
  [118,-30],[116,-26],[114,-24],[114,-22],
];

// Nova Zelândia (ilha norte + sul simplificadas)
const NZ: [number,number][] = [
  [172,-34],[174,-36],[176,-38],[178,-38],[178,-40],[176,-42],[174,-44],
  [170,-44],[168,-44],[168,-42],[170,-40],[172,-38],[172,-36],[172,-34],
];

// ─── Converte lat/lon → ponto SVG (viewBox 1000x500) ────────────────────────
const W = 1000;
const H = 500;
function lonlatToSVG(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

// Gera lista de pontos a partir de um polígono com passo de interpolação
function polyDots(ring: [number,number][], step = 1.5): Array<{x:number,y:number}> {
  const out: Array<{x:number,y:number}> = [];
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const lon = x0 + dx * t;
      const lat = y0 + dy * t;
      const [px, py] = lonlatToSVG(lon, lat);
      out.push({ x: px, y: py });
    }
  }
  return out;
}

// Preenche o interior de um polígono com pontos em grade lat/lon (passo 1.5°)
function fillPoly(ring: [number,number][], lonStep = 1.5, latStep = 1.2): Array<{x:number,y:number}> {
  // Bounding box
  const lons = ring.map(p => p[0]);
  const lats = ring.map(p => p[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);

  function inPoly(lon: number, lat: number): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  const out: Array<{x:number,y:number}> = [];
  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lon = minLon; lon <= maxLon; lon += lonStep) {
      if (inPoly(lon, lat)) {
        const [px, py] = lonlatToSVG(lon, lat);
        out.push({ x: px, y: py });
      }
    }
  }
  return out;
}

// Combina contorno + preenchimento
function continentDots(ring: [number,number][]): Array<{x:number,y:number}> {
  return [...polyDots(ring, 1.5), ...fillPoly(ring, 2, 1.5)];
}

const Dots = React.memo(function Dots() {
  const all = useMemo(() => [
    ...continentDots(NA),
    ...continentDots(CA),
    ...continentDots(SA),
    ...continentDots(EU),
    ...continentDots(AF),
    ...continentDots(AS),
    ...continentDots(RU),
    ...continentDots(JP),
    ...continentDots(AU),
    ...continentDots(NZ),
  ], []);

  return (
    <g>
      {all.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={2} fill="rgba(120,130,160,0.45)" />
      ))}
    </g>
  );
});

// ─── Barras de sessão dentro do SVG ─────────────────────────────────────────
interface SessionBarProps {
  id: string;
  city: { lat: number; lon: number; label: string };
  color: string;
  open: boolean;
  label: string;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

function SessionBar({ id, city, color, open, label, Icon }: SessionBarProps) {
  const [cx, cy] = lonlatToSVG(city.lon, city.lat);
  const bw = 108;
  const bh = 22;
  const x = Math.min(W - bw - 2, Math.max(2, cx - bw / 2));
  const y = Math.min(H - bh - 2, Math.max(2, cy - bh / 2));
  const opacity = open ? 1 : 0.5;

  return (
    <g key={id} opacity={opacity}>
      {/* Glow halo quando aberto */}
      {open && (
        <ellipse cx={cx} cy={cy} rx={bw / 2 + 10} ry={bh / 2 + 10}
          fill={color} fillOpacity={0.12}
          style={{ filter: 'blur(6px)' }} />
      )}
      {/* Fundo glassmorphism */}
      <rect x={x} y={y} width={bw} height={bh} rx={11}
        fill={open ? `${color}22` : 'rgba(20,24,36,0.55)'}
        stroke={color}
        strokeWidth={open ? 1.2 : 0.6}
        strokeOpacity={open ? 0.9 : 0.35}
        style={{ backdropFilter: 'blur(4px)' }}
      />
      {/* Ponto de status */}
      <circle cx={x + 11} cy={y + bh / 2} r={3.5}
        fill={open ? color : 'rgba(120,130,160,0.4)'}
        fillOpacity={open ? 1 : 0.6}
      />
      {open && (
        <circle cx={x + 11} cy={y + bh / 2} r={5.5}
          fill={color} fillOpacity={0.25}
          style={{ filter: 'blur(2px)' }}
        />
      )}
      {/* Nome */}
      <text
        x={x + 21} y={y + bh / 2 + 4.5}
        fontSize={11}
        fontWeight={open ? '700' : '500'}
        fill={open ? '#ffffff' : 'rgba(161,167,179,0.85)'}
        fontFamily="Inter, system-ui, sans-serif"
        letterSpacing={0.2}
      >
        {label}
      </text>
    </g>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function WorldSessionMap({ trades = [], sessions, zone = 'local', now }: Props) {
  const ref = now ?? new Date();
  const status = useMemo(() => marketStatus(ref), [ref]);
  const offsetHours = -ref.getTimezoneOffset() / 60;
  const delta = zone === 'utc' ? -offsetHours : 0;
  const utcH = ref.getUTCHours() + ref.getUTCMinutes() / 60;
  const nowH = zone === 'utc' ? utcH : ref.getHours() + ref.getMinutes() / 60;
  const nowPct = (nowH / 24) * 100;
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

      {/* ── Mapa + barras de sessão (SVG unificado) ── */}
      <div
        className="wsm-mapwrap"
        role="img"
        aria-label="Mapa-múndi das sessões de mercado"
      >
        <svg
          className="wsm-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <Dots />

          {/* Barras de sessão */}
          {status.map((m) => {
            const city = CITY[m.id];
            if (!city) return null;
            const s = sessionById.get(m.id);
            const i = s ? s.i : 0;
            const color = SESSION_COLORS[i % SESSION_COLORS.length];
            const Icon = sessionIconFor(m.id);
            return (
              <SessionBar
                key={m.id}
                id={m.id}
                city={city}
                color={color}
                open={m.open}
                label={city.label}
                Icon={Icon}
              />
            );
          })}

          {/* Linha "agora" no mapa */}
          <line
            x1={(nowH / 24) * W} y1={0}
            x2={(nowH / 24) * W} y2={H}
            stroke="var(--red, #e74c3c)"
            strokeWidth={1.5}
            strokeOpacity={0.9}
            style={{ filter: 'drop-shadow(0 0 4px var(--red, #e74c3c))' }}
          />

          {/* Pílula do relógio no topo da linha */}
          {(() => {
            const lx = (nowH / 24) * W;
            const tw = 76, th = 18;
            const tx = Math.min(W - tw - 2, Math.max(2, lx - tw / 2));
            return (
              <g>
                <rect x={tx} y={4} width={tw} height={th} rx={9}
                  fill="var(--red, #e74c3c)" />
                <text
                  x={tx + tw / 2} y={4 + th / 2 + 4.5}
                  fontSize={10}
                  fontWeight="700"
                  fill="#fff"
                  textAnchor="middle"
                  fontFamily="Inter, system-ui, sans-serif"
                  fontVariantNumeric="tabular-nums"
                >
                  {nowLabel} {zone === 'utc' ? 'UTC' : 'local'}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ── Volume por hora + linha do agora ── */}
      <div className="wsm-vol-section">
        <div className="wsm-vol-header">
          <span className="wsm-vol-title">Volume por hora</span>
          <span className="wsm-vol-sub">{totalTrades} trade(s) por hora de abertura</span>
        </div>
        <div className="wsm-vol-wrap">
          <div className="wsm-vol-plot">
            {/* Faixas coloridas das sessões ao fundo */}
            {sessions.map((def, i) =>
              sessionDisplaySegments(def, delta).map((sg) => (
                <span
                  key={`${def.id}-${sg.start}`}
                  className="wsm-vol-band"
                  style={{
                    left: pct(sg.start),
                    width: pct(sg.end - sg.start),
                    background: `${SESSION_COLORS[i % SESSION_COLORS.length]}28`,
                    borderTop: `1px solid ${SESSION_COLORS[i % SESSION_COLORS.length]}55`,
                  }}
                />
              ))
            )}
            {/* Barras de trade por hora */}
            {hours.map((n, h) => {
              const hitIdx = sessions.findIndex((d) => sessionContains(d, h));
              const color = hitIdx >= 0 ? SESSION_COLORS[hitIdx % SESSION_COLORS.length] : 'rgba(255,255,255,0.25)';
              return (
                <span
                  key={h}
                  className="wsm-vol-bar"
                  style={{
                    left: pct(h),
                    width: `calc(${100 / 24}% - 1px)`,
                    height: n ? `${Math.max(8, (n / hourMax) * 100)}%` : '0',
                    background: color,
                    boxShadow: n ? `0 0 4px ${color}66` : 'none',
                  }}
                  title={`${h}h · ${n} trade(s)`}
                />
              );
            })}
            {/* Linha do agora no volume */}
            <span
              className="wsm-vol-now"
              style={{ left: `${nowPct}%` }}
            />
          </div>
          <div className="wsm-axis">
            {HOUR_LABELS.map((h) => (
              <span key={h} className="wsm-hour" style={{ left: pct(h) }}>{h}h</span>
            ))}
          </div>
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
        Barras coloridas = cada mercado na sua posição geográfica real. Linha vermelha = agora ({zone === 'utc' ? 'UTC' : 'horário local'}).
      </p>
    </div>
  );
}

// ─── CSS injetado ─────────────────────────────────────────────────────────────
const WSM_CSS = `
.wsm-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
  container-type: inline-size;
}

/* ── Mapa ── */
.wsm-mapwrap {
  position: relative;
  width: 100%;
  background: rgba(11, 15, 28, 0.95);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
}
.wsm-svg {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 2 / 1;
}

/* ── Histograma de volume ── */
.wsm-vol-section { display: flex; flex-direction: column; gap: 6px; }
.wsm-vol-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.wsm-vol-title { font-size: 12px; font-weight: 700; color: var(--text, #e7eaf0); }
.wsm-vol-sub { font-size: 11px; font-weight: 400; color: var(--muted, #a1a7b3); }
.wsm-vol-wrap {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  overflow: hidden;
  padding-bottom: 0;
}
.wsm-vol-plot {
  position: relative;
  height: 72px;
  overflow: hidden;
}
.wsm-vol-band {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
}
.wsm-vol-bar {
  position: absolute;
  bottom: 0;
  border-radius: 2px 2px 0 0;
  transition: height 0.3s ease;
}
.wsm-vol-now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--red, #e74c3c);
  box-shadow: 0 0 8px var(--red, #e74c3c);
  transform: translateX(-50%);
  z-index: 4;
  pointer-events: none;
}
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

@container (max-width: 460px) {
  .wsm-markets { grid-template-columns: 1fr; }
  .wsm-vol-plot { height: 88px; }
}
@media (max-width: 420px) {
  .wsm-markets { grid-template-columns: 1fr; }
  .wsm-vol-plot { height: 88px; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('wsm-styles')) {
  const style = document.createElement('style');
  style.id = 'wsm-styles';
  style.textContent = WSM_CSS;
  document.head.appendChild(style);
}
