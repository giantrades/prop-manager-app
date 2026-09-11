// STAGE 13 — SyncConflicts. Lista conflitos de sync (Opção B: campo financeiro mexido
// dos dois lados) com os valores lado a lado + botões "Manter meu" / "Usar da nuvem".
// COMPOSIÇÃO: recebe `conflicts` + `onResolve`; o container persiste via
// `cloud.resolveConflictChoice`.

import React from 'react';

function fmtVal(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * @param {object} props
 * @param {Array<{id:string;entityType:string;recordId:string;fields:string[];local:object;remote:object;detectedAt:string}>} [props.conflicts]
 * @param {(conflictId:string, choice:'mine'|'theirs')=>void} [props.onResolve]
 * @param {boolean} [props.loading]
 */
export default function SyncConflicts({ conflicts = [], onResolve, loading = false }) {
  if (loading) {
    return (
      <div className="sc-root sc-loading" role="status" aria-live="polite">
        <div className="sc-skeleton" />
        <span className="sc-screen-reader">Carregando conflitos…</span>
      </div>
    );
  }

  if (conflicts.length === 0) {
    return <div className="sc-empty" role="status">Sem conflitos de sincronização.</div>;
  }

  return (
    <div className="sc-root">
      <div className="sc-head">
        <h3 className="sc-title">Conflitos de sync</h3>
        <span className="sc-count">{conflicts.length}</span>
      </div>
      <div className="sc-list">
        {conflicts.map((c) => (
          <div key={c.id} className="sc-item">
            <div className="sc-item-head">
              <span className="sc-kind">{c.entityType}</span>
              <span className="sc-id">{String(c.recordId).slice(0, 12)}</span>
            </div>
            <div className="sc-fields">
              {(c.fields || []).map((f) => (
                <div key={f} className="sc-field">
                  <span className="sc-field-name">{f}</span>
                  <span className="sc-field-local">meu: <b>{fmtVal(c.local?.[f])}</b></span>
                  <span className="sc-field-remote">nuvem: <b>{fmtVal(c.remote?.[f])}</b></span>
                </div>
              ))}
            </div>
            <div className="sc-actions">
              <button className="sc-btn sc-btn-primary" onClick={() => onResolve && onResolve(c.id, 'mine')}>Manter meu</button>
              <button className="sc-btn" onClick={() => onResolve && onResolve(c.id, 'theirs')}>Usar da nuvem</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SC_CSS = `
.sc-root { display: flex; flex-direction: column; gap: 14px; }
.sc-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.sc-loading { gap: 8px; }
.sc-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: sc-pulse 1.4s ease-in-out infinite; }
.sc-head { display: flex; align-items: center; justify-content: space-between; }
.sc-title { font-size: 15px; font-weight: 800; margin: 0; }
.sc-count { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: rgba(225,177,44,0.14); color: var(--yellow, #e1b12c); font-weight: 700; }
.sc-list { display: flex; flex-direction: column; gap: 10px; }
.sc-item { background: rgba(255,255,255,0.02); border: 1px solid rgba(225,177,44,0.3); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.sc-item-head { display: flex; gap: 8px; align-items: center; }
.sc-kind { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.06); }
.sc-id { font-size: 11px; color: var(--muted, #a1a7b3); font-family: monospace; }
.sc-fields { display: flex; flex-direction: column; gap: 6px; }
.sc-field { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 12px; align-items: center; }
.sc-field-name { font-family: monospace; color: var(--muted, #a1a7b3); }
.sc-field-local, .sc-field-remote { font-variant-numeric: tabular-nums; }
.sc-actions { display: flex; gap: 10px; }
.sc-btn { padding: 9px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; }
.sc-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.sc-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 719px) { .sc-field { grid-template-columns: 1fr; gap: 2px; } }
@keyframes sc-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('scf-styles')) {
  const style = document.createElement('style');
  style.id = 'scf-styles';
  style.textContent = SC_CSS;
  document.head.appendChild(style);
}
