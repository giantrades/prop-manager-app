// STAGE 12 — Strategies (Playbook). Tabela por setup: n, WR, avgR, PF, expectancy +
// long/short + PnL ponderado. `n<20` = "sem amostra" (nunca estatística decorativa).
// COMPOSIÇÃO: recebe `metrics` de `allStrategyMetrics(trades)` + callbacks.

import { fmtMoney } from './currency';
import React from 'react';

function fmtR(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}R`;
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
 * @param {Array<object>} [props.metrics] de `allStrategyMetrics(trades)`.
 * @param {(strategyId:string)=>void} [props.onUnlink] desvincula a estratégia dos trades.
 * @param {boolean} [props.loading]
 */
export default function Strategies({ metrics = [], onUnlink, loading = false }) {
  if (loading) {
    return (
      <div className="st-root st-loading" role="status" aria-live="polite">
        <div className="st-skeleton" /><div className="st-skeleton" /><div className="st-skeleton" />
        <span className="st-screen-reader">Carregando estratégias…</span>
      </div>
    );
  }

  if (metrics.length === 0) {
    return <div className="st-empty" role="status">Nenhuma estratégia nos trades ainda. Marque o setup no TradeForm.</div>;
  }

  const sorted = [...metrics].sort((a, b) => (b.expectancy ?? 0) - (a.expectancy ?? 0));

  return (
    <div className="st-root">
      <div className="st-list">
        {sorted.map((m) => (
          <div key={m.strategyId} className={`st-card${m.sampleSufficient ? '' : ' st-nosample'}`}>
            <div className="st-head">
              <div>
                <div className="st-name">{m.strategyId}</div>
                <div className="st-sub">
                  {m.n} trades
                  {!m.sampleSufficient && <span className="st-badge">sem amostra (n&lt;20)</span>}
                </div>
              </div>
              {onUnlink && (
                <button className="st-btn st-btn-sm" onClick={() => onUnlink(m.strategyId)} title="Desvincular estratégia dos trades (sem órfão)">
                  Desvincular
                </button>
              )}
            </div>
            {m.sampleSufficient ? (
              <>
                <div className="st-grid">
                  <div className="st-cell"><span className="st-label">Winrate</span><span>{fmtPct(m.winRate)}</span></div>
                  <div className="st-cell"><span className="st-label">Avg R</span><span>{fmtR(m.avgR)}</span></div>
                  <div className="st-cell"><span className="st-label">PF</span><span>{fmtPF(m.profitFactor)}</span></div>
                  <div className="st-cell"><span className="st-label">Expectancy</span><span>{fmtMoney(m.expectancy)}</span></div>
                </div>
                <div className="st-dirs">
                  <span>Long: {m.long.n} · {fmtPct(m.long.winRate)} · {fmtR(m.long.avgR)}</span>
                  <span>Short: {m.short.n} · {fmtPct(m.short.winRate)} · {fmtR(m.short.avgR)}</span>
                </div>
              </>
            ) : (
              <div className="st-hint">Acumule 20+ trades para ler edge (faltam {20 - m.n}).</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const ST_CSS = `
.st-root { display: flex; flex-direction: column; gap: 14px; }
.st-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.st-loading { gap: 8px; }
.st-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: st-pulse 1.4s ease-in-out infinite; }
.st-list { display: flex; flex-direction: column; gap: 10px; }
.st-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.st-nosample { opacity: 0.85; }
.st-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 10px; }
.st-name { font-size: 14px; font-weight: 800; }
.st-sub { font-size: 11px; color: var(--muted, #a1a7b3); margin-top: 2px; }
.st-badge { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: rgba(225,177,44,0.15); color: var(--yellow, #e1b12c); margin-left: 6px; font-weight: 700; }
.st-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.st-cell { display: flex; flex-direction: column; gap: 2px; }
.st-label { font-size: 10px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.st-cell span:last-child { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.st-dirs { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--muted, #a1a7b3); margin-top: 8px; }
.st-hint { font-size: 12px; color: var(--muted, #a1a7b3); }
.st-btn { padding: 9px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; }
.st-btn-sm { padding: 5px 10px; min-height: 30px; font-size: 11px; border-radius: 8px; }
.st-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 719px) { .st-grid { grid-template-columns: repeat(2, 1fr); } }
@keyframes st-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('stg-styles')) {
  const style = document.createElement('style');
  style.id = 'stg-styles';
  style.textContent = ST_CSS;
  document.head.appendChild(style);
}
