import React, { useMemo,useEffect, useState } from "react";
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend,BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area} from "recharts";
import { useJournal } from "@apps/journal-state";
import { useCurrency } from "@apps/state";
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';




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
      date: new Date(Date.now() - (count - i) * 24 * 3600 * 1000).toISOString(),
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

function calcBasicStats(trades: any[]) {
  const total = trades.length;
  const wins = trades.filter(t => safeNumber(t.result_R) > 0).length;
  const losses = total - wins;
  const winrate = total ? wins / total : 0;
  
  // 1. Médias de R
  const R_values = trades.map(t => safeNumber(t.result_R));
  const avgR = total ? R_values.reduce((s, r) => s + r, 0) / total : 0;

  // 2. Cálculo Detalhado de Expected Value (EV em R)
  const winningTrades = trades.filter(t => safeNumber(t.result_R) > 0);
  const losingTrades = trades.filter(t => safeNumber(t.result_R) <= 0);

  const avgWinR = winningTrades.length 
    ? winningTrades.reduce((s, t) => s + safeNumber(t.result_R), 0) / winningTrades.length 
    : 0;

  const avgLossR = losingTrades.length 
    ? losingTrades.reduce((s, t) => s + safeNumber(t.result_R), 0) / losingTrades.length 
    : 0;
    
  const expectedR = (winrate * avgWinR) + ((1 - winrate) * avgLossR);

  const pnl = trades.reduce((s, t) => s + safeNumber(t.result_net), 0);
  
  const profitFactor = (() => {
    const profits = trades.filter(t => safeNumber(t.result_net) > 0).reduce((s, t) => s + t.result_net, 0);
    const losses = Math.abs(trades.filter(t => safeNumber(t.result_net) < 0).reduce((s, t) => s + t.result_net, 0));
    if (losses === 0) return profits === 0 ? 0 : Infinity;
    return profits / losses;
  })();

  // Sharpe (simple) usando retornos diários
  const returns = trades.map(t => (safeNumber(t.result_net) / 10000)); 
  const mean = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length || 1);
  const std = Math.sqrt(variance) || 0;
  const sharpe = std === 0 ? 0 : (mean / std) * Math.sqrt(252);

  // skewness & kurtosis
  const m2 = variance;
  const m3 = returns.reduce((s, r) => s + Math.pow(r - mean, 3), 0) / (returns.length || 1);
  const m4 = returns.reduce((s, r) => s + Math.pow(r - mean, 4), 0) / (returns.length || 1);
  const skew = m2 === 0 ? 0 : m3 / Math.pow(m2, 1.5);
  const kurt = m2 === 0 ? 0 : m4 / (m2 * m2) - 3;

  // Risk of Ruin (approx)
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

// equity series (cumulative)
function buildEquitySeries(trades: any[], start = 10000) {
  let eq = start;
  const series: { date: string; equity: number; pnl: number }[] = [];
  trades.forEach(t => {
    eq += safeNumber(t.result_net);
    const label = t.date ? new Date(t.date).toLocaleDateString() : "";
    series.push({ date: label, equity: +eq.toFixed(2), pnl: safeNumber(t.result_net) });
  });
  return series;
}

