// STAGE 12 — PreTradeChecklist. Itens do dia com checkboxes; completo = dia liberado.
// COMPOSIÇÃO: recebe template + marcações + onToggle (o container persiste via checklist.ts).

import React from 'react';

/**
 * @param {object} props
 * @param {string[]} [props.items]
 * @param {Record<string,boolean>} [props.checked]
 * @param {(index:number, done:boolean)=>void} [props.onToggle]
 * @param {boolean} [props.loading]
 */
interface PreTradeChecklistProps {
  items?: string[];
  checked?: Record<string, boolean>;
  onToggle?: (index: number, done: boolean) => void;
  loading?: boolean;
}
export default function PreTradeChecklist({ items = [], checked = {}, onToggle, loading = false }: PreTradeChecklistProps) {
  if (loading) {
    return (
      <div className="pc-root pc-loading" role="status" aria-live="polite">
        <div className="pc-skeleton" /><div className="pc-skeleton" />
        <span className="pc-screen-reader">Carregando checklist…</span>
      </div>
    );
  }

  const done = items.filter((_, i) => checked[String(i)] === true).length;
  const complete = items.length > 0 && done === items.length;

  return (
    <div className="pc-root">
      <div className="pc-head">
        <h3 className="pc-title">Checklist pré-trade (hoje)</h3>
        <span className={`pc-count${complete ? ' pc-done' : ''}`}>{done}/{items.length}</span>
      </div>
      {complete && <div className="pc-ok" role="status">✅ Dia liberado — opere o plano.</div>}
      <div className="pc-list">
        {items.map((item, i) => (
          <label key={i} className={`pc-item${checked[String(i)] ? ' pc-checked' : ''}`}>
            <input
              type="checkbox"
              checked={checked[String(i)] === true}
              onChange={(e) => onToggle && onToggle(i, e.target.checked)}
              aria-label={item}
            />
            <span>{item}</span>
          </label>
        ))}
      </div>
      {!complete && items.length > 0 && (
        <div className="pc-warn" role="note">⚠️ O Journal bloqueia novos trades até completar o checklist.</div>
      )}
    </div>
  );
}

const PC_CSS = `
.pc-root { display: flex; flex-direction: column; gap: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; }
.pc-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.pc-loading { gap: 8px; }
.pc-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: pc-pulse 1.4s ease-in-out infinite; }
.pc-head { display: flex; justify-content: space-between; align-items: center; }
.pc-title { font-size: 14px; font-weight: 800; margin: 0; }
.pc-count { font-size: 12px; font-weight: 800; padding: 2px 10px; border-radius: 999px; background: rgba(225,177,44,0.15); color: var(--yellow, #e1b12c); }
.pc-count.pc-done { background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); }
.pc-ok { font-size: 13px; padding: 10px 12px; border-radius: 10px; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.25); color: var(--green, #2ecc71); }
.pc-warn { font-size: 12px; color: var(--muted, #a1a7b3); }
.pc-list { display: flex; flex-direction: column; gap: 8px; }
.pc-item { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; cursor: pointer; padding: 8px; border-radius: 8px; }
.pc-item:hover { background: rgba(255,255,255,0.03); }
.pc-item input { width: 18px; height: 18px; margin-top: 1px; accent-color: var(--brand, #7c5cff); }
.pc-checked span { text-decoration: line-through; opacity: 0.6; }
@keyframes pc-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('pck-styles')) {
  const style = document.createElement('style');
  style.id = 'pck-styles';
  style.textContent = PC_CSS;
  document.head.appendChild(style);
}
