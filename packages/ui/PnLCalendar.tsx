// J1 — PnLCalendar (engine-driven). Grade mensal de PnL por dia.
// Motor: `calendarPnl()` (packages/lib/db/journalAnalytics.ts). A UI nunca calcula.
// Mobile-first 360px (células compactas, sem scroll horizontal).
//
// Fonte: DOCS/10_MODULES/00-trading-journal.md (J1).

import React, { useMemo, useState } from 'react';
import { calendarPnl, MIN_SAMPLE } from '@apps/lib/db';

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function fmtMoney(v, cur = 'R$') {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v < 0 ? '-' : ''}${cur}${Math.abs(v).toFixed(2)}`;
}

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {string} [props.currency]
 * @param {(dateKey:string|null)=>void} [props.onSelectDay] — A4: drill-down (null = fechar)
 * @param {string} [props.selectedDay]
 * @param {boolean} [props.loading]
 */
export default function PnLCalendar({ trades = [], currency = 'R$', onSelectDay, selectedDay, loading = false }) {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const data = useMemo(() => calendarPnl(trades, ym.year, ym.month), [trades, ym.year, ym.month]);
  const byDate = useMemo(() => new Map(data.days.map((d) => [d.date, d])), [data]);

  const firstDow = new Date(ym.year, ym.month - 1, 1).getDay();
  const daysInMonth = new Date(ym.year, ym.month, 0).getDate();
  const today = todayKey();

  if (loading) {
    return (
      <div className="pnlcal-root pnlcal-loading" role="status" aria-live="polite">
        <div className="pnlcal-skeleton" />
        <div className="pnlcal-skeleton" />
        <span className="pnlcal-screen-reader">Carregando calendário…</span>
      </div>
    );
  }

  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, info: byDate.get(key) ?? null, isToday: key === today, key });
  }

  return (
    <div className="pnlcal-root" aria-label={`Calendário de PnL — ${MONTHS_PT[ym.month - 1]} de ${ym.year}`}>
      <div className="pnlcal-head">
        <div className="pnlcal-title">
          {MONTHS_PT[ym.month - 1]} <span className="pnlcal-year">{ym.year}</span>
        </div>
        <div className="pnlcal-nav">
          <button className="pnlcal-btn" aria-label="Mês anterior" onClick={() => setYm((s) => shiftMonth(s.year, s.month, -1))}>‹</button>
          <button className="pnlcal-btn" aria-label="Mês atual" onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() + 1 })}>Hoje</button>
          <button className="pnlcal-btn" aria-label="Próximo mês" onClick={() => setYm((s) => shiftMonth(s.year, s.month, 1))}>›</button>
        </div>
      </div>

      <div className="pnlcal-grid" role="grid" aria-label="Dias do mês">
        {DOW.map((d) => (
          <div key={d} className="pnlcal-dow">{d}</div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`pad-${i}`} className="pnlcal-cell pnlcal-pad" />;
          const { day, info, isToday } = c;
          const selected = selectedDay === c.key;
          const cls = `pnlcal-cell${info ? (info.pnl > 0 ? ' pnlcal-pos' : info.pnl < 0 ? ' pnlcal-neg' : ' pnlcal-flat') : ''}${isToday ? ' pnlcal-today' : ''}${selected ? ' pnlcal-selected' : ''}`;
          const tip = info ? `${info.trades} trades • ${info.wins}W/${info.losses}L • ${fmtMoney(info.pnl, currency)}` : 'Sem trades';
          const inner = (
            <>
              <span className="pnlcal-day">{day}</span>
              {info && <span className="pnlcal-val">{fmtMoney(info.pnl, currency)}</span>}
            </>
          );
          // A4 — dias com trades viram botões quando há handler de drill-down.
          if (onSelectDay && info) {
            return (
              <button
                key={c.key}
                type="button"
                className={cls}
                title={`${tip} — ver trades`}
                aria-label={`Ver trades do dia ${c.key}`}
                aria-pressed={selected}
                onClick={() => onSelectDay(selected ? null : c.key)}
              >
                {inner}
              </button>
            );
          }
          return (
            <div key={c.key} className={cls} title={tip}>
              {inner}
            </div>
          );
        })}
      </div>

      <div className="pnlcal-summary" aria-live="polite">
        <div className="pnlcal-sum-item">
          <span className="pnlcal-sum-label">Mês</span>
          <span className={`pnlcal-sum-value ${data.monthPnl >= 0 ? 'pnlcal-pos-t' : 'pnlcal-neg-t'}`}>
            {fmtMoney(data.monthPnl, currency)}
          </span>
        </div>
        <div className="pnlcal-sum-item">
          <span className="pnlcal-sum-label">Trades</span>
          <span className="pnlcal-sum-value">{data.monthTrades}</span>
        </div>
        <div className="pnlcal-sum-item">
          <span className="pnlcal-sum-label">Melhor dia</span>
          <span className="pnlcal-sum-value">{data.bestDay ? `${data.bestDay.date.slice(8, 10)} • ${fmtMoney(data.bestDay.pnl, currency)}` : '—'}</span>
        </div>
        <div className="pnlcal-sum-item">
          <span className="pnlcal-sum-label">Pior dia</span>
          <span className="pnlcal-sum-value">{data.worstDay ? `${data.worstDay.date.slice(8, 10)} • ${fmtMoney(data.worstDay.pnl, currency)}` : '—'}</span>
        </div>
      </div>
      {data.monthTrades === 0 ? (
        <div className="pnlcal-empty" role="status">Sem trades neste mês.</div>
      ) : data.monthTrades < MIN_SAMPLE ? (
        <div className="pnlcal-note" role="note">Amostra pequena no mês ({data.monthTrades} trades).</div>
      ) : null}
    </div>
  );
}

const PNLCAL_CSS = `
.pnlcal-root { display: flex; flex-direction: column; gap: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.pnlcal-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.pnlcal-loading { gap: 8px; }
.pnlcal-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: pnlcal-pulse 1.4s ease-in-out infinite; }
.pnlcal-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.pnlcal-title { font-size: 14px; font-weight: 700; }
.pnlcal-year { color: var(--muted, #a1a7b3); font-weight: 500; }
.pnlcal-nav { display: flex; gap: 6px; }
.pnlcal-btn { min-width: 44px; min-height: 44px; padding: 6px 12px; border-radius: 10px; background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); font-size: 14px; font-weight: 700; cursor: pointer; }
.pnlcal-btn:hover { border-color: var(--brand, #7c5cff); }
.pnlcal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.pnlcal-dow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); text-align: center; padding: 4px 0; }
.pnlcal-cell { min-height: 52px; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px 2px; }
.pnlcal-pad { background: transparent; border: none; }
.pnlcal-day { font-size: 11px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.pnlcal-val { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pnlcal-pos { border-color: rgba(46,204,113,0.35); background: rgba(46,204,113,0.07); }
.pnlcal-pos .pnlcal-val { color: var(--green, #2ecc71); }
.pnlcal-neg { border-color: rgba(231,76,60,0.35); background: rgba(231,76,60,0.07); }
.pnlcal-neg .pnlcal-val { color: var(--red, #e74c3c); }
.pnlcal-flat .pnlcal-val { color: var(--muted, #a1a7b3); }
.pnlcal-today { outline: 2px solid var(--brand, #7c5cff); outline-offset: -2px; }
button.pnlcal-cell { cursor: pointer; font-family: inherit; }
button.pnlcal-cell:hover { border-color: var(--brand, #7c5cff); }
.pnlcal-selected { outline: 2px solid var(--green, #2ecc71); outline-offset: -2px; }
.pnlcal-today .pnlcal-day { color: var(--text, #e7eaf0); font-weight: 700; }
.pnlcal-pos-t { color: var(--green, #2ecc71); }
.pnlcal-neg-t { color: var(--red, #e74c3c); }
.pnlcal-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.pnlcal-sum-item { display: flex; flex-direction: column; gap: 2px; }
.pnlcal-sum-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.pnlcal-sum-value { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pnlcal-empty { padding: 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
.pnlcal-note { font-size: 11px; color: var(--yellow, #e1b12c); }
@media (max-width: 719px) {
  .pnlcal-cell { min-height: 46px; }
  .pnlcal-val { font-size: 10px; }
  .pnlcal-summary { grid-template-columns: repeat(2, 1fr); }
}
@keyframes pnlcal-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('pnlcal-styles')) {
  const style = document.createElement('style');
  style.id = 'pnlcal-styles';
  style.textContent = PNLCAL_CSS;
  document.head.appendChild(style);
}
