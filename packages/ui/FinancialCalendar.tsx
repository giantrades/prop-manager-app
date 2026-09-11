// STAGE 6 — FinancialCalendar. Mês único com camadas toggle (Trading / Economic /
// Bills / Payouts / Tax). Overlay econômico via API free (FOMC/CPI) — best-effort.
// Banner de alto impacto ("High impact em 2h: não opere XAU").
//
// COMPOSIÇÃO: só renderiza dados que o container/página já buscou dos motores.
// Nenhum cálculo financeiro aqui (PnL/datas vêm prontos dos engines).
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Financial Calendar) + 01-tasks.md (T6.2).

import React, { useMemo } from 'react';

const LAYERS = [
  { id: 'trading', label: 'Trading', emoji: '📈' },
  { id: 'economic', label: 'Econômico', emoji: '🌐' },
  { id: 'bills', label: 'Contas', emoji: '🧾' },
  { id: 'payouts', label: 'Payouts', emoji: '💸' },
  { id: 'tax', label: 'Imposto', emoji: '🏛️' },
] as const;

export type LayerId = (typeof LAYERS)[number]['id'];

function fmtMoney(value, currency = 'R$') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * @param {object} props
 * @param {string} props.yearMonth "YYYY-MM"
 * @param {Array<{date:string;pnl:number;trades:number}>} [props.trading]
 * @param {Array<{scheduledAt:string;eventName:string;importance:string}>} [props.economic]
 * @param {Array<{date:string;amount:number;label?:string}>} [props.bills]
 * @param {Array<{date:string;amount:number;status:string}>} [props.payouts]
 * @param {Array<{date:string;amount:number;label?:string}>} [props.tax]
 * @param {boolean} [props.loading]
 * @param {boolean} [props.economicLoading]
 * @param {string|null} [props.economicError]
 * @param {Set<string>|string[]} [props.activeLayers]
 * @param {(id:LayerId)=>void} [props.onToggleLayer]
 * @param {()=>void} [props.onPrevMonth]
 * @param {()=>void} [props.onNextMonth]
 */
