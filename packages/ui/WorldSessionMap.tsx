// WorldSessionMap — "session map" estilo fxblue + qorix, na nossa identidade:
//  (1) mapa-múndi PONTILHADO REAL: máscara de terra (Natural Earth 50m, domínio público)
//      rasterizada numa grade hexagonal de pontos e embutida como bitmap base64
//      (sem GeoJSON externo, sem fetch). Duas densidades: fina (desktop) e grossa
//      (container < 600px) — a fina vira "névoa" quando o mapa encolhe no celular.
//  (2) Etiquetas translúcidas por mercado em HTML (não em SVG): o texto fica SEMPRE
//      em 11px, não encolhe junto com o viewBox no celular. Ponto = posição da cidade.
//  (3) Linha "agora" atravessando mapa + histograma de volume, com relógio no topo
//      preso à linha. Mapa e histograma vivem no mesmo card, com a mesma largura,
//      então a coluna de hora fica alinhada 1:1 por construção.
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

// Coordenadas das cidades (lon, lat). `dy` = deslocamento vertical (px) da etiqueta em
// relação ao ponto da cidade (default −16 = acima). Londres e Nova York ficam a ~7°
// de latitude uma da outra: no celular as etiquetas se sobreporiam sem esse desvio.
const CITY: Record<string, { lat: number; lon: number; label: string; dy?: number }> = {
  sydney: { lat: -33.9, lon: 151.2, label: 'Sydney' },
  tokyo: { lat: 35.7, lon: 139.7, label: 'Tóquio' },
  london: { lat: 51.5, lon: -0.1, label: 'Londres' },
  newyork: { lat: 40.7, lon: -74.0, label: 'Nova York', dy: 16 },
};

const HOUR_LABELS = [0, 6, 12, 18, 24];

