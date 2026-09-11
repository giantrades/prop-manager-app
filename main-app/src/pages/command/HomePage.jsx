// STAGE 6 — HomePage. Container do Command Center. Só chama o hook de snapshot
// (useCommandSnapshot → selectors dos motores) e renderiza o HomeCommandCenter
// (composição). Nenhuma lógica financeira própria aqui.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Home = composição) + 01-tasks.md (T6.1).

import React, { useState } from 'react';
import HomeCommandCenter from '@apps/ui/HomeCommandCenter';
import { useCommandSnapshot } from '@apps/state';

const WIDGETS = [
  { id: 'risk', label: 'Trading Today' },
  { id: 'investments', label: 'Investments' },
  { id: 'goals', label: 'Goals' },
  { id: 'actions', label: 'Action Center' },
  { id: 'insights', label: 'Insights' },
];

const HOME_WIDGETS_KEY = 'homeWidgetsHidden';

function loadHidden() {
  try {
    const raw = localStorage.getItem(HOME_WIDGETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => WIDGETS.some((w) => w.id === x)) : [];
  } catch {
    return [];
  }
}

export default function HomePage() {
  const { loading, snapshot, actions, insights, refresh } = useCommandSnapshot();
  const [hidden, setHidden] = useState(loadHidden);
  const [customizing, setCustomizing] = useState(false);

  const toggleWidget = (id) => {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(HOME_WIDGETS_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Command Center</h1>
        <div className="cmd-actions">
          <button className="cmd-refresh" onClick={() => setCustomizing((c) => !c)} aria-expanded={customizing}>
            Personalizar
          </button>
          <button className="cmd-refresh" onClick={() => refresh()} disabled={loading} aria-label="Atualizar">
            {loading ? '…' : 'Atualizar'}
          </button>
        </div>
      </div>
      {customizing && (
        <div className="cmd-msg" role="group" aria-label="Mostrar ou ocultar widgets" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {WIDGETS.map((w) => (
            <label key={w.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!hidden.includes(w.id)} onChange={() => toggleWidget(w.id)} style={{ width: 18, height: 18 }} />
              {w.label}
            </label>
          ))}
        </div>
      )}
      <HomeCommandCenter snapshot={snapshot} actions={actions} insights={insights} loading={loading} hidden={hidden} />
    </div>
  );
}

const CMD_PAGE_CSS = `
.cmd-page { display: flex; flex-direction: column; gap: 16px; }
.cmd-page-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.cmd-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cmd-warn { padding: 10px 12px; border-radius: 10px; background: rgba(225,177,44,0.08); border: 1px solid rgba(225,177,44,0.3); color: var(--yellow, #e1b12c); font-size: 13px; }
.cmd-warn a { color: inherit; font-weight: 700; }
.cmd-msg { padding: 10px 12px; border-radius: 10px; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.25); color: var(--green, #2ecc71); font-size: 13px; }
.cmd-page-title { font-size: 20px; font-weight: 800; margin: 0; }
.cmd-refresh { padding: 8px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text); font-size: 12px; cursor: pointer; min-height: 40px; }
.cmd-refresh:disabled { opacity: 0.5; cursor: default; }
.cmd-select { padding: 8px 12px; border-radius: 10px; background: #111623; border: 1px solid rgba(255,255,255,0.1); color: var(--text); font-size: 12px; min-height: 40px; max-width: 220px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('cmd-page-styles')) {
  const style = document.createElement('style');
  style.id = 'cmd-page-styles';
  style.textContent = CMD_PAGE_CSS;
  document.head.appendChild(style);
}
