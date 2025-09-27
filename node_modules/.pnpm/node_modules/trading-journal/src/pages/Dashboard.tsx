// src/pages/Dashboard.tsx
import React, { useMemo, useState, useEffect } from "react";
import {LineChart, Line,CartesianGrid,XAxis,YAxis,Tooltip as ReTooltip,ResponsiveContainer,Area,BarChart, Bar,PieChart, Pie,Cell,RadarChart,PolarGrid,PolarAngleAxis,PolarRadiusAxis,Radar,} from "recharts";
import { useJournal } from "@apps/journal-state";
import { FiltersProvider } from "@apps/state";
import { useFilters } from '@apps/state'


// Try to use host journal state if available
let dynamicUseJournal: any = null;
try {
  // dynamic require to avoid build-time failures if alias missing
  // @ts-ignore
  const m = require("@apps/journal-state");
  if (m && m.useJournal) dynamicUseJournal = m.useJournal;
} catch (e) {
  // not available: we'll fall back to mock
}

/* ----------------------
   Mock data generator
   ---------------------- */
function genMockTrades(count = 120) {
  const assets = ["EURUSD", "XAUUSD", "BTCUSD", "ES", "AAPL"];
  const tfs = ["5m", "15m", "1h", "4h"];
  const cats = ["Forex", "Futures", "Cripto", "Personal"];
  const rnd = (min: number, max: number) => Math.random() * (max - min) + min;

  const trades: any[] = [];
  let equity = 10000;
  for (let i = 0; i < count; i++) {
    const direction = Math.random() > 0.5 ? "Long" : "Short";
    const asset = assets[Math.floor(Math.random() * assets.length)];
    const tf = tfs[Math.floor(Math.random() * tfs.length)];
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const resultR = parseFloat((rnd(-2, 4) * (Math.random() > 0.8 ? 2 : 1)).toFixed(2));
    const pnl = parseFloat((resultR * 100).toFixed(2)); // R * 100$
    equity += pnl;
    trades.push({
      id: `t${i}`,
      date: new Date(Date.now() - (count - i) * 24 * 3600 * 1000).toISOString(),
      asset,
      marketCategory: cat,
      tf_signal: tf,
      direction,
      result_R: resultR,
      result_net: pnl,
      volume: Math.round(Math.abs(rnd(1, 20))),
      tags: ["EMA20_OK_M15"],
      notes: ""
    });
  }
  return trades;
}

/* ----------------------
   Utility calculations
   ---------------------- */
function calcMetrics(trades: any[]) {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.result_R > 0).length;
  const loss = trades.filter((t) => t.result_R <= 0).length;
  const winrate = totalTrades ? wins / totalTrades : 0;
  const avgR = totalTrades ? trades.reduce((s, t) => s + (t.result_R || 0), 0) / totalTrades : 0;
  const pnl = trades.reduce((s, t) => s + (t.result_net || 0), 0);
  const profits = trades.filter(t => t.result_net > 0).reduce((s,t)=> s + t.result_net, 0);
  const losses = Math.abs(trades.filter(t => t.result_net < 0).reduce((s,t)=> s + t.result_net, 0));
  const pf = losses === 0 ? Infinity : profits / losses;
  // simple sharpe: mean/std (sample) * sqrt(252)
  const returns = trades.map(t => (t.result_net || 0) / 10000); // relative simple daily-like proxy
  const mean = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const std = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length || 1));
  const sharpe = std === 0 ? 0 : (mean / std) * Math.sqrt(252);
  // skew/kurt (population)
  const m2 = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length || 0;
  const m3 = returns.reduce((s, r) => s + Math.pow(r - mean, 3), 0) / returns.length || 0;
  const m4 = returns.reduce((s, r) => s + Math.pow(r - mean, 4), 0) / returns.length || 0;
  const skew = m2 === 0 ? 0 : m3 / Math.pow(m2, 1.5);
  const kurt = m2 === 0 ? 0 : m4 / (m2 * m2) - 3;
  // risk of ruin crude: prob of series hitting -50% sim - mock using winrate & expectancy
  const expectancyR = avgR;
  const ror = (winrate && expectancyR) ? Math.max(0, 1 - (winrate * expectancyR) / (Math.abs(expectancyR) + 1)) : 0;

  // equity curve
  const equitySeries = [];
  let eq = 10000;
  for (const t of trades) {
    eq += (t.result_net || 0);
    equitySeries.push({ date: t.date.slice(0,10), equity: +eq.toFixed(2), pnl: t.result_net });
  }

  return {
    totalTrades, winrate, avgR, pnl, pf, sharpe, skew, kurt, ror,
    equitySeries
  };
}

/* ----------------------
   Small presentational components
   ---------------------- */

function KpiCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4 shadow-sm bg-surface rounded-md">
      <div className="text-xs text-muted">{title}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  );
}

function MiniTooltip({ payload }: any) {
  if (!payload || !payload.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: "#0f1724", color: "#e6eef8", padding: 8, borderRadius: 8 }}>
      <div style={{ fontWeight: 700 }}>{p.payload.date}</div>
      <div style={{ fontSize: 12 }}>{`Equity: ${p.payload.equity?.toFixed(2) ?? "-"}`}</div>
    </div>
  );
}

/* ----------------------
   Main Dashboard page
   ---------------------- */
export default function DashboardPage() {
  // if host app provides a hook, use it — else use mock data
  const journal = useJournal ? useJournal() : null;
  const tradesFromStore = journal ? journal.trades || [] : genMockTrades(180);

  // filter state
  const [range, setRange] = useState<[string,string] | null>(null);
  const [selectedAccountOrCategory, setSelectedAccountOrCategory] = useState<string | null>(null);
  const [tfFilter, setTfFilter] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<string | null>(null);

  // apply filters
  const trades = useMemo(() => {
    let t = tradesFromStore.slice();
    if (selectedAccountOrCategory) {
      t = t.filter((tr:any) => tr.marketCategory === selectedAccountOrCategory || tr.asset === selectedAccountOrCategory);
    }
    if (tfFilter) t = t.filter((tr:any) => tr.tf_signal === tfFilter);
    if (directionFilter) t = t.filter((tr:any) => tr.direction === directionFilter);
    if (range) {
      const [from, to] = range;
      t = t.filter((tr:any) => tr.date >= from && tr.date <= to);
    }
    return t;
  }, [tradesFromStore, selectedAccountOrCategory, tfFilter, directionFilter, range]);

  const metrics = useMemo(() => calcMetrics(trades), [trades]);

  // breakdowns
  const byTF = useMemo(() => {
    const map:any = {};
    trades.forEach((t:any) => {
      map[t.tf_signal] = map[t.tf_signal] || { count:0, pnl:0, wins:0, results:[] };
      map[t.tf_signal].count++;
      map[t.tf_signal].pnl += t.result_net;
      if (t.result_R>0) map[t.tf_signal].wins++;
      map[t.tf_signal].results.push(t.result_R);
    });
    return Object.entries(map).map(([k,v]: any) => ({
      tf: k, count: v.count, pnl: v.pnl, winrate: v.count ? (v.wins / v.count) : 0,
      avgR: v.results.length ? v.results.reduce((s:any,x:number)=>s+x,0)/v.results.length : 0
    }));
  }, [trades]);

  const longShort = useMemo(() => {
    const long = trades.filter((t:any)=>t.direction==='Long');
    const short = trades.filter((t:any)=>t.direction==='Short');
    const sum = (arr:any[]) => arr.reduce((s,t)=>s + (t.result_net||0),0);
    return [
      { name: "Long", pnl: sum(long), count: long.length },
      { name: "Short", pnl: sum(short), count: short.length }
    ];
  }, [trades]);

  const tagCounts = useMemo(() => {
  const m: Record<string, number> = {};

  trades.forEach((t: any) => {
    Object.keys(t.tags || {}).forEach((tag) => {
      if (t.tags[tag]) {
        m[tag] = (m[tag] || 0) + 1;
      }
    });
  });

  return Object.entries(m).map(([k, v]) => ({ tag: k, count: v }));
}, [trades]);


  /* ----------------------
     UI layout
     ---------------------- */
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="text-2xl font-bold">📈 Trading Journal</div>

        <div className="flex gap-2 items-center ml-4">
          <select className="input" value={selectedAccountOrCategory||""} onChange={(e)=> setSelectedAccountOrCategory(e.target.value || null)}>
            <option value="">— All categories / accounts —</option>
            <option value="Futures">Futures</option>
            <option value="Forex">Forex</option>
            <option value="Cripto">Cripto</option>
            <option value="Personal">Personal</option>
            {/* You can replace with dynamic accounts list */}
          </select>

          <input className="input" placeholder="Date from (YYYY-MM-DD)" onBlur={(e)=> {
            const from = e.target.value.trim();
            if (!from) { setRange(null); return; }
            // keep simple: single-day range
            setRange([from, new Date().toISOString().slice(0,10)]);
          }} />
          <button className="btn ghost" onClick={()=> { setTfFilter(null); setDirectionFilter(null); setSelectedAccountOrCategory(null); setRange(null); }}>Reset</button>
        </div>

        <div className="spacer" />
        <div className="flex items-center gap-3">
          <button className="btn">Advanced filters</button>
        </div>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard title="Total PnL ($)" value={`${metrics.pnl.toFixed(2)}`} hint="Net profit/loss" />
        <KpiCard title="Winrate" value={`${(metrics.winrate*100).toFixed(1)}%`} hint="Wins / total trades" />
        <KpiCard title="Avg R" value={metrics.avgR.toFixed(2)} hint="Expectancy (R)" />
        <KpiCard title="Profit Factor" value={isFinite(metrics.pf) ? metrics.pf.toFixed(2) : "∞"} hint="Gains / losses" />
        <KpiCard title="Sharpe" value={metrics.sharpe.toFixed(2)} hint="Sharpe (proxy)" />
        <KpiCard title="Skew" value={metrics.skew.toFixed(2)} hint="Return skewness" />
        <KpiCard title="Kurtosis" value={metrics.kurt.toFixed(2)} hint="Return kurtosis" />
        <KpiCard title="Risk of Ruin" value={`${(metrics.ror*100).toFixed(2)}%`} hint="Empirical estimate" />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity curve (big) */}
        <div className="card p-4 bg-surface rounded-md col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Equity Curve</div>
            <div className="text-sm text-muted">{trades.length} trades</div>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.equitySeries}>
                <CartesianGrid strokeDasharray="3 6" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["dataMin - 1000", "dataMax + 1000"]} />
                <ReTooltip content={<MiniTooltip payload={[]} />} />
                <Area type="monotone" dataKey="equity" stroke="#0ea5a4" fill="#052f2f" fillOpacity={0.12} />
                <Line type="monotone" dataKey="equity" stroke="#10b981" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution / Tags */}
        <div className="card p-4 bg-surface rounded-md">
          <div className="font-semibold mb-3">Distribution of Trades (tags)</div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tagCounts}>
                <CartesianGrid strokeDasharray="2 6" opacity={0.25} />
                <XAxis dataKey="tag" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ReTooltip />
                <Bar dataKey="count" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-muted">Top setups / tags frequency</div>
        </div>
      </div>

      {/* Timeframe performance & Long vs Short & Checklist radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 bg-surface rounded-md">
          <div className="font-semibold mb-3">Timeframe Performance</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th>TF</th><th>Count</th><th>Win%</th><th>AvgR</th></tr></thead>
            <tbody>
              {byTF.map((r:any)=>(
                <tr key={r.tf}>
                  <td className="py-1">{r.tf}</td>
                  <td className="py-1">{r.count}</td>
                  <td className="py-1">{(r.winrate*100).toFixed(1)}%</td>
                  <td className="py-1">{r.avgR.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4 bg-surface rounded-md">
          <div className="font-semibold mb-3">Long vs Short</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={longShort} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
                  <Cell fill="#34d399" />
                  <Cell fill="#60a5fa" />
                </Pie>
                <ReTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-muted">P&L by direction</div>
        </div>

        <div className="card p-4 bg-surface rounded-md">
          <div className="font-semibold mb-3">Checklist Impact (Radar)</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                {subject: 'Checklist1', A: 120},
                {subject: 'Checklist2', A: 98},
                {subject: 'Checklist3', A: 86},
                {subject: 'Checklist4', A: 99},
                {subject: 'Checklist5', A: 85},
              ]}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <PolarRadiusAxis />
                <Radar name="Impact" dataKey="A" stroke="#f97316" fill="#fb923c" fillOpacity={0.4} />
                <ReTooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Volume vs ROI and table of recent trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 bg-surface rounded-md">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Volume vs ROI</div>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trades.slice().reverse().slice(0,40)}>
                <CartesianGrid strokeDasharray="2 6" opacity={0.2} />
                <XAxis dataKey="asset" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ReTooltip />
                <Bar dataKey="volume" maxBarSize={24} fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4 bg-surface rounded-md">
          <div className="font-semibold mb-3">Recent Trades</div>
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted border-b"><tr><th>Date</th><th>Asset</th><th>R</th><th>PnL</th></tr></thead>
              <tbody>
                {trades.slice().reverse().slice(0,25).map((t:any)=>(
                  <tr key={t.id} className="hover:bg-zinc-800">
                    <td className="py-1">{t.date.slice(0,10)}</td>
                    <td className="py-1">{t.asset} <span className="text-xs text-muted">({t.tf_signal})</span></td>
                    <td className="py-1">{t.result_R?.toFixed(2)}</td>
                    <td className={`py-1 ${t.result_net >= 0 ? 'text-green-400' : 'text-rose-400'}`}>{t.result_net?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer small notes */}
      <footer className="text-xs text-muted">Data shown is mock/demo. Integrate with journal-state to use real user data.</footer>
    </div>
  );
}
