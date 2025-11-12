import React, { useState, useMemo,useEffect, useRef } from 'react';
import { useJournal } from "@apps/journal-state";
import { useCurrency } from "@apps/state";
import StrategyForm from '../Components/StrategyForm';
import { Strategy } from '../types/strategy';
import { Trade } from '../types/trade';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import {getAll} from '@apps/lib/dataStore';


type ConsistencyItem = {
  title: string;
  percent: number | null;
  trueCount: number;
  totalCount: number;
};

type Consistency = {
  byItem: Record<string, ConsistencyItem>;
  overall: number | null;
};
function computeConsistency(
  checklist: { id: string; title: string }[] = [],
  linkedTrades: Trade[] = []
): Consistency {
  // 🔹 Monta apenas o checklist da estratégia atual
  const byItem: Record<string, ConsistencyItem> = {};
  checklist.forEach((it) => {
    if (!it || !it.id) return;
    byItem[it.id] = {
      title: it.title || "(sem título)",
      percent: null,
      trueCount: 0,
      totalCount: 0,
    };
  });

  // 🔹 Preenche apenas se o checklist da estratégia tiver sido usado em trades dela
  for (const t of linkedTrades) {
    if (!t.checklistResults) continue;
    Object.keys(t.checklistResults).forEach((cid) => {
      // ✅ Só conta se fizer parte do checklist dessa estratégia
      if (!byItem[cid]) return;

      byItem[cid].totalCount += 1;
      if (t.checklistResults[cid]) byItem[cid].trueCount += 1;
    });
  }

  // 🔹 Calcula percentuais por item
  const percents: number[] = [];
  Object.values(byItem).forEach((it) => {
    if (it.totalCount === 0) {
      it.percent = null;
    } else {
      it.percent = (it.trueCount / it.totalCount) * 100;
      percents.push(it.percent);
    }
  });

  const overall =
    percents.length === 0
      ? null
      : percents.reduce((s, v) => s + v, 0) / percents.length;

  return { byItem, overall };
}


const categoryColors = {
  Futures: 'pink',
  Forex: 'lavander',
  Cripto: 'orange',
  Personal: 'purple',
  Todos:'white',
  gray: 'gray'
};

const pillClass = {
  'Futures': 'pink',
  'Forex': 'lavander',
  'Cripto': 'orange',
  'Personal': 'purple',
  'Todos': 'white'
};


