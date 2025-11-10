import React, { useMemo,useEffect, useState, useRef } from "react";
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend,BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, Scatter, ScatterChart, ComposedChart, ReferenceLine} from "recharts";
import { useJournal } from "@apps/journal-state";
import { useCurrency } from "@apps/state";
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
import HeatMapSection from "../Components/Dashboard/HeatMapSection";
import DurationAnalysis from "../Components/Dashboard/DurationAnalysis";
import DrawdownSection from "../Components/Dashboard/DrawdownSection";



// Dashboard.tsx

function calculateDuration(entryStr?: string, exitStr?: string) {
  if (!entryStr || !exitStr) return "";
  try {
    const [eDate, eTime] = entryStr.split("T");
    const [xDate, xTime] = exitStr.split("T");
    const eParts = [...eDate.split("-").map(Number), ...eTime.split(":").map(Number)];
    const xParts = [...xDate.split("-").map(Number), ...xTime.split(":").map(Number)];
    const entry = new Date(eParts[0], eParts[1] - 1, eParts[2], eParts[3], eParts[4]);
    const exit = new Date(xParts[0], xParts[1] - 1, xParts[2], xParts[3], xParts[4]);

    const diffMs = exit.getTime() - entry.getTime();
    if (diffMs < 0) return "–";

    const diffMins = Math.floor(diffMs / 60000);
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    return `${h}h ${m}m`;
  } catch {
    return "";
  }
}

// --------------------------- Integrated Data Hook ---------------------------
function useIntegratedData() {
  // Dados do journal (trades)
  const journal = useJournal();
  const trades = journal?.trades || [];
  
  // Dados do main-app (contas)
  const [accounts, setAccounts] = useState(() => getAll().accounts || []);

useEffect(() => {
  setAccounts(getAll().accounts || []);
}, []);

  
  // Map de contas por ID para facilitar lookup
  const accountsById = useMemo(() => {
    const map = new Map();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
    });
    return map;
  }, [accounts]);
  
  // Map de contas por nome (fallback)
  const accountsByName = useMemo(() => {
    const map = new Map();
    accounts.forEach(acc => {
      map.set(acc.name, acc);
    });
    return map;
  }, [accounts]);
  
  // Enriquecer trades com informações das contas
  const enrichedTrades = useMemo(() => {
    return trades.map(trade => {
      // Tentar encontrar a conta associada
      let account = null;
      
      if (trade.accountId) {
        account = accountsById.get(trade.accountId);
      } else if (trade.accountName) {
        account = accountsByName.get(trade.accountName);
      } else if (trade.account) {
        account = accountsByName.get(trade.account);
      }
      
      return {
        ...trade,
        // Se encontrou conta, usar o tipo dela; senão, usar categoria do trade ou fallback
        accountType: account?.type || trade.marketCategory || trade.category || 'Unknown',
        accountName: account?.name || trade.accountName || trade.account || 'Unknown Account',
        account: account
      };
    });
  }, [trades, accountsById, accountsByName]);
  
  // Categorias disponíveis (tipos das contas do main-app)
  const availableCategories = useMemo(() => {
    const categories = new Set();
    accounts.forEach(acc => {
      if (acc.type) categories.add(acc.type);
    });
    // Adicionar categorias dos trades que não tem conta associada
    enrichedTrades.forEach(trade => {
      if (trade.accountType && trade.accountType !== 'Unknown') {
        categories.add(trade.accountType);
      }
    });
    return Array.from(categories).sort();
  }, [accounts, enrichedTrades]);
  
  return {
    trades: enrichedTrades,
    accounts,
    availableCategories,
    hasRealData: enrichedTrades.length > 0 && accounts.length > 0
  };
}

// --------------------------- Mock data fallback ---------------------------
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
    const accountType = cats[Math.floor(Math.random() * cats.length)];
    const resultR = parseFloat((rnd(-2, 4) * (Math.random() > 0.8 ? 2 : 1)).toFixed(2));
    const pnl = parseFloat((resultR * 100).toFixed(2));
    equity += pnl;
    trades.push({
      id: `mock_t${i}`,
      entry_datetime: new Date(Date.now() - (count - i) * 24 * 3600 * 1000).toISOString(),
      asset,
      accountType, 
      tf_signal: tf,
      direction,
      result_R: resultR,
      result_net: pnl,
      volume: Math.round(Math.abs(rnd(1, 20))),
      accountName: `Account ${accountType} ${Math.floor(Math.random() * 3) + 1}`
    });
  }
  return trades;
}

// --------------------------- Helpers / Metrics ---------------------------
function useFormatter() {
  try {
    const { currency, rate } = useCurrency() || { currency: "USD", rate: 1 };
        const fmt = (v: number) => currency === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate);
    const fmtShort = (v: number) =>
      (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));
    return { fmt, fmtShort, currency, rate };
  } catch (e) {
    const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
    return { fmt, fmtShort: (v: number) => (v || 0).toFixed(0), currency: "USD", rate: 1 };
  }
}

function safeNumber(n: any) { return typeof n === "number" && !isNaN(n) ? n : 0; }
function getTotalR(trade) {
  if (!trade) return 0;
  if (!Array.isArray(trade.PartialExecutions)) return trade.result_R || 0;
  return trade.PartialExecutions.reduce(
    (acc, p) => acc + (Number(p.result_R) || 0), 
    0
  );
}

function calcBasicStats(trades: any[]) {
  const total = trades.length;

  // ✅ Winrate usando soma correta de R (PartialExecutions)
  const wins = trades.filter(t => getTotalR(t) > 0).length;
  const losses = total - wins;
  const winrate = total ? wins / total : 0;

  // ✅ Vetor de R consolidado (sempre vindo das partials)
  const R_values = trades.map(t => getTotalR(t));

  // ✅ Média de R
  const avgR = total ? R_values.reduce((s, r) => s + r, 0) / total : 0;

  // ✅ Trades com R positivo e negativo
  const winningTrades = trades.filter(t => getTotalR(t) > 0);
  const losingTrades = trades.filter(t => getTotalR(t) <= 0);

  const avgWinR = winningTrades.length
    ? winningTrades.reduce((s, t) => s + getTotalR(t), 0) / winningTrades.length
    : 0;

  const avgLossR = losingTrades.length
    ? losingTrades.reduce((s, t) => s + getTotalR(t), 0) / losingTrades.length
    : 0;

  // ✅ Expected R (EV)
  const expectedR = (winrate * avgWinR) + ((1 - winrate) * avgLossR);

  // ✅ PnL continua igual (já está correto)
  const pnl = trades.reduce((s, t) => s + safeNumber(t.result_net), 0);

  // ✅ Profit Factor (mantido como antes)
  const profitFactor = (() => {
    const profits = trades.filter(t => safeNumber(t.result_net) > 0).reduce((s, t) => s + t.result_net, 0);
    const losses = Math.abs(trades.filter(t => safeNumber(t.result_net) < 0).reduce((s, t) => s + t.result_net, 0));
    if (losses === 0) return profits === 0 ? 0 : Infinity;
    return profits / losses;
  })();

  // ✅ Sharpe, skew, kurtosis mantidos (com result_net)
  const returns = trades.map(t => (safeNumber(t.result_net) / 10000)); 
  const mean = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length || 1);
  const std = Math.sqrt(variance) || 0;
  const sharpe = std === 0 ? 0 : (mean / std) * Math.sqrt(252);

  const m2 = variance;
  const m3 = returns.reduce((s, r) => s + Math.pow(r - mean, 3), 0) / (returns.length || 1);
  const m4 = returns.reduce((s, r) => s + Math.pow(r - mean, 4), 0) / (returns.length || 1);
  const skew = m2 === 0 ? 0 : m3 / Math.pow(m2, 1.5);
  const kurt = m2 === 0 ? 0 : m4 / (m2 * m2) - 3;

  // ✅ Risk of Ruin com R correto
  const RoR = (() => {
    const p = winrate;
    const q = 1 - p;
    const b = avgR || 0;
    if (p === 0 || b <= 0) return 100;
    return Math.min(100, Math.max(0, (1 - Math.pow((p - q) / (p + q), 1)) * 100));
  })();

  return {
    total,
    wins,
    losses,
    winrate,
    avgR,
    avgWinR: avgWinR.toFixed(2),
    avgLossR: avgLossR.toFixed(2),
    expectedR: expectedR.toFixed(2),
    pnl,
    profitFactor,
    sharpe,
    skew,
    kurt,
    RoR
  };
}


