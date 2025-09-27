// src/pages/Strategies.tsx
import React, { useState } from 'react';
import { useJournalLocal } from '../hooks/useJournalLocal';
import { useJournal } from "@apps/journal-state";
/**
 * Strategies page:
 * - list strategies
 * - create/edit modal with dynamic checklist
 * - simple strategy analytics (PnL/time)
 */

export default function StrategiesPage() {
  const { strategies, trades, addStrategy, removeStrategy } = useJournalLocal() as any;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [form, setForm] = useState({ name:'', description:'', category:'Futures', checklist: [] as string[], tags: [] as string[] });

  const openNew = () => { setEditing(null); setForm({ name:'', description:'', category:'Futures', checklist: [], tags: [] }); setOpen(true); };
  const save = () => {
    addStrategy(form);
    setOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Strategies</h2>
        <div>
          <button className="btn" onClick={openNew}>+ New Strategy</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(strategies||[]).map((s:any)=> {
          const linkedTrades = (trades||[]).filter((t:any)=> t.strategyId === s.id);
          const totalPnL = linkedTrades.reduce((a:any,b:any)=>a + (b.result_net||0),0);
          const wins = linkedTrades.filter((t:any)=> (t.result_net||0) > 0).length;
          const winrate = linkedTrades.length ? Math.round((wins/linkedTrades.length)*1000)/10 : 0;
          const avgR = linkedTrades.length ? (linkedTrades.reduce((a:any,b:any)=> a + (b.result_R||0),0) / linkedTrades.length) : 0;
          return (
            <div className="card p-4" key={s.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{s.name}</h4>
                  <div className="muted text-sm">{s.category}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{totalPnL.toFixed(2)}</div>
                  <div className="muted text-xs">PnL</div>
                </div>
              </div>

              <div className="mt-3 text-sm">
                <div>Trades: {linkedTrades.length}</div>
                <div>Winrate: {winrate}%</div>
                <div>Avg R: {avgR.toFixed(2)}</div>
                <div className="mt-2">
                  <button className="btn ghost small mr-2" onClick={()=> { setEditing(s); setForm(s); setOpen(true); }}>Edit</button>
                  <button className="btn ghost negative small" onClick={()=> removeStrategy(s.id)}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for create/edit */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
          <div className="bg-black/60 absolute inset-0" onClick={()=>setOpen(false)} />
          <div className="relative z-10 bg-card rounded-2xl p-6 w-full max-w-2xl">
            <h3 className="text-lg font-semibold mb-3">{editing ? 'Edit strategy' : 'New strategy'}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Name</label>
                <input className="input" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
              </div>
              <div>
                <label className="form-label">Category</label>
                <select className="select" value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
                  <option>Futures</option><option>Forex</option><option>Cripto</option><option>Personal</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="form-label">Description</label>
                <textarea className="input" rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} />
              </div>

              <div className="col-span-2">
                <label className="form-label">Checklist items</label>
                <div className="flex gap-2">
                  <input className="input" placeholder="Add checklist item and press Enter" onKeyDown={(e)=> {
                    if (e.key==='Enter') {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) { setForm(prev => ({ ...prev, checklist: [...prev.checklist, v] })); (e.target as HTMLInputElement).value=''; }
                    }
                  }} />
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {form.checklist.map((c, idx) => <span key={idx} className="px-2 py-1 rounded bg-[#0f1724]">{c} <button className="btn ghost tiny ml-2" onClick={()=> setForm(prev=> ({...prev, checklist: prev.checklist.filter((x,i)=>i!==idx)}))}>x</button></span>)}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn ghost" onClick={()=> setOpen(false)}>Cancel</button>
              <button className="btn" onClick={()=> { addStrategy(form); setOpen(false); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