export const StrategyCard = ({
  strategy,
  trades = [],
  onEdit,
  onDelete,
  currency,
  rate,
  accountStatusFilter,
  accounts,
}) => {
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSection = (id: string) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // === Data handling ===
  const linkedTrades = useMemo(() => {
    let filtered = trades.filter((t) => t.strategyId === strategy.id);
    if (accountStatusFilter.length > 0 && accounts.length > 0) {
      const allowedAccountIds = accounts
        .filter((acc) => accountStatusFilter.includes(acc.status?.toLowerCase()))
        .map((acc) => acc.id);
      filtered = filtered.filter((t) => {
        if (t.accountId && allowedAccountIds.includes(t.accountId)) return true;
        if (Array.isArray(t.accounts))
          return t.accounts.some((acc) => allowedAccountIds.includes(acc.accountId));
        return false;
      });
    }
    return filtered;
  }, [trades, strategy.id, accountStatusFilter, accounts]);

  const fmt = (v: number) => {
    const value = currency === "USD" ? v || 0 : (v || 0) * rate;
    const locale = currency === "USD" ? "en-US" : "pt-BR";
    const curr = currency === "USD" ? "USD" : "BRL";
    return new Intl.NumberFormat(locale, { style: "currency", currency: curr }).format(value);
  };

  const stats = useMemo(() => {
    const totalPnLNet = linkedTrades.reduce((s, t) => s + (Number(t.result_net) || 0), 0);
    const totalR = linkedTrades.reduce((s, t) => s + (Number(t.result_R) || 0), 0);
    const validTrades = linkedTrades.filter((t) => !t.isBreakeven);
    const wins = validTrades.filter((t) => (Number(t.result_net) || 0) > 0).length;
    const breakevens = linkedTrades.filter((t) => t.isBreakeven).length;
    const avgR = validTrades.length ? totalR / validTrades.length : 0;
    const winrate = validTrades.length
      ? Math.round((wins / validTrades.length) * 1000) / 10
      : 0;

    return { linkedTradesCount: linkedTrades.length, totalPnLNet, avgR, winrate, breakevens };
  }, [JSON.stringify(linkedTrades)]);

  const equitySeries = useMemo(() => {
    let acc = 0;
    const sorted = linkedTrades
      .filter((t) => t.entry_datetime)
      .sort(
        (a, b) =>
          new Date(a.entry_datetime).getTime() - new Date(b.entry_datetime).getTime()
      );
    return sorted.map((t) => {
      acc += Number(t.result_net) || 0;
      return {
        entry_datetime: new Date(t.entry_datetime).toLocaleDateString("pt-BR"),
        pnl: acc,
      };
    });
  }, [JSON.stringify(linkedTrades)]);

  const consistency = computeConsistency(strategy.checklist || [], linkedTrades);
  const tagsArray = Array.isArray(strategy.tags)
    ? strategy.tags
    : Object.keys(strategy.tags || {});

  // === Layout ===
  return (
    <div
      className="card strategy-card border-soft"
      style={{
        padding: 16,
        borderTop: `3px solid var(--${pillClass[strategy.category] || "gray"})`,
        background:
          "linear-gradient(180deg, rgba(12,18,28,0.8), rgba(6,8,12,0.8))",
      }}
    >
      {/* Cabeçalho */}
      <div className="strategy-header">
        <div>
          <h4 style={{ margin: 0 }}>{strategy.name}</h4>
          <div className="flex gap-2 mt-2 flex-wrap">
            Mercado:
            <span className={`pill ${pillClass[strategy.category]}`}>
              {strategy.category}
            </span> <div className="flex gap-2">
          <button className="btn ghost small" onClick={() => onEdit(strategy)}>
            Editar
          </button>
          <button
            className="btn ghost negative small"
            onClick={() => onDelete(strategy.id)}
          >
            Deletar
          </button>
        </div>
          </div>
        </div>
       
      </div>

      {/* ======= MOBILE ======= */}
      {isMobile ? (
        <div className="strategy-collapse-group">
          {["stats", "checklist", "desc", "rr", "chart"].map((section) => (
            <div className="strategy-collapse" key={section}>
              <div
                className="strategy-collapse-header"
                onClick={() => toggleSection(section)}
              >
                <span>
                  {{
                    stats: "📊 Estatísticas",
                    checklist: "🧾 Checklist",
                    desc: "📝 Descrição",
                    rr: "🎯 R:R",
                    chart: "📈 Gráfico",
                  }[section] || section}
                </span>
                <span>{openSections.includes(section) ? "−" : "+"}</span>
              </div>

              <div
                className={`strategy-collapse-content ${
                  openSections.includes(section) ? "open" : ""
                }`}
              >
                {section === "stats" && (
                  <>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: stats.totalPnLNet >= 0 ? "#10B981" : "#F87171",
                      }}
                    >
                      {fmt(stats.totalPnLNet)}
                    </div>
                    <div className="muted">P&L Total</div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <div className="muted text-xs">Trades</div>
                        <div>{stats.linkedTradesCount}</div>
                      </div>
                      <div>
                        <div className="muted text-xs">Winrate</div>
                        <div>{stats.winrate}%</div>
                      </div>
                      <div>
                        <div className="muted text-xs">Avg R</div>
                        <div>{stats.avgR.toFixed(2)} R</div>
                      </div>
                      <div>
                        <div className="muted text-xs">Break-evens</div>
                        <div>{stats.breakevens}</div>
                      </div>
                    </div>
                    {tagsArray.length > 0 && (
                      <div className="mt-2">
                        <div className="muted text-xs mb-1">Tags</div>
                        <div className="flex flex-wrap gap-2">
                          {tagsArray.map((tag, i) => (
                            <span
                              key={i}
                              className={`pill ${pillClass[strategy.category] || "gray"}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {section === "checklist" && (
                  <>
                    {strategy.checklist?.length > 0 ? (
                      Object.values(consistency.byItem || {}).length > 0 ? (
                        Object.values(consistency.byItem).map((it, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between text-sm text-muted mb-1"
                          >
                            <span>{it.title || "(sem título)"} -</span>
                            <span>
                              {it.percent === null
                                ? "—"
                                : `${Math.round(it.percent)}%`}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="muted text-sm">Sem dados ainda</div>
                      )
                    ) : (
                      <div className="muted text-sm">Sem checklist</div>
                    )}
                  </>
                )}

                {section === "desc" && (
                  <div>{strategy.description || "—"}</div>
                )}

                {section === "rr" && (
                  <div className="flex gap-4">
                    <div>
                      <div className="muted text-xs">Alvo</div>
                      <div style={{ fontWeight: 700 }}>
                        {strategy.defaultRisk?.profitTargetR
                          ? `${strategy.defaultRisk.profitTargetR}R`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="muted text-xs">Stop</div>
                      <div style={{ fontWeight: 700 }}>
                        {strategy.defaultRisk?.stopLossR
                          ? `${strategy.defaultRisk.stopLossR}R`
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}

                {section === "chart" && (
                  <>
                    {equitySeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={equitySeries}>
                          <defs>
                            <linearGradient
                              id={`gradStrategy-${strategy.id}`}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
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
                            tickFormatter={(v) => fmt(v)}
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={70}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload?.length) {
                                const p = payload[0];
                                const val = Number(p.value ?? 0);
                                return (
                                  <div
                                    style={{
                                      background: "#0f172a",
                                      border: "1px solid #1e293b",
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      color: "#f3f4f6",
                                    }}
                                  >
                                    <div
                                      style={{ fontSize: 12, color: "#9ca3af" }}
                                    >
                                      {p.payload.entry_datetime}
                                    </div>
                                    <div
                                      style={{
                                        fontWeight: 600,
                                        color:
                                          val >= 0 ? "#4ade80" : "#ef4444",
                                      }}
                                    >
                                      {fmt(val)}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area
                            type="monotoneX"
                            dataKey="pnl"
                            stroke="#22c55e"
                            strokeWidth={2}
                            fill={`url(#gradStrategy-${strategy.id})`}
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="muted text-center py-4">Sem dados</div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ======= DESKTOP =======
        <div className="strategy-desktop-grid">
          {/* Estatísticas */}
          <div className="strategy-stats-section">
            <h5>Estatísticas</h5>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: stats.totalPnLNet >= 0 ? "#10B981" : "#F87171",
              }}
            >
              {fmt(stats.totalPnLNet)}
            </div>
            <div className="muted">P&L Total</div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div><div className="muted text-xs">Trades</div>{stats.linkedTradesCount}</div>
              <div><div className="muted text-xs">Winrate</div>{stats.winrate}%</div>
              <div><div className="muted text-xs">Avg R</div>{stats.avgR.toFixed(2)} R</div>
              <div><div className="muted text-xs">Break-evens</div>{stats.breakevens}</div>
            </div>
          </div>

          {/* Checklist + descrição */}
          <div className="strategy-description-section">
            <h5>Checklist</h5>
            {strategy.checklist?.length > 0 ? (
              Object.values(consistency.byItem || {}).map((it, idx) => (
                <div key={idx} className="flex justify-between text-sm text-gray-300">
                  <span>{it.title || "(sem título)"} -</span>
                  <span className="text-gray-500">
                    {it.percent === null ? "—" : `${Math.round(it.percent)}%`}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-sm">Sem checklist</div>
            )}

            <h5 className="mt-4">Descrição</h5>
            <div className="text-sm leading-relaxed">
              {strategy.description || "—"}
            </div>
          </div>

          {/* Gráfico */}
          <div className="strategy-chart-section">
            <h5>Equity Curve</h5>
            {equitySeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={equitySeries}>
                  <defs>
                    <linearGradient
                      id={`gradStrategy-${strategy.id}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="entry_datetime" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload?.length) {
                        const p = payload[0];
                        const val = Number(p.value ?? 0);
                        return (
                          <div
                            style={{
                              background: "#0f172a",
                              border: "1px solid #1e293b",
                              borderRadius: 8,
                              padding: "6px 10px",
                              color: "#f3f4f6",
                            }}
                          >
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>
                              {p.payload.entry_datetime}
                            </div>
                            <div
                              style={{
                                fontWeight: 600,
                                color: val >= 0 ? "#4ade80" : "#ef4444",
                              }}
                            >
                              {fmt(val)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotoneX"
                    dataKey="pnl"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill={`url(#gradStrategy-${strategy.id})`}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="muted text-center py-4">Sem dados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};



// --- Página ---
export default function StrategiesPage() {
  const { strategies, trades, removeStrategy } = useJournal() as any;
  const { currency, rate } = useCurrency();
  const [open, setOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);

  const handleEdit = (s: Strategy) => {
    setEditingStrategy(s);
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja deletar esta estratégia?")) {
      removeStrategy(id);
    }
  };

  // === Filtros ===
  const [accountStatusFilter, setAccountStatusFilter] = useState<string[]>([
    "live",
    "funded",
  ]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  // === Contas ===
  const [accounts, setAccounts] = useState(() => {
    try {
      return getAll().accounts || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const data = getAll();
      setAccounts(data.accounts || []);
    } catch (err) {
      console.error("Erro ao atualizar contas:", err);
    }
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!statusDropdownRef.current) return;
      if (!statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    }
    if (statusDropdownOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [statusDropdownOpen]);

  const accountStatuses = useMemo<string[]>(() => {
    const all = (accounts || [])
      .map((a) => a.status?.toLowerCase() || "")
      .filter((s): s is string => !!s);
    return Array.from(new Set(all));
  }, [accounts]);

  // === Render ===
  return (
    <div className="p-6 space-y-6 strategies-page">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-semibold">📈 Gerenciamento de Estratégias</h2>
        <button
          className="btn"
          onClick={() => {
            setEditingStrategy(null);
            setOpen(true);
          }}
        >
          ➕ Nova Estratégia
        </button>
      </div>

      {/* CONTROLES / FILTROS */}
      <div
        className="card p-4"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span className="text-sm font-medium text-muted">🔎 Filtros:</span>

          {/* Dropdown de Status */}
          <div
            className="strat-mgr-dropdown-wrapper"
            ref={statusDropdownRef}
            style={{ position: "relative" }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStatusDropdownOpen((v) => !v);
              }}
              className={`strat-mgr-dropdown-trigger ${
                statusDropdownOpen ? "strat-mgr-dropdown-active" : ""
              }`}
            >
              {accountStatusFilter && accountStatusFilter.length > 0
                ? `Status: ${accountStatusFilter.join(", ")}`
                : "Filtrar Status"}
              <span className="strat-mgr-dropdown-arrow">▾</span>
            </button>

            {statusDropdownOpen && accountStatuses && accountStatuses.length > 0 && (
              <div
                className="card strat-mgr-dropdown-panel"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="strat-mgr-dropdown-scroll">
                  {accountStatuses.map((status) => {
                    const st = String(status || "");
                    const checked = accountStatusFilter.includes(st);
                    return (
                      <label key={st} className="strat-mgr-dropdown-item">
                        <div className="strat-mgr-custom-checkbox">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? Array.from(
                                    new Set([...accountStatusFilter, st])
                                  )
                                : accountStatusFilter.filter((s) => s !== st);
                              setAccountStatusFilter(next);
                            }}
                          />
                          <span className="strat-mgr-custom-check"></span>
                        </div>
                        <span className="strat-mgr-dropdown-label">{st}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="strat-mgr-dropdown-actions">
                  <button
                    className="btn ghost small strat-mgr-dropdown-action-btn"
                    onClick={() => setAccountStatusFilter(["live", "funded"])}
                  >
                    Resetar padrão
                  </button>
                  <button
                    className="btn ghost small strat-mgr-dropdown-action-btn"
                    onClick={() =>
                      setAccountStatusFilter(accountStatuses.slice())
                    }
                  >
                    Marcar todos
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            className="btn ghost"
            onClick={() => setAccountStatusFilter(["live", "funded"])}
          >
            🧹 Limpar
          </button>
        </div>
      </div>

      {/* GRID DE ESTRATÉGIAS */}
      <div className="strategies-grid">
        {(strategies as Strategy[] || []).map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            trades={trades as Trade[] || []}
            onEdit={handleEdit}
            onDelete={handleDelete}
            currency={currency}
            rate={rate}
            accountStatusFilter={accountStatusFilter}
            accounts={accounts}
          />
        ))}
      </div>

      {(!strategies || strategies.length === 0) && (
        <div className="card p-6 text-center text-muted">
          Nenhuma estratégia cadastrada.
        </div>
      )}

      {open && (
        <StrategyForm
          key={editingStrategy?.id || "new"}
          editing={editingStrategy}
          onClose={() => {
            setOpen(false);
            setEditingStrategy(null);
          }}
        />
      )}
    </div>
  );
}