// equity series (cumulative) - agora inclui rawDate (ISO) + date (label) + equity numérico
function buildEquitySeries(trades: any[], start = 10000) {
  let eq = Number(start || 0);

  const sorted = (trades || [])
    .filter((t) => t && t.entry_datetime)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.entry_datetime).getTime() || 0;
      const tb = new Date(b.entry_datetime).getTime() || 0;
      return ta - tb;
    });

  return sorted.map((t) => {
    // garante number
    const pnl = Number(t.result_net || 0);
    eq = Number(eq) + pnl;
    return {
      rawDate: t.entry_datetime,
      date: t.entry_datetime ? new Date(t.entry_datetime).toLocaleDateString("pt-BR") : "",
      equity: +eq.toFixed(2),
      pnl: pnl,
    };
  });
}


// group helpers
function groupByMonth(trades) {
  const map = {};
  trades.forEach(t => {
    if (!t.entry_datetime) return;
    const key = new Date(t.entry_datetime).toISOString().slice(0, 7);
    map[key] = (map[key] || 0) + (t.result_net || 0);
  });
  return Object.entries(map).map(([month, pnl]) => ({ month, pnl }));
}


function pnlByCategory(trades: any[]) {
  const map: Record<string, { pnl: number; count: number; wins: number }> = {};
  trades.forEach(t => {
    const cat = t.accountType || "Unknown";
    map[cat] = map[cat] || { pnl: 0, count: 0, wins: 0 };
    map[cat].pnl += safeNumber(t.result_net);
    map[cat].count += 1;
    if (safeNumber(t.result_R) > 0) map[cat].wins += 1;
  });
  return Object.entries(map).map(([name, v]) => ({ 
    name, 
    pnl: +v.pnl.toFixed(2), 
    count: v.count, 
    winrate: +(v.wins / v.count * 100).toFixed(1) 
  }));
}

