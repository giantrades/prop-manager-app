// J3 — HistogramR (engine-driven). Distribuição de múltiplos-R em buckets.
// Motor: `rDistribution()`. Barras em div (sem lib de chart). Mobile 360px.
//
// Fonte: DOCS/10_MODULES/00-trading-journal.md (J3).

import React, { useMemo } from 'react';
import { rDistribution, MIN_SAMPLE } from '@apps/lib/db';

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {number} [props.bucketSize]
 * @param {(size:number)=>void} [props.onBucketSize] — A7: controle na UI
 * @param {boolean} [props.loading]
 */
export default function HistogramR({ trades = [], bucketSize = 0.5, onBucketSize, loading = false }) {
  const data = useMemo(() => rDistribution(trades, bucketSize), [trades, bucketSize]);
  const maxCount = useMemo(() => Math.max(1, ...data.buckets.map((b) => b.count)), [data]);

  if (loading) {
    return (
      <div className="hr-root hr-loading" role="status" aria-live="polite">
        <div className="hr-skeleton" />
        <div className="hr-skeleton" />
        <span className="hr-screen-reader">Carregando histograma…</span>
      </div>
    );
  }

  return (
    <div className="hr-root" aria-label="Histograma de R">
      <div className="hr-head">
        <div className="hr-title">Distribuição de R</div>
        {onBucketSize && (
          <select
            className="hr-bucket"
            value={bucketSize}
            onChange={(e) => onBucketSize(Number(e.target.value))}
            aria-label="Tamanho do bucket"
          >
            {[0.25, 0.5, 1.0].map((b) => (
              <option key={b} value={b}>{b}R</option>
            ))}
          </select>
        )}
      </div>
      {data.count === 0 ? (
        <div className="hr-empty" role="status">Sem R registrado (trades sem stop).</div>
      ) : (
        <>
          <div className="hr-stats" aria-live="polite">
            <span>n={data.count}</span>
            <span>média {data.avg != null ? `${data.avg.toFixed(2)}R` : '—'}</span>
            <span>mediana {data.median != null ? `${data.median.toFixed(2)}R` : '—'}</span>
            <span>std {data.std != null ? data.std.toFixed(2) : '—'}</span>
          </div>
          <div className="hr-bars">
            {data.buckets.map((b) => (
              <div key={b.label} className="hr-row" title={`${b.label}: ${b.count} trades`}>
                <span className="hr-label">{b.label}</span>
                <span className="hr-bar-wrap">
                  <span className="hr-bar" style={{ width: `${Math.max(b.count > 0 ? 4 : 0, (b.count / maxCount) * 100)}%` }} />
                </span>
                <span className="hr-count">{b.count}</span>
              </div>
            ))}
          </div>
          {data.count < MIN_SAMPLE && (
            <div className="hr-note" role="note">Amostra pequena ({data.count} trades com R).</div>
          )}
        </>
      )}
    </div>
  );
}

const HR_CSS = `
.hr-root { display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.hr-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.hr-loading { gap: 8px; }
.hr-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: hr-pulse 1.4s ease-in-out infinite; }
.hr-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; }
.hr-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.hr-bucket { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 6px 8px; border-radius: 8px; font-size: 12px; min-height: 36px; }
.hr-stats { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; font-variant-numeric: tabular-nums; }
.hr-bars { display: flex; flex-direction: column; gap: 6px; }
.hr-row { display: grid; grid-template-columns: 92px 1fr 32px; align-items: center; gap: 8px; font-size: 12px; }
.hr-label { color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.hr-bar-wrap { height: 10px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.hr-bar { display: block; height: 100%; background: linear-gradient(90deg, var(--brand, #7c5cff), #a78bfa); border-radius: 999px; }
.hr-count { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.hr-empty { padding: 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
.hr-note { font-size: 11px; color: var(--yellow, #e1b12c); }
@keyframes hr-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('hr-styles')) {
  const style = document.createElement('style');
  style.id = 'hr-styles';
  style.textContent = HR_CSS;
  document.head.appendChild(style);
}
