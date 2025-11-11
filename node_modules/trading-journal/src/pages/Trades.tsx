import React, { useMemo, useEffect, useState, useRef } from 'react';
import TradeTable from '../Components/TradeTable';
import TradeForm from '../Components/TradeForm';
import { useJournal } from '@apps/journal-state';
import { useCurrency } from '@apps/state';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getAll } from '@apps/lib/dataStore';
import type { EnrichedTrade, Trade } from '../types/trade';

export default function TradesPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedTrade | null>(null);
  const { trades = [], deleteTrade, ready, strategies = [] } = useJournal();
  const [filters, setFilters] = useState({
    account: '',
    category: '',
    strategyId: '',
    timeframe: ''
  });

  const [searchAccount, setSearchAccount] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [accountStatusFilter, setAccountStatusFilter] = useState<string[]>(['live', 'funded']);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
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
      console.error('Erro ao atualizar contas:', err);
    }
  }, []);

  const { currency, rate } = useCurrency();
  const fmt = (v: number) =>
    currency === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate);

  const enrichedTrades: EnrichedTrade[] = useMemo(() => {
    const strategyMap = strategies.reduce((acc, s) => {
      acc[s.id] = s.name;
      return acc;
    }, {} as Record<string, string>);

    return trades.map((trade) => {
      let primaryAccount = null;
      if (trade.accountId) {
        primaryAccount = accounts.find((acc) => acc.id === trade.accountId);
      } else if (trade.accounts && trade.accounts.length > 0) {
        const primaryAccId = trade.accounts.sort((a, b) => (b.weight || 0) - (a.weight || 0))[0]?.accountId;
        primaryAccount = accounts.find((acc) => acc.id === primaryAccId);
      }

      return {
        ...trade,
        accountName: primaryAccount?.name,
        accountType: primaryAccount?.type,
        strategyName: trade.strategyId ? strategyMap[trade.strategyId] : undefined
      };
    });
  }, [trades, accounts, strategies]);

// === FILTRAGEM DE TRADES ===
const accountStatuses = useMemo<string[]>(() => {
  const all = (accounts || [])
    .map((a) => a.status?.toLowerCase() || "")
    .filter((s): s is string => !!s);
  return Array.from(new Set(all));
}, [accounts]);

