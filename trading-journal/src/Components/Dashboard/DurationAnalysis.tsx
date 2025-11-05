import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  Legend,
} from "recharts";

function getRealR(trade: any) {
  // usa partialExecutions ou result_net / risk
  if (trade.partialExecutions?.length > 0) {
    const totalPnL = trade.partialExecutions.reduce((sum, p) => sum + (Number(p.net) || 0), 0);
    const risk = Number(trade.risk) || 0;
    return risk !== 0 ? totalPnL / risk : 0;
  }
  if (trade.result_net && trade.risk) {
    return trade.result_net / trade.risk;
  }
  return Number(trade.result_R) || 0;
}

/* Helpers */
const safeNumber = (n: any) => (typeof n === "number" && !isNaN(n) ? n : Number(n) || 0);

// NOVOS BUCKETS PERSONALIZADOS
const bucketLabel = (min: number) => {
  if (min < 30) return "<30min";
  if (min < 60) return "30min-1h";
  if (min < 120) return "1-2h";
  if (min < 240) return "2-4h";
  if (min < 720) return "4-12h";
  if (min < 1440) return "12-24h";
  if (min < 4320) return "1-3d";
  if (min < 10080) return "3-7d";
  return ">7d";
};

const fmtMinutes = (min: number) => {
  if (min === 0 || !Number.isFinite(min)) return "0m";
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 1440) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = Math.floor(min / 1440);
  const hours = Math.round((min % 1440) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
};

const limit = (v: number, dec = 2) => {
  if (!Number.isFinite(v)) return 0;
  const pow = Math.pow(10, dec);
  return Math.round(v * pow) / pow;
};

/* Custom Tooltip Melhorado */
const BarTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const winrate = data.total ? ((data.wins / data.total) * 100).toFixed(1) : "0";
  
  return (
    <div style={{
      background: "rgba(26, 31, 46, 0.98)",
      color: "#f3f4f6",
      padding: "12px 14px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.1)",
      fontSize: 13,
      minWidth: 180,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
    }}>
      <div style={{ 
        fontWeight: 700, 
        marginBottom: 10, 
        fontSize: 14,
        color: "#fff",
        paddingBottom: 8,
        borderBottom: "1px solid rgba(255,255,255,0.1)"
      }}>
        {data.bucket}
      </div>
      
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa" }}></div>
          <span>Wins</span>
        </div>
        <div style={{ color: "#a78bfa", fontWeight: 600 }}>{data.wins}</div>
      </div>
      
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background:"#a78bfa"  }}></div>
          <span>Losses</span>
        </div>
        <div style={{ color: "#60a5fa", fontWeight: 600 }}>{data.losses}</div>
      </div>
      
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between",
        paddingTop: 8,
        borderTop: "1px solid rgba(255,255,255,0.1)",
        color: "#9ca3af",
        fontSize: 12
      }}>
        <span>Win Rate</span>
        <span style={{ 
          color: parseFloat(winrate) >= 50 ? "#4ade80" : "#f87171",
          fontWeight: 700 
        }}>
          {winrate}%
        </span>
      </div>
    </div>
  );
};

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  
  return (
    <div style={{
      background: "rgba(26, 31, 46, 0.98)",
      color: "#f3f4f6",
      padding: "12px 14px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.1)",
      fontSize: 13,
      minWidth: 200,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
    }}>
      <div style={{ 
        fontWeight: 700, 
        marginBottom: 10,
        fontSize: 14,
        color: "#fff",
        paddingBottom: 8,
        borderBottom: "1px solid rgba(255,255,255,0.1)"
      }}>
        {d.asset || "Unknown"}
      </div>
      
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#9ca3af" }}>Strategy</span>
        <span style={{ fontWeight: 600 }}>{d.strategyName || d.strategyId || "—"}</span>
      </div>
      
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#9ca3af" }}>Duration</span>
        <span style={{ fontWeight: 600 }}>{fmtMinutes(d.duration)}</span>
      </div>
      
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between",
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid rgba(255,255,255,0.1)"
      }}>
        <span style={{ color: "#9ca3af" }}>Result (R)</span>
        <span style={{ 
          color: d.result_R >= 0 ? "#4ade80" : "#f87171", 
          fontWeight: 700,
          fontSize: 15
        }}>
          {d.result_R >= 0 ? "+" : ""}{limit(d.result_R, 2)}
        </span>
      </div>
    </div>
  );
};

