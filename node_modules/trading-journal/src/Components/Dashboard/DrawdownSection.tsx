import React, { useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { getAll } from "@apps/lib/dataStore";
import { useCurrency } from "@apps/state";

// ✅ Utilitário seguro
const safeNumber = (n: any) => (typeof n === "number" && !isNaN(n) ? n : Number(n) || 0);

// ✅ Fallback inteligente de formatação de moeda
function useFmtCurrencyFallback() {
  try {
    const { currency, rate } = useCurrency() || { currency: "BRL", rate: 1 };
    const fmt = (v: number) =>
      currency === "USD"
        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0)
        : new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: currency || "BRL",
          }).format((v || 0) * (rate || 1));
    return fmt;
  } catch {
    return (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v || 0);
  }
}

/* =====================================================
   Construção da série de equity cumulativa corrigida
===================================================== */
function buildEquitySeries(trades: any[], accounts: any[]) {
  const start = accounts.reduce((s, acc) => s + safeNumber(acc.initialFunding || 0), 0);

  const sorted = trades
    .slice()
    .filter((t) => t && (t.entry_datetime || t.date))
    .sort(
      (a, b) =>
        new Date(a.entry_datetime || a.date).getTime() -
        new Date(b.entry_datetime || b.date).getTime()
    );

  let eq = start;
  return sorted.map((t) => {
    eq += safeNumber(t.result_net);
    const baseDate = t.entry_datetime || t.date;
    const dateObj = new Date(baseDate);
    return {
      date: baseDate,
      label: dateObj.toLocaleDateString("pt-BR"),
      equity: +eq.toFixed(2),
    };
  });
}

/* =====================================================
   Detecção de drawdowns (inalterada)
===================================================== */
function detectDrawdowns(series: any[]) {
  const drawdowns: any[] = [];
  if (!series.length) return drawdowns;

  let peak = series[0].equity;
  let peakIndex = 0;
  let troughIndex = 0;
  let inDD = false;

  for (let i = 1; i < series.length; i++) {
    const val = series[i].equity;

    if (val >= peak) {
      if (inDD) {
        const start = series[peakIndex];
        const trough = series[troughIndex];
        const end = series[i];
        const abs = +(start.equity - trough.equity).toFixed(2);
        const pct = +((abs / start.equity) * 100).toFixed(2);
        const duration = Math.max(
          1,
          Math.round(
            (new Date(end.date).getTime() - new Date(start.date).getTime()) /
              (1000 * 3600 * 24)
          )
        );
        const recovery = Math.max(
          0,
          Math.round(
            (new Date(end.date).getTime() - new Date(trough.date).getTime()) /
              (1000 * 3600 * 24)
          )
        );
        drawdowns.push({
          id: drawdowns.length + 1,
          startDate: start.label,
          troughDate: trough.label,
          recoveryDate: end.label,
          drawdownAbs: abs,
          drawdownPct: pct,
          durationDays: duration,
          recoveryDays: recovery,
          recovered: true,
        });
      }
      peak = val;
      peakIndex = i;
      inDD = false;
    } else {
      if (!inDD || val < series[troughIndex].equity) {
        inDD = true;
        troughIndex = i;
      }
    }
  }

  if (inDD) {
    const start = series[peakIndex];
    const trough = series[troughIndex];
    const abs = +(start.equity - trough.equity).toFixed(2);
    const pct = +((abs / start.equity) * 100).toFixed(2);
    const duration = Math.max(
      1,
      Math.round(
        (new Date(series.at(-1).date).getTime() - new Date(start.date).getTime()) /
          (1000 * 3600 * 24)
      )
    );
    drawdowns.push({
      id: drawdowns.length + 1,
      startDate: start.label,
      troughDate: trough.label,
      recoveryDate: null,
      drawdownAbs: abs,
      drawdownPct: pct,
      durationDays: duration,
      recoveryDays: null,
      recovered: false,
    });
  }

  return drawdowns.sort((a, b) => b.drawdownPct - a.drawdownPct);
}