const filteredTrades = useMemo(() => {
  let filtered = enrichedTrades;

  // 🔹 Filtro por tipo de conta
  if (filters.category) {
    filtered = filtered.filter((t) => t.accountType === filters.category);
  }

  // 🔹 Filtro por estratégia
  if (filters.strategyId) {
    filtered = filtered.filter((t) => t.strategyId === filters.strategyId);
  }

  // 🔹 Filtro por status de conta
  if (accountStatusFilter.length > 0) {
    filtered = filtered.filter((t) => {
      const acc = accounts.find((a) => a.id === t.accountId);
      const st = acc?.status?.toLowerCase();
      return st && accountStatusFilter.includes(st);
    });
  }

  return filtered.sort(
    (a, b) =>
      new Date(b.entry_datetime).getTime() - new Date(a.entry_datetime).getTime()
  );
}, [enrichedTrades, filters, accountStatusFilter, accounts]);


  const filteredStats = useMemo(() => {
    const total = filteredTrades.length;
    const wins = filteredTrades.filter((t) => (t.result_R || 0) > 0).length;
    const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.result_net || 0), 0);
    const avgR = total > 0 ? filteredTrades.reduce((sum, t) => sum + (t.result_R || 0), 0) / total : 0;
    return { total, winrate, avgR, totalPnL };
  }, [filteredTrades]);

  const equitySeries = useMemo(() => {
    let acc = 0;
    return filteredTrades
      .slice()
      .sort((a, b) => new Date(a.entry_datetime).getTime() - new Date(b.entry_datetime).getTime())
      .map((t) => {
        acc += t.result_net || 0;
        return { x: t.entry_datetime, y: acc };
      });
  }, [filteredTrades]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="trades-page">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-semibold">📊 Trades</h2>
        <button className="btn" onClick={() => setOpen(true)}>
          + Novo Trade
        </button>
      </div>

{/* === FILTROS === */}
<div className="filters-section">
  {/* BOTÃO MOBILE */}
  <button className="filters-toggle md:hidden" onClick={() => setFiltersOpen((o) => !o)}>
    {filtersOpen ? '🔽 Ocultar Filtros' : '🔍 Mostrar Filtros'}
  </button>

  {/* CONTEÚDO DOS FILTROS */}
  <div className={`filters-content ${filtersOpen ? 'open' : ''}`}>
    <div className="card p-3 flex gap-4 flex-wrap items-center">
      <span className="text-sm font-medium text-muted">🔎 Filtros:</span>

      <select
        className="input w-1/5 min-w-[150px]"
        value={filters.category}
        onChange={(e) => setFilters({ ...filters, category: e.target.value })}
      >
        <option value="">All Markets</option>
        {['Forex', 'Futures', 'Cripto'].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>

      <select
        className="input w-1/5 min-w-[150px]"
        value={filters.strategyId}
        onChange={(e) => setFilters({ ...filters, strategyId: e.target.value })}
      >
        <option value="">All Strategies</option>
        {strategies.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
{/* Filtro de Status de Conta */}
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

      <button
        className="btn ghost"
        onClick={() => setFilters({ account: '', category: '', strategyId: '', timeframe: '' })}
      >
        🧹 Limpar
      </button>
    </div>
  </div>
</div>


      {/* MÉTRICAS + GRÁFICO */}
      <div className="trades-layout">
        <div className="trades-stats">
          <div className="card accent9">
            <h3>📊 Total Trades</h3>
            <div className="stat">{filteredStats.total}</div>
            <div className="muted">trades executados</div>
          </div>
          <div className="card accent7">
            <h3>🎯 Win Rate</h3>
            <div className="stat">{filteredStats.winrate}%</div>
            <div className="muted">taxa de acerto</div>
          </div>
          <div className="card accent8">
            <h3>📈 Avg R</h3>
            <div className="stat">{filteredStats.avgR.toFixed(2)}</div>
            <div className="muted">risco-retorno médio</div>
          </div>
          <div className="card accent1">
            <h3>💰 P&L Total</h3>
            <div className={`stat ${filteredStats.totalPnL >= 0 ? 'pos' : 'neg'}`}>
              {fmt(filteredStats.totalPnL)}
            </div>
            <div className="muted">resultado líquido</div>
          </div>
        </div>

{/* GRÁFICO */}
{equitySeries.length > 0 && (
  <div className="card chart-card">
    <div className="flex items-center justify-between mb-3">
      <h3>📈 Curva de Equity</h3>
      <div className="muted">{filteredTrades.length} trades</div>
    </div>

    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={equitySeries}
          margin={{ top: 15, right: 15, left: 40, bottom: 25 }}
        >
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="#374151"
            opacity={0.3}
            horizontal
            vertical={false}
          />
          <XAxis
            dataKey="x"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(value) =>
              new Date(value).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })
            }
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3af", fontSize: 11 }}
            tickFormatter={(v) => fmt(Number(v))}
            width={80}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div
                    style={{
                      background: "rgba(15,17,25,0.95)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      color: "#f3f4f6",
                      boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#9ca3af",
                        marginBottom: 4,
                      }}
                    >
                      {new Date(label).toLocaleDateString("pt-BR")}
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: Number(data.y) >= 0 ? "#4ade80" : "#f87171",
                      }}
                    >
                      {fmt(Number(data.y))}
                    </div>
                    {data.trade && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: "#9ca3af",
                        }}
                      >
                        {data.trade.asset} ({data.trade.direction}) •{" "}
                        <span
                          style={{
                            color:
                              (data.trade.result_R || 0) > 0
                                ? "#4ade80"
                                : "#f87171",
                            fontWeight: 600,
                          }}
                        >
                          {(Number(data.trade.result_R) || 0).toFixed(2)} R
                        </span>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <Line
            type="monotone"
            dataKey="y"
            stroke="#22c55e"
            strokeWidth={2.4}
            dot={false}
            activeDot={{ r: 5, stroke: "#0f1218", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
)}

      </div>

      {/* TABELA */}
      <div className="card">
        <h3>📋 Lista de Trades</h3>
<TradeTable
  trades={filteredTrades}
  onEdit={(trade) => {
    setEditing(trade);
    setOpen(true);
  }}
  onDelete={(id) => deleteTrade(id)}
/>      </div>

      {/* MODAL */}
{open && (
  <TradeForm
    onClose={() => {
      setOpen(false);
      setEditing(null); // 🧹 limpa o trade em edição
    }}
    editing={editing}
  />
)}
    </div>
  );
}
