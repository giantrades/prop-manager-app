// SessionTradeMap — mapa de um dia (0–24h) com as SESSÕES de mercado ao fundo e os TRADES
// desenhados da ABERTURA ao FECHAMENTO (bolinha → barra → seta). Cada trade é um objeto só,
// então nada é contado duas vezes; a cor = direção (long verde / short vermelho). Apresentação
// pura: só usa `entryDatetime`/`exitDatetime` e `tradeNetPnl`.
import React, { useEffect, useMemo, useState } from 'react';
import type { Trade, SessionDef } from '@apps/lib/db';
import { parseDate, tradeNetPnl } from '@apps/lib/db';
import { sessionDisplaySegments, pct } from './sessionTime';
import { fmtMoney } from './currency';

interface Props {
  trades: Trade[];
  sessions: SessionDef[];
  zone?: 'local' | 'utc';
  currency?: string;
}

const HOUR_LABELS = [0, 6, 12, 18, 24];
const ROW_H = 18;

const SESSION_FILLS = [
  'rgba(124, 92, 255, 0.16)',
  'rgba(52, 152, 219, 0.16)',
  'rgba(46, 204, 113, 0.15)',
  'rgba(241, 196, 15, 0.15)',
  'rgba(231, 76, 60, 0.15)',
];
const SESSION_DOTS = ['#7c5cff', '#3498db', '#2ecc71', '#f1c40f', '#e74c3c'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function dayKeyOf(iso: string, zone: 'local' | 'utc'): string {
  const d = parseDate(iso);
  const y = zone === 'utc' ? d.getUTCFullYear() : d.getFullYear();
  const m = (zone === 'utc' ? d.getUTCMonth() : d.getMonth()) + 1;
  const day = zone === 'utc' ? d.getUTCDate() : d.getDate();
  return `${y}-${pad2(m)}-${pad2(day)}`;
}
function dayStartMs(key: string, zone: 'local' | 'utc'): number {
  const [y, m, d] = key.split('-').map(Number);
  return zone === 'utc' ? Date.UTC(y, m - 1, d) : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function fmtHM(h: number): string {
  const total = Math.round((((h % 24) + 24) % 24) * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export default function SessionTradeMap({ trades, sessions, zone = 'local', currency = 'USD' }: Props) {
  const now = new Date();
  const zoneLabel = zone === 'utc' ? 'UTC' : 'local';
  const offsetHours = -now.getTimezoneOffset() / 60;
  const delta = zone === 'utc' ? -offsetHours : 0;
  const nowH = zone === 'utc'
    ? now.getUTCHours() + now.getUTCMinutes() / 60
    : now.getHours() + now.getMinutes() / 60;

  // Dias disponíveis (da abertura e do fechamento).
  const days = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) {
      if (t.entryDatetime) set.add(dayKeyOf(t.entryDatetime, zone));
      if (t.exitDatetime) set.add(dayKeyOf(t.exitDatetime, zone));
    }
    return [...set].sort();
  }, [trades, zone]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedDay || !days.includes(selectedDay)) setSelectedDay(days[days.length - 1] ?? null);
  }, [days, selectedDay]);

  const isToday = selectedDay === dayKeyOf(now.toISOString(), zone);

  const bars = useMemo(() => {
    if (!selectedDay) return [];
    const ds = dayStartMs(selectedDay, zone);
    const out: Array<{ t: Trade; start: number; end: number; open: boolean }> = [];
    for (const t of trades) {
      if (!t.entryDatetime) continue;
      const e0 = (parseDate(t.entryDatetime).getTime() - ds) / 3600000;
      const hasExit = !!t.exitDatetime;
      const x0 = hasExit ? (parseDate(t.exitDatetime as string).getTime() - ds) / 3600000 : NaN;
      const start = e0;
      const end = hasExit ? x0 : (dayKeyOf(t.entryDatetime, zone) === dayKeyOf(now.toISOString(), zone) ? nowH : 24);
      if (end <= 0 || start >= 24) continue;
      out.push({
        t,
        start: Math.max(0, start),
        end: Math.min(24, Math.max(end, start + 0.1)),
        open: !hasExit,
      });
    }
    out.sort((a, b) => a.start - b.start);
    return out;
  }, [trades, selectedDay, zone, nowH]);

  // Empacota em faixas: primeiro espaço livre sem sobrepor no tempo.
  const laid = useMemo(() => {
    const laneEnds: number[] = [];
    return bars.map((it) => {
      let lane = laneEnds.findIndex((e) => e <= it.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = it.end;
      return { ...it, lane };
    });
  }, [bars]);
  const laneCount = laid.reduce((m, x) => Math.max(m, x.lane + 1), 0);
  const plotH = Math.max(ROW_H, laneCount * ROW_H);

  const sessionSegs = useMemo(
    () => sessions.map((def, i) => ({ def, i, segs: sessionDisplaySegments(def, delta) })),
    [sessions, delta],
  );

  const goDay = (n: number) => {
    const base = selectedDay ?? days[days.length - 1];
    if (base) setSelectedDay(addDaysKey(base, n));
  };

  return (
    <div className="stm-root">
      <div className="stm-head">
        <div className="stm-legend">
          {sessionSegs.map(({ def, i }) => (
            <span key={def.id} className="stm-chip">
              <i style={{ background: SESSION_DOTS[i % SESSION_DOTS.length] }} />{def.label}
            </span>
          ))}
          <span className="stm-chip stm-chip-dir"><i className="stm-md long">▲</i>long<i className="stm-md short">▼</i>short</span>
        </div>
        <div className="stm-day">
          <button className="stm-btn" onClick={() => goDay(-1)} disabled={!selectedDay} aria-label="Dia anterior">◀</button>
          <input
            className="stm-date"
            type="date"
            value={selectedDay ?? ''}
            onChange={(e) => e.target.value && setSelectedDay(e.target.value)}
            aria-label="Dia do mapa"
          />
          <button className="stm-btn" onClick={() => goDay(1)} disabled={!selectedDay} aria-label="Próximo dia">▶</button>
        </div>
      </div>

      <div className="stm-axis">
        {HOUR_LABELS.map((h) => (
          <span key={h} className="stm-hour" style={{ left: pct(h) }}>{h}h</span>
        ))}
      </div>

      <div className="stm-plot" style={{ height: `${plotH}px` }}>
        {sessionSegs.map(({ def, i, segs }) => (
          <React.Fragment key={def.id}>
            {segs.map((s) => (
              <span
                key={`${def.id}-${s.start}`}
                className="stm-band"
                style={{ left: pct(s.start), width: pct(s.end - s.start), background: SESSION_FILLS[i % SESSION_FILLS.length] }}
                aria-hidden="true"
              />
            ))}
          </React.Fragment>
        ))}
        {[6, 12, 18].map((h) => (
          <span key={h} className="stm-grid" style={{ left: pct(h) }} aria-hidden="true" />
        ))}
        {isToday && <span className="stm-now" style={{ left: `${(nowH / 24) * 100}%` }} aria-hidden="true" />}

        {laid.map((b) => {
          const pnl = tradeNetPnl(b.t);
          const long = b.t.direction !== 'short';
          const w = Math.max(0.4, b.end - b.start);
          const title = `${b.t.symbol} ${long ? 'long' : 'short'} • ${fmtHM(b.start)} → ${b.open ? 'aberto' : fmtHM(b.end)} ${zoneLabel} • ${fmtMoney(pnl, currency)}${b.t.resultR != null ? ` • ${Number(b.t.resultR).toFixed(2)}R` : ''}`;
          return (
            <span
              key={b.t.id}
              className={`stm-bar${b.open ? ' stm-bar-open' : ''} ${long ? 'stm-long' : 'stm-short'}`}
              style={{ left: pct(b.start), width: pct(w), top: `${b.lane * ROW_H}px` }}
              title={title}
              aria-label={title}
            >
              <i className="stm-dot" />
              <em className="stm-sym">{b.t.symbol}</em>
              {!b.open && <i className="stm-arrow" />}
            </span>
          );
        })}

        {laid.length === 0 && <div className="stm-empty">Sem trades neste dia.</div>}
      </div>

      <p className="stm-hint">
        Período exibido: 00:00–24:00 ({zoneLabel}){isToday ? ' • linha = agora' : ''}
      </p>
    </div>
  );
}