/* Main component */
export default function DurationAnalysis({ trades = [] }: { trades: any[] }) {
const parsed = useMemo(() => {
  return (trades || []).map((t: any) => {
    let entryDate: Date | null = null;
    let exitDate: Date | null = null;

    try {
      if (t.entry_datetime) entryDate = new Date(t.entry_datetime);
    } catch {
      entryDate = null;
    }

    try {
      if (t.exit_datetime) exitDate = new Date(t.exit_datetime);
    } catch {
      exitDate = null;
    }

    let durationMin = 0;
    if (entryDate && exitDate && !isNaN(entryDate.getTime()) && !isNaN(exitDate.getTime())) {
      durationMin = Math.max(0, (exitDate.getTime() - entryDate.getTime()) / 60000);
    }

    return {
      ...t,
      entryDate,
      exitDate,
      duration: durationMin,
      bucket: bucketLabel(durationMin),
    };
  });
}, [trades]);


const stats = useMemo(() => {
  if (!parsed.length) return { avg: "—", fastest: "—", longest: "—", sweet: "—" };

  // todas as durações válidas (em minutos)
  const durationsAll = parsed
    .map((p: any) => p.duration)
    .filter((d: any) => Number.isFinite(d) && d >= 0)
    .sort((a: number, b: number) => a - b);

  if (!durationsAll.length) return { avg: "—", fastest: "—", longest: "—", sweet: "—" };

  const avgAll = durationsAll.reduce((s: number, v: number) => s + v, 0) / durationsAll.length;
  const fastestAll = durationsAll[0];
  const longestAll = durationsAll[durationsAll.length - 1];

  // --- FASTEST WIN (corrigido) ---
  const winDurations = parsed
    .filter((p: any) => getRealR(p) > 0)
    .map((p: any) => p.duration)
    .filter((d: any) => Number.isFinite(d) && d >= 0)
    .sort((a: number, b: number) => a - b);

  const fastestWin = winDurations.length ? winDurations[0] : null;

  // --- SWEET SPOT: bucket mais comum entre WINS (se preferir entre todas, mude para durationsAll) ---
  const counts: Record<string, number> = {};
  // usar wins para sweet spot:
  const sourceForSweet = parsed.filter((p: any) => getRealR(p) > 0);
  // se quiser sweet entre todas as trades, use: const sourceForSweet = parsed;
  sourceForSweet.forEach((p: any) => {
    const b = bucketLabel(p.duration || 0);
    counts[b] = (counts[b] || 0) + 1;
  });
  const sweet = Object.entries(counts).length
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : "—";

  return {
    avg: fmtMinutes(avgAll),
    fastest: fastestWin ? fmtMinutes(fastestWin) : "—", // mostra apenas fastest win
    longest: fmtMinutes(longestAll),
    sweet,
  };
}, [parsed]);


  const bucketData = useMemo(() => {
    const map: Record<string, { bucket: string; wins: number; losses: number; total: number }> = {};
    parsed.forEach((p: any) => {
      const b = p.bucket || bucketLabel(p.duration || 0);
      if (!map[b]) map[b] = { bucket: b, wins: 0, losses: 0, total: 0 };
      map[b].total++;
      if (getRealR(p) > 0) map[b].wins++;
      else map[b].losses++;
    });
    
    // ORDEM DOS NOVOS BUCKETS
    const order = ["<30min", "30min-1h", "1-2h", "2-4h", "4-12h", "12-24h", "1-3d", "3-7d", ">7d"];
    const arr = order.map(k => map[k]).filter(Boolean);
    const rest = Object.values(map).filter(m => !order.includes(m.bucket));
    return [...arr, ...rest];
  }, [parsed]);

  const scatter = useMemo(() => {
    return parsed
      .filter((p: any) => Number.isFinite(p.duration) && p.duration >= 0 && typeof p.result_R === "number")
      .map((p: any) => ({
        duration: p.duration,
        result_R: getRealR(p),
        asset: p.asset,
        strategyName: p.strategyName || p.strategyId || p.strategy || null,
      }));
  }, [parsed]);

  const correlation = useMemo(() => {
    if (scatter.length < 2) return 0;
    const xs = scatter.map((d: any) => Math.log10(d.duration + 1));
    const ys = scatter.map((d: any) => d.result_R);
    const meanX = xs.reduce((a: number, b: number) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a: number, b: number) => a + b, 0) / ys.length;
    const num = xs.reduce((sum: number, x: number, i: number) => sum + (x - meanX) * (ys[i] - meanY), 0);
    const den = Math.sqrt(xs.reduce((s: number, x: number) => s + (x - meanX) ** 2, 0) * ys.reduce((s: number, y: number) => s + (y - meanY) ** 2, 0));
    return den ? num / den : 0;
  }, [scatter]);

  const maxDuration = useMemo(() => {
    const m = scatter.reduce((s: number, d: any) => Math.max(s, d.duration || 0), 0);
    return Math.max(1, m);
  }, [scatter]);

  const colorWin = "#60a5fa";
  const colorLoss = "#a78bfa";
  const scatterWin = "#4ade80";
  const scatterLoss = "#f87171";

  return (
    <div style={{
      background: "linear-gradient(180deg, #1a1f2e 0%, #151a27 100%)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 24,
      color: "#e5e7eb",
    }}>
      <h2 style={{ 
        fontSize: 18, 
        fontWeight: 700, 
        marginBottom: 20, 
        color: "#f3f4f6",
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
        ⏱️ Trade Duration Analysis
      </h2>

      {/* Mini stats */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(4, 1fr)", 
        gap: 12, 
        marginBottom: 24 
      }}>
        <div style={{ 
          background: "rgba(96, 165, 250, 0.1)", 
          border: "1px solid rgba(96, 165, 250, 0.2)", 
          borderRadius: 8, 
          padding: 12 
        }}>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Avg Duration</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa" }}>{stats.avg}</div>
        </div>
        <div style={{ 
          background: "rgba(96, 165, 250, 0.1)", 
          border: "1px solid rgba(96, 165, 250, 0.2)", 
          borderRadius: 8, 
          padding: 12 
        }}>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Fastest Win</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa" }}>{stats.fastest}</div>
        </div>
        <div style={{ 
          background: "rgba(96, 165, 250, 0.1)", 
          border: "1px solid rgba(96, 165, 250, 0.2)", 
          borderRadius: 8, 
          padding: 12 
        }}>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Longest Trade</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa" }}>{stats.longest}</div>
        </div>
        <div style={{ 
          background: "rgba(96, 165, 250, 0.1)", 
          border: "1px solid rgba(96, 165, 250, 0.2)", 
          borderRadius: 8, 
          padding: 12 
        }}>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Sweet Spot</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa" }}>{stats.sweet}</div>
        </div>
      </div>

{/* BARCHART LADO A LADO */}
      <div style={{ 
        background: "rgba(0, 0, 0, 0.2)", 
        borderRadius: 8, 
        padding: 20,
        marginBottom: 24
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12
        }}>
          <h3 style={{ 
            fontSize: 14, 
            color: "#d1d5db", 
            fontWeight: 600,
            margin: 0
          }}>
            Wins vs Losses por Duration
          </h3>
          {/* LEGENDA NO HEADER */}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: colorWin }}></div>
              <span style={{ color: "#9ca3af", fontSize: 12 }}>Wins</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: colorLoss }}></div>
              <span style={{ color: "#9ca3af", fontSize: 12 }}>Losses</span>
            </div>
          </div>
        </div>
        
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bucketData}
              margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
              barGap={8}
              barCategoryGap="25%"
            >
              <XAxis
                dataKey="bucket"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
                width={45}
                label={{
                  value: "Trades",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#9ca3af",
                  fontSize: 12,
                  offset: 0
                }}
              />
              <ReTooltip content={<BarTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="wins" fill={colorWin} radius={[4, 4, 0, 0]} />
              <Bar dataKey="losses" fill={colorLoss} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SCATTER MELHORADO */}
      <div style={{ 
        background: "rgba(0, 0, 0, 0.2)", 
        borderRadius: 8, 
        padding: 20 
      }}>
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          marginBottom: 16 
        }}>
          <h3 style={{ fontSize: 14, color: "#d1d5db", fontWeight: 600 }}>
            Duration × Result (R)
          </h3>
          <div style={{
            fontSize: 12,
            color: "#9ca3af",
            background: "rgba(0, 0, 0, 0.4)",
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)"
          }}>
            Correlation: <span style={{ color: "#60a5fa", fontWeight: 600 }}>{limit(correlation, 3)}</span>
          </div>
        </div>

        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ left: 10, right: 30, top: 20, bottom: 20 }}>
              <CartesianGrid stroke="#374151" strokeOpacity={0.2} strokeDasharray="3 3" />
              <XAxis
                dataKey="duration"
                name="Duration"
                type="number"
                domain={[1, Math.max(2, maxDuration)]}
                scale="log"
                tickFormatter={(v) => (Number.isFinite(v) ? fmtMinutes(Math.round(v)) : "")}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                label={{ 
                  value: "Duration (log scale)", 
                  position: "insideBottom", 
                  offset: -10, 
                  fill: "#9ca3af",
                  fontSize: 12
                }}
              />
              <YAxis 
                dataKey="result_R" 
                name="Result (R)" 
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                label={{ 
                  value: "Result (R)", 
                  angle: -90, 
                  position: "insideLeft", 
                  fill: "#9ca3af",
                  fontSize: 12
                }}
              />
              <ZAxis range={[40, 400]} />
              <ReTooltip content={<ScatterTooltip />} />
              <Legend 
                verticalAlign="top"
                height={36}
                iconType="circle"
                formatter={(value, entry: any) => {
                  const color = entry.color;
                  return <span style={{ color: "#9ca3af", fontSize: 12 }}>{value}</span>;
                }}
                payload={[
                  { value: "Winning Trades", type: "circle", color: scatterWin },
                  { value: "Losing Trades", type: "circle", color: scatterLoss }
                ]}
              />
              <Scatter
                data={scatter}
                fill="#4ade80"
                shape="circle"
              >
                {scatter.map((entry: any, idx: number) => (
                  <Cell 
                    key={`c-${idx}`} 
                    fill={entry.result_R >= 0 ? scatterWin : scatterLoss}
                    opacity={0.7}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}