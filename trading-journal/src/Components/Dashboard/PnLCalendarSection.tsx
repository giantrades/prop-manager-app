import React, { useMemo, useState, useEffect } from "react";
import { useCurrency } from "@apps/state";

const isMobile = window.innerWidth < 768;
const daysShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const safeNumber = (n: any) => (typeof n === "number" && !isNaN(n) ? n : Number(n) || 0);

function useFmtCurrency() {
  try {
    const { currency, rate } = useCurrency() || { currency: "BRL", rate: 1 };
    const fmt = (v: number) =>
      currency === "USD"
        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0)
        : new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format((v || 0) * (rate || 1));
    const fmtShort = (v: number) => {
      const converted = currency === "BRL" ? (v || 0) * (rate || 1) : (v || 0);
      const abs = Math.abs(converted);
      const sign = converted < 0 ? "-" : "";
      const symbol = currency === "USD" ? "$" : "R$";
      const locale = currency === "USD" ? "en-US" : "pt-BR";
      const nf = (n: number, d: number) =>
        new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
      if (abs >= 1_000_000) return `${sign}${symbol}${nf(abs / 1_000_000, 1)}M`;
      if (abs >= 1_000) return `${sign}${symbol}${nf(abs / 1_000, 1)}k`;
      return `${sign}${symbol}${nf(abs, 0)}`;
    };
    return { fmt, fmtShort, currency, rate };
  } catch {
    const fmt = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v || 0);
    const fmtShort = (v: number) => {
      const abs = Math.abs(v);
      const sign = v < 0 ? "-" : "";
      const nf = (n: number, d: number) =>
        new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
      if (abs >= 1_000_000) return `${sign}R$${nf(abs / 1_000_000, 1)}M`;
      if (abs >= 1_000) return `${sign}R$${nf(abs / 1_000, 1)}k`;
      return `${sign}R$${nf(abs, 0)}`;
    };
    return { fmt, fmtShort, currency: "BRL", rate: 1 };
  }
}

