// J5+J6 — BreakdownSection (engine-driven). Long vs Short + tabela por símbolo.
// Motor: `directionSplit()` + `symbolBreakdown()`. Métricas de taxa (avgR/PF/expectancy)
// mostram "sem amostra" quando n < MIN_SAMPLE (20); PnL/trades são fato e sempre mostram.
//
// Fonte: DOCS/10_MODULES/00-trading-journal.md (J5, J6).

import React, { useMemo } from 'react';
import { directionSplit, symbolBreakdown } from '@apps/lib/db';

function fmtMoney(v, cur = 'R$') {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v < 0 ? '-' : ''}${cur}${Math.abs(v).toFixed(2)}`;
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtPF(pf) {
  if (pf === 'infinity') return '∞';
  if (pf === 'n/a') return 'n/a';
  return Number(pf).toFixed(2);
}

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {string} [props.currency]
 * @param {boolean} [props.loading]
 */
export default function BreakdownSection({ trades = [], currency = 'R$', loading = false }) {
  const dirs = useMemo(() => directionSplit(trades), [trades]);
  const symbols = useMemo(() => symbolBreakdown(trades), [trades]);

  if (loading) {
    return (
      <div className="bd-root bd-loading" role="status" aria-live="polite">
        <div className="bd-skeleton" />
        <div className="bd-skeleton" />
        <span className="bd-screen-reader">Carregando breakdown…</span>
      </div>
    );
  }

  const dirCards = [
    { label: 'Long', s: dirs.long },
    { label: 'Short', s: dirs.short },
  ];

  return (
    <div className="bd-root" aria-label="Breakdown long/short e por símbolo">
      <div className="bd-title">Long vs Short</div>
      <div className="bd-dirs">
        {dirCards.map(({ label, s }) => (
          <div key={label} className="bd-dir">
            <div className="bd-dir-head">{label} <span className="bd-dim">n={s.trades}</span></div>
            <div className="bd-dir-grid">
              <span>PnL <b className={s.pnl >= 0 ? 'bd-pos' : 'bd-neg'}>{fmtMoney(s.pnl, currency)}</b></span>
              <span>WR <b>{fmtPct(s.winrate)}</b></span>
              <span>AvgR <b>{s.avgR != null ? `${s.avgR.toFixed(2)}R` : '—'}</b></span>
              <span>PF <b>{fmtPF(s.profitFactor)}</b></span>
            </div>
          </div>
        ))}
      </div>

      <div className="bd-title">Por símbolo</div>
      {symbols.length === 0 ? (
        <div className="bd-empty" role="status">Sem trades fechados.</div>
      ) : (
        <div className="bd-table-wrap">
          <table className="bd-table">
            <thead>
              <tr>
                <th>Símbolo</th><th>n</th><th>PnL</th><th>WR</th><th>AvgR</th><th>PF</th><th>Expect.</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((r) => (
                <tr key={r.symbol}>
                  <td><b>{r.symbol}</b></td>
                  <td className="bd-num">{r.trades}</td>
                  <td className={`bd-num ${r.pnl >= 0 ? 'bd-pos' : 'bd-neg'}`}>{fmtMoney(r.pnl, currency)}</td>
                  <td className="bd-num">{fmtPct(r.winrate)}</td>
                  <td className="bd-num">{r.sampleOk && r.avgR != null ? `${r.avgR.toFixed(2)}R` : <span className="bd-dim">sem amostra</span>}</td>
                  <td className="bd-num">{r.sampleOk ? fmtPF(r.profitFactor) : <span className="bd-dim">sem amostra</span>}</td>
                  <td className="bd-num">{r.sampleOk ? fmtMoney(r.expectancy, currency) : <span className="bd-dim">sem amostra</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const BD_CSS = `
.bd-root { display: flex; flex-direction: column; gap: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.bd-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.bd-loading { gap: 8px; }
.bd-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: bd-pulse 1.4s ease-in-out infinite; }
.bd-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; }
.bd-dirs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bd-dir { border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.bd-dir-head { font-size: 13px; font-weight: 700; }
.bd-dim { font-size: 11px; color: var(--muted, #a1a7b3); font-weight: 500; }
.bd-dir-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; font-variant-numeric: tabular-nums; }
.bd-pos { color: var(--green, #2ecc71); }
.bd-neg { color: var(--red, #e74c3c); }
.bd-table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid rgba(255,255,255,0.07); }
.bd-table { width: 100%; min-width: 560px; border-collapse: collapse; }
.bd-table th, .bd-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
.bd-table th { font-size: 10px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; }
.bd-num { font-variant-numeric: tabular-nums; }
.bd-empty { padding: 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 719px) { .bd-dirs { grid-template-columns: 1fr; } }
@keyframes bd-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('bd-styles')) {
  const style = document.createElement('style');
  style.id = 'bd-styles';
  style.textContent = BD_CSS;
  document.head.appendChild(style);
}