function fmtMin(min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ─── MAPA-MÚNDI PONTILHADO ───────────────────────────────────────────────────
// Projeção equiretangular recortada de 84°N a 60°S (sem Ártico profundo nem
// Antártida — mesmo enquadramento dos mapas de sessão do fxblue/qorix).
// x = (lon+180)/360 * W ; y = (LAT_TOP-lat)/(LAT_TOP-LAT_BOT) * H
// Proporção W:H = 360:144 = 5:2 (igual ao aspect-ratio do CSS → nada é esticado).
const W = 1000;
const H = 400;
const LAT_TOP = 84;
const LAT_BOT = -60;

function lonlatToSVG(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * W, ((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * H];
}

// Grade hexagonal (linhas ímpares deslocadas meia coluna). 1 bit por célula, MSB
// primeiro, linha a linha; bit = 1 → célula com terra suficiente (Natural Earth 50m).
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
// Diâmetro do ponto ≈ 55% do passo horizontal (fina 4,17 → 2,3 ; grossa 8,33 → 4,4).
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

// ─── Etiqueta de mercado (HTML sobre o mapa) ────────────────────────────────
interface CityMarkerProps {
  city: { lat: number; lon: number; label: string; dy?: number };
  color: string;
  open: boolean;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

function CityMarker({ city, color, open, Icon }: CityMarkerProps) {
  const [cx, cy] = lonlatToSVG(city.lon, city.lat);
  const xPct = (cx / W) * 100;
  const yPct = (cy / H) * 100;
  // Meia-largura estimada da etiqueta (px) — só p/ não vazar da borda do mapa.
  const half = Math.ceil((city.label.length * 6.6 + 54) / 2);
  const dy = city.dy ?? -16;
  const vars = {
    '--c': color,
    '--c-bg': `${color}24`,
    '--c-bd': `${color}e6`,
    '--c-dim': `${color}59`,
    '--c-glow': `${color}66`,
  } as React.CSSProperties;

  return (
    <>
      <span
        className={`wsm-pin${open ? ' is-open' : ''}`}
        style={{ left: `${xPct}%`, top: `${yPct}%`, ...vars }}
        aria-hidden="true"
      />
      <div
        className={`wsm-city${open ? ' is-open' : ''}`}
        style={{
          left: `clamp(${half}px, ${xPct}%, calc(100% - ${half}px))`,
          top: `clamp(14px, calc(${yPct}% + ${dy}px), calc(100% - 14px))`,
          ...vars,
        }}
        title={`${city.label} — ${open ? 'aberto' : 'fechado'}`}
      >
        <span className="wsm-city-icon"><Icon size={14} /></span>
        <span className="wsm-city-name">{city.label}</span>
        <span className="wsm-city-dot" aria-hidden="true" />
        <span className="wsm-sr">{open ? ', aberto' : ', fechado'}</span>
      </div>
    </>
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
  const zoneTag = zone === 'utc' ? 'UTC' : 'local';

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

      {/* ── Card único: relógio + mapa + volume (mesma largura → hora alinhada 1:1) ── */}
      <div className="wsm-stage">

        {/* Cabeçalho: relógio preso à linha "agora" */}
        <div className="wsm-clockbar">
          <span
            className="wsm-clock"
            style={{ left: `clamp(48px, ${nowPct}%, calc(100% - 48px))` }}
            aria-label={`Agora: ${nowLabel} ${zoneTag}`}
          >
            {nowLabel} {zoneTag}
          </span>
        </div>

        {/* Mapa (proporção fixa 5:2) */}
        <div
          className="wsm-map"
          role="group"
          aria-label="Mapa-múndi das sessões de mercado"
        >
          <svg
            className="wsm-svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            focusable="false"
          >
            <Dots />
          </svg>

          {/* Linha "agora" no mapa */}
          <span className="wsm-now" style={{ left: `${nowPct}%` }} aria-hidden="true" />

          {/* Etiquetas de mercado */}
          {status.map((m) => {
            const city = CITY[m.id];
            if (!city) return null;
            const s = sessionById.get(m.id);
            const i = s ? s.i : 0;
            const color = SESSION_COLORS[i % SESSION_COLORS.length];
            const Icon = sessionIconFor(m.id);
            return (
              <CityMarker
                key={m.id}
                city={city}
                color={color}
                open={m.open}
                Icon={Icon}
              />
            );
          })}
        </div>

        {/* Volume por hora + linha do agora */}
        <div className="wsm-vol-header">
          <span className="wsm-vol-title">Volume por hora</span>
          <span className="wsm-vol-sub">{totalTrades} trade(s) por hora de abertura</span>
        </div>
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
                aria-hidden="true"
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
          {/* Linha do agora no volume (mesmo left% da linha do mapa) */}
          <span className="wsm-now" style={{ left: `${nowPct}%` }} aria-hidden="true" />
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
        Etiquetas coloridas = cada mercado (ponto = posição real da cidade). Linha vermelha = agora ({zone === 'utc' ? 'UTC' : 'horário local'}).
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

/* ── Card único (relógio + mapa + volume) ── */
.wsm-stage {
  position: relative;
  width: 100%;
  background: rgba(11, 15, 28, 0.95);
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
}

/* ── Mapa ── */
.wsm-map {
  position: relative;
  width: 100%;
  aspect-ratio: 5 / 2;
}
.wsm-svg {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.wsm-land {
  fill: none;
  stroke: var(--muted, #a1a7b3);
  stroke-linecap: round;
}
.wsm-land-fine { stroke-opacity: 0.42; }
.wsm-land-coarse { stroke-opacity: 0.5; display: none; }

/* Linha "agora" (mapa e volume) */
.wsm-now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--red, #e74c3c);
  box-shadow: 0 0 8px var(--red, #e74c3c);
  z-index: 4;
  pointer-events: none;
}

/* ── Etiquetas de mercado ── */
.wsm-pin {
  position: absolute;
  width: 7px;
  height: 7px;
  margin: -3.5px 0 0 -3.5px;
  border-radius: 50%;
  background: var(--c-dim);
  z-index: 2;
  pointer-events: none;
}
.wsm-pin.is-open {
  background: var(--c);
  box-shadow: 0 0 0 3px var(--c-bg), 0 0 10px var(--c-glow);
}
.wsm-city {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px 0 8px;
  border-radius: 12px;
  border: 1px solid var(--c-dim);
  background: rgba(20, 24, 36, 0.6);
  color: var(--muted, #a1a7b3);
  font-family: Inter, system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0.78;
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  z-index: 3;
}
.wsm-city.is-open {
  opacity: 1;
  font-weight: 700;
  color: var(--text, #e7eaf0);
  border-color: var(--c-bd);
  background: var(--c-bg);
  box-shadow: 0 0 14px var(--c-glow);
}
.wsm-city-icon { display: inline-flex; color: var(--c); }
.wsm-city-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-dim);
}
.wsm-city.is-open .wsm-city-dot {
  background: var(--c);
  box-shadow: 0 0 6px var(--c);
}
.wsm-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ── Histograma de volume ── */
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
  height: 72px;
  overflow: hidden;
  background: rgba(255,255,255,0.02);
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

/* Celular / container estreito: pontos mais grossos (senão viram névoa) */
@container (max-width: 600px) {
  .wsm-land-fine { display: none; }
  .wsm-land-coarse { display: inline; }
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