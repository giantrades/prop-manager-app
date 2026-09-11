// J2 — HeatmapSection (engine-driven). Heat por símbolo (J2) + por sessão (J7).
// Motor: `heatmapBySymbol()` + `heatmapBySession()`. Intensidade = |PnL| / max.
// Mobile-first 360px (grade fluida, sem scroll horizontal).
//
// Fonte: DOCS/10_MODULES/00-trading-journal.md (J2, J7).

import { fmtMoney } from './currency';
import React, { useMemo, useState } from 'react';
import { heatmapBySymbol, heatmapBySession, DEFAULT_SESSIONS } from '@apps/lib/db';


function intensity(pnl, maxAbs) {
  if (!maxAbs) return 0;
  return Math.min(1, Math.abs(pnl) / maxAbs);
}

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {string} [props.currency]
 * @param {Array<object>} [props.sessionDefs] — A3: definições custom (default = padrão)
 * @param {(sessions:Array<object>)=>void} [props.onSessions]
 * @param {boolean} [props.loading]
 */
export default function HeatmapSection({ trades = [], currency = 'R$', sessionDefs, onSessions, loading = false }) {
  const defs = sessionDefs && sessionDefs.length > 0 ? sessionDefs : DEFAULT_SESSIONS;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const symbols = useMemo(() => heatmapBySymbol(trades, 12), [trades]);
  const sessions = useMemo(() => heatmapBySession(trades, defs), [trades, defs]);
  const maxAbs = useMemo(() => {
    const all = [...symbols.map((s) => s.pnl), ...sessions.map((s) => s.pnl)];
    return Math.max(1, ...all.map((v) => Math.abs(v)));
  }, [symbols, sessions]);

  if (loading) {
    return (
      <div className="hm-root hm-loading" role="status" aria-live="polite">
        <div className="hm-skeleton" />
        <div className="hm-skeleton" />
        <span className="hm-screen-reader">Carregando heatmap…</span>
      </div>
    );
  }

  const renderCell = (key, label, sub, pnl, extra) => (
    <div
      key={key}
      className={`hm-cell${pnl > 0 ? ' hm-pos' : pnl < 0 ? ' hm-neg' : ' hm-flat'}`}
      style={{ '--hm-i': intensity(pnl, maxAbs).toFixed(2) } as React.CSSProperties}
      title={`${label} • ${extra}`}
    >
      <span className="hm-label">{label}</span>
      {sub && <span className="hm-sub">{sub}</span>}
      <span className="hm-val">{fmtMoney(pnl, currency)}</span>
    </div>
  );

  return (
    <div className="hm-root" aria-label="Heatmap de PnL">
      <div className="hm-section">
        <div className="hm-title">Heat por símbolo</div>
        {symbols.length === 0 ? (
          <div className="hm-empty" role="status">Sem trades fechados.</div>
        ) : (
          <div className="hm-grid">
            {symbols.map((s) => renderCell(s.symbol, s.symbol, `${s.trades} trades`, s.pnl, `${s.wins}W/${s.losses}L`))}
          </div>
        )}
      </div>
      <div className="hm-section">
        <div className="hm-title-row">
          <div className="hm-title">Heat por sessão (UTC)</div>
          {onSessions && (
            <button
              className="hm-edit-btn"
              aria-expanded={editing}
              onClick={() => {
                if (!editing) setDraft(defs.map((d) => ({ ...d })));
                setEditing((e) => !e);
              }}
            >
              {editing ? 'Fechar' : 'Editar sessões'}
            </button>
          )}
        </div>
        <div className="hm-grid hm-grid-4">
          {sessions.map((s) => renderCell(s.session, s.label, `${s.trades} trades`, s.pnl, `${s.wins}W/${s.losses}L`))}
        </div>
        {editing && draft && onSessions && (
          <div className="hm-editor" role="group" aria-label="Editar sessões">
            {draft.map((d, i) => (
              <div key={d.id} className="hm-editor-row">
                <input
                  className="hm-input hm-input-label"
                  value={d.label}
                  onChange={(e) => setDraft((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  aria-label={`Nome da sessão ${i + 1}`}
                />
                <input
                  className="hm-input"
                  type="number" min={0} max={24} step={0.5}
                  value={d.startH}
                  onChange={(e) => setDraft((prev) => prev.map((x, j) => (j === i ? { ...x, startH: Number(e.target.value) } : x)))}
                  aria-label={`Início (hora UTC) da sessão ${i + 1}`}
                />
                <input
                  className="hm-input"
                  type="number" min={0} max={24} step={0.5}
                  value={d.endH}
                  onChange={(e) => setDraft((prev) => prev.map((x, j) => (j === i ? { ...x, endH: Number(e.target.value) } : x)))}
                  aria-label={`Fim (hora UTC) da sessão ${i + 1}`}
                />
              </div>
            ))}
            <div className="hm-editor-actions">
              <button
                className="hm-edit-btn hm-primary"
                onClick={() => {
                  const clean = draft
                    .filter((d) => d.label.trim() && d.startH >= 0 && d.endH <= 24 && d.startH < d.endH)
                    .map((d) => ({ ...d, label: d.label.trim() }));
                  if (clean.length > 0) {
                    onSessions(clean);
                    setEditing(false);
                  }
                }}
              >
                Aplicar
              </button>
              <button
                className="hm-edit-btn"
                onClick={() => {
                  onSessions(DEFAULT_SESSIONS.map((d) => ({ ...d })));
                  setEditing(false);
                }}
              >
                Restaurar padrão
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const HM_CSS = `
.hm-root { display: flex; flex-direction: column; gap: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.hm-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.hm-loading { gap: 8px; }
.hm-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: hm-pulse 1.4s ease-in-out infinite; }
.hm-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.hm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
.hm-grid-4 { grid-template-columns: repeat(4, 1fr); }
.hm-cell { border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); padding: 8px 6px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.hm-pos { border-color: rgba(46,204,113,0.35); background: rgba(46,204,113,calc(0.05 + 0.25 * var(--hm-i, 0))); }
.hm-pos .hm-val { color: var(--green, #2ecc71); }
.hm-neg { border-color: rgba(231,76,60,0.35); background: rgba(231,76,60,calc(0.05 + 0.25 * var(--hm-i, 0))); }
.hm-neg .hm-val { color: var(--red, #e74c3c); }
.hm-flat .hm-val { color: var(--muted, #a1a7b3); }
.hm-label { font-size: 12px; font-weight: 700; }
.hm-sub { font-size: 10px; color: var(--muted, #a1a7b3); }
.hm-val { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.hm-empty { padding: 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
.hm-title-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.hm-title-row .hm-title { margin-bottom: 0; }
.hm-edit-btn { background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); border-radius: 8px; padding: 6px 10px; font-size: 11px; font-weight: 600; cursor: pointer; min-height: 36px; }
.hm-edit-btn.hm-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; }
.hm-editor { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.hm-editor-row { display: grid; grid-template-columns: 1fr 72px 72px; gap: 6px; }
.hm-input { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 6px 8px; border-radius: 8px; font-size: 12px; min-height: 36px; width: 100%; }
.hm-editor-actions { display: flex; gap: 6px; }
@media (max-width: 719px) { .hm-grid-4 { grid-template-columns: repeat(2, 1fr); } }
@keyframes hm-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('hm-styles')) {
  const style = document.createElement('style');
  style.id = 'hm-styles';
  style.textContent = HM_CSS;
  document.head.appendChild(style);
}
