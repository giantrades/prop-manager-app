import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useCurrency } from "@apps/state";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

const daysShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const safeNumber = (n: any) =>
  typeof n === "number" && !isNaN(n) ? n : Number(n) || 0;

function useFmtCurrency() {
  try {
    const { currency, rate } = useCurrency() || { currency: "BRL", rate: 1 };
    const fmt = (v: number) =>
      currency === "USD"
        ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0)
        : new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(
          (v || 0) * (rate || 1)
        );
    const fmtShort = (v: number) => {
      const converted = currency === "BRL" ? (v || 0) * (rate || 1) : v || 0;
      const abs = Math.abs(converted);
      const sign = converted < 0 ? "-" : "+";
      const symbol = currency === "USD" ? "$" : "R$";
      const locale = currency === "USD" ? "en-US" : "pt-BR";
      const nf = (n: number, d: number) =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }).format(n);
      if (abs >= 1_000_000) return `${sign}${symbol}${nf(abs / 1_000_000, 1)}M`;
      if (abs >= 1_000) return `${sign}${symbol}${nf(abs / 1_000, 1)}k`;
      return `${sign}${symbol}${nf(abs, 0)}`;
    };
    return { fmt, fmtShort, currency, rate };
  } catch {
    const fmt = (v: number) =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      }).format(v || 0);
    const fmtShort = (v: number) => {
      const abs = Math.abs(v);
      const sign = v < 0 ? "-" : "+";
      const nf = (n: number, d: number) =>
        new Intl.NumberFormat("pt-BR", {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }).format(n);
      if (abs >= 1_000_000) return `${sign}R$${nf(abs / 1_000_000, 1)}M`;
      if (abs >= 1_000) return `${sign}R$${nf(abs / 1_000, 1)}k`;
      return `${sign}R$${nf(abs, 0)}`;
    };
    return { fmt, fmtShort, currency: "BRL", rate: 1 };
  }
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  // Glass card
  cardBg: "rgba(255,255,255,0.03)",
  cardBorder: "rgba(255,255,255,0.07)",
  cardBlur: "blur(16px)",

  // Cell base (empty)
  cellEmptyBg: "rgba(255,255,255,0.02)",
  cellEmptyBorder: "rgba(255,255,255,0.04)",

  // Cell positive
  cellPosBg: (intensity: number) =>
    `rgba(34,197,94,${0.08 + 0.22 * intensity})`,
  cellPosBorder: (intensity: number) =>
    `rgba(34,197,94,${0.20 + 0.50 * intensity})`,
  cellPosText: "#4ade80",

  // Cell negative
  cellNegBg: (intensity: number) =>
    `rgba(220,38,38,${0.08 + 0.22 * intensity})`,
  cellNegBorder: (intensity: number) =>
    `rgba(220,38,38,${0.20 + 0.50 * intensity})`,
  cellNegText: "#f87171",

  // Today ring
  todayBorder: "#60a5fa",

  // Day number
  dayNumActive: "#ffffff",
  dayNumEmpty: "#374151",
  dayNumToday: "#93c5fd",

  // Weekday header
  weekHeader: "#6b7280",
};

