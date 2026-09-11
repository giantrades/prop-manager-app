// J11 — WeeklyReview (engine-driven). Resumo da semana (seg–dom) + botão copiar.
// Motor: `weeklyReview()`. A meta da próxima semana é manual (o motor entrega fatos).
// Mobile 360px.
//
// Fonte: DOCS/10_MODULES/00-trading-journal.md (J11).

import { fmtMoney } from './currency';
import React, { useMemo, useState } from 'react';
import { weeklyReview } from '@apps/lib/db';


function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDay(iso) {
  if (!iso) return '—';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {string} [props.currency]
 * @param {boolean} [props.loading]
 */
export default function WeeklyReview({ trades = [], currency = 'R$', loading = false }) {
  const data = useMemo(() => weeklyReview(trades), [trades]);
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <div className="wr-root wr-loading" role="status" aria-live="polite">
        <div className="wr-skeleton" />
        <span className="wr-screen-reader">Carregando review…</span>
      </div>
    );
  }

  const summary = [
    `Review semanal ${fmtDay(data.weekStart)}–${fmtDay(data.weekEnd)}`,
    `PnL ${fmtMoney(data.pnl, currency)} em ${data.trades} trades (WR ${fmtPct(data.winrate)})`,
    `Melhor dia ${data.bestDay ? `${fmtDay(data.bestDay.date)} (${fmtMoney(data.bestDay.pnl, currency)})` : '—'} · Pior dia ${data.worstDay ? `${fmtDay(data.worstDay.date)} (${fmtMoney(data.worstDay.pnl, currency)})` : '—'}`,
    `Melhor símbolo ${data.bestSymbol ?? '—'} · Pior ${data.worstSymbol ?? '—'}`,
  ].join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = summary;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="wr-root" aria-label="Review semanal">
      <div className="wr-head">
        <div className="wr-title">Review semanal <span className="wr-range">{fmtDay(data.weekStart)}–{fmtDay(data.weekEnd)}</span></div>
        <button className="wr-btn" onClick={handleCopy} aria-live="polite">{copied ? 'Copiado!' : 'Copiar resumo'}</button>
      </div>
      {data.trades === 0 ? (
        <div className="wr-empty" role="status">Sem trades nesta semana.</div>
      ) : (
        <div className="wr-grid" aria-live="polite">
          <div className="wr-item"><span className="wr-label">PnL</span><span className={`wr-value ${data.pnl >= 0 ? 'wr-pos' : 'wr-neg'}`}>{fmtMoney(data.pnl, currency)}</span></div>
          <div className="wr-item"><span className="wr-label">Trades</span><span className="wr-value">{data.trades}</span></div>
          <div className="wr-item"><span className="wr-label">WR</span><span className="wr-value">{fmtPct(data.winrate)}</span></div>
          <div className="wr-item"><span className="wr-label">AvgR</span><span className="wr-value">{data.avgR != null ? `${data.avgR.toFixed(2)}R` : '—'}</span></div>
          <div className="wr-item"><span className="wr-label">Melhor dia</span><span className="wr-value">{data.bestDay ? `${fmtDay(data.bestDay.date)} • ${fmtMoney(data.bestDay.pnl, currency)}` : '—'}</span></div>
          <div className="wr-item"><span className="wr-label">Pior dia</span><span className="wr-value">{data.worstDay ? `${fmtDay(data.worstDay.date)} • ${fmtMoney(data.worstDay.pnl, currency)}` : '—'}</span></div>
          <div className="wr-item"><span className="wr-label">Melhor símbolo</span><span className="wr-value">{data.bestSymbol ?? '—'}</span></div>
          <div className="wr-item"><span className="wr-label">Pior símbolo</span><span className="wr-value">{data.worstSymbol ?? '—'}</span></div>
        </div>
      )}
    </div>
  );
}

const WR_CSS = `
.wr-root { display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.wr-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.wr-loading { gap: 8px; }
.wr-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: wr-pulse 1.4s ease-in-out infinite; }
.wr-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.wr-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; }
.wr-range { color: var(--text, #e7eaf0); }
.wr-btn { padding: 8px 14px; border-radius: 10px; background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); font-size: 12px; font-weight: 600; cursor: pointer; min-height: 42px; }
.wr-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.wr-item { display: flex; flex-direction: column; gap: 2px; }
.wr-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.wr-value { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.wr-pos { color: var(--green, #2ecc71); }
.wr-neg { color: var(--red, #e74c3c); }
.wr-empty { padding: 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 719px) { .wr-grid { grid-template-columns: repeat(2, 1fr); } }
@keyframes wr-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('wr-styles')) {
  const style = document.createElement('style');
  style.id = 'wr-styles';
  style.textContent = WR_CSS;
  document.head.appendChild(style);
}