export default function FinancialCalendar({
  yearMonth,
  trading = [],
  economic = [],
  bills = [],
  payouts = [],
  tax = [],
  loading = false,
  economicLoading = false,
  economicError = null,
  activeLayers = ['trading', 'economic', 'bills', 'payouts', 'tax'],
  onToggleLayer,
  onPrevMonth,
  onNextMonth,
}) {
  const activeSet = useMemo(() => new Set(activeLayers), [activeLayers]);

  // Índice de marcadores por dia (YYYY-MM-DD).
  const markers = useMemo(() => {
    const map = new Map();
    const push = (date, kind, extra) => {
      const key = date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ kind, ...extra });
    };
    for (const t of trading) push(t.date, 'trading', { pnl: t.pnl, trades: t.trades });
    for (const e of economic) push(e.scheduledAt, 'economic', { eventName: e.eventName, importance: e.importance });
    for (const b of bills) push(b.date, 'bills', { amount: b.amount, label: b.label });
    for (const p of payouts) push(p.date, 'payouts', { amount: p.amount, status: p.status });
    for (const tx of tax) push(tx.date, 'tax', { amount: tx.amount, label: tx.label });
    return map;
  }, [trading, economic, bills, payouts, tax]);

  const cells = useMemo(() => buildMonthGrid(yearMonth), [yearMonth]);

  const monthLabel = useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [yearMonth]);

  if (loading) {
    return (
      <div className="fc-root fc-loading" role="status" aria-live="polite">
        <div className="fc-skeleton" />
        <div className="fc-skeleton" />
        <span className="fc-screen-reader">Carregando calendário…</span>
      </div>
    );
  }

  // Banner de alto impacto (próxima ocorrência dentro de 48h).
  const highImpactSoon = economic.find((e) => {
    const diff = new Date(e.scheduledAt).getTime() - Date.now();
    return e.importance === 'high' && diff > 0 && diff < 48 * 3600 * 1000;
  });

  return (
    <div className="fc-root">
      {/* Header do mês */}
      <div className="fc-head">
        <button className="fc-nav" onClick={onPrevMonth} aria-label="Mês anterior">‹</button>
        <div className="fc-month">{monthLabel}</div>
        <button className="fc-nav" onClick={onNextMonth} aria-label="Próximo mês">›</button>
      </div>

      {/* Layer toggles */}
      <div className="fc-layers" role="group" aria-label="Camadas do calendário">
        {LAYERS.map((l) => {
          const on = activeSet.has(l.id);
          return (
            <button
              key={l.id}
              className={`fc-layer${on ? ' active' : ''}`}
              onClick={() => onToggleLayer && onToggleLayer(l.id)}
              aria-pressed={on}
            >
              <span aria-hidden="true">{l.emoji}</span>
              <span>{l.label}</span>
            </button>
          );
        })}
      </div>

      {/* Banner de alto impacto */}
      {highImpactSoon && (
        <div className="fc-banner" role="note">
          <span className="fc-banner-emoji" aria-hidden="true">⚠️</span>
          <div>
            <div className="fc-banner-title">High impact em breve</div>
            <div className="fc-banner-sub">
              {highImpactSoon.eventName} · {new Date(highImpactSoon.scheduledAt).toLocaleString('pt-BR')} — revise
              exposição antes de operar.
            </div>
          </div>
        </div>
      )}

      {/* Econômico offline/erro */}
      {activeSet.has('economic') && economicError && (
        <div className="fc-offline" role="status">
          🌐 Calendário econômico indisponível sem conexão {economicLoading ? '(tentando…)' : ''}.
        </div>
      )}

      {/* Grade do mês */}
      <div className="fc-grid-wrap">
        <div className="fc-dow">
          {DOW.map((d) => (
            <div key={d} className="fc-dow-cell">{d}</div>
          ))}
        </div>
        <div className="fc-grid">
          {cells.map((cell) => (
            <div
              key={cell.key}
              className={`fc-cell${cell.day === 0 ? ' fc-outside' : ''}${cell.isToday ? ' fc-today' : ''}`}
              aria-label={cell.day === 0 ? undefined : `Dia ${cell.day}`}
            >
              <span className="fc-daynum">{cell.day === 0 ? '' : cell.day}</span>
              <div className="fc-marks">
                {cell.key && markers.has(cell.key) &&
                  markers
                    .get(cell.key)
                    .filter((m) => activeSet.has(m.kind))
                    .map((m, i) => (
                      <span key={i} className={`fc-mark fc-mark-${m.kind}`} title={markTitle(m)} />
                    ))}
              </div>
              {cell.key && activeSet.has('trading') && trading.find((t) => t.date.slice(0, 10) === cell.key) && (
                <span className="fc-pnl" style={{ color: (trading.find((t) => t.date.slice(0, 10) === cell.key)?.pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmtMoney(trading.find((t) => t.date.slice(0, 10) === cell.key)?.pnl, '$')}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function markTitle(m) {
  switch (m.kind) {
    case 'trading': return `Trading: ${fmtMoney(m.pnl, '$')} (${m.trades} trades)`;
    case 'economic': return `Econômico: ${m.eventName}`;
    case 'bills': return `Conta: ${fmtMoney(m.amount)}${m.label ? ` · ${m.label}` : ''}`;
    case 'payouts': return `Payout: ${fmtMoney(m.amount)} (${m.status})`;
    case 'tax': return `Imposto: ${fmtMoney(m.amount)}${m.label ? ` · ${m.label}` : ''}`;
    default: return '';
  }
}

function buildMonthGrid(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startDow = first.getUTCDay();
  const cells = [];
  const today = new Date().toISOString().slice(0, 10);

  // Células do fim do mês anterior.
  const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevDays - i;
    const key = isoDate(y, m - 1, day);
    cells.push({ key, day: 0, isToday: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = isoDate(y, m, d);
    cells.push({ key, day: d, isToday: key === today });
  }
  // Células do início do mês seguinte.
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const key = isoDate(y, m + 1, d);
    cells.push({ key, day: 0, isToday: false });
  }
  return cells;
}

function isoDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

const FC_CSS = `
.fc-root { display: flex; flex-direction: column; gap: 14px; }
.fc-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.fc-loading { gap: 8px; }
.fc-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: fc-pulse 1.4s ease-in-out infinite; }
.fc-skeleton:nth-child(2) { width: 70%; }

.fc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.fc-month { font-size: 16px; font-weight: 800; text-transform: capitalize; }
.fc-nav { width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: var(--text); font-size: 20px; cursor: pointer; }

.fc-layers { display: flex; flex-wrap: wrap; gap: 8px; }
.fc-layer { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted); font-size: 12px; cursor: pointer; min-height: 36px; }
.fc-layer.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text); font-weight: 700; }

.fc-banner { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: 12px; background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.3); }
.fc-banner-emoji { font-size: 18px; }
.fc-banner-title { font-size: 13px; font-weight: 800; color: var(--red, #e74c3c); }
.fc-banner-sub { font-size: 12px; color: var(--muted, #a1a7b3); }

.fc-offline { font-size: 12px; color: var(--muted, #a1a7b3); padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,0.03); }

.fc-grid-wrap { border-radius: 12px; border: 1px solid rgba(255,255,255,0.07); overflow: hidden; }
.fc-dow { display: grid; grid-template-columns: repeat(7, 1fr); background: rgba(255,255,255,0.03); }
.fc-dow-cell { text-align: center; font-size: 11px; color: var(--muted, #a1a7b3); padding: 8px 0; text-transform: lowercase; }
.fc-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.fc-cell { min-height: 54px; padding: 6px 4px; border-top: 1px solid rgba(255,255,255,0.04); display: flex; flex-direction: column; gap: 2px; align-items: center; }
.fc-outside { opacity: 0.25; }
.fc-today { background: rgba(124,92,255,0.08); }
.fc-daynum { font-size: 12px; font-weight: 600; }
.fc-marks { display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; }
.fc-mark { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.fc-mark-trading { background: var(--blue, #3498db); }
.fc-mark-economic { background: var(--yellow, #e1b12c); }
.fc-mark-bills { background: var(--gray, #5b6270); }
.fc-mark-payouts { background: var(--green, #2ecc71); }
.fc-mark-tax { background: var(--red, #e74c3c); }
.fc-pnl { font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }

@media (max-width: 719px) {
  .fc-cell { min-height: 46px; }
  .fc-layer { padding: 6px 10px; }
}
@keyframes fc-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('fc-styles')) {
  const style = document.createElement('style');
  style.id = 'fc-styles';
  style.textContent = FC_CSS;
  document.head.appendChild(style);
}
