// J4 — DurationAnalysis (engine-driven). Hold time médio/mediana/min/max + por direção.
// Motor: `durationStats()`. Mobile 360px.
//
// Fonte: DOCS/10_MODULES/00-trading-journal.md (J4).

import React, { useMemo } from 'react';
import { durationStats } from '@apps/lib/db';
import type { Trade } from '@apps/lib/db';

function fmtMin(v: number | null | undefined) {
  if (v == null) return '—';
  if (v < 60) return `${v.toFixed(v % 1 ? 1 : 0)}m`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {boolean} [props.loading]
 */
interface DurationAnalysisProps {
  trades?: Trade[];
  loading?: boolean;
}
export default function DurationAnalysis({ trades = [], loading = false }: DurationAnalysisProps) {
  const data = useMemo(() => durationStats(trades), [trades]);

  if (loading) {
    return (
      <div className="du-root du-loading" role="status" aria-live="polite">
        <div className="du-skeleton" />
        <div className="du-skeleton" />
        <span className="du-screen-reader">Carregando duração…</span>
      </div>
    );
  }

  const cards = [
    { label: 'Média', value: fmtMin(data.avgMin) },
    { label: 'Mediana', value: fmtMin(data.medianMin) },
    { label: 'Mín', value: fmtMin(data.minMin) },
    { label: 'Máx', value: fmtMin(data.maxMin) },
  ];

  return (
    <div className="du-root" aria-label="Análise de duração">
      <div className="du-title">Duração (hold time) — n={data.count}</div>
      {data.count === 0 ? (
        <div className="du-empty" role="status">Sem trades fechados com as duas datas.</div>
      ) : (
        <>
          <div className="du-grid" aria-live="polite">
            {cards.map((c) => (
              <div key={c.label} className="du-card">
                <span className="du-label">{c.label}</span>
                <span className="du-value">{c.value}</span>
              </div>
            ))}
          </div>
          <div className="du-dirs">
            <span>Long: {data.byDirection.long.count} trades • média {fmtMin(data.byDirection.long.avgMin)}</span>
            <span>Short: {data.byDirection.short.count} trades • média {fmtMin(data.byDirection.short.avgMin)}</span>
          </div>
        </>
      )}
    </div>
  );
}

const DU_CSS = `
.du-root { display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.du-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.du-loading { gap: 8px; }
.du-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: du-pulse 1.4s ease-in-out infinite; }
.du-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; }
.du-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.du-card { display: flex; flex-direction: column; gap: 2px; }
.du-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.du-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.du-dirs { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.du-empty { padding: 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 719px) { .du-grid { grid-template-columns: repeat(2, 1fr); } }
@keyframes du-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('du-styles')) {
  const style = document.createElement('style');
  style.id = 'du-styles';
  style.textContent = DU_CSS;
  document.head.appendChild(style);
}
