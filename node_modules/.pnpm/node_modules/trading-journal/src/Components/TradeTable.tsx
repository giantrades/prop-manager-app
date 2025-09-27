// src/components/TradeTable.tsx
import React, { useMemo, useState } from 'react';
import type { Trade } from '../types/trade';
import { CSVLink } from 'react-csv';

/**
 * Minimal, performant TradeTable.
 * - receives trades array and callbacks for edit/delete.
 * - includes simple search & sorting & bulk select.
 */

type Props = {
  trades: Trade[];
  onEdit?: (t:Trade)=>void;
  onDelete?: (id:string)=>void;
};

export default function TradeTable({ trades, onEdit, onDelete }: Props) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string,boolean>>({});
  const [sortKey, setSortKey] = useState<'date'|'result_net'|'result_R'>('date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');

  const filtered = useMemo(()=> {
    const lower = q.toLowerCase();
    return trades.filter(t => {
      if (!q) return true;
      return (t.asset||'').toLowerCase().includes(lower)
        || (t.strategyId||'').toLowerCase().includes(lower)
        || (t.notes||'').toLowerCase().includes(lower);
    }).sort((a,b)=>{
      const av = (a as any)[sortKey] || 0;
      const bv = (b as any)[sortKey] || 0;
      if (av < bv) return sortDir==='asc' ? -1 : 1;
      if (av > bv) return sortDir==='asc' ? 1 : -1;
      return 0;
    });
  }, [trades, q, sortKey, sortDir]);

  const toggle = (id:string) => setSel(s => ({...s, [id]: !s[id]}));
  const bulkDelete = () => {
    const ids = Object.keys(sel).filter(k=>sel[k]);
    if (!ids.length) return alert('No selection');
    if (!confirm(`Delete ${ids.length} trades?`)) return;
    ids.forEach(id => onDelete && onDelete(id));
    setSel({});
  };

  const csvData = useMemo(()=> {
    return filtered.map(t=>({
      date: t.date,
      time: t.time,
      asset: t.asset,
      strategyId: t.strategyId,
      dir: t.direction,
      pnl: t.result_net,
      R: t.result_R,
      notes: t.notes
    }));
  }, [filtered]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex gap-2">
          <input className="input" placeholder="Search..." value={q} onChange={e=>setQ(e.target.value)} />
          <select className="select" value={sortKey} onChange={e=>setSortKey(e.target.value as any)}>
            <option value="date">Date</option>
            <option value="result_net">Result $</option>
            <option value="result_R">Result R</option>
          </select>
          <button className="btn ghost" onClick={()=> setSortDir(d=> d==='asc' ? 'desc' : 'asc')}>{sortDir}</button>
        </div>

        <div className="flex gap-2">
          <button className="btn ghost" onClick={bulkDelete}>Delete selected</button>
          <CSVLink data={csvData} filename="trades_export.csv" className="btn">Export CSV</CSVLink>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-[#0b1220]">
            <tr>
              <th style={{width: 40}}><input type="checkbox" onChange={(e)=> {
                const checked = e.target.checked;
                const next:Record<string,boolean> = {};
                if (checked) filtered.forEach(t=> next[t.id]=true);
                setSel(next);
              }} /></th>
              <th>Date</th>
              <th>Asset</th>
              <th>Strategy</th>
              <th>Dir</th>
              <th>Vol</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Net $</th>
              <th>R</th>
              <th>Tags</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className="hover:bg-[#071023]">
                <td><input type="checkbox" checked={!!sel[t.id]} onChange={()=>toggle(t.id)} /></td>
                <td>{t.date} {t.time||''}</td>
                <td>{t.asset}</td>
                <td>{t.strategyId}</td>
                <td>{t.direction}</td>
                <td>{t.volume}</td>
                <td>{(t.entryVwap||t.entry_price)?.toFixed?.(2) ?? '-'}</td>
                <td>{(t.exitVwap||'-')}</td>
                <td>{(t.result_net||0).toFixed(2)}</td>
                <td>{(t.result_R||0).toFixed(2)}</td>
                <td>
                  {Object.keys(t.tags||{}).map(k=> t.tags[k] ? <span key={k} className="px-2 py-0.5 mr-1 rounded bg-[#0b1730] text-xs">{k}</span> : null)}
                </td>
                <td title={t.notes||''}>{(t.notes||'').slice(0,40)}</td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn ghost small" onClick={()=> onEdit && onEdit(t)}>Edit</button>
                    <button className="btn ghost negative small" onClick={()=> onDelete && onDelete(t.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={13} className="p-6 muted">No trades found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
