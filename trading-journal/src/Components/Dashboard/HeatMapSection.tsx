import React, { useMemo, useState } from "react";
import { useCurrency } from "@apps/state"; // se não existir, pode remover

const safeNumber = (n: any) => (typeof n === "number" && !isNaN(n) ? n : Number(n) || 0);

const daysFull = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const daysShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fmtHourRange = (h: number) => `${String(h).padStart(2, "0")}:00 – ${String((h + 1) % 24).padStart(2, "0")}:00`;

function useFmtCurrencyFallback() {
  try {
    const { currency, rate } = useCurrency() || { currency: "BRL", rate: 1 };
    const fmt = (v: number) =>
      currency === "USD"
        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0)
        : new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format((v || 0) * (rate || 1));
    return fmt;
  } catch {
    return (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v || 0);
  }
}

// ✅ Usa sempre entry_datetime (ISO completo)
function parseTradeDate(t: any): Date | null {
  if (!t) return null;
  if (t.entry_datetime) {
    const d = new Date(t.entry_datetime);
    if (!isNaN(d.getTime())) return d;
  }
  if (t.exit_datetime) {
    const d = new Date(t.exit_datetime);
    if (!isNaN(d.getTime())) return d;
  }
  if (t.createdAt) {
    const d = new Date(t.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

const HeatmapSection = ({ trades }: { trades: any[] }) => {
  const fmtCurrency = useFmtCurrencyFallback();
  const [tooltip, setTooltip] = useState<any | null>(null);

  const heatmap = useMemo(() => {
    const matrix = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({
        sum: 0,
        count: 0,
        wins: 0,
        losses: 0,
        dates: [] as Date[],
        rows: [] as any[],
      }))
    );

    trades.forEach((t) => {
      const dt = parseTradeDate(t);
      if (!dt) return;
      const day = dt.getDay();
      const hour = dt.getHours();
      const val = safeNumber(t.result_net);
      const cell = matrix[day][hour];
      cell.sum += val;
      cell.count++;
      cell.dates.push(dt);
      cell.rows.push(t);
      if (val > 0) cell.wins++;
      else if (val < 0) cell.losses++;
    });

    let maxAbs = 0;
    matrix.forEach((r) => r.forEach((c) => (maxAbs = Math.max(maxAbs, Math.abs(c.sum)))));
    const norm = matrix.map((row) => row.map((c) => (maxAbs === 0 ? 0 : c.sum / maxAbs)));

    const dayTotals = matrix.map((row) => row.reduce((s, c) => s + c.sum, 0));
    const bestDayIndex = dayTotals.length ? dayTotals.indexOf(Math.max(...dayTotals)) : -1;
    const bestDay = bestDayIndex >= 0 ? daysFull[bestDayIndex] : "—";

    const hourTotals = Array.from({ length: 24 }, (_, h) => matrix.reduce((s, row) => s + row[h].sum, 0));
    const bestHourIndex = hourTotals.length ? hourTotals.indexOf(Math.max(...hourTotals)) : -1;
    const bestHour = bestHourIndex >= 0 ? fmtHourRange(bestHourIndex) : "—";

    return { matrix, norm, bestDay, bestHour };
  }, [trades]);

  const color = (val: number) => {
    if (val === 0) return "rgba(31,41,55,0.24)";
    if (val > 0) return `rgba(34,197,94,${0.28 + 0.65 * Math.min(1, val)})`;
    return `rgba(220,38,38,${0.28 + 0.65 * Math.min(1, Math.abs(val))})`;
  };

  const constrainTooltip = (x: number, y: number, w = 260, h = 140) => {
    const pad = 12;
    const maxX = window.innerWidth - w - pad;
    const maxY = window.innerHeight - h - pad;
    return { x: Math.max(pad, Math.min(x, maxX)), y: Math.max(pad, Math.min(y, maxY)) };
  };

  return (
    <div
      className="card"
      style={{
        background: "linear-gradient(180deg,#1a1f2e 0%,#151a27 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: 24,
        color: "#e5e7eb",
        position: "relative",
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: "#f3f4f6" }}>
        🔥 Performance Heatmap: Dia × Hora
      </h2>

      {/* Top stats */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)", borderRadius: 8, padding: "12px 16px", flex: 1, minWidth: 150 }}>
          <div style={{ color: "#9ca3af", fontSize: 13 }}>Melhor Dia</div>
          <strong style={{ color: "#4ade80", fontSize: 16 }}>{heatmap.bestDay}</strong>
        </div>

        <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)", borderRadius: 8, padding: "12px 16px", flex: 1, minWidth: 150 }}>
          <div style={{ color: "#9ca3af", fontSize: 13 }}>Melhor Hora</div>
          <strong style={{ color: "#4ade80", fontSize: 16 }}>{heatmap.bestHour}</strong>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", paddingRight: 8, fontSize: 11, color: "#9ca3af" }}>
          {daysShort.map((d) => (
            <div key={d} style={{ height: 24, display: "flex", alignItems: "center" }}>{d}</div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, marginBottom: 6, fontSize: 9, color: "#6b7280", textAlign: "center" }}>
            {Array.from({ length: 24 }).map((_, i) => <div key={i}>{i}</div>)}
          </div>

          <div style={{ display: "grid", gap: 2 }}>
            {heatmap.matrix.map((row, day) => (
              <div key={day} style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
                {row.map((cell, hour) => (
                  <div
                    key={hour}
                    onMouseEnter={(e) => {
                      const pos = constrainTooltip(e.clientX + 12, e.clientY + 12, 320, 160);
                      setTooltip({
                        x: pos.x,
                        y: pos.y,
                        day,
                        hour,
                        ...cell,
                        color: cell.sum > 0 ? "#22c55e" : cell.sum < 0 ? "#ef4444" : "#9ca3af",
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 6,
                      background: color(heatmap.norm[day][hour]),
                      transition: "transform 0.12s, box-shadow 0.12s",
                      cursor: cell.count ? "pointer" : "default",
                      boxShadow: cell.count ? "0 6px 18px rgba(0,0,0,0.35)" : "none",
                      border: "1px solid rgba(255,255,255,0.02)",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            top: tooltip.y,
            left: tooltip.x,
            background: "rgba(10,14,22,0.95)",
            border: `1px solid ${tooltip.color}`,
            padding: "12px 14px",
            borderRadius: 10,
            color: "#f3f4f6",
            minWidth: 260,
            zIndex: 9999,
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8, color: tooltip.color }}>
            {daysFull[tooltip.day]}
          </div>
          <div style={{ color: "#9ca3af", marginBottom: 8 }}>⏰ {fmtHourRange(tooltip.hour)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ color: "#cbd5e1" }}>Lucro líquido:</div>
            <div style={{ fontWeight: 800, color: tooltip.sum > 0 ? "#4ade80" : tooltip.sum < 0 ? "#f87171" : "#e5e7eb" }}>
              {fmtCurrency(tooltip.sum)}
            </div>
          </div>
          <div style={{ color: "#9ca3af" }}>
            {tooltip.count > 0 ? (
              <div>
                <div><strong style={{ color: "#fff" }}>{tooltip.count}</strong> trades</div>
                <div style={{ marginTop: 4 }}>({tooltip.wins}W / {tooltip.losses}L)</div>
              </div>
            ) : (
              <div style={{ color: "#6b7280" }}>Sem trades neste horário</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HeatmapSection;
