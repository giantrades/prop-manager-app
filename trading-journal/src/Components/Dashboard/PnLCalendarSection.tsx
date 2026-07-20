import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
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

  const constrainTooltip = (x: number, y: number, w = 260, h = 160) => {
    const pad = 12;
    const cx = Math.max(pad + w / 2, Math.min(x, window.innerWidth - pad - w / 2));
    const cy = Math.max(pad + h * 1.1, Math.min(y, window.innerHeight - pad + h * 0.1));
    return { x: cx, y: cy };
  };

  const goToPrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const goToNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const goToToday = () => setViewDate(new Date());

  const isFirstMonth = availableMonths.length > 0 && viewDate.getFullYear() === availableMonths[0].year && viewDate.getMonth() === availableMonths[0].month;
  const isLastMonth = availableMonths.length > 0 && viewDate.getFullYear() === availableMonths[availableMonths.length - 1].year && viewDate.getMonth() === availableMonths[availableMonths.length - 1].month;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-tooltip-cell]') && !target.closest('[data-tooltip]')) {
        setTooltip(null);
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const availableMonthsSet = useMemo(() => new Set(availableMonths.map(m => `${m.year}-${m.month}`)), [availableMonths]);
  const availableYears = useMemo(() => [...new Set(availableMonths.map(m => m.year))].sort(), [availableMonths]);
  const fallbackYears = useMemo(() => {
    if (availableYears.length > 0) return [];
    const y = today.getFullYear();
    return Array.from({ length: 6 }, (_, i) => y - 5 + i);
  }, [availableYears]);
  const yearList = availableYears.length > 0 ? availableYears : fallbackYears;

  return (
    <div
      className="card"
      style={{
        background: "linear-gradient(180deg,#10151f 0%,#0c1119 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 12,
        padding: isMobile ? "16px 12px" : 24,
        boxSizing: "border-box", // Correção: Garante que o padding não adicione largura extra
        width: "100%",           // Correção: Garante que o container não extrapole a tela
        color: "#e5e7eb",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, marginBottom: 16, color: "#f3f4f6" }}>
        📅 PnL Calendar
      </h2>

      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "space-between",
        marginBottom: 16,
        gap: 12
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <button
            onClick={goToPrevMonth}
            disabled={isFirstMonth}
            style={{
              background: isFirstMonth ? "transparent" : "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: isFirstMonth ? "#4b5563" : "#e5e7eb",
              borderRadius: 8, padding: "8px 12px", cursor: isFirstMonth ? "default" : "pointer"
            }}
          >
            ◀
          </button>

          <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden", display: "flex", padding: "2px 6px" }}>
            <select
              value={viewMonth}
              onChange={(e) => setViewDate(new Date(viewYear, Number(e.target.value), 1))}
              style={{ background: "transparent", border: "none", color: "#f3f4f6", padding: "5px", fontSize: 13, fontWeight: 700, outline: "none" }}
            >
              {monthNames.map((name, i) => {
                const hasTrade = availableMonthsSet.has(`${viewYear}-${i}`);
                return <option key={i} value={i} disabled={!hasTrade} style={{ background: "#10151f", color: hasTrade ? "#f3f4f6" : "#4b5563" }}>{isMobile ? name.substring(0, 3) : name}</option>;
              })}
            </select>
            <div style={{ width: 1, background: "rgba(255,255,255,0.12)", margin: "0 2px" }} />
            <select
              value={viewYear}
              onChange={(e) => setViewDate(new Date(Number(e.target.value), viewMonth, 1))}
              style={{ background: "transparent", border: "none", color: "#f3f4f6", padding: "5px", fontSize: 13, fontWeight: 700, outline: "none" }}
            >
              {yearList.map(y => <option key={y} value={y} style={{ background: "#10151f", color: "#f3f4f6" }}>{y}</option>)}
            </select>
          </div>

          <button
            onClick={goToNextMonth}
            disabled={isLastMonth}
            style={{
              background: isLastMonth ? "transparent" : "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: isLastMonth ? "#4b5563" : "#e5e7eb",
              borderRadius: 8, padding: "8px 12px", cursor: isLastMonth ? "default" : "pointer"
            }}
          >
            ▶
          </button>
        </div>

        <button
          onClick={goToToday}
          style={{
            background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)", color: "#93c5fd",
            borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
            alignSelf: isMobile ? "center" : "auto", width: isMobile ? "100%" : "auto"
          }}
        >
          ● Hoje
        </button>
      </div>

      {/* Correção: Uso de minmax(0, 1fr) no grid template para forçar os itens a respeitarem o container */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: isMobile ? 2 : 4, marginBottom: 8, fontSize: isMobile ? 10 : 12, color: "#9ca3af", textAlign: "center" }}>
        {daysShort.map(d => <div key={d} style={{ padding: "4px 0", fontWeight: 600 }}>{d}</div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: isMobile ? 2 : 4 }}>
        {calendarData.map((item, idx) => {
          if (item.day === null) return <div key={`pad-${idx}`} />;

          const cellDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(item.day).padStart(2, "0")}`;
          const isToday = cellDateStr === todayStr;
          const hasData = item.totalPnl !== undefined;

          return (
            <div
              key={item.day}
              data-tooltip-cell
              onMouseEnter={(e) => {
                if (!hasData || isMobile) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const cellCenterX = rect.left + rect.width / 2;
                const aboveSpace = rect.top - 10 - 12 - 160 * 1.1;
                const belowSpace = window.innerHeight - rect.bottom - 12 - 160 * 0.1;
                const showAbove = aboveSpace >= 0 || aboveSpace > belowSpace;
                const y = showAbove ? rect.top - 10 : rect.bottom + 10;
                setTooltip({
                  ...constrainTooltip(cellCenterX, y, 260, 160), above: showAbove, day: item.day,
                  totalPnl: item.totalPnl, count: item.count, wins: item.wins, losses: item.losses,
                  color: (item.totalPnl || 0) > 0 ? "#22c55e" : (item.totalPnl || 0) < 0 ? "#ef4444" : "#9ca3af",
                });
              }}
              onMouseLeave={() => { if (!isMobile) setTooltip(null); }}
              onClick={(e) => {
                if (!hasData || !isMobile) return;
                e.stopPropagation();
                setTooltip(prev => prev && prev.day === item.day ? null : {
                  x: window.innerWidth / 2, y: window.innerHeight / 2, above: true, day: item.day,
                  totalPnl: item.totalPnl, count: item.count, wins: item.wins, losses: item.losses,
                  color: (item.totalPnl || 0) > 0 ? "#22c55e" : (item.totalPnl || 0) < 0 ? "#ef4444" : "#9ca3af",
                });
              }}
              style={{
                aspectRatio: isMobile ? "auto" : "1",
                minHeight: isMobile ? 52 : 56,
                borderRadius: 8,
                background: hasData ? getColor(item.totalPnl) : "rgba(15,23,42,0.4)",
                border: isToday ? "1px solid #60a5fa" : hasData ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.02)",
                cursor: hasData ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                padding: "4px 2px",
                position: "relative",
              }}
            >
              <div style={{ fontSize: isMobile ? 10 : 11, color: isToday ? "#60a5fa" : (hasData ? "#f3f4f6" : "#4b5563"), fontWeight: isToday || hasData ? 600 : 400, lineHeight: 1 }}>
                {item.day}
              </div>
              {hasData && (
                <div style={{ fontSize: isMobile ? 9 : 10, fontWeight: 800, color: (item.totalPnl || 0) > 0 ? "#4ade80" : (item.totalPnl || 0) < 0 ? "#f87171" : "#9ca3af", marginTop: isMobile ? 10 : 12, lineHeight: 1.2, textAlign: "center", wordBreak: "break-all" }}>
                  {fmtShort(item.totalPnl || 0)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tooltip && createPortal(
        <div
          data-tooltip
          style={{
            position: "fixed",
            top: window.innerWidth <= 768 ? "50%" : `${tooltip.y}px`,
            left: window.innerWidth <= 768 ? "50%" : `${tooltip.x}px`,
            transform: window.innerWidth <= 768 ? "translate(-50%, -50%)" : tooltip.above ? "translate(-50%, -110%)" : "translate(-50%, 10px)",
            background: "rgba(10,14,22,0.95)", border: `1px solid ${tooltip.color}`, padding: "12px 14px", borderRadius: 10,
            color: "#f3f4f6", minWidth: window.innerWidth <= 768 ? "80%" : 220, zIndex: 99999, boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, color: tooltip.color, fontSize: 14 }}>
            {`${tooltip.day} de ${monthNames[viewMonth]} de ${viewYear}`}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>PnL:</div>
            <div style={{ fontWeight: 800, color: tooltip.totalPnl > 0 ? "#4ade80" : tooltip.totalPnl < 0 ? "#f87171" : "#e5e7eb", fontSize: 13 }}>
              {fmt(tooltip.totalPnl || 0)}
            </div>
          </div>
          {tooltip.count > 0 && (
            <div style={{ color: "#9ca3af", fontSize: 13 }}>
              <div><strong style={{ color: "#fff" }}>{tooltip.count}</strong> trades</div>
              <div style={{ marginTop: 4 }}>({tooltip.wins}W / {tooltip.losses}L)</div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default PnLCalendarSection;