/* =====================================================
   Componente principal
===================================================== */
export default function DrawdownSection({
  trades = [],
  accounts = [],
}: {
  trades: any[];
  accounts: any[];
}) {
  const fmtCurrency = useFmtCurrencyFallback();

  const allData = getAll();
  const effectiveTrades = trades.length ? trades : allData.trades || [];
  const effectiveAccounts = accounts.length ? accounts : allData.accounts || [];

  const equitySeries = useMemo(
    () => buildEquitySeries(effectiveTrades, effectiveAccounts),
    [effectiveTrades, effectiveAccounts]
  );

  const drawdowns = useMemo(() => detectDrawdowns(equitySeries), [equitySeries]);

  const maxDD = drawdowns[0] || { drawdownAbs: 0, drawdownPct: 0 };
  const avgDD = drawdowns.length
    ? +(drawdowns.reduce((s, d) => s + d.drawdownAbs, 0) / drawdowns.length).toFixed(2)
    : 0;
  const avgRecovery = drawdowns.filter((d) => d.recovered).length
    ? Math.round(
        drawdowns
          .filter((d) => d.recovered)
          .reduce((s, d) => s + (d.recoveryDays || 0), 0) /
          drawdowns.filter((d) => d.recovered).length
      )
    : null;

  const peakEquity = Math.max(...equitySeries.map((e) => e.equity || 0));
  const lastEquity = equitySeries.at(-1)?.equity || 0;
  const currentStatus =
    Math.abs(lastEquity - peakEquity) < 1e-6 ? "At Peak ✓" : "In Drawdown ⚠️";

  const underwater = useMemo(() => {
    let peak = -Infinity;
    return equitySeries.map((pt) => {
      peak = Math.max(peak, pt.equity);
      const dd = peak > 0 ? ((pt.equity - peak) / peak) * 100 : 0;
      return { date: pt.label, dd: +dd.toFixed(2) };
    });
  }, [equitySeries]);

  const [page, setPage] = useState(0);
  const perPage = 3;
  const totalPages = Math.max(1, Math.ceil(drawdowns.length / perPage));
  const pageItems = drawdowns.slice(page * perPage, page * perPage + perPage);

  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>📉 Drawdown Deep Dive</h2>

      {/* Métricas principais */}
      <div
        className="dd-metrics"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Max Drawdown</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#ef4444" }}>
            {fmtCurrency(-safeNumber(maxDD.drawdownAbs))}
            <br />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              -{maxDD.drawdownPct}%
            </span>
          </div>
        </div>
        <div>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Avg Drawdown</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#ef4444" }}>
            {fmtCurrency(-safeNumber(avgDD))}
            <br />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>avg depth</span>
          </div>
        </div>
        <div>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Avg Recovery</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {avgRecovery ? `${avgRecovery} days` : "—"}
          </div>
        </div>
        <div>
          <div style={{ color: "#9ca3af", fontSize: 12 }}>Current Status</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: currentStatus.includes("Peak")
                ? "#4ade80"
                : "#ef4444",
            }}
          >
            {currentStatus}
          </div>
        </div>
      </div>

      {/* Gráfico Underwater */}
      <div style={{ height: 200, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={underwater}>
            <defs>
              <linearGradient id="gradDD" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 8,
                color: "#f3f4f6",
              }}
              formatter={(v: number) => `${v}%`}
            />
            <Area dataKey="dd" stroke="#dc2626" strokeWidth={2} fill="url(#gradDD)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Worst Drawdowns */}
      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>🔻 Worst Drawdowns</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#9ca3af", textAlign: "left" }}>
              <th>#</th>
              <th>Period</th>
              <th>Max DD</th>
              <th>Duration</th>
              <th>Recovery</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 8, color: "#9ca3af" }}>
                  No drawdowns detected
                </td>
              </tr>
            )}
            {pageItems.map((d, i) => (
              <tr key={d.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <td>{page * perPage + i + 1}</td>
                <td>
                  {d.startDate} — {d.recoveryDate || "ongoing"}
                </td>
                <td style={{ color: "#ef4444" }}>
                  {fmtCurrency(-safeNumber(d.drawdownAbs))} ({d.drawdownPct}%)
                </td>
                <td>{d.durationDays} days</td>
                <td>
                  {d.recovered ? (
                    `${d.recoveryDays} days`
                  ) : (
                    <span
                      style={{
                        background: "#dc2626",
                        color: "#fff",
                        borderRadius: 6,
                        padding: "2px 6px",
                        fontSize: 12,
                      }}
                    >
                      ONGOING
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paginação */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 10,
          }}
        >
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            ◀
          </button>
          <span style={{ color: "#9ca3af" }}>
            Page {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            ▶
          </button>
        </div>
        {/* Insights */}
<div
  className="insights"
  style={{
    marginTop: 16,
    background: "rgba(26,31,46,0.6)",
    borderRadius: 8,
    padding: 12,
  }}
>
  <ul style={{ color: "#e5e7eb", fontSize: 13, lineHeight: 1.8 }}>
    <li>
      📊 Total significant drawdowns (&gt;5%):{" "}
      <strong>{drawdowns.filter((d) => d.drawdownPct >= 5).length}</strong>
    </li>
    <li>
      ⏱️ Average time in drawdown:{" "}
      <strong>
        {drawdowns.length
          ? Math.round(
              drawdowns.reduce((s, d) => s + d.durationDays, 0) / drawdowns.length
            )
          : 0}{" "}
        days
      </strong>
    </li>
    <li>
      📈 Recovery rate:{" "}
      <strong>
        {drawdowns.length
          ? Math.round(
              (drawdowns.filter((d) => d.recovered).length / drawdowns.length) *
                100
            )
          : 0}
        %
      </strong>
    </li>
    <li>
      ⚠️ Longest period without new peak:{" "}
      <strong>
        {drawdowns.length
          ? Math.max(...drawdowns.map((d) => d.durationDays))
          : 0}{" "}
        days
      </strong>
    </li>
  </ul>
</div>

      </div>
    </div>
  );
}
