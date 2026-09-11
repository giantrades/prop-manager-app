// STAGE 6 — HomePage. Container do Command Center. Só chama o hook de snapshot
// (useCommandSnapshot → selectors dos motores) e renderiza o HomeCommandCenter
// (composição). Nenhuma lógica financeira própria aqui.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Home = composição) + 01-tasks.md (T6.1).

import React, { useState } from 'react';
import HomeCommandCenter from '@apps/ui/HomeCommandCenter';
import ModuleTabs from '../../ModuleTabs';
import { useCommandSnapshot } from '@apps/state';

const WIDGETS = [
  { id: 'risk', label: 'Trading Today' },
  { id: 'actions', label: 'Action Center' },
  { id: 'money', label: 'Money' },
  { id: 'investments', label: 'Investments' },
  { id: 'goals', label: 'Goals' },
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
        <h1 className="cmd-page-title">Home</h1>
        <div className="cmd-actions">
          <button className="cmd-refresh" onClick={() => setCustomizing((c) => !c)} aria-expanded={customizing}>
            Personalizar
          </button>
          <button className="cmd-refresh" onClick={() => refresh()} disabled={loading} aria-label="Atualizar">
            {loading ? '…' : 'Atualizar'}
          </button>
        </div>
      </div>
      <ModuleTabs module="home" />
      {customizing && (
        <div className="hm-custom" role="group" aria-label="Mostrar ou ocultar widgets">
          <div className="hm-custom-title">Widgets visíveis</div>
          {WIDGETS.map((w) => (
            <label key={w.id} className="hm-custom-row">
              <input type="checkbox" checked={!hidden.includes(w.id)} onChange={() => toggleWidget(w.id)} />
              {w.label}
            </label>
          ))}
          <button className="cmd-refresh" onClick={() => setCustomizing(false)}>Pronto</button>
        </div>
      )}
      <HomeCommandCenter snapshot={snapshot} actions={actions} insights={insights} loading={loading} hidden={hidden} />
    </div>
  );
}

const CMD_PAGE_CSS = `
.hm-custom { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); display: flex; flex-direction: column; gap: 8px; }
.hm-custom-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.hm-custom-row { display: flex; gap: 10px; align-items: center; font-size: 13px; cursor: pointer; min-height: 40px; }
.hm-custom-row input { width: 18px; height: 18px; accent-color: var(--brand, #7c5cff); }
`;
if (typeof document !== 'undefined' && !document.getElementById('cmd-page-styles')) {
  const style = document.createElement('style');
  style.id = 'cmd-page-styles';
  style.textContent = CMD_PAGE_CSS;
  document.head.appendChild(style);
}