const PnLCalendarSection = ({ trades }: { trades: any[] }) => {
  const { fmt, fmtShort, currency, rate } = useFmtCurrency();
  const [tooltip, setTooltip] = useState<any | null>(null);
  const [viewDate, setViewDate] = useState(() => new Date());

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    trades.forEach(t => {
      if (!t.entry_datetime) return;
      const d = new Date(t.entry_datetime);
      if (!isNaN(d.getTime())) set.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    const sorted = Array.from(set).sort();
    return sorted.map(s => {
      const [y, m] = s.split("-").map(Number);
      return { year: y, month: m, label: `${monthNames[m]} ${y}` };
    });
  }, [trades]);

  const tradesByDate = useMemo(() => {
    const map = new Map<string, { totalPnl: number; count: number; wins: number; losses: number; trades: any[] }>();
    trades.forEach(t => {
      if (!t.entry_datetime) return;
      const d = new Date(t.entry_datetime);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const pnl = safeNumber(t.result_net);
      const existing = map.get(key) || { totalPnl: 0, count: 0, wins: 0, losses: 0, trades: [] };
      existing.totalPnl += pnl;
      existing.count++;
      existing.trades.push(t);
      if (pnl > 0) existing.wins++;
      else if (pnl < 0) existing.losses++;
      map.set(key, existing);
    });
    return map;
  }, [trades]);

  const calendarData = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: { day: number | null; totalPnl?: number; count?: number; wins?: number; losses?: number }[] = [];

    for (let i = 0; i < firstDay; i++) days.push({ day: null });

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const data = tradesByDate.get(key);
      days.push({
        day: d,
        totalPnl: data?.totalPnl,
        count: data?.count,
        wins: data?.wins,
        losses: data?.losses,
      });
    }

    return days;
  }, [viewDate, tradesByDate]);

  const maxAbs = useMemo(() => {
    let max = 0;
    calendarData.forEach(d => { if (d.totalPnl) max = Math.max(max, Math.abs(d.totalPnl)); });
    return max;
  }, [calendarData]);

  const getColor = (pnl: number | undefined) => {
    if (pnl === undefined || pnl === 0) return "rgba(31,41,55,0.24)";
    const intensity = maxAbs === 0 ? 0 : Math.abs(pnl) / maxAbs;
    if (pnl > 0) return `rgba(34,197,94,${0.28 + 0.65 * Math.min(1, intensity)})`;
    return `rgba(220,38,38,${0.28 + 0.65 * Math.min(1, intensity)})`;
  };

  const goToPrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const goToNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const isFirstMonth = availableMonths.length > 0 && viewDate.getFullYear() === availableMonths[0].year && viewDate.getMonth() === availableMonths[0].month;
  const isLastMonth = availableMonths.length > 0 && viewDate.getFullYear() === availableMonths[availableMonths.length - 1].year && viewDate.getMonth() === availableMonths[availableMonths.length - 1].month;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  useEffect(() => {
    const handleClick = () => { if (window.innerWidth <= 768) setTooltip(null); };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const minYear = availableMonths.length > 0 ? availableMonths[0].year : today.getFullYear() - 5;
  const maxYear = availableMonths.length > 0 ? availableMonths[availableMonths.length - 1].year : today.getFullYear();
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

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
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#f3f4f6" }}>
        📅 PnL Calendar
      </h2>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8 }}>
        <button
          onClick={goToPrevMonth}
          disabled={isFirstMonth}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.1)",
            color: isFirstMonth ? "#4b5563" : "#e5e7eb",
            borderRadius: 8,
            padding: "6px 12px",
            cursor: isFirstMonth ? "default" : "pointer",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ◀
        </button>

        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", display: "flex" }}>
          <select
            value={viewMonth}
            onChange={(e) => setViewDate(new Date(viewYear, Number(e.target.value), 1))}
            style={{
              background: "transparent",
              border: "none",
              color: "#f3f4f6",
              padding: "6px 12px",
              fontSize: isMobile ? 13 : 15,
              fontWeight: 700,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {monthNames.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>

          <div style={{ width: 1, background: "rgba(255,255,255,0.15)" }} />

          <select
            value={viewYear}
            onChange={(e) => setViewDate(new Date(Number(e.target.value), viewMonth, 1))}
            style={{
              background: "transparent",
              border: "none",
              color: "#f3f4f6",
              padding: "6px 12px",
              fontSize: isMobile ? 13 : 15,
              fontWeight: 700,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button
          onClick={goToNextMonth}
          disabled={isLastMonth}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.1)",
            color: isLastMonth ? "#4b5563" : "#e5e7eb",
            borderRadius: 8,
            padding: "6px 12px",
            cursor: isLastMonth ? "default" : "pointer",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ▶
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 8,
          fontSize: isMobile ? 10 : 12,
          color: "#9ca3af",
          textAlign: "center",
        }}
      >
        {daysShort.map(d => (
          <div key={d} style={{ padding: "4px 0", fontWeight: 600 }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {calendarData.map((item, idx) => {
          if (item.day === null) return <div key={`pad-${idx}`} />;

          const cellDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(item.day).padStart(2, "0")}`;
          const isToday = cellDateStr === todayStr;
          const hasData = item.totalPnl !== undefined;

          return (
            <div
              key={item.day}
              onMouseEnter={(e) => {
                if (!hasData) return;
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  x: rect.left + rect.width / 2,
                  y: rect.top - 10,
                  day: item.day,
                  totalPnl: item.totalPnl,
                  count: item.count,
                  wins: item.wins,
                  losses: item.losses,
                  color: (item.totalPnl || 0) > 0 ? "#22c55e" : (item.totalPnl || 0) < 0 ? "#ef4444" : "#9ca3af",
                });
              }}
              onMouseLeave={() => { if (window.innerWidth > 768) setTooltip(null); }}
              onClick={(e) => {
                if (!hasData) return;
                e.stopPropagation();
                if (window.innerWidth <= 768) {
                  setTooltip(prev =>
                    prev && prev.day === item.day
                      ? null
                      : {
                          x: window.innerWidth / 2,
                          y: window.innerHeight / 2,
                          day: item.day,
                          totalPnl: item.totalPnl,
                          count: item.count,
                          wins: item.wins,
                          losses: item.losses,
                          color: (item.totalPnl || 0) > 0 ? "#22c55e" : (item.totalPnl || 0) < 0 ? "#ef4444" : "#9ca3af",
                        }
                  );
                }
              }}
              style={{
                aspectRatio: "1",
                borderRadius: 8,
                background: hasData ? getColor(item.totalPnl) : "rgba(31,41,55,0.12)",
                border: isToday ? "1px solid rgba(96,165,250,0.5)" : "1px solid rgba(255,255,255,0.02)",
                cursor: hasData ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 2,
                position: "relative",
                minHeight: isMobile ? 40 : 56,
              }}
            >
              <div style={{
                fontSize: isMobile ? 9 : 10,
                color: isToday ? "#60a5fa" : "#6b7280",
                fontWeight: isToday ? 700 : 400,
                position: "absolute",
                top: 3,
                left: 5,
                lineHeight: 1,
              }}>
                {item.day}
              </div>
              {hasData && (
                <div style={{
                  fontSize: isMobile ? 7 : 9,
                  fontWeight: 700,
                  color: (item.totalPnl || 0) > 0 ? "#4ade80" : (item.totalPnl || 0) < 0 ? "#f87171" : "#9ca3af",
                  marginTop: isMobile ? 2 : 4,
                  lineHeight: 1.2,
                  textAlign: "center",
                  wordBreak: "break-all",
                }}>
                  {fmtShort(item.totalPnl || 0)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div
          style={{
            position: "fixed",
            top: window.innerWidth <= 768 ? "50%" : `${tooltip.y}px`,
            left: window.innerWidth <= 768 ? "50%" : `${tooltip.x}px`,
            transform: window.innerWidth <= 768 ? "translate(-50%, -50%)" : "translate(-50%, -110%)",
            background: "rgba(10,14,22,0.95)",
            border: `1px solid ${tooltip.color}`,
            padding: "12px 14px",
            borderRadius: 10,
            color: "#f3f4f6",
            minWidth: window.innerWidth <= 768 ? "80%" : 220,
            zIndex: 9999,
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            fontSize: 13,
            pointerEvents: "auto",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, color: tooltip.color, fontSize: 14 }}>
            {`${tooltip.day} de ${monthNames[viewMonth]} de ${viewYear}`}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ color: "#cbd5e1" }}>PnL:</div>
            <div style={{ fontWeight: 800, color: tooltip.totalPnl > 0 ? "#4ade80" : tooltip.totalPnl < 0 ? "#f87171" : "#e5e7eb" }}>
              {fmt(tooltip.totalPnl || 0)}
            </div>
          </div>
          {tooltip.count > 0 && (
            <div style={{ color: "#9ca3af" }}>
              <div><strong style={{ color: "#fff" }}>{tooltip.count}</strong> trades</div>
              <div style={{ marginTop: 4 }}>({tooltip.wins}W / {tooltip.losses}L)</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PnLCalendarSection;