const STM_CSS = `
.stm-root { display: flex; flex-direction: column; gap: 8px; }
.stm-head { display: flex; flex-direction: column; gap: 8px; }
.stm-legend { display: flex; flex-wrap: wrap; gap: 6px; }
.stm-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text, #e7eaf0); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 2px 8px; }
.stm-chip > i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.stm-chip-dir { gap: 3px; }
.stm-md { font-style: normal; font-size: 10px; }
.stm-md.long { color: var(--green, #2ecc71); }
.stm-md.short { color: var(--red, #e74c3c); }
.stm-day { display: flex; align-items: center; gap: 6px; }
.stm-btn { min-height: 34px; min-width: 34px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); cursor: pointer; }
.stm-btn:disabled { opacity: 0.4; }
.stm-date { flex: 1; min-height: 34px; background: #111623; border: 1px solid #273044; border-radius: 8px; padding: 4px 8px; color: var(--text, #e7eaf0); font-size: 12px; font-family: inherit; }
.stm-axis { position: relative; height: 15px; margin: 0 2px; }
.stm-hour { position: absolute; top: 0; transform: translateX(-50%); font-size: 10px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.stm-hour:first-child { transform: translateX(0); }
.stm-hour:last-child { transform: translateX(-100%); }
.stm-plot { position: relative; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); overflow: hidden; }
.stm-band { position: absolute; top: 0; bottom: 0; }
.stm-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.06); }
.stm-now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--brand, #7c5cff); box-shadow: 0 0 6px var(--brand, #7c5cff); z-index: 3; }
.stm-bar { position: absolute; height: 14px; border-radius: 7px; border: 1px solid transparent; display: flex; align-items: center; overflow: hidden; z-index: 2; }
.stm-long { background: rgba(46,204,113,0.45); border-color: rgba(46,204,113,0.9); }
.stm-short { background: rgba(231,76,60,0.45); border-color: rgba(231,76,60,0.9); }
.stm-bar-open { background: transparent !important; border-style: dashed !important; }
.stm-dot { position: absolute; left: 1px; top: 50%; width: 7px; height: 7px; margin-top: -3.5px; border-radius: 50%; background: #fff; border: 2px solid currentColor; box-sizing: border-box; }
.stm-long .stm-dot { color: var(--green, #2ecc71); }
.stm-short .stm-dot { color: var(--red, #e74c3c); }
.stm-arrow { position: absolute; right: 0; top: 50%; margin-top: -4px; width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 6px solid currentColor; }
.stm-long .stm-arrow { color: var(--green, #2ecc71); }
.stm-short .stm-arrow { color: var(--red, #e74c3c); }
.stm-sym { font-style: normal; font-size: 10px; font-weight: 700; color: #fff; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.stm-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--muted, #a1a7b3); font-size: 12px; }
.stm-hint { margin: 0; font-size: 10px; color: var(--muted, #a1a7b3); }
`;
if (typeof document !== 'undefined' && !document.getElementById('stm-styles')) {
  const style = document.createElement('style');
  style.id = 'stm-styles';
  style.textContent = STM_CSS;
  document.head.appendChild(style);
}
