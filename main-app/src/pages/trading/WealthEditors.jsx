// STAGE 7 — WealthEditors. Containers engine-driven para Goals e Positions.
// Liga os editores ao `DataService`/`WealthService` (único writer).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useFinance } from '@apps/state';
import { csvToPositions } from '@apps/lib/db';
import { useToast } from '@apps/ui/Toast';
import GoalsEditor from '@apps/ui/GoalsEditor';
import Goals from '@apps/ui/Goals';
import Positions from '@apps/ui/Positions';

export function GoalsManagePage() {
  const finance = useFinance();
  const [goals, setGoals] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const load = useCallback(async () => {
    if (!finance) return;
    setLoading(true);
    try {
      const [g, p] = await Promise.all([finance.ds.goals.list(), finance.wealth.goals()]);
      setGoals(g);
      setProgress(p);
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

  const handleSave = useCallback(async (goal) => {
    const f = financeRef.current;
    if (!f) return;
    const rec = { ...goal, id: goal.id || `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
    await f.ds.goals.put(rec, { source: 'local' });
    load();
  }, [load]);

  const handleDelete = useCallback(async (goalId) => {
    const f = financeRef.current;
    if (!f) return;
    await f.ds.goals.remove(goalId);
    load();
  }, [load]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Goals</h1></div>
      <nav className="ws-tabs" aria-label="Workspace planejamento">
        <NavLink to="/goals" className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}>Goals</NavLink>
        <NavLink to="/forecast" className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}>Forecast</NavLink>
        <NavLink to="/journal-events" className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}>Marcos</NavLink>
      </nav>
      <GoalsEditor goals={goals} loading={loading} onSave={handleSave} onDelete={handleDelete} />
      <Goals goals={progress} loading={loading} />
    </div>
  );
}

export function PositionsManagePage() {
  const finance = useFinance();
  const { toast } = useToast();
  const [positions, setPositions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const load = useCallback(async () => {
    if (!finance) return;
    setLoading(true);
    try {
      const [p, a] = await Promise.all([finance.ds.positions.list(), finance.ds.accounts.list()]);
      setPositions(p);
      setAccounts(a.filter((x) => x.kind === 'investment' || x.kind === 'crypto'));
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

  const handleSave = useCallback(async (position) => {
    const f = financeRef.current;
    if (!f) return;
    const rec = { ...position, id: position.id || `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
    if (rec.lastMarkPrice != null) {
      rec.lastMarkAt = new Date().toISOString();
    }
    await f.ds.positions.put(rec, { source: 'local' });
    load();
  }, [load]);

  const handleDelete = useCallback(async (positionId) => {
    const f = financeRef.current;
    if (!f) return;
    await f.ds.positions.remove(positionId);
    load();
  }, [load]);

  // P7 — Import de posições via CSV (symbol,qty,avgPrice). Conta padrão: primeira de investimento.
  const csvRef = useRef(null);
  const handleImportCsv = useCallback(async (file) => {
    const f = financeRef.current;
    if (!f) return;
    try {
      const text = await file.text();
      const { positions: parsed, errors } = csvToPositions(text);
      const defaultAccountId = accounts[0]?.id ?? '';
      let imported = 0;
      for (const p of parsed) {
        await f.ds.positions.put({
          id: `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          accountId: defaultAccountId,
          symbol: p.symbol,
          qty: p.qty,
          avgPrice: p.avgPrice,
          updatedAt: new Date().toISOString(),
          deviceId: 'import',
          version: 0,
        }, { source: 'local' });
        imported += 1;
      }
      toast(`Importadas ${imported} posições.${errors.length ? ` ${errors.length} linhas ignoradas: ${errors.slice(0, 3).join(' · ')}` : ''}`);
      load();
    } catch (e) {
      toast(`Falha ao importar CSV: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    }
  }, [accounts, load, toast]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Positions</h1>
        <button className="cmd-refresh" onClick={() => csvRef.current?.click()}>Importar CSV</button>
      </div>
      <nav className="ws-tabs" aria-label="Workspace do portfolio">
        <NavLink to="/portfolio" end className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}>Overview</NavLink>
        <NavLink to="/positions" className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}>Holdings</NavLink>
      </nav>
      <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) handleImportCsv(e.target.files[0]); e.target.value = ''; }} />
      <Positions positions={positions} accounts={accounts} loading={loading} onSave={handleSave} onDelete={handleDelete} />
    </div>
  );
}