const PnLCalendarSection = ({ trades }: { trades: any[] }) => {
  const isMobile = useIsMobile();
  const { fmt, fmtShort } = useFmtCurrency();
  const [tooltip, setTooltip] = useState<any | null>(null);
  const [viewDate, setViewDate] = useState(() => new Date());

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => {
      if (!t.entry_datetime) return;
      const d = new Date(t.entry_datetime);
      if (!isNaN(d.getTime())) set.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    const sorted = Array.from(set).sort();
    return sorted.map((s) => {
      const [y, m] = s.split("-").map(Number);
      return { year: y, month: m, label: `${monthNames[m]} ${y}` };
    });
  }, [trades]);

  const tradesByDate = useMemo(() => {
    const map = new Map<
      string,
      { totalPnl: number; count: number; wins: number; losses: number; trades: any[] }
    >();
    trades.forEach((t) => {
      if (!t.entry_datetime) return;
      const d = new Date(t.entry_datetime);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      const pnl = safeNumber(t.result_net);
      const existing = map.get(key) || {
        totalPnl: 0,
        count: 0,
        wins: 0,
        losses: 0,
        trades: [],
      };
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
    const days: {
      day: number | null;
      totalPnl?: number;
      count?: number;
      wins?: number;
      losses?: number;
    }[] = [];

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
    calendarData.forEach((d) => {
      if (d.totalPnl) max = Math.max(max, Math.abs(d.totalPnl));
    });
    return max;
  }, [calendarData]);

  const getCellStyle = (pnl: number | undefined) => {
    if (pnl === undefined) {
      return {
        bg: T.cellEmptyBg,
        border: T.cellEmptyBorder,
        textColor: T.dayNumEmpty,
        amountColor: "transparent",
        barColor: "transparent",
      };
    }
    const intensity = maxAbs === 0 ? 0 : Math.min(1, Math.abs(pnl) / maxAbs);
    if (pnl > 0)
      return {
        bg: T.cellPosBg(intensity),
        border: T.cellPosBorder(intensity),
        textColor: T.dayNumActive,
        amountColor: T.cellPosText,
        barColor: "rgba(34,197,94,0.6)",
      };
    if (pnl < 0)
      return {
        bg: T.cellNegBg(intensity),
        border: T.cellNegBorder(intensity),
        textColor: T.dayNumActive,
        amountColor: T.cellNegText,
        barColor: "rgba(220,38,38,0.6)",
      };
    // breakeven
    return {
      bg: "rgba(255,255,255,0.04)",
      border: "rgba(255,255,255,0.10)",
      textColor: T.dayNumActive,
      amountColor: "#9ca3af",
      barColor: "transparent",
    };
  };

  const constrainTooltip = (x: number, y: number, w = 240, h = 150) => {
    const pad = 12;
    const cx = Math.max(pad + w / 2, Math.min(x, window.innerWidth - pad - w / 2));
    const cy = Math.max(pad + h * 1.1, Math.min(y, window.innerHeight - pad + h * 0.1));
    return { x: cx, y: cy };
  };

  const goToPrevMonth = () =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const goToToday = () => setViewDate(new Date());

  const isFirstMonth =
    availableMonths.length > 0 &&
    viewDate.getFullYear() === availableMonths[0].year &&
    viewDate.getMonth() === availableMonths[0].month;
  const isLastMonth =
    availableMonths.length > 0 &&
    viewDate.getFullYear() === availableMonths[availableMonths.length - 1].year &&
    viewDate.getMonth() === availableMonths[availableMonths.length - 1].month;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-tooltip-cell]") && !target.closest("[data-tooltip]")) {
        setTooltip(null);
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const availableMonthsSet = useMemo(
    () => new Set(availableMonths.map((m) => `${m.year}-${m.month}`)),
    [availableMonths]
  );
  const availableYears = useMemo(
    () => [...new Set(availableMonths.map((m) => m.year))].sort(),
    [availableMonths]
  );
  const fallbackYears = useMemo(() => {
    if (availableYears.length > 0) return [];
    const y = today.getFullYear();
    return Array.from({ length: 6 }, (_, i) => y - 5 + i);
  }, [availableYears]);
  const yearList = availableYears.length > 0 ? availableYears : fallbackYears;

  // ─── Month summary stats ──────────────────────────────────────────────────
  const monthStats = useMemo(() => {
    let totalPnl = 0, winDays = 0, lossDays = 0, tradeDays = 0;
    calendarData.forEach((d) => {
      if (d.totalPnl === undefined) return;
      tradeDays++;
      totalPnl += d.totalPnl;
      if (d.totalPnl > 0) winDays++;
      else if (d.totalPnl < 0) lossDays++;
    });
    return { totalPnl, winDays, lossDays, tradeDays };
  }, [calendarData]);

  return (
    <div
      style={{
        background: T.cardBg,
        backdropFilter: T.cardBlur,
        WebkitBackdropFilter: T.cardBlur,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: 16,
        padding: isMobile ? "16px 12px" : "22px 24px",
        boxSizing: "border-box",
        width: "100%",
        color: "#e5e7eb",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle glow orb */}
      <div
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background:
            monthStats.totalPnl >= 0
              ? "radial-gradient(circle, rgba(34,197,94,0.07) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: isMobile ? 15 : 16,
              fontWeight: 700,
              color: "#f3f4f6",
              margin: 0,
              letterSpacing: "0.1px",
            }}
          >
            📅 PnL Calendar
          </h2>
          {/* Month summary pill */}
          <div
            style={{
              marginTop: 5,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 20,
              padding: "3px 10px",
            }}
          >
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              {monthNames[viewMonth].substring(0, 3)} {viewYear}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: monthStats.totalPnl >= 0 ? T.cellPosText : T.cellNegText,
              }}
            >
              {monthStats.totalPnl === 0 ? "—" : fmtShort(monthStats.totalPnl)}
            </span>
            {monthStats.tradeDays > 0 && (
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                {monthStats.winDays}W / {monthStats.lossDays}L
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={goToPrevMonth}
            disabled={isFirstMonth}
            style={{
              background: isFirstMonth ? "transparent" : "rgba(255,255,255,0.05)",
              border: `1px solid ${isFirstMonth ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)"}`,
              color: isFirstMonth ? "#2d3748" : "#9ca3af",
              borderRadius: 8,
              padding: "7px 10px",
              cursor: isFirstMonth ? "default" : "pointer",
              fontSize: 12,
              transition: "all 0.15s",
            }}
          >
            ◀
          </button>

          {/* Month / Year selectors */}
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              padding: "0 4px",
            }}
          >
            <select
              value={viewMonth}
              onChange={(e) => setViewDate(new Date(viewYear, Number(e.target.value), 1))}
              style={{
                background: "transparent",
                border: "none",
                color: "#f3f4f6",
                padding: "6px 4px",
                fontSize: 13,
                fontWeight: 700,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {monthNames.map((name, i) => {
                const hasTrade = availableMonthsSet.has(`${viewYear}-${i}`);
                return (
                  <option
                    key={i}
                    value={i}
                    disabled={!hasTrade}
                    style={{ background: "#0c1119", color: hasTrade ? "#f3f4f6" : "#374151" }}
                  >
                    {isMobile ? name.substring(0, 3) : name}
                  </option>
                );
              })}
            </select>
            <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 13 }}>·</span>
            <select
              value={viewYear}
              onChange={(e) => setViewDate(new Date(Number(e.target.value), viewMonth, 1))}
              style={{
                background: "transparent",
                border: "none",
                color: "#f3f4f6",
                padding: "6px 4px",
                fontSize: 13,
                fontWeight: 700,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {yearList.map((y) => (
                <option key={y} value={y} style={{ background: "#0c1119", color: "#f3f4f6" }}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={goToNextMonth}
            disabled={isLastMonth}
            style={{
              background: isLastMonth ? "transparent" : "rgba(255,255,255,0.05)",
              border: `1px solid ${isLastMonth ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)"}`,
              color: isLastMonth ? "#2d3748" : "#9ca3af",
              borderRadius: 8,
              padding: "7px 10px",
              cursor: isLastMonth ? "default" : "pointer",
              fontSize: 12,
              transition: "all 0.15s",
            }}
          >
            ▶
          </button>

          <button
            onClick={goToToday}
            style={{
              background: "rgba(96,165,250,0.08)",
              border: "1px solid rgba(96,165,250,0.20)",
              color: "#93c5fd",
              borderRadius: 8,
              padding: "7px 12px",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.3px",
              transition: "all 0.15s",
            }}
          >
            Hoje
          </button>
        </div>
      </div>

      {/* ── Calendar grid ──────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
        <div style={{ minWidth: 420 }}>
          {/* Weekday headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: isMobile ? 4 : 6,
              marginBottom: 6,
            }}
          >
            {daysShort.map((d) => (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.weekHeader,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  padding: "4px 0",
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: isMobile ? 4 : 6,
            }}
          >
            {calendarData.map((item, idx) => {
              if (item.day === null) return <div key={`pad-${idx}`} />;

              const cellDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(
                item.day
              ).padStart(2, "0")}`;
              const isToday = cellDateStr === todayStr;
              const hasData = item.totalPnl !== undefined;
              const cs = getCellStyle(item.totalPnl);
              const intensity =
                maxAbs === 0 || !hasData
                  ? 0
                  : Math.min(1, Math.abs(item.totalPnl || 0) / maxAbs);

              return (
                <div
                  key={item.day}
                  data-tooltip-cell
                  onMouseEnter={(e) => {
                    if (!hasData || isMobile) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const cellCenterX = rect.left + rect.width / 2;
                    const showAbove = rect.top > 200;
                    const y = showAbove ? rect.top - 10 : rect.bottom + 10;
                    setTooltip({
                      ...constrainTooltip(cellCenterX, y, 240, 150),
                      above: showAbove,
                      day: item.day,
                      totalPnl: item.totalPnl,
                      count: item.count,
                      wins: item.wins,
                      losses: item.losses,
                    });
                  }}
                  onMouseLeave={() => {
                    if (!isMobile) setTooltip(null);
                  }}
                  onClick={(e) => {
                    if (!hasData || !isMobile) return;
                    e.stopPropagation();
                    setTooltip((prev: any) =>
                      prev && prev.day === item.day
                        ? null
                        : {
                          x: window.innerWidth / 2,
                          y: window.innerHeight / 2,
                          above: true,
                          day: item.day,
                          totalPnl: item.totalPnl,
                          count: item.count,
                          wins: item.wins,
                          losses: item.losses,
                        }
                    );
                  }}
                  style={{
                    minHeight: isMobile ? 54 : 62,
                    borderRadius: 10,
                    background: cs.bg,
                    border: `1px solid ${isToday ? T.todayBorder : cs.border}`,
                    boxShadow: isToday
                      ? "0 0 0 1px rgba(96,165,250,0.25)"
                      : hasData && item.totalPnl !== 0
                        ? `inset 0 0 0 1px ${cs.border}`
                        : "none",
                    cursor: hasData ? "pointer" : "default",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 4px",
                    position: "relative",
                    transition: "border-color 0.15s, background 0.15s",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                  }}
                >
                  {/* Day number */}
                  <div
                    style={{
                      fontSize: isMobile ? 11 : 13,
                      fontWeight: 600,
                      color: isToday ? T.dayNumToday : hasData ? T.dayNumActive : T.dayNumEmpty,
                      lineHeight: 1,
                      marginBottom: hasData ? 4 : 0,
                    }}
                  >
                    {item.day}
                  </div>

                  {/* PnL amount */}
                  {hasData && (
                    <>
                      <div
                        style={{
                          fontSize: isMobile ? 10 : 12,
                          fontWeight: 800,
                          color: cs.amountColor,
                          lineHeight: 1.2,
                          textAlign: "center",
                          letterSpacing: "-0.2px",
                        }}
                      >
                        {fmtShort(item.totalPnl || 0)}
                      </div>

                      {/* Trade count badge */}
                      {(item.count || 0) > 0 && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 9,
                            color:
                              (item.totalPnl || 0) > 0
                                ? "rgba(74,222,128,0.6)"
                                : (item.totalPnl || 0) < 0
                                  ? "rgba(248,113,113,0.6)"
                                  : "rgba(156,163,175,0.6)",
                            fontWeight: 600,
                            letterSpacing: "0.2px",
                          }}
                        >
                          {item.count} trade{(item.count || 0) !== 1 ? "s" : ""}
                        </div>
                      )}

                      {/* Bottom intensity bar */}
                      {(item.totalPnl || 0) !== 0 && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: `${Math.max(20, 80 * intensity)}%`,
                            height: 2,
                            borderRadius: "1px 1px 0 0",
                            background: cs.barColor,
                          }}
                        />
                      )}
                    </>
                  )}

                  {/* Today dot */}
                  {isToday && (
                    <div
                      style={{
                        position: "absolute",
                        top: 5,
                        right: 5,
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: T.todayBorder,
                        boxShadow: "0 0 4px rgba(96,165,250,0.6)",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {[
          { color: "rgba(34,197,94,0.55)", label: "Positivo" },
          { color: "rgba(255,255,255,0.06)", label: "Sem trades" },
          { color: "rgba(220,38,38,0.55)", label: "Negativo" },
        ].map(({ color, label }) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: color,
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
            <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Tooltip ─────────────────────────────────────────────────────── */}
      {tooltip &&
        createPortal(
          <div
            data-tooltip
            style={{
              position: "fixed",
              top:
                window.innerWidth <= 768
                  ? "50%"
                  : `${tooltip.y}px`,
              left:
                window.innerWidth <= 768
                  ? "50%"
                  : `${tooltip.x}px`,
              transform:
                window.innerWidth <= 768
                  ? "translate(-50%, -50%)"
                  : tooltip.above
                    ? "translate(-50%, -110%)"
                    : "translate(-50%, 10px)",
              background: "rgba(8,12,20,0.92)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: `1px solid ${(tooltip.totalPnl || 0) > 0
                  ? "rgba(34,197,94,0.35)"
                  : (tooltip.totalPnl || 0) < 0
                    ? "rgba(220,38,38,0.35)"
                    : "rgba(255,255,255,0.10)"
                }`,
              padding: "12px 16px",
              borderRadius: 12,
              color: "#f3f4f6",
              minWidth: window.innerWidth <= 768 ? "72%" : 210,
              zIndex: 99999,
              boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color:
                  (tooltip.totalPnl || 0) > 0
                    ? T.cellPosText
                    : (tooltip.totalPnl || 0) < 0
                      ? T.cellNegText
                      : "#9ca3af",
                marginBottom: 10,
                letterSpacing: "0.1px",
              }}
            >
              {`${String(tooltip.day).padStart(2, "0")} de ${monthNames[viewMonth]} de ${viewYear}`}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, color: "#6b7280" }}>PnL</span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color:
                    (tooltip.totalPnl || 0) > 0
                      ? "#4ade80"
                      : (tooltip.totalPnl || 0) < 0
                        ? "#f87171"
                        : "#e5e7eb",
                  letterSpacing: "-0.3px",
                }}
              >
                {fmt(tooltip.totalPnl || 0)}
              </span>
            </div>

            {(tooltip.count || 0) > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: 8,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  <strong style={{ color: "#e5e7eb" }}>{tooltip.count}</strong>{" "}
                  trade{tooltip.count !== 1 ? "s" : ""}
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: "#4ade80" }}>{tooltip.wins}W</span>
                  <span style={{ color: "#4b5563", margin: "0 4px" }}>/</span>
                  <span style={{ color: "#f87171" }}>{tooltip.losses}L</span>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default PnLCalendarSection;