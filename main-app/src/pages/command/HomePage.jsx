// STAGE 6 — HomePage. Container do Command Center. Só chama o hook de snapshot
// (useCommandSnapshot → selectors dos motores) + calendário econômico/feriados e
// renderiza o HomeCommandCenter (composição). Nenhuma lógica financeira própria.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Home = composição) + 01-tasks.md (T6.1).

import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, Receipt, ArrowDownToLine, TrendingUp, Wallet } from 'lucide-react';
import HomeCommandCenter from '@apps/ui/HomeCommandCenter';
import { useCommandSnapshot, useFinance } from '@apps/state';
import { fetchEconomicEvents, usMarketHolidays, nowIso } from '@apps/lib/db';

const WIDGETS = [
  { id: 'risk', label: 'Trading' },
  { id: 'money', label: 'Gastos' },
  { id: 'investments', label: 'Investimentos' },
  { id: 'payouts', label: 'Contas & Payouts' },
  { id: 'goals', label: 'Metas' },
  { id: 'actions', label: 'Ações' },
  { id: 'calendar', label: 'Calendário' },
  { id: 'insights', label: 'Insights' },
];

const HOME_WIDGETS_KEY = 'homeWidgetsHidden';

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  const finance = useFinance();
  const [hidden, setHidden] = useState(loadHidden);
  const [customizing, setCustomizing] = useState(false);
  const [calendar, setCalendar] = useState({ events: [], holidays: [] });

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

  // Calendário econômico (MyForexCalendar-like via API free) + feriados dos EUA.
  useEffect(() => {
    let alive = true;
    (async () => {
      const today = nowIso().slice(0, 10);
      const to = addDays(today, 45);
      const year = new Date().getUTCFullYear();
      const holidays = [...usMarketHolidays(year), ...usMarketHolidays(year + 1)]
        .filter((h) => h.date >= today && h.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date));
      let events = [];
      try {
        events = (await fetchEconomicEvents(today, to)).slice(0, 8);
      } catch {
        events = [];
      }
      if (alive) setCalendar({ events, holidays });
    })();
    return () => { alive = false; };
  }, [finance]);

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
      <nav className="hm-quick" aria-label="Ações rápidas">
        <NavLink to="/journal?new=1" className="hm-quick-btn"><BookOpen size={16} /> Novo trade</NavLink>
        <NavLink to="/expenses" className="hm-quick-btn"><Receipt size={16} /> Novo lançamento</NavLink>
        <NavLink to="/payouts" className="hm-quick-btn"><ArrowDownToLine size={16} /> Payouts</NavLink>
        <NavLink to="/portfolio" className="hm-quick-btn"><TrendingUp size={16} /> Investimentos</NavLink>
        <NavLink to="/accounts" className="hm-quick-btn"><Wallet size={16} /> Contas</NavLink>
      </nav>
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
      <HomeCommandCenter
        snapshot={snapshot}
        actions={actions}
        insights={insights}
        calendar={calendar}
        loading={loading}
        hidden={hidden}
      />
    </div>
  );
}
