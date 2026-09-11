// STAGE 12 — PlaybookPage. Strategies (métricas) + checklist pré-trade do dia +
// diário emocional × R. Tudo no motor novo (strategies.ts + checklist.ts + meta).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useFinance } from '@apps/state';
import {
  allStrategyMetrics,
  deleteStrategyClean,
  getChecklistTemplate,
  getDayCheck,
  setDayCheck,
  getDiaryEntry,
  saveDiaryEntry,
} from '@apps/lib/db';
import Strategies from '@apps/ui/Strategies';
import PreTradeChecklist from '@apps/ui/PreTradeChecklist';
import EmotionalDiary from '@apps/ui/EmotionalDiary';

export default function PlaybookPage() {
  const finance = useFinance();
  const [trades, setTrades] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [template, setTemplate] = useState([]);
  const [checked, setChecked] = useState({});
  const [entry, setEntry] = useState(null);
  const [diaryRows, setDiaryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const load = useCallback(async () => {
    if (!finance) return;
    setLoading(true);
    try {
      const [t, tpl, chk, ent] = await Promise.all([
        finance.ds.trades.list(),
        getChecklistTemplate(finance.ds),
        getDayCheck(finance.ds),
        getDiaryEntry(finance.ds),
      ]);
      setTrades(t);
      setMetrics(allStrategyMetrics(t));
      setTemplate(tpl);
      setChecked(chk);
      setEntry(ent);

      // Dia × R: últimos 14 dias com trade fechado ou registro no diário.
      const byDay = new Map();
      for (const tr of t) {
        if (tr.exitDatetime == null) continue;
        const day = tr.exitDatetime.slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + (tr.resultR ?? 0));
      }
      const days = [...byDay.keys()].sort().reverse().slice(0, 14);
      const rows = [];
      for (const day of days) {
        const d = await getDiaryEntry(finance.ds, `${day}T12:00:00Z`);
        rows.push({ date: day, sleep: d?.sleep ?? null, mood: d?.mood ?? null, fomo: d?.fomo ?? null, r: Number(byDay.get(day).toFixed(2)) });
      }
      setDiaryRows(rows);
    } finally {
      setLoading(false);
    }
  }, [finance]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', load);
    return off;
  }, [finance, load]);

  const handleToggle = useCallback(async (index, done) => {
    const f = financeRef.current;
    if (!f) return;
    setChecked(await setDayCheck(f.ds, index, done));
  }, []);

  const handleSaveDiary = useCallback(async (e) => {
    const f = financeRef.current;
    if (!f) return;
    await saveDiaryEntry(f.ds, e);
    load();
  }, [load]);

  const handleUnlink = useCallback(async (strategyId) => {
    const f = financeRef.current;
    if (!f) return;
    await deleteStrategyClean(f.ds, strategyId);
    load();
  }, [load]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Playbook</h1></div>
      <nav className="ws-tabs" aria-label="Workspace trading">
        <NavLink to="/journal" className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}>Journal</NavLink>
        <NavLink to="/playbook" className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}>Playbook</NavLink>
        <NavLink to="/risk" className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}>Risk</NavLink>
      </nav>
      <PreTradeChecklist items={template} checked={checked} onToggle={handleToggle} loading={loading} />
      <div className="pb-section-title">Setups (edge por estratégia)</div>
      <Strategies metrics={metrics} onUnlink={handleUnlink} loading={loading} />
      <div className="pb-section-title">Diário emocional</div>
      <EmotionalDiary entry={entry} rows={diaryRows} onSave={handleSaveDiary} loading={loading} />
    </div>
  );
}

const PB_CSS = `
.pb-section-title { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; margin: 4px 0 0; }
`;
if (typeof document !== 'undefined' && !document.getElementById('pb-styles')) {
  const style = document.createElement('style');
  style.id = 'pb-styles';
  style.textContent = PB_CSS;
  document.head.appendChild(style);
}
