// STAGE 7 — WealthEditors. Containers engine-driven para Goals e Positions.
// Liga os editores ao `DataService`/`WealthService` (único writer).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import { csvToPositions } from '@apps/lib/db';
import { useToast } from '@apps/ui/Toast';
import GoalsEditor from '@apps/ui/GoalsEditor';
import Goals from '@apps/ui/Goals';
import Positions from '@apps/ui/Positions';

export function GoalsManagePage() {
  const finance = useFinance();
  const { loading, data, reload: load } = usePageData('goals', async (f) => {
    const [g, p] = await Promise.all([f.ds.goals.list(), f.wealth.goals()]);
    return { goals: g, progress: p };
  });
  const goals = data?.goals ?? [];
  const progress = data?.progress ?? [];
  const financeRef = useRef(finance);
  financeRef.current = finance;

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

  const [filter, setFilter] = useState('all');
  const counts = {
    all: progress.length,
    active: progress.filter((g) => !g.completed).length,
    completed: progress.filter((g) => g.completed).length,
  };
  const shown = filter === 'active' ? progress.filter((g) => !g.completed)
    : filter === 'completed' ? progress.filter((g) => g.completed)
    : progress;

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Goals</h1></div>
      <ModuleTabs module="planejamento" />
      <div className="go-summary">
        {[
          { key: 'all', label: 'Total', count: counts.all, sub: 'metas', color: '#7c5cff' },
          { key: 'active', label: 'Em andamento', count: counts.active, sub: 'ativas', color: '#f59e0b' },
          { key: 'completed', label: 'Concluídas', count: counts.completed, sub: 'finalizadas', color: '#10b981' },
        ].map((c) => (
          <button
            key={c.key}
            type="button"
            className={`go-sum-card${filter === c.key ? ' active' : ''}`}
            style={{ borderColor: filter === c.key ? c.color : 'rgba(255,255,255,0.08)' }}
            onClick={() => setFilter(c.key)}
          >
            <span className="go-sum-glow" style={{ background: `radial-gradient(circle, ${c.color}33 0%, transparent 70%)` }} />
            <span className="go-sum-label">{c.label}</span>
            <span className="go-sum-value" style={{ color: c.color }}>{c.count}</span>
            <span className="go-sum-sub">{c.sub}</span>
          </button>
        ))}
      </div>
      <GoalsEditor goals={goals} loading={loading} onSave={handleSave} onDelete={handleDelete} />
      <Goals goals={shown} loading={loading} />
    </div>
  );
}

const GO_CSS = `
.go-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.go-sum-card { position: relative; overflow: hidden; text-align: left; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px 18px; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.go-sum-glow { position: absolute; top: -40px; right: -40px; width: 120px; height: 120px; border-radius: 50%; }
.go-sum-label { position: relative; display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; color: var(--muted, #a1a7b3); margin-bottom: 8px; }
.go-sum-value { position: relative; display: block; font-size: 2rem; font-weight: 800; line-height: 1; }
.go-sum-sub { position: relative; display: block; font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px; }
@media (max-width: 560px) { .go-summary { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('go-styles')) {
  const style = document.createElement('style');
  style.id = 'go-styles';
  style.textContent = GO_CSS;
  document.head.appendChild(style);
}

export function PositionsManagePage() {
  const finance = useFinance();
  const { toast } = useToast();
  const { loading, data, reload: load } = usePageData('positions', async (f) => {
    const [p, a] = await Promise.all([f.ds.positions.list(), f.ds.accounts.list()]);
    return { positions: p, accounts: a.filter((x) => x.kind === 'investment' || x.kind === 'crypto') };
  });
  const positions = data?.positions ?? [];
  const accounts = data?.accounts ?? [];
  const financeRef = useRef(finance);
  financeRef.current = finance;

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
      <ModuleTabs module="investimentos" />
      <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) handleImportCsv(e.target.files[0]); e.target.value = ''; }} />
      <Positions positions={positions} accounts={accounts} loading={loading} onSave={handleSave} onDelete={handleDelete} />
    </div>
  );
}
