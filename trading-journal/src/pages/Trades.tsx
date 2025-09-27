// src/pages/Trades.tsx
import React, { useMemo, useState } from 'react';
import TradeTable from '../Components/TradeTable';
import TradeForm from '../Components/TradeForm';
import { useJournalLocal } from '../hooks/useJournalLocal';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useJournal } from "@apps/journal-state";

/**
 * Trades page:
 * - top KPI cards
 * - equity chart (small)
 * - TradeTable with edit / delete / new trade
 */

export default function TradesPage() {
  const { trades, loading, addTrade, editTrade, removeTrade, stats } = useJournalLocal();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);

  // prepare equity series
  const equitySeries = useMemo(()=> {
    let acc = 0;
    return trades
      .slice()
      .sort((a,b)=> (a.createdAt || '').localeCompare(b.createdAt || ''))
      .map(t => {
        acc += (t.result_net || 0);
        return { x: t.date, y: acc };
      });
  }, [trades]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Trades</h2>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={()=> { setEditing(null); setOpen(true); }}>+ New Trade</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="muted">Total Trades</div>
          <div className="text-xl font-bold">{stats.total}</div>
        </div>
        <div className="card p-4">
          <div className="muted">Winrate</div>
          <div className="text-xl font-bold">{stats.winrate}%</div>
        </div>
        <div className="card p-4">
          <div className="muted">Avg R</div>
          <div className="text-xl font-bold">{(stats.avgR||0).toFixed(2)}</div>
        </div>
        <div className="card p-4">
          <div className="muted">Total PnL ($)</div>
          <div className="text-xl font-bold">{(stats.totalPnL||0).toFixed(2)}</div>
        </div>
      </div>

      {/* equity chart */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Equity Curve</h3>
        </div>
        <div style={{height:200}}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equitySeries}>
              <XAxis dataKey="x" hide />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="y" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* trades table */}
      <TradeTable
        trades={trades}
        onEdit={(t)=> { setEditing(t); setOpen(true); }}
        onDelete={(id)=> removeTrade(id)}
      />

      {open && <TradeForm onClose={()=> setOpen(false)} editing={editing} />}
    </div>
  );
}