// group helpers
function groupByMonth(trades: any[]) {
  const map: Record<string, number> = {};
  trades.forEach(t => {
    const key = t.date ? new Date(t.date).toISOString().slice(0, 7) : "unknown";
    map[key] = (map[key] || 0) + safeNumber(t.result_net);
  });
  return Object.entries(map).sort().map(([k, v]) => ({ month: k, pnl: +v.toFixed(2) }));
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

function winRateByTimeframe(trades: any[]) {
  const map: Record<string, { pnl: number; wins: number; total: number }> = {};
  trades.forEach(t => {
    const tf = t.tf_signal || t.timeframe || "Unknown";
    map[tf] = map[tf] || { pnl: 0, wins: 0, total: 0 };
    map[tf].pnl += safeNumber(t.result_net);
    map[tf].total += 1;
    if (safeNumber(t.result_R) > 0) map[tf].wins += 1;
  });
  return Object.entries(map).map(([tf, v]) => ({ 
    tf, 
    pnl: +v.pnl.toFixed(2), 
    winRate: +(v.wins / v.total * 100).toFixed(1), 
    total: v.total 
  })).sort((a, b) => b.pnl - a.pnl);
}

// histogram of R multiples
function histogramR(trades: any[], bins = 20) {
  const arr = trades.map(t => safeNumber(t.result_R));
  if (arr.length === 0) return [];
  const min = Math.min(...arr), max = Math.max(...arr);
  const step = (max - min) / bins || 1;
  const buckets = Array.from({ length: bins }, (_, i) => ({ x0: min + i * step, x1: min + (i + 1) * step, count: 0 }));
  arr.forEach(v => {
    const idx = Math.min(buckets.length - 1, Math.max(0, Math.floor((v - min) / step)));
    buckets[idx].count += 1;
  });
  return buckets.map(b => ({ label: `${b.x0.toFixed(2)}-${b.x1.toFixed(2)}`, count: b.count }));
}

// --------------------------- Small local subcomponents ---------------------------

const Chip = ({ children, active = false, onClick }: any) => (
  <button onClick={onClick} className={`chip ${active ? "active" : ""}`} style={{ marginRight: 8 }}>{children}</button>
);

const StatCard = ({ title, value, subtitle, accent = 1 }: any) => (
  <div className={`card accent${accent}`}>
    <div className="muted small">{title}</div>
    <div className="stat" style={{ fontSize: 20 }}>{value}</div>
    {subtitle && <div className="muted">{subtitle}</div>}
  </div>
);

// Equity area chart with optional drawdown line
const EquityArea = ({ series, showDrawdown }: any) => {
  return (
    <div className="card">
      <h3>📈 Equity Curve</h3>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id="gradEq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ade80" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4ade80" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#374151" strokeOpacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
            <YAxis tickFormatter={(v) => v.toFixed(0)} tick={{ fill: "#9ca3af" }} />
            <ReTooltip formatter={(v: any) => (typeof v === "number" ? v.toFixed(2) : v)} />
            <Area type="monotoneX" dataKey="equity" stroke="#4ade80" fill="url(#gradEq)" strokeWidth={2} dot={false} />
            {showDrawdown && <Line type="monotoneX" dataKey="drawdown" stroke="#f87171" strokeDasharray="4 4" dot={false} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Category pie + table with account type colors
const CategoryCard = ({ data, fmt }: any) => {
  const getCategoryColor = (category: string) => {
    switch(category) {
      case 'Forex': return '#15b91d';
      case 'Cripto': return '#e9820d';
      case 'Futures': return '#1b55ad';
      case 'Personal': return '#cc1e52';
      default: return '#5b6270';
    }
  };

  const totalPnl = data.reduce((s: number, d: any) => s + d.pnl, 0);

  return (
    <div className="card">
      <h3>🎯 P&L por Categoria</h3>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ width: 260, height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                dataKey="pnl"
                data={data}
                nameKey="name"
                innerRadius={40}
                outerRadius={80}
                label
              >
                {data.map((entry: any, i: number) => (
                  <Cell key={i} fill={getCategoryColor(entry.name)} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              <ReTooltip
                formatter={(val: any, _name: any, props: any) => {
                  const pct = totalPnl ? ((val / totalPnl) * 100).toFixed(1) + "%" : "0%";
                  return [fmt(val) + "(" + pct + ")", props.payload.name];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1 }}>
          {data.map((row: any) => (
            <div key={row.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    backgroundColor: getCategoryColor(row.name)
                  }}></span>
                  {row.name}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{row.count} trades • {row.winrate}% WR</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: row.pnl >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{fmt(row.pnl)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Timeframe bar
const TimeframeBar = ({ data, fmt }: any) => (
  <div className="card">
    <h3>⏱ Timeframe Performance</h3>
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#374151" strokeOpacity={0.3} />
          <XAxis dataKey="tf" tick={{ fill: "#9ca3af" }} />
          <YAxis tick={{ fill: "#9ca3af" }} />
          <ReTooltip formatter={(v: any) => (typeof v === "number" ? fmt(v) : v)} />
          <Bar dataKey="pnl" fill="#60a5fa" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// Histogram of R multiples
const HistogramR = ({ data }: any) => (
  <div className="card">
    <h3>📊 Distribuição de R (histograma)</h3>
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#374151" strokeOpacity={0.3} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <YAxis tick={{ fill: "#9ca3af" }} />
          <ReTooltip />
          <Bar dataKey="count" fill="#a78bfa" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// Recent trades table with account info
const RecentTrades = ({ trades, fmt }: any) => {
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

  return (
    <div className="card">
      <h3>📝 Recent Trades</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#94a3b8" }}>
            <th style={{ padding: "8px 6px" }}>Date</th>
            <th style={{ padding: "8px 6px" }}>Asset / TF</th>
            <th style={{ padding: "8px 6px" }}>Markets / Accounts</th>
            <th style={{ padding: "8px 6px" }}>Direction</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>R</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>PnL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t: any) => (
            <tr key={t.id} style={{ cursor: "pointer", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                onClick={() => { 
                  // Navigate to trades page with this trade selected
                  window.location.href = `/journal/trades#${t.id}`;
                }}>
              <td style={{ padding: "6px" }}>{new Date(t.date).toLocaleDateString()}</td>
              <td style={{ padding: "6px" }}>
                {t.asset} <span className="muted">• {t.tf_signal || t.timeframe || ''}</span>
              </td>
              <td style={{ padding: "6px" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t.accountType && (
                    <span className={`pill ${getAccountTypeClass(t.accountType)}`} 
                      style={{ fontSize: 8, padding: '2px 4px' }}>
                      {t.accountType}
                    </span>
                  )}
                  <span style={{ fontSize: 11 }}>{t.accountName || 'N/A'}</span>
                </div>
              </td>
              <td style={{ padding: "6px" }}>
                <span className={`pill ${t.direction === "Long" ? "lavander" : "orange"}`} style={{ padding: "4px 10px" }}>{t.direction}</span>
              </td>
              <td style={{ padding: "6px", textAlign: "right" }}>{(safeNumber(t.result_R)).toFixed(2)}</td>
              <td style={{ padding: "6px", textAlign: "right", color: safeNumber(t.result_net) >= 0 ? "#4ade80" : "#f87171" }}>{fmt(safeNumber(t.result_net))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Advanced metrics grid
const AdvancedMetricsCard = ({ metrics }: any) => (
  <div className="card">
    <h3>🧠 Advanced Metrics</h3>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
      <div className="card accent9">
        <div className="muted">Sharpe</div>
        <div className="stat">{metrics.sharpe.toFixed(2)}</div>
      </div>
      <div className="card accent10">
        <div className="muted">Skew</div>
        <div className="stat">{metrics.skew.toFixed(2)}</div>
      </div>
      <div className="card accent11">
        <div className="muted">Kurtosis</div>
        <div className="stat">{metrics.kurt.toFixed(2)}</div>
      </div>
      <div className="card accent12">
        <div className="muted">Risk of Ruin</div>
        <div className="stat">{(metrics.RoR || 0).toFixed(1)}%</div>
      </div>
    </div>
  </div>
);

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

  // Derived lists
  const timeframes = useMemo(() => {
    const s = new Set<string>();
    trades.forEach(t => s.add(t.tf_signal || t.timeframe || "Unknown"));
    return Array.from(s).sort();
  }, [trades]);

  // Filtering
  const filteredTrades = useMemo(() => {
    let out = trades.slice();
    if (categoryFilter) out = out.filter(t => (t.accountType || "Unknown") === categoryFilter);
    if (timeframeFilter) out = out.filter(t => (t.tf_signal || t.timeframe || "Unknown") === timeframeFilter);
    if (strategyFilter) out = out.filter(t => (t.strategyId || t.strategyName || "") === strategyFilter);
    if (rangeFilter !== "all") {
      const days = parseInt(rangeFilter, 10);
      const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
      out = out.filter(t => new Date(t.date) >= cutoff);
    }
    return out;
  }, [trades, categoryFilter, timeframeFilter, strategyFilter, rangeFilter]);

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

  return (
    <div style={{ display: "grid", gap: 20 }}>
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

      {/* Enhanced Filters Bar with Account Types */}
      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <strong>Filters:</strong>
            
            {/* Category filter with colors - CORRIGIDO */}
            <div style={{ display: 'flex', gap: 4 }}>
              {availableCategories.map((cat: string) => {
                const active = categoryFilter === cat;
                const className = cat === 'Forex' ? 'lavander'
                              : cat === 'Cripto' ? 'orange'
                              : cat === 'Futures' ? 'pink'
                              : cat === 'Personal' ? 'purple'
                              : 'gray';

                              
                return (
                  <button key={cat}
                    className={`chip ${active ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(active ? '' : cat)}
                  >
                    <span className={`pill ${className}`} style={{ 
                      display: 'inline-block', 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      marginRight: 6,
                      padding: 0,
                      fontSize: 0
                    }}></span>
                    {cat}
                  </button>
                );
              })}
            </div>
            
            <select value={timeframeFilter} onChange={e => setTimeframeFilter(e.target.value)} className="input">
              <option value="">All Timeframes</option>
              {timeframes.map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)} className="input">
              <option value="">All Strategies</option>
              {strategies.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

         <div className="range">
        {['7','30','180','365','all'].map(r=>(
          <button key={r}
            className={'chip '+(rangeFilter===r?'active':'')}
            onClick={()=>setRangeFilter(r)}>
            {r==='7'?'7d':r==='30'?'30d':r==='180'?'180d':r==='365'?'1y':'All'}
          </button>))}
           </div>
            <button className="chip" onClick={() => { 
              setCategoryFilter(""); 
              setTimeframeFilter(""); 
              setStrategyFilter(""); 
              setRangeFilter("all"); 
            }}>Reset</button>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showDrawdown} onChange={() => setShowDrawdown(s => !s)} />
              <span className="muted">Show drawdown</span>
            </label>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16
        }}>
          
          {/* PRIMEIRA FILEIRA: Os 4 StatCards */}
          <StatCard 
            title="Total Net P&L" 
            value={fmt(basic.pnl)} 
            subtitle={`${basic.total} trades`} 
            accent={5} 
          />
          <StatCard 
            title="Win Rate" 
            value={`${(basic.winrate * 100).toFixed(1)}%`} 
            subtitle={`${basic.wins} wins / ${basic.losses} losses`} 
            accent={6} 
          />
          <StatCard 
            title="Avg R" 
            value={basic.avgR.toFixed(2)} 
            subtitle="Average result (R)" 
            accent={7} 
          />
          <StatCard 
            title="Profit Factor" 
            value={isFinite(basic.profitFactor) ? basic.profitFactor.toFixed(2) : "∞"} 
            subtitle="" 
            accent={8} 
          />
          
          {/* SEGUNDO CARD COMPRIDO (Expected R) */}
          <div style={{ gridColumn: 'span 4', marginBottom: 0, marginTop: 0 }}>
            <StatCard 
              title="Expected R (Average R per trade)" 
              value={basic.expectedR ? basic.expectedR : basic.avgR.toFixed(2)} 
              subtitle={`Avg Winning R: ${basic.avgWinR || '-'} | Avg Losing R: ${basic.avgLossR || '-'}`} 
              accent={13} 
            />
          </div>
          
          {/* TERCEIRA FILEIRA: AdvancedMetricsCard */}
          <div style={{ gridColumn: 'span 4' }}> 
            <AdvancedMetricsCard metrics={basic} />
          </div>
        </div>
      </div>

      {/* Grid with main charts */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={{ display: "grid", gap: 16 }}>
          <EquityArea series={drawdownSeries} showDrawdown={showDrawdown} />
          <HistogramR data={hist} />
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <CategoryCard data={cat} fmt={fmt} />
          <TimeframeBar data={tf} fmt={fmt} />
        </div>
      </div>

      {/* Lower row */}
      <div style={{ display: "grid"}}>
        <RecentTrades trades={filteredTrades} fmt={fmt} />
      </div>
    </div>
  );
}