// Timeframe performance detalhada (lucros e perdas)
function winRateByTimeframe(trades: any[]) {
  const map: Record<
    string,
    { pnlWin: number; pnlLoss: number; wins: number; losses: number; total: number }
  > = {};

  trades.forEach((t) => {
    const tf = t.tf_signal || t.timeframe || "Unknown";
    const pnl = Number(t.result_net) || 0;
    const isWin = pnl > 0;

    if (!map[tf]) map[tf] = { pnlWin: 0, pnlLoss: 0, wins: 0, losses: 0, total: 0 };

    map[tf].total++;
    if (isWin) {
      map[tf].wins++;
      map[tf].pnlWin += pnl;
    } else {
      map[tf].losses++;
      map[tf].pnlLoss += Math.abs(pnl);
    }
  });
  

  return Object.entries(map)
    .map(([tf, v]) => ({
      tf,
      pnlWin: +v.pnlWin.toFixed(2),
      pnlLoss: +v.pnlLoss.toFixed(2),
      wins: v.wins,
      losses: v.losses,
      total: v.total,
      winRate: v.total ? +(v.wins / v.total * 100).toFixed(1) : 0,
      lossRate: v.total ? +(v.losses / v.total * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => (b.pnlWin - b.pnlLoss) - (a.pnlWin - a.pnlLoss));
}


// ✅ Histogram R – agora usa o R REAL vindo das PartialExecutions
function histogramR(trades: any[], bins = 20) {
  const arr = trades.map(t => getTotalR(t)); // <-- corrigido aqui
  if (arr.length === 0) return [];

  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const step = (max - min) / bins || 1;

  const buckets = Array.from({ length: bins }, (_, i) => ({
    x0: min + i * step,
    x1: min + (i + 1) * step,
    count: 0
  }));

  arr.forEach(v => {
    const idx = Math.min(buckets.length - 1, Math.max(0, Math.floor((v - min) / step)));
    buckets[idx].count += 1;
  });

  return buckets.map(b => ({
    label: `${b.x0.toFixed(2)} - ${b.x1.toFixed(2)}`,
    count: b.count
  }));
}

// ✅ Curva de densidade (KDE) também usando o R correto
function computeKDE(valuesOrTrades: any[], bins = 40) {
// Se mandarem trades, converto. Se já for array de números, uso direto.
  const values = Array.isArray(valuesOrTrades[0])
    ? valuesOrTrades
    : valuesOrTrades.map((t: any) => getTotalR(t));

  if (!values || values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (max - min) / bins || 1;
  const bandwidth = (max - min) / Math.cbrt(values.length) || 1;
  const kernel = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  return Array.from({ length: bins }, (_, i) => {
    const x = min + i * step;
    const y = values.reduce((s, v) => s + kernel((x - v) / bandwidth), 0) / (values.length * bandwidth);
    return { label: x.toFixed(2), density: y };
  });
}

// 📈 PnL Growth Curve (Total Net P&L por filtros/contas)
const EquityArea = ({ trades = [], selectedAccount, fmt }: any) => {
  const safeNumber = (n: any) =>
    typeof n === "number" && !isNaN(n) ? n : Number(n) || 0;

  // 🔹 Aplica filtro de conta se houver conta selecionada
  const filtered = React.useMemo(() => {
    if (!selectedAccount) return trades;
    return trades.filter(
      (t: any) =>
        t.accountId === selectedAccount.id ||
        t.accountName === selectedAccount.name ||
        t.account?.name === selectedAccount.name
    );
  }, [trades, selectedAccount]);

  // 🔹 Gera série cumulativa iniciando em 0
  const series = React.useMemo(() => {
    const sorted = (filtered || [])
      .filter((t: any) => t && t.entry_datetime)
      .sort(
        (a: any, b: any) =>
          new Date(a.entry_datetime).getTime() -
          new Date(b.entry_datetime).getTime()
      );

    let cumulativePnL = 0;
    const result = [
      {
        entry_datetime: sorted[0]
          ? new Date(sorted[0].entry_datetime).toLocaleDateString("pt-BR")
          : "",
        pnl: 0,
      },
    ];

    sorted.forEach((t: any) => {
      cumulativePnL += safeNumber(t.result_net);
      result.push({
        entry_datetime: new Date(t.entry_datetime).toLocaleDateString("pt-BR"),
        pnl: +cumulativePnL.toFixed(2),
      });
    });

    return result;
  }, [filtered]);

  // 📊 Estatísticas básicas da curva
  const highestPnL = Math.max(...series.map((s) => s.pnl || 0), 0);
  const currentPnL = series.length ? series[series.length - 1].pnl : 0;
  const minPnL = Math.min(...series.map((s) => s.pnl || 0), 0);
  const maxDrawdownAbs = highestPnL - minPnL;
  const maxDrawdownPct =
    highestPnL > 0 ? ((maxDrawdownAbs / highestPnL) * 100).toFixed(2) : "0.00";

  // 🔹 Tooltip customizado
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const val = payload[0].value;
      return (
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#f3f4f6",
          }}
        >
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            {payload[0]?.payload?.entry_datetime}
          </div>
          <div
            style={{
              fontWeight: 600,
              color: val >= 0 ? "#4ade80" : "#ef4444",
            }}
          >
            {fmt ? fmt(val) : val.toLocaleString()}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="card"
      style={{
        background: "linear-gradient(180deg,#10151f 0%,#0c1119 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <h3 style={{ fontSize: 18, color: "#f3f4f6", marginBottom: 8 }}>
        📈 PnL Growth (Cumulative)
      </h3>

      {selectedAccount && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
          Showing data for <strong>{selectedAccount.name}</strong> (
          {selectedAccount.type})
        </div>
      )}

      {/* Gráfico */}
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series}
            margin={{ top: 10, right: 40, left: 10, bottom: 10 }}
          >
            <defs>
              <linearGradient id="gradPnL" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="#1f2937"
              strokeDasharray="3 3"
              opacity={0.3}
            />
            <XAxis
              dataKey="entry_datetime"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => (fmt ? fmt(v) : v.toLocaleString())}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={[0, "dataMax"]}
              width={100}
            />
            <ReTooltip content={<CustomTooltip />} />
            <Area
              type="monotoneX"
              dataKey="pnl"
              stroke="#22c55e"
              strokeWidth={2.2}
              fill="url(#gradPnL)"
              dot={false}
              isAnimationActive
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 📘 Legenda estilo histograma */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 10,
          padding: "10px 14px",
          marginTop: 14,
        }}
      >
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Highest PnL</div>
          <div style={{ color: "#e5e7eb", fontWeight: 600 }}>
            {fmt ? fmt(highestPnL) : highestPnL}
          </div>
        </div>

        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Current PnL</div>
          <div
            style={{
              color: currentPnL >= 0 ? "#4ade80" : "#f87171",
              fontWeight: 600,
            }}
          >
            {fmt ? fmt(currentPnL) : currentPnL}
          </div>
        </div>

        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Max Drawdown</div>
          <div style={{ color: "#e5e7eb", fontWeight: 600 }}>
            {fmt ? fmt(maxDrawdownAbs) : maxDrawdownAbs}{" "}
            <span style={{ color: "#9ca3af", fontSize: 11 }}>
              ({maxDrawdownPct}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};



// Category pie + table with account type colors
const CategoryCard = ({ data, fmt }: any) => {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Forex": return "#15b91d";
      case "Cripto": return "#e9820d";
      case "Futures": return "#1b55ad";
      case "Personal": return "#cc1e52";
      default: return "#5b6270";
    }
  };

  const totalPnl = data.reduce((s: number, d: any) => s + d.pnl, 0);
  const totalFmt = fmt(totalPnl);
  const radius = 80;
  const center = 100;
  let startAngle = 0;

  const paths =
    data.length > 1
      ? data.map((entry: any) => {
          const pct = totalPnl ? entry.pnl / totalPnl : 0;
          const endAngle = startAngle + pct * 360;
          const largeArc = endAngle - startAngle > 180 ? 1 : 0;

          const start = {
            x: center + radius * Math.cos((Math.PI / 180) * (startAngle - 90)),
            y: center + radius * Math.sin((Math.PI / 180) * (startAngle - 90)),
          };
          const end = {
            x: center + radius * Math.cos((Math.PI / 180) * (endAngle - 90)),
            y: center + radius * Math.sin((Math.PI / 180) * (endAngle - 90)),
          };

          const path = `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
          startAngle = endAngle;

          return (
            <path
              key={entry.name}
              d={path}
              fill={getCategoryColor(entry.name)}
              opacity="0.9"
              stroke="#0f1419"
              strokeWidth={0.5}
            />
          );
        })
      : [
          <circle
            key="single"
            cx={center}
            cy={center}
            r={radius}
            fill={getCategoryColor(data[0]?.name || "Unknown")}
            opacity="0.9"
          />,
        ];

  return (
    <div
      className="card"
      style={{
        display: "grid",
        gap: 16,
        background: "linear-gradient(180deg,#1a1f2e 0%,#151a27 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 24,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#f3f4f6", marginBottom: 12 }}>
        🎯 P&L por Categoria
      </h2>

      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        {/* Gráfico */}
        <div
          style={{
            width: 260,
            height: 260,
            position: "relative",
            flexShrink: 0,
          }}
        >
          <svg width="100%" height="100%" viewBox="0 0 200 200">
            {paths}
            <circle cx="100" cy="100" r="50" fill="#111827" />
          </svg>

          {/* Texto Central */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              width: "85%",
              padding: "8px 0",
            }}
          >
            <div
              style={{
                fontSize:
                  totalFmt.length > 10
                    ? 18
                    : totalFmt.length > 8
                    ? 20
                    : 24,
                fontWeight: 700,
                color: "#f9fafb",
                textShadow: "0 0 6px rgba(255,255,255,0.08)",
              }}
            >
              {totalFmt}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Total P&L</div>
          </div>
        </div>

        {/* Lista */}
        <div
          style={{
            flex: 1,
            minWidth: 220,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {data.map((row: any) => (
            <div
              key={row.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: getCategoryColor(row.name),
                  }}
                />
                <div>
                  <h4 style={{ fontSize: 15, color: "#f3f4f6", marginBottom: 4 }}>
                    {row.name}
                  </h4>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {row.count} trades • {row.winrate}% WR
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: row.pnl >= 0 ? "#4ade80" : "#f87171",
                  }}
                >
                  {fmt(row.pnl)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// versão corrigida e compatível com seu winRateByTimeframe atual
const TimeframeBar = ({ data = [], fmt }: any) => {
  if (!data || data.length === 0) return null;

  const totalPnL = data.reduce((sum, d) => sum + (d.pnlWin - d.pnlLoss), 0);
  const best = data.reduce(
    (a, b) => ((b.pnlWin - b.pnlLoss) > (a.pnlWin - a.pnlLoss) ? b : a),
    data[0]
  );
  const worst = data.reduce(
    (a, b) => ((b.pnlWin - b.pnlLoss) < (a.pnlWin - a.pnlLoss) ? b : a),
    data[0]
  );

  const bestPnL = best ? best.pnlWin - best.pnlLoss : 0;
  const worstPnL = worst ? worst.pnlWin - worst.pnlLoss : 0;

  const meanPnL = totalPnL / data.length;
  const variance =
    data.reduce((sum, d) => {
      const pnl = d.pnlWin - d.pnlLoss;
      return sum + Math.pow(pnl - meanPnL, 2);
    }, 0) / data.length;
  const stdDev = Math.sqrt(variance);
  const consistency = meanPnL !== 0 ? 1 - Math.abs(stdDev / meanPnL) : 0;
  const dominance = totalPnL ? ((bestPnL / totalPnL) * 100).toFixed(1) : 0;

  return (
    <div
      className="card"
      style={{
        background: "linear-gradient(180deg,#10151f 0%,#0c1119 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, color: "#f3f4f6" }}>
          ⏱ Timeframe Performance
        </h3>
      </div>

      <div style={{ height: 260, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid stroke="#374151" strokeOpacity={0.25} vertical={false} />
            <XAxis
              dataKey="tf"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (fmt ? fmt(v) : `$${v.toLocaleString()}`)}
            />
            <ReTooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 8,
                color: "#f3f4f6",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
              formatter={(value, name, props) => {
                const val = Number(value);
                const winRate = props.payload?.winRate || 0;
                const lossRate = props.payload?.lossRate || 0;
                if (name === "pnlWin")
                  return [
                    fmt ? fmt(val) : `$${val.toLocaleString()}`,
                    `Ganho (${winRate}% WR)`,
                  ];
                if (name === "pnlLoss")
                  return [
                    fmt ? fmt(val) : `$${val.toLocaleString()}`,
                    `Perda (${lossRate}% LR)`,
                  ];
                return [fmt ? fmt(val) : `$${val.toFixed(2)}`, "Média PnL"];
              }}
              labelFormatter={(label) => `Timeframe: ${label}`}
            />

            {/* barras fixas (sem .map) */}
            <Bar
              dataKey="pnlWin"
              stackId="a"
              fill="#4ade80"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="pnlLoss"
              stackId="a"
              fill="#ef4444"
              radius={[4, 4, 0, 0]}
            />

            {/* linha média */}
           <ReferenceLine
  y={meanPnL}
  stroke="#60a5fa"
  strokeWidth={2}
  strokeDasharray="5 5"
  label={{
    value: `Mean ${fmt ? fmt(meanPnL) : `$${meanPnL.toFixed(2)}`}`,
    position: "top",
    fill: "#ffffff",
    fontSize: 12,
    fontWeight: 600,
    style: {
      textShadow: '0 0 8px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.9)',
    }
  }}
/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* legenda inferior */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          marginTop: 14,
          color: "#e5e7eb",
          fontSize: 13,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingTop: 10,
        }}
      >
        <div>
          <div style={{ color: "#9ca3af", fontSize: 11 }}>🏆 Best Timeframe</div>
          <div style={{ fontWeight: 600 }}>
            {best?.tf || "-"} ({fmt ? fmt(bestPnL) : bestPnL}){" "}
            <span style={{ color: "#9ca3af", fontSize: 11 }}>{dominance}%</span>
          </div>
        </div>
        <div>
          <div style={{ color: "#9ca3af", fontSize: 11 }}>💀 Worst Timeframe</div>
          <div style={{ fontWeight: 600 }}>
            {worst?.tf || "-"} ({fmt ? fmt(worstPnL) : worstPnL})
          </div>
        </div>
        <div>
          <div style={{ color: "#9ca3af", fontSize: 11 }}>📏 Consistency</div>
          <div style={{ fontWeight: 600 }}>
            {(consistency * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
};



// 🔥 HistogramR atualizado — usa filteredTrades reais e legenda dinâmica
const HistogramR = ({ trades = [] }: { trades: any[] }) => {
  const [mode, setMode] = React.useState<"hist" | "density">("hist");

  // Aplica os filtros da Dashboard
  const filteredTrades = React.useMemo(() => {
    if (!trades?.length) return [];
    return trades.filter(t => t && (t.result_R !== undefined) && !isNaN(Number(t.result_R)));
  }, [trades]);

  // 🔥 Bins dinâmicos: usa regra de Sturges para calcular número ideal
  const numBins = React.useMemo(() => {
    if (filteredTrades.length < 2) return 10;
    return Math.ceil(Math.log2(filteredTrades.length) + 1);
  }, [filteredTrades.length]);

  // histograma e kde (como você já tinha)
  const dataHist = React.useMemo(() => histogramR(filteredTrades, numBins), [filteredTrades, numBins]);
  const kde = React.useMemo(() => computeKDE(filteredTrades.map(t => Number(t.result_R) || 0), 40), [filteredTrades]);

  // --- métricas dinâmicas (remove EV, Worst R, Winrate conforme pediu) ---
  // ✅ Calcula R real de cada trade (usa partialExecutions, risk, result_net etc.)
  const R_values = React.useMemo(() => {
    return filteredTrades.map(t => {
      try {
        // use a função que VOCÊ já tem (getTotalR ou getRealR)
        if (typeof getTotalR === "function") return getTotalR(t);

        // fallback seguro (ainda melhor do que usar result_R direto)
        if (t.partialExecutions?.length > 0) {
          const totalPnL = t.partialExecutions.reduce((s, p) => s + (Number(p.net) || 0), 0);
          return t.risk ? totalPnL / t.risk : 0;
        }
        if (t.result_net && t.risk) return t.result_net / t.risk;

        return Number(t.result_R) || 0;
      } catch {
        return 0;
      }
    }).filter(v => Number.isFinite(v));
  }, [filteredTrades]);

  // ✅ Média
  const avgR = React.useMemo(() => {
    if (!R_values.length) return 0;
    return R_values.reduce((s, r) => s + r, 0) / R_values.length;
  }, [R_values]);

  // ✅ Mediana
  const medianR = React.useMemo(() => {
    if (!R_values.length) return 0;
    const s = [...R_values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
  }, [R_values]);

  // ✅ Desvio padrão
  const stdR = React.useMemo(() => {
    if (!R_values.length) return 0;
    const mean = avgR;
    const variance = R_values.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / R_values.length;
    return Math.sqrt(variance);
  }, [R_values, avgR]);

  // ✅ Melhor trade (em R real)
  const bestR = React.useMemo(() => {
    if (!R_values.length) return 0;
    return Math.max(...R_values);
  }, [R_values]);

  // formato (R não é currency — manter 2 casas)
  const fmtR = (v: number) => Number(v || 0).toFixed(2);

  // 🎨 Tooltip customizado com melhor legibilidade
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    return (
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        border: "1px solid rgba(167,139,250,0.3)",
        borderRadius: 10,
        padding: "12px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        minWidth: 160
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#a78bfa",
          marginBottom: 8,
          borderBottom: "1px solid rgba(167,139,250,0.2)",
          paddingBottom: 6
        }}>
          {mode === "hist" ? `Intervalo: ${label}R` : `R: ${label}`}
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#e5e7eb"
        }}>
          {mode === "hist" 
            ? `${payload[0].value} trades` 
            : `${Number(payload[0].value).toFixed(3)}`
          }
        </div>
        {mode === "density" && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            Densidade
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{
        background: "#0f172a",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 16,
        padding: 16,
      }}
    >
      {/* --- Header --- */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb", display: "flex", alignItems: "center", gap: 6 }}>
          📊 Distribuição de R (histograma)
        </h3>

        {/* Toggle */}
        <div style={{
          display: "flex", alignItems: "center", background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999, position: "relative", width: 165, height: 34, justifyContent: "space-between", padding: "3px",
          boxShadow: "0 0 10px rgba(0,0,0,0.35)"
        }}>
          <div style={{
            position: "absolute", top: 3, bottom: 3, left: mode === "hist" ? 3 : "calc(50% + 3px)",
            width: "calc(50% - 6px)", borderRadius: 999,
            background: "linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.45))",
            transition: "all 0.3s ease", boxShadow: "0 0 6px rgba(139,92,246,0.4)"
          }} />
          <button onClick={() => setMode("hist")} style={{
            flex: 1, border: "none", background: "none",
            color: mode === "hist" ? "#e0e7ff" : "#9ca3af", fontSize: 12.5, fontWeight: 600, zIndex: 2,
            cursor: "pointer", borderRadius: 999, transition: "color 0.2s ease"
          }}>Histograma</button>
          <button onClick={() => setMode("density")} style={{
            flex: 1, border: "none", background: "none",
            color: mode === "density" ? "#e0e7ff" : "#9ca3af", fontSize: 12.5, fontWeight: 600, zIndex: 2,
            cursor: "pointer", borderRadius: 999, transition: "color 0.2s ease"
          }}>Densidade</button>
        </div>
      </div>

      {/* --- Gráfico + Legenda --- */}
      <div style={{
        background: "rgba(15,23,42,0.4)",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 12,
        padding: 12
      }}>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            {mode === "hist" ? (
              <BarChart data={dataHist} margin={{ top: 10, right: 10, left: 5, bottom: 20 }}>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.1} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="#374151" strokeOpacity={0.25} vertical={false} />
                
                {/* ✅ Eixo X com label */}
                <XAxis 
                  dataKey="label" 
                  tick={{ fill: "#94a3b8", fontSize: 10 }} 
                  label={{ 
                    value: "R (múltiplos de risco)", 
                    position: "insideBottom", 
                    offset: -8, 
                    fill: "#64748b", 
                    fontSize: 11 
                  }}
                />
                
                {/* ✅ Eixo Y com label */}
                <YAxis 
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  label={{ 
                    value: "Frequência (trades)", 
                    angle: -90, 
                    position: "insideLeft", 
                    fill: "#64748b", 
                    fontSize: 11 
                  }}
                />
                
                {/* ✅ Tooltip customizado */}
                <ReTooltip content={<CustomTooltip />} />
                
                {/* ✅ Linha de referência em R=0 */}
                <ReferenceLine 
                  x="0.00" 
                  stroke="#ef4444" 
                  strokeWidth={1.5} 
                  strokeDasharray="3 3" 
                  label={{ 
                    value: "Break-even", 
                    fill: "#ef4444", 
                    fontSize: 10, 
                    position: "top" 
                  }} 
                />
                
                {/* ✅ Linha da média */}
                <ReferenceLine 
                  x={avgR.toFixed(2)} 
                  stroke="#10b981" 
                  strokeWidth={1.5} 
                  strokeDasharray="5 5" 
                  label={{ 
                    value: `Média: ${fmtR(avgR)}R`, 
                    fill: "#10b981", 
                    fontSize: 10, 
                    position: "top" 
                  }} 
                />
                
                <Bar dataKey="count" fill="url(#barGrad)" radius={[4,4,0,0]} barSize={20} />
              </BarChart>
            ) : (
              <LineChart data={kde} margin={{ top: 10, right: 10, left: 5, bottom: 20 }}>
                <CartesianGrid stroke="#374151" strokeOpacity={0.25} vertical={false} />
                
                {/* ✅ Eixo X com label */}
                <XAxis 
                  dataKey="label" 
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  label={{ 
                    value: "R (múltiplos de risco)", 
                    position: "insideBottom", 
                    offset: -8, 
                    fill: "#64748b", 
                    fontSize: 11 
                  }}
                />
                
                {/* ✅ Eixo Y com label */}
                <YAxis 
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  label={{ 
                    value: "Densidade de probabilidade", 
                    angle: -90, 
                    position: "insideLeft", 
                    fill: "#64748b", 
                    fontSize: 11 
                  }}
                />
                
                {/* ✅ Tooltip customizado */}
                <ReTooltip content={<CustomTooltip />} />
                
                {/* ✅ Linha de referência em R=0 */}
                <ReferenceLine 
                  x={0} 
                  stroke="#ef4444" 
                  strokeWidth={1.5} 
                  strokeDasharray="3 3" 
                />
                
                {/* ✅ Linha da média */}
                <ReferenceLine 
                  x={avgR} 
                  stroke="#10b981" 
                  strokeWidth={1.5} 
                  strokeDasharray="5 5" 
                />
                
                <Line type="monotone" dataKey="density" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* --- Legenda dinâmica (removidos EV, Worst R, Winrate) --- */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8, marginTop: 14,
          background: "rgba(2,6,23,0.5)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 10,
          padding: "10px 12px"
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Avg R</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtR(avgR)}</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Median R</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtR(medianR)}</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Std Dev</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtR(stdR)}</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>Best R</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4ade80" }}>{fmtR(bestR)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};


// Recent trades table with account info
const RecentTrades = ({ trades, fmt }: any) => {
  const allData = getAll();
  const accounts = allData.accounts || [];
  const rows = trades.slice(-8).reverse();

  const getAccountTypeClass = (type: string) => {
    switch (type) {
      case 'Forex': return 'lavander';
      case 'Cripto': return 'orange';
      case 'Futures': return 'pink';
      case 'Personal': return 'purple';
      default: return 'gray';
    }
  };

  const resolveAccountDisplay = (t: any) => {
    // Se o trade tiver um array de contas vinculadas
    if (Array.isArray(t.accounts) && t.accounts.length > 0) {
      const firstAcc = accounts.find(a => a.id === t.accounts[0]?.accountId);
      const firstName = firstAcc ? firstAcc.name : 'N/A';
      const extra = t.accounts.length - 1;
      return (
        <>
          {firstName}
          {extra > 0 && <span className="muted"> +{extra}</span>}
        </>
      );
    }

    // Se tiver apenas uma conta
    if (t.accountId) {
      const acc = accounts.find(a => a.id === t.accountId);
      return acc ? acc.name : t.accountName || 'N/A';
    }

    // Se já tiver o nome direto
    if (t.accountName) return t.accountName;

    return 'N/A';
  };

return (
  <div className="card">
    <h3>📝 Recent Trades</h3>
    <table className="responsive-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Asset / TF</th>
          <th>Markets / Accounts</th>
          <th>Direction</th>
          <th>R</th>
          <th>PnL</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((t: any) => (
          <tr
            key={t.id}
            onClick={() => (window.location.href = `/journal/trades#${t.id}`)}
            style={{ cursor: "pointer" }}
          >
            {/* Date */}
            <td data-label="Date">
              {(() => {
                const entry = t.entry_datetime?.slice(0, 10);
                const exit = t.exit_datetime?.slice(0, 10);
                const sameDay = !exit || entry === exit;

                const formatDate = (iso?: string) =>
                  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
                const entryDate = formatDate(t.entry_datetime);
                const exitDate = formatDate(t.exit_datetime);

                const formatTime = (iso?: string) =>
                  iso
                    ? new Date(iso).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";

                const entryTime = formatTime(t.entry_datetime);
                const exitTime = formatTime(t.exit_datetime);

                const duration =
                  t.exit_datetime && t.entry_datetime
                    ? calculateDuration(t.entry_datetime, t.exit_datetime)
                    : "";

                return (
                  <>
                    <div style={{ fontWeight: 500, paddingRight:10 }}>
                      {sameDay ? entryDate : `${entryDate} → ${exitDate}`}
                    </div>
                    <div className="muted" style={{ fontSize: 11, paddingRight:3 }}>
                      {entryTime}
                      {exitTime && ` → ${exitTime}`}
                    </div>
                    {duration && (
                      <div className="muted" style={{ fontSize: 10 }}>
                        ({duration})
                      </div>
                    )}
                  </>
                );
              })()}
            </td>

            {/* Asset / TF */}
            <td data-label="Asset / TF">
              {t.asset} <span className="muted">• {t.tf_signal || t.timeframe || ""}</span>
            </td>

            {/* Accounts */}
            <td data-label="Markets / Accounts">
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {t.accountType && (
                  <span
                    className={`pill ${getAccountTypeClass(t.accountType)}`}
                    style={{ fontSize: 9, padding: "2px 4px" }}
                  >
                    {t.accountType}
                  </span>
                )}
                <span style={{ fontSize: 11 }}>{resolveAccountDisplay(t)}</span>
              </div>
            </td>

            {/* Direction */}
            <td data-label="Direction">
              <span
                className={`pill ${t.direction === "Long" ? "lavander" : "orange"}`}
                style={{ padding: "4px 10px" }}
              >
                {t.direction}
              </span>
            </td>

            {/* R */}
            <td data-label="R">
              {getTotalR(t).toFixed(2)}
            </td>

            {/* PnL */}
            <td
              data-label="PnL"
              style={{
                color: Number(t.result_net) >= 0 ? "#4ade80" : "#f87171",
              }}
            >
              {fmt(Number(t.result_net) || 0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

};


// --------------------------- Main Page ---------------------------

export default function Dashboard() {
  // Usar dados integrados ou fallback para mock
  const integratedData = useIntegratedData();
  const journal = useJournal();
  const strategies = journal?.strategies || [];
  
  // Se não tem dados reais, usar mock
  const trades = integratedData.hasRealData 
    ? integratedData.trades 
    : genMockTrades(120);
  
  const accounts = integratedData.accounts;
  const availableCategories = integratedData.availableCategories.length > 0 
    ? integratedData.availableCategories 
    : ['Forex', 'Cripto', 'Futures', 'Personal'];

  const { fmt, fmtShort } = useFormatter();

  // Filters state
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [timeframeFilter, setTimeframeFilter] = useState<string>("");
  const [rangeFilter, setRangeFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("");
  const [accountStatusFilter, setAccountStatusFilter] = useState<string[]>(["live", "funded"]); const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  // ref para o dropdown wrapper
const statusDropdownRef = useRef<HTMLDivElement | null>(null);
const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
const [showCalendar, setShowCalendar] = useState(false);
const calendarRef = useRef<HTMLDivElement>(null);
// fecha ao clicar fora
useEffect(() => {
  function onDocClick(e: MouseEvent) {
    if (!statusDropdownRef.current) return;
    if (!statusDropdownRef.current.contains(e.target as Node)) {
      setStatusDropdownOpen(false);
    }
  }
  if (statusDropdownOpen) document.addEventListener('mousedown', onDocClick);
  return () => document.removeEventListener('mousedown', onDocClick);
}, [statusDropdownOpen]);
 // Logo após o useEffect do statusDropdown
useEffect(() => {
  function onDocClick(e) {
    if (!calendarRef.current) return;
    if (!calendarRef.current.contains(e.target)) {
      setShowCalendar(false);
    }
  }
  if (showCalendar) document.addEventListener('mousedown', onDocClick);
  return () => document.removeEventListener('mousedown', onDocClick);
}, [showCalendar]);
  // Pega todos os status únicos das contas disponíveis 
const accountStatuses = useMemo<string[]>(() => {
  const all = (accounts || [])
    .map((a) => a.status?.toLowerCase() || "")
    .filter((s): s is string => !!s);
  return Array.from(new Set(all));
}, [accounts]);

  // 🟩 Novo filtro de conta (busca e seleção)
const [searchAccount, setSearchAccount] = useState("");
const [selectedAccount, setSelectedAccount] = useState<any>(null);

// 🔸 Contas visíveis conforme categoria selecionada e texto da busca
const visibleAccounts = useMemo(() => {
  let accs = accounts || [];
  if (categoryFilter) {
    accs = accs.filter(a => a.type === categoryFilter);
  }
  if (searchAccount.trim()) {
    const q = searchAccount.toLowerCase();
    accs = accs.filter(a =>
      (a.name?.toLowerCase().includes(q)) ||
      String(a.currentFunding || a.initialFunding || 0).includes(q)
    );
  }
  return accs;
}, [accounts, categoryFilter, searchAccount]);

// 🔸 Contas e trades filtrados pela conta selecionada
// 🔹 Contas filtradas por categoria, conta selecionada e status
const filteredAccounts = useMemo(() => {
  let accs = accounts || [];

  // Se tem conta selecionada, ela tem prioridade
  if (selectedAccount) return [selectedAccount];

  // Filtro de categoria
  if (categoryFilter) {
    accs = accs.filter(a => a.type === categoryFilter);
  }

  // ✅ Filtro de status (novo)
  if (accountStatusFilter.length > 0) {
    accs = accs.filter(a =>
      accountStatusFilter.includes(a.status?.toLowerCase())
    );
  }

  return accs;
}, [accounts, categoryFilter, selectedAccount, accountStatusFilter]);


// 🔹 Filtra trades e contas com base na conta selecionada
// 🔹 Filtra trades com base nos filtros combinados
const filteredTrades = useMemo(() => {
  let out = trades.slice();

  // Categoria, timeframe e estratégia
  if (categoryFilter)
    out = out.filter((t) => (t.accountType || "Unknown") === categoryFilter);
  if (timeframeFilter)
    out = out.filter(
      (t) => (t.tf_signal || t.timeframe || "Unknown") === timeframeFilter
    );
  if (strategyFilter)
    out = out.filter(
      (t) => (t.strategyId || t.strategyName || "") === strategyFilter
    );
  if (rangeFilter !== "all") {
    const days = parseInt(rangeFilter, 10);
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    out = out.filter((t) => new Date(t.entry_datetime) >= cutoff);
  }
  // Filtro de data
if (dateFilter.start || dateFilter.end) {
  const startDate = dateFilter.start ? new Date(dateFilter.start) : new Date('1970-01-01');
  const endDate = dateFilter.end ? new Date(dateFilter.end) : new Date();
  endDate.setHours(23, 59, 59, 999);
  
  out = out.filter((t) => {
    const tradeDate = new Date(t.entry_datetime);
    return tradeDate >= startDate && tradeDate <= endDate;
  });
}

  // ✅ Filtro adicional: conta selecionada OU status filtrado
  const allowedIds = filteredAccounts.map(a => a.id);
  out = out.filter((t) => allowedIds.includes(t.accountId));

  return out;
}, [
  trades,
  categoryFilter,
  timeframeFilter,
  strategyFilter,
  rangeFilter,
  dateFilter,
  filteredAccounts,
]);


  // Derived lists
  const timeframes = useMemo(() => {
    const s = new Set<string>();
    trades.forEach(t => s.add(t.tf_signal || t.timeframe || "Unknown"));
    return Array.from(s).sort();
  }, [trades]);
  

  // metrics and series
  const basic = useMemo(() => calcBasicStats(filteredTrades), [filteredTrades]);
  const equitySeries = useMemo(() => buildEquitySeries(filteredTrades, 10000), [filteredTrades]);
  
  // compute drawdown series
  const drawdownSeries = useMemo(() => {
    let peak = -Infinity; let maxDraw = 0;
    return equitySeries.map(p => {
      peak = Math.max(peak, p.equity);
      const dd = +(100 * (p.equity - peak) / (peak || 1)).toFixed(2);
      maxDraw = Math.min(maxDraw, dd);
      return { ...p, drawdown: dd };
    });
  }, [equitySeries]);

  const monthly = useMemo(() => groupByMonth(filteredTrades), [filteredTrades]);
  const cat = useMemo(() => pnlByCategory(filteredTrades), [filteredTrades]);
  const tf = useMemo(() => winRateByTimeframe(filteredTrades), [filteredTrades]);
  const hist = useMemo(() => histogramR(filteredTrades, 18), [filteredTrades]);

  // UI toggles
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);

  return (
      <div className="journal-dashboard-page">
     {/* Status de integração */}
      {!integratedData.hasRealData && (
        <div className="card" style={{ 
          background: 'linear-gradient(180deg, #2e2b12 0%, #1b2010 100%)',
          borderColor: '#594e19' 
        }}>
          <h3>⚠️ Usando dados de demonstração</h3>
          <div className="muted">
            {accounts.length === 0 
              ? "Nenhuma conta encontrada no main-app. Crie contas primeiro no main-app para ver dados reais."
              : "Nenhum trade encontrado. Adicione trades na página /trades para ver dados reais."
            }
          </div>
        </div>
      )}

{/* FILTERS SECTION */}
<div className="filters">
  <div className="filters-toggle">
    <button onClick={() => setFiltersOpen((v: boolean) => !v)}>
      {filtersOpen ? "Ocultar Filtros ▲" : "Mostrar Filtros ▼"}
    </button>
  </div>

  <div className={`filters-content ${filtersOpen ? "open" : ""}`}>
  {/* === LEFT GROUP: Category, Timeframe, Strategy === */}
  <div className="filters-left">
    <span style={{ fontWeight: 600, fontSize: 14 }}>Filtros:</span>

    {/* Category filter with colors */}
    <div className="category-chips">
      {availableCategories.map((cat: string) => {
        const active = categoryFilter === cat;
        const className =
          cat === "Forex"
            ? "lavander"
            : cat === "Cripto"
            ? "orange"
            : cat === "Futures"
            ? "pink"
            : cat === "Personal"
            ? "purple"
            : "gray";

        return (
          <button
            key={cat}
            className={`chip ${active ? "active" : ""}`}
            onClick={() => setCategoryFilter(active ? "" : cat)}
          >
            <span
              className={`pill ${className}`}
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                marginRight: 6,
              }}
            />
            {cat}
          </button>
        );
      })}
    </div>

    <select
      value={timeframeFilter}
      onChange={(e) => setTimeframeFilter(e.target.value)}
      className="input"
    >
      <option value="">All Timeframes</option>
      {timeframes.map((t: string) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>

    <select
      value={strategyFilter}
      onChange={(e) => setStrategyFilter(e.target.value)}
      className="input"
    >
      <option value="">All Strategies</option>
      {strategies.map((s: any) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  </div>

  {/* === RIGHT GROUP: Status Filter + Search + Range + Calendar === */}
  <div className="filters-right">
    {/* Account Status Filter */}
    <div className="status-dropdown" ref={statusDropdownRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setStatusDropdownOpen((v) => !v);
        }}
        className="input"
        style={{ display: "flex", justifyContent: "space-between", minWidth: 160 }}
      >
        {accountStatusFilter?.length > 0
          ? `Status: ${accountStatusFilter.join(", ")}`
          : "Filtrar Status"}
        <span style={{ opacity: 0.7, marginLeft: 8 }}>▾</span>
      </button>

      {statusDropdownOpen && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            zIndex: 9999,
            background: "var(--card-bg, #1e1f2b)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: "8px 10px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
            minWidth: 200,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {accountStatuses.map((status) => {
              const st = String(status || "");
              const checked = accountStatusFilter.includes(st);
              return (
                <label
                  key={st}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 4px",
                    cursor: "pointer",
                    fontSize: 14,
                    color: "#e6e6e9",
                    textTransform: "capitalize",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? Array.from(new Set([...accountStatusFilter, st]))
                        : accountStatusFilter.filter((s) => s !== st);
                      setAccountStatusFilter(next);
                    }}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>{st}</span>
                </label>
              );
            })}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              className="btn ghost small"
              style={{ flex: 1 }}
              onClick={() => setAccountStatusFilter(["live", "funded"])}
            >
              Resetar padrão
            </button>

            <button
              className="btn ghost small"
              style={{ flex: 1 }}
              onClick={() => setAccountStatusFilter(accountStatuses.slice())}
            >
              Marcar todos
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Account Search */}
<div className="account-search-container" style={{ position: "relative", minWidth: 260, flexShrink: 0 }}>
      <input
        type="text"
        placeholder="Buscar conta..."
        className="input"
        value={searchAccount}
        onChange={(e) => setSearchAccount(e.target.value)}
      />
      {searchAccount && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            width: "100%",
            background: "#0f172a",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            zIndex: 50,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {visibleAccounts.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              Nenhuma conta encontrada
            </div>
          ) : (
            visibleAccounts.map((acc) => (
              <div
                key={acc.id}
                onClick={() => {
                  setSelectedAccount(acc);
                  setSearchAccount("");
                }}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: "#0f172a",
                }}
              >
                <div style={{ fontWeight: 600, color: "#f9fafb" }}>{acc.name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {acc.type} • Balance: {fmt(acc.currentFunding || acc.balance || 0)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>

    {/* Range Buttons */}
    <div className="range">
      {["7", "30", "180", "365", "all"].map((r) => (
        <button
          key={r}
          className={`chip ${rangeFilter === r ? "active" : ""}`}
          onClick={() => setRangeFilter(r)}
        >
          {r === "7" ? "7d" : r === "30" ? "30d" : r === "180" ? "180d" : r === "365" ? "1y" : "All"}
        </button>
      ))}
    </div>

    {/* Calendar */}
    <div className="calendar" ref={calendarRef}>
      <button
        className={`calendar-btn ${dateFilter.start || dateFilter.end ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setShowCalendar((v) => !v);
        }}
        title="Filtrar por data"
      >
        <svg className="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {showCalendar && (
        <div className="calendar-dropdown">
          <div className="calendar-header">
            <h4>Filtrar por Data</h4>
            {(dateFilter.start || dateFilter.end) && (
              <button className="btn ghost small" onClick={() => setDateFilter({ start: null, end: null })}>
                Limpar
              </button>
            )}
          </div>

          <div>
            <div className="calendar-label">Data Início</div>
            <input
              type="date"
              className="calendar-input"
              value={dateFilter.start || ""}
              onChange={(e) => setDateFilter((prev) => ({ ...prev, start: e.target.value }))}
            />
          </div>

          <div>
            <div className="calendar-label">Data Fim</div>
            <input
              type="date"
              className="calendar-input"
              value={dateFilter.end || ""}
              onChange={(e) => setDateFilter((prev) => ({ ...prev, end: e.target.value }))}
            />
          </div>

          <div className="calendar-actions">
            <button
              className="btn ghost small"
              onClick={() => {
                const today = new Date().toISOString().split("T")[0];
                const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0];
                setDateFilter({ start: lastMonth, end: today });
              }}
            >
              Último mês
            </button>
            <button className="btn primary small" onClick={() => setShowCalendar(false)}>
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
</div>
</div>
        {/* SUMMARY CARDS */}
<div className="summary-section">
        <div className="grid cards">            
            {/* Total P&L */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.15) 0%, rgba(74, 222, 128, 0.05) 100%)',
              border: '1px solid rgba(74, 222, 128, 0.2)',
              borderRadius: 10,
              padding: 20
            }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Total Net P&L
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>
                {fmt(basic.pnl)}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {basic.total} trades
              </div>
            </div>

            {/* Win Rate */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.15) 0%, rgba(96, 165, 250, 0.05) 100%)',
              border: '1px solid rgba(96, 165, 250, 0.2)',
              borderRadius: 10,
              padding: 20
            }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Win Rate
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>
                {(basic.winrate * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {basic.wins} wins / {basic.losses} losses
              </div>
            </div>

            {/* Avg R */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.15) 0%, rgba(167, 139, 250, 0.05) 100%)',
              border: '1px solid rgba(167, 139, 250, 0.2)',
              borderRadius: 10,
              padding: 20
            }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Avg R
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>
                {basic.avgR.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Average result (R)
              </div>
            </div>

            {/* Profit Factor */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%)',
              border: '1px solid rgba(251, 191, 36, 0.2)',
              borderRadius: 10,
              padding: 20
            }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Profit Factor
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>
                {isFinite(basic.profitFactor) ? basic.profitFactor.toFixed(2) : "∞"}
              </div>
            </div>

{/* Expected R */}
<div style={{
  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
  border: '1px solid rgba(139, 92, 246, 0.2)',
  borderRadius: 10,
  padding: 20
}}>
  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    Expected R
  </div>
  <div style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>
    {basic.expectedR ? basic.expectedR : basic.avgR.toFixed(2)}
  </div>
  <div style={{ fontSize: 12, color: '#6b7280' }}>
    Avg Win: {basic.avgWinR || '-'} | Avg Loss: {basic.avgLossR || '-'}
  </div>
</div>

{/* Best Trade */}
<div style={{
  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)',
  border: '1px solid rgba(16, 185, 129, 0.2)',
  borderRadius: 10,
  padding: 20
}}>
  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    Best Trade
  </div>
  <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>
    {(() => {
      const best = filteredTrades.reduce((max, t) => 
        (t.result_net || 0) > (max.result_net || 0) ? t : max, 
        filteredTrades[0] || { result_net: 0 }
      );
      return fmt(best.result_net || 0);
    })()}
  </div>
  <div style={{ fontSize: 12, color: '#6b7280' }}>
    {(() => {
      const best = filteredTrades.reduce((max, t) => 
        (t.result_net || 0) > (max.result_net || 0) ? t : max, 
        filteredTrades[0] || {}
      );
      return best.asset ? `${best.asset} (${best.direction || 'N/A'})` : 'No trades';
    })()}
  </div>
</div>

{/* Best R */}
<div style={{
  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%)',
  border: '1px solid rgba(34, 197, 94, 0.2)',
  borderRadius: 10,
  padding: 20
}}>
  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    Biggest R:R Trade
  </div>
  <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>
    {(() => {
const bestR = filteredTrades.reduce((max, t) =>
  getTotalR(t) > getTotalR(max) ? t : max,
  filteredTrades[0] || {}
);
return getTotalR(bestR).toFixed(2) + 'R';

    })()}
  </div>
  <div style={{ fontSize: 12, color: '#6b7280' }}>
    {(() => {
     const bestR = filteredTrades.reduce((max, t) => 
  getTotalR(t) > getTotalR(max) ? t : max,
  filteredTrades[0] || {}
);
return bestR.asset ? `${bestR.asset} (${bestR.direction || 'N/A'})` : 'No trades';

    })()}
  </div>
</div>

{/* Worst Trade */}
<div style={{
  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)',
  border: '1px solid rgba(239, 68, 68, 0.2)',
  borderRadius: 10,
  padding: 20
}}>
  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
    Worst Trade
  </div>
  <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
   {(() => {
  const worst = filteredTrades.reduce((min, t) =>
    (t.result_net || 0) < (min.result_net || 0) ? t : min,
    filteredTrades[0] || { result_net: 0 }
  );
  const net = worst.result_net || 0;
  const color = net >= 0 ? '#10b981' : '#ef4444'; // verde se for positivo!
  return (
    <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 4 }}>
      {fmt(net)}
    </div>
  );
})()}
  </div>
  <div style={{ fontSize: 12, color: '#6b7280' }}>
    {(() => {
      const worst = filteredTrades.reduce((min, t) => 
        (t.result_net || 0) < (min.result_net || 0) ? t : min, 
        filteredTrades[0] || {}
      );
      return worst.asset ? `${worst.asset} (${worst.direction || 'N/A'})` : 'No trades';
    })()}
  </div>
</div>

            {/* Advanced Metrics */}
<div className="advanced-metrics">
                <h2 style={{ fontSize: 18, marginBottom: 16, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                🧠 Advanced Metrics
              </h2>
    <div className="metrics-grid">
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  padding: 16,
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>Sharpe</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa' }}>{basic.sharpe.toFixed(2)}</div>
                </div>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  padding: 16,
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>Skew</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa' }}>{basic.skew.toFixed(2)}</div>
                </div>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  padding: 16,
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>Kurtosis</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa' }}>{basic.kurt.toFixed(2)}</div>
                </div>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  padding: 16,
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>Risk of Ruin</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa' }}>{(basic.RoR || 0).toFixed(1)}%</div>
                </div>
              </div>
            </div>

          </div>
        </div>

      {/* Grid with main charts */}
<div className="grid two-cols">
        <div style={{ display: "grid", gap: 16 }}>
       <EquityArea trades={filteredTrades} selectedAccount={selectedAccount} fmt={fmt} />
        <HistogramR trades={filteredTrades} />
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <CategoryCard data={cat} fmt={fmt} />
          <TimeframeBar data={tf} fmt={fmt} />
        </div>
      </div>

<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  <HeatMapSection trades={filteredTrades} />
  </div>
<div className="grid two-cols">  
  <DurationAnalysis trades={filteredTrades} />
  <DrawdownSection trades={filteredTrades} accounts={filteredAccounts}/>
</div>

      {/* Lower row */}
      <div style={{ display: "grid"}}>
        <RecentTrades trades={filteredTrades} fmt={fmt} />
      </div>
    </div>
  );
}