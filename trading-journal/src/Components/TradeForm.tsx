// src/components/TradeForm.tsx
import React, { useMemo, useState, useEffect } from 'react';
import type { Trade, Execution, AccountWeight } from '../types/trade';
import { useJournalLocal } from '../hooks/useJournalLocal';
import { useCurrency } from '@apps/state'; // optional: for formatting & exchange rate
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { v4 as uuidv4 } from 'uuid';

/**
 * TradeForm props:
 * - onClose(): close modal
 * - editing?: Trade | null -> if present, we are editing
 */
type Props = {
  onClose: () => void;
  editing?: Trade | null;
};

function fmt(v:number) {
  return (v||0).toFixed(2);
}

export default function TradeForm({ onClose, editing }: Props) {
  const { strategies, addTrade, editTrade, trades, strategies: sList } = useJournalLocal();
  const { currency, rate } = useCurrency ? useCurrency() : { currency: 'USD', rate: 1 };

  // initial form
  const [form, setForm] = useState<Partial<Trade>>(() => ({
    date: new Date().toISOString().slice(0,10),
    time: new Date().toISOString().slice(11,16),
    direction: 'Long',
    marketCategory: 'Futures',
    accounts: [],
    executions: [],
    tags: {}
  }));

  useEffect(() => {
    if (editing) {
      setForm(editing);
    }
  }, [editing]);

  // computed: VWAP / PnL / R
  const computeVWAP = (execs: Execution[], side: 'entry'|'exit') => {
    const arr = execs.filter(e=>e.side===side);
    const denom = arr.reduce((s,a)=>s+a.quantity,0);
    if (!denom) return 0;
    const num = arr.reduce((s,a)=>s + a.price * a.quantity,0);
    return num/denom;
  };

  const recalc = () => {
    const entries = (form.executions||[]).filter(e=>e.side==='entry');
    const exits = (form.executions||[]).filter(e=>e.side==='exit');
    const entryVwap = computeVWAP(entries,'entry');
    const exitVwap = computeVWAP(exits,'exit');
    const qtyTotal = entries.reduce((s,a)=>s+a.quantity,0);
    const directionSign = form.direction === 'Long' ? 1 : -1;
    const pnlGross = qtyTotal ? ( (exitVwap - entryVwap) * directionSign * qtyTotal ) : 0;
    const costs = (form.commission||0) + (form.fees||0) + (form.swap||0) + (form.slippage||0);
    const net = pnlGross - costs;
    const R$ = form.risk_per_R || 0;
    const r = R$ ? net / R$ : 0;
    setForm(prev => ({ ...prev, entryVwap, exitVwap, result_gross: pnlGross, result_net: net, result_R: r }));
  };

  useEffect(() => { recalc(); }, [form.executions, form.direction, form.risk_per_R, form.commission, form.fees, form.swap, form.slippage]);

  // executions editor helpers
  const addExecution = (side:'entry'|'exit') => {
    const ex: Execution = { id: uuidv4(), date: form.date||new Date().toISOString().slice(0,10), time: form.time||new Date().toISOString().slice(11,16), price: 0, quantity: 0, side };
    setForm(prev => ({ ...prev, executions: [...(prev.executions||[]), ex] }));
  };

  const updateExec = (id:string, patch:Partial<Execution>) => {
    setForm(prev => ({ ...prev, executions: (prev.executions||[]).map(e=> e.id===id ? {...e,...patch} : e) }));
  };

  const removeExec = (id:string) => {
    setForm(prev => ({ ...prev, executions: (prev.executions||[]).filter(e=>e.id!==id) }));
  };

  const handleSave = async () => {
    // basic validation: date, asset
    if (!form.asset) return alert('Asset required');
    if (editing && editing.id) {
      await editTrade(editing.id, form as Trade);
    } else {
      await addTrade(form as Partial<Trade>);
    }
    onClose();
  };

  // Strategy-based checklist auto-populate (if strategy has checklist)
  useEffect(() => {
    if (form.strategyId) {
      const strat = (sList || []).find((s:any)=> s.id === form.strategyId);
      if (strat && Array.isArray(strat.checklist)) {
        // convert array to tags booleans
        const tags = { ...(form.tags||{}) };
        for (const item of strat.checklist) tags[item] = tags[item] ?? false;
        setForm(prev => ({ ...prev, tags }));
      }
    }
  }, [form.strategyId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
      <div className="bg-black/80 absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-card rounded-2xl p-6 shadow-xl z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{editing ? 'Edit Trade' : 'New Trade'}</h3>
          <div className="flex items-center gap-2">
            <button className="btn ghost" onClick={onClose}>Close</button>
            <button className="btn" onClick={handleSave}>Save</button>
          </div>
        </div>

        {/* Row 1: date/time/asset/strategy */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="form-label">Date</label>
            <input className="input" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
          </div>
          <div>
            <label className="form-label">Time</label>
            <input className="input" type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} />
          </div>
          <div>
            <label className="form-label">Asset</label>
            <input className="input" value={form.asset||''} onChange={e=>setForm({...form,asset:e.target.value})} />
          </div>
          <div>
            <label className="form-label">Strategy</label>
            <select className="select" value={form.strategyId||''} onChange={e=>setForm({...form,strategyId: e.target.value || null})}>
              <option value=''>— none —</option>
              {(sList || []).map((s:any)=>(<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
        </div>

        {/* Row 2: market/direction/accounts */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="form-label">Market</label>
            <select className="select" value={form.marketCategory||'Futures'} onChange={e=>setForm({...form,marketCategory: e.target.value})}>
              <option>Futures</option><option>Forex</option><option>Cripto</option><option>Personal</option>
            </select>
          </div>
          <div>
            <label className="form-label">Direction</label>
            <select className="select" value={form.direction||'Long'} onChange={e=>setForm({...form,direction: e.target.value as any})}>
              <option value="Long">Long</option><option value="Short">Short</option>
            </select>
          </div>
          <div>
            <label className="form-label">Accounts (weights)</label>
            {/* quick accounts selection from global state - simplified UI */}
            <AccountsSmallEditor accounts={form.accounts||[]} onChange={(accs)=>setForm({...form,accounts:accs})} />
          </div>
        </div>

        {/* Row 3: prices & risk */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="form-label">Volume</label><input className="input" type="number" value={form.volume||0} onChange={e=>setForm({...form,volume:Number(e.target.value)})} /></div>
          <div><label className="form-label">Entry</label><input className="input" type="number" value={form.entry_price||0} onChange={e=>setForm({...form,entry_price:Number(e.target.value)})} /></div>
          <div><label className="form-label">Stop</label><input className="input" type="number" value={form.stop_loss_price||0} onChange={e=>setForm({...form,stop_loss_price:Number(e.target.value)})} /></div>
          <div><label className="form-label">Target</label><input className="input" type="number" value={form.profit_target_price||0} onChange={e=>setForm({...form,profit_target_price:Number(e.target.value)})} /></div>
        </div>

        {/* executions editor */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <strong>Executions</strong>
            <div className="flex gap-2">
              <button className="btn ghost" onClick={()=>addExecution('entry')}>+ Entry</button>
              <button className="btn ghost" onClick={()=>addExecution('exit')}>+ Exit</button>
            </div>
          </div>
          <div className="space-y-2 max-h-36 overflow-auto">
            {(form.executions||[]).map(ex=>(
              <div className="flex items-center gap-2" key={ex.id}>
                <input className="input" style={{width:120}} value={ex.date} onChange={e=>updateExec(ex.id,{date:e.target.value})} />
                <input className="input" style={{width:90}} value={ex.time||''} onChange={e=>updateExec(ex.id,{time:e.target.value})} />
                <input className="input" style={{width:120}} type="number" value={ex.price} onChange={e=>updateExec(ex.id,{price:Number(e.target.value)})} />
                <input className="input" style={{width:90}} type="number" value={ex.quantity} onChange={e=>updateExec(ex.id,{quantity:Number(e.target.value)})} />
                <div style={{minWidth:80}}>{ex.side}</div>
                <button className="btn ghost small" onClick={()=>removeExec(ex.id)}>Del</button>
              </div>
            ))}
          </div>
        </div>

        {/* costs / risk settings */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="form-label">Risk per R ($)</label><input className="input" type="number" value={form.risk_per_R||0} onChange={e=>setForm({...form,risk_per_R:Number(e.target.value)})} /></div>
          <div><label className="form-label">Commission</label><input className="input" type="number" value={form.commission||0} onChange={e=>setForm({...form,commission:Number(e.target.value)})} /></div>
          <div><label className="form-label">Fees</label><input className="input" type="number" value={form.fees||0} onChange={e=>setForm({...form,fees:Number(e.target.value)})} /></div>
          <div><label className="form-label">Swap/Slippage</label><input className="input" type="number" value={(form.swap||0)+(form.slippage||0)} onChange={e=>{ const v=Number(e.target.value); setForm({...form, swap: v*0.5, slippage: v*0.5})}} /></div>
        </div>

        {/* tags/checklist */}
        <div className="mb-3">
          <label className="form-label">Checklist / Tags</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.keys(form.tags||{}).length === 0 && <span className="muted">No checklist for this strategy</span>}
            {Object.entries(form.tags||{}).map(([k,v])=>(
              <label key={k} className="inline-flex items-center gap-2 px-2 py-1 bg-[#0f1724] text-sm rounded">
                <input type="checkbox" checked={!!v} onChange={e=> setForm(prev=> ({...prev, tags: {...(prev.tags||{}), [k]: e.target.checked}}))} />
                <span>{k}</span>
              </label>
            ))}
          </div>
        </div>

        {/* notes and summary */}
        <div className="mb-3">
          <label className="form-label">Notes</label>
          <textarea className="input" rows={3} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} />
        </div>

        {/* summary */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="card p-3">
            <div className="muted">Entry VWAP</div>
            <div className="text-xl font-semibold">{fmt(form.entryVwap||0)}</div>
          </div>
          <div className="card p-3">
            <div className="muted">Exit VWAP</div>
            <div className="text-xl font-semibold">{fmt(form.exitVwap||0)}</div>
          </div>
          <div className="card p-3">
            <div className="muted">Net PnL</div>
            <div className="text-xl font-semibold">{fmt(form.result_net||0)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------
  Small helper: Accounts editor
   - expects accounts from global @apps/state -> we emulate minimal UI
   - accounts param: AccountWeight[]
---------------------------*/
function AccountsSmallEditor({ accounts, onChange }:{accounts:AccountWeight[], onChange:(acc:AccountWeight[])=>void}) {
  // Try to read accounts from @apps/state if available:
  // If you want more advanced UI, replace with multi-select linked to global accounts list
  return (
    <div>
      <div className="muted text-sm">Assign accounts (enter id:weight)</div>
      <div className="flex gap-2 mt-1">
        <input className="input" placeholder="accountId:0.5" onKeyDown={(e)=> {
          if(e.key==='Enter') {
            const val = (e.target as HTMLInputElement).value;
            const [id,w] = val.split(':');
            if(id) {
              const next = [...(accounts||[]), { accountId: id.trim(), weight: Number(w||1) }];
              onChange(next);
              (e.target as HTMLInputElement).value='';
            }
          }
        }} />
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        {(accounts||[]).map(a=>(
          <div key={a.accountId} className="px-2 py-1 rounded bg-[#0f1724]">
            <span className="text-sm">{a.accountId} — {Math.round((a.weight||0)*100)}%</span>
            <button className="btn ghost small ml-2" onClick={()=> onChange((accounts||[]).filter(x=>x.accountId!==a.accountId))}>x</button>
          </div>
        ))}
      </div>
    </div>
  );
}
