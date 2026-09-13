// PeriodPicker — seletor de período reutilizável (Mês · Intervalo X→Y · Tudo).
// Apresentacional: recebe `period` e `onChange` (o estado vive no PeriodContext / página).
import React from 'react';

/**
 * @param {object} props
 * @param {{mode:'month'|'range'|'all', ym?:string, from?:string, to?:string}} props.period
 * @param {(p:object)=>void} props.onChange
 * @param {boolean} [props.compact]
 */
export default function PeriodPicker({ period, onChange, compact = false }) {
  const mode = period?.mode ?? 'all';
  const set = (patch) => onChange({ ...period, ...patch });

  return (
    <div className={`pp-root${compact ? ' pp-compact' : ''}`} role="group" aria-label="Selecionar período">
      <div className="pp-modes">
        <button type="button" className={`pp-mode${mode === 'month' ? ' active' : ''}`} onClick={() => set({ mode: 'month', ym: period?.ym ?? new Date().toISOString().slice(0, 7) })}>Mês</button>
        <button type="button" className={`pp-mode${mode === 'range' ? ' active' : ''}`} onClick={() => set({ mode: 'range', from: period?.from ?? period?.ym ?? new Date().toISOString().slice(0, 7), to: period?.to ?? new Date().toISOString().slice(0, 7) })}>Intervalo</button>
        <button type="button" className={`pp-mode${mode === 'all' ? ' active' : ''}`} onClick={() => set({ mode: 'all' })}>Tudo</button>
      </div>

      {mode === 'month' && (
        <input
          className="pp-input"
          type="month"
          value={period?.ym ?? ''}
          onChange={(e) => set({ ym: e.target.value })}
          aria-label="Mês"
        />
      )}

      {mode === 'range' && (
        <div className="pp-range">
          <input className="pp-input" type="month" value={period?.from ?? ''} onChange={(e) => set({ from: e.target.value })} aria-label="Mês inicial" />
          <span className="pp-sep">→</span>
          <input className="pp-input" type="month" value={period?.to ?? ''} onChange={(e) => set({ to: e.target.value })} aria-label="Mês final" />
        </div>
      )}

      {mode === 'all' && <span className="pp-all">Todo o período</span>}
    </div>
  );
}

const PP_CSS = `
.pp-root { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pp-modes { display: inline-flex; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 2px; }
.pp-mode { padding: 7px 12px; border: none; background: transparent; color: var(--muted, #a1a7b3); font-size: 12px; font-weight: 700; border-radius: 8px; cursor: pointer; min-height: 34px; }
.pp-mode.active { background: rgba(124,92,255,0.18); color: var(--text, #e7eaf0); }
.pp-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: var(--text, #e7eaf0); font-size: 12px; padding: 8px 10px; min-height: 38px; color-scheme: dark; }
.pp-range { display: inline-flex; align-items: center; gap: 6px; }
.pp-sep { color: var(--muted, #a1a7b3); font-size: 12px; }
.pp-all { font-size: 12px; color: var(--muted, #a1a7b3); }
.pp-compact .pp-input { min-height: 34px; padding: 6px 8px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('pp-styles')) {
  const style = document.createElement('style');
  style.id = 'pp-styles';
  style.textContent = PP_CSS;
  document.head.appendChild(style);
}
