import React, { useMemo, useEffect, useState, useRef } from 'react';
import TradeTable from '../Components/TradeTable';
import TradeForm from '../Components/TradeForm';
import { useJournal } from '@apps/journal-state';
import { useCurrency } from '@apps/state';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { getAll, getFirms } from '@apps/lib/dataStore';
import type { EnrichedTrade, Trade } from '../types/trade';
import AccountPicker from '@apps/ui/AccountPicker';


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

  const [accounts, setAccounts] = useState(() => {
    try {
      return getAll().accounts || [];
    } catch {
      return [];
    }
  });
  const [firms, setFirms] = useState<any[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);


  useEffect(() => {
    try {
      const data = getAll();
      setAccounts(data.accounts || []);
      setFirms(getFirms() || []);
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
  const filteredTrades = useMemo(() => {
    let filtered = enrichedTrades;

    // 🔹 Filtro por tipo de conta (dropdown All Markets)
    if (filters.category) {
      filtered = filtered.filter((t) => t.accountType === filters.category);
    }

    // 🔹 Filtro por estratégia
    if (filters.strategyId) {
      filtered = filtered.filter((t) => t.strategyId === filters.strategyId);
    }

    // 🔹 Filtro pelo AccountPicker
    if (selectedAccountIds.length > 0) {
      filtered = filtered.filter((t) => {
        // Verifica se a conta primária ou alguma das contas do trade está nos selecionados
        if (t.accountId && selectedAccountIds.includes(t.accountId)) return true;
        if (t.accounts && t.accounts.some((acc: any) => selectedAccountIds.includes(acc.accountId))) return true;
        // Fallback p/ legacy name matching
        const accNames = accounts.filter(a => selectedAccountIds.includes(a.id)).map(a => a.name);
        if (t.accountName && accNames.includes(t.accountName)) return true;
        return false;
      });
    }

    return filtered.sort(
      (a, b) =>
        new Date(b.entry_datetime).getTime() - new Date(a.entry_datetime).getTime()
    );
  }, [enrichedTrades, filters, selectedAccountIds, accounts]);



  const filteredStats = useMemo(() => {
    const total = filteredTrades.length;
    const wins = filteredTrades.filter((t) => (t.result_R || 0) > 0).length;
    const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.result_net || 0), 0);
    const avgR = total > 0 ? filteredTrades.reduce((sum, t) => sum + (t.result_R || 0), 0) / total : 0;
    return { total, winrate, avgR, totalPnL };
  }, [filteredTrades]);

  // 🔹 Payouts correspondentes às contas ativas
  const activePayouts = useMemo(() => {
    try {
      const allPayouts = getAll().payouts || [];
      return allPayouts.filter((p: any) => {
        if (!selectedAccountIds || selectedAccountIds.length === 0) {
          const allowedIds = accounts.map((a: any) => a.id);
          return p.accountIds?.some((id: string) => allowedIds.includes(id)) || allowedIds.includes(p.accountId);
        }
        return p.accountIds?.some((id: string) => selectedAccountIds.includes(id)) || selectedAccountIds.includes(p.accountId);
      });
    } catch {
      return [];
    }
  }, [selectedAccountIds, accounts]);

  const equitySeries = useMemo(() => {
    const events: any[] = [];
    const safeNumber = (n: any) => typeof n === "number" && !isNaN(n) ? n : Number(n) || 0;

    // 1. Trades
    (filteredTrades || [])
      .forEach((t: any) => {
        if (t.entry_datetime) {
          events.push({
            time: new Date(t.entry_datetime).getTime(),
            dateStr: new Date(t.entry_datetime).toLocaleDateString("pt-BR"),
            type: 'trade',
            net: safeNumber(t.result_net),
            trade: t
          });
        }
      });

    // 2. Payouts (ativos, ignorando Rejected)
    activePayouts
      .filter((p: any) => p && p.dateCreated && p.status?.toLowerCase() !== 'rejected')
      .forEach((p: any) => {
        let amount = 0;
        if (selectedAccountIds && selectedAccountIds.length > 0) {
          selectedAccountIds.forEach((id: string) => {
            amount += p.splitByAccount?.[id]?.gross || (p.amountSolicited / (p.accountIds?.length || 1));
          });
        } else {
          const allowedIds = accounts.map((a: any) => a.id);
          allowedIds.forEach((id: string) => {
            amount += p.splitByAccount?.[id]?.gross || (p.amountSolicited / (p.accountIds?.length || 1));
          });
        }

        if (amount > 0) {
          events.push({
            time: new Date(p.dateCreated).getTime(),
            dateStr: new Date(p.dateCreated).toLocaleDateString("pt-BR"),
            type: 'payout',
            net: -amount,
            payout: p
          });
        }
      });

    // 3. Ordena cronologicamente
    events.sort((a, b) => a.time - b.time);

    // 4. Acumula
    let cumPnL = 0;
    let cumPayouts = 0;
    const result: any[] = [];

    events.forEach((ev: any) => {
      if (ev.type === 'trade') {
        cumPnL += ev.net;
      } else if (ev.type === 'payout') {
        cumPayouts += Math.abs(ev.net);
      }

      const bal = cumPnL - cumPayouts;

      result.push({
        time: ev.time,
        x: ev.time,
        entry_datetime: ev.dateStr,
        y: +cumPnL.toFixed(2),
        pnl: +cumPnL.toFixed(2),
        balance: +bal.toFixed(2),
        hasPayout: ev.type === 'payout',
        payoutAmount: ev.type === 'payout' ? Math.abs(ev.net) : 0,
        trade: ev.trade || null,
        payoutDetail: ev.payout || null
      });
    });

    if (result.length === 0) {
      result.push({ entry_datetime: "", pnl: 0, balance: 0, y: 0 });
    }

    return result;
  }, [filteredTrades, activePayouts, selectedAccountIds, accounts]);

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
      <div className="filters-section" style={{ width: '100%', marginBottom: 16 }}>
        {/* BOTÃO MOBILE */}
        <button className="filters-toggle md:hidden" onClick={() => setFiltersOpen((o) => !o)}>
          {filtersOpen ? '🔽 Ocultar Filtros' : '🔍 Mostrar Filtros'}
        </button>

        {/* CONTEÚDO DOS FILTROS */}
        <div className={`filters-content ${filtersOpen ? 'open' : ''}`} style={{ width: '100%' }}>
          <div className="card w-full p-3 flex gap-4 flex-wrap items-center" style={{ width: '100%' }}>
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
            <AccountPicker
              selectedIds={selectedAccountIds}
              onChange={setSelectedAccountIds}
              accounts={accounts}
              firms={firms}
              placeholder="Todas as contas"
            />


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
                <AreaChart
                  data={equitySeries}
                  margin={{ top: 15, right: 15, left: 40, bottom: 25 }}
                >
                  <defs>
                    <linearGradient id="gradPnLTrades" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>

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
                    tickFormatter={(value) => {
                      if (!value) return "";
                      return new Date(value).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                      });
                    }}
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
                        const pnlVal = payload.find((p: any) => p.dataKey === 'pnl' || p.dataKey === 'y')?.value ?? 0;
                        const balVal = payload.find((p: any) => p.dataKey === 'balance')?.value ?? 0;
                        
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
                              {new Date(data.time || label).toLocaleDateString("pt-BR")}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Cumulative P&L:</span>
                                <span style={{ fontWeight: 600, color: Number(pnlVal) >= 0 ? "#4ade80" : "#f87171", fontSize: 12 }}>
                                  {fmt(Number(pnlVal))}
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Operational Bal:</span>
                                <span style={{ fontWeight: 600, color: Number(balVal) >= 0 ? "#a855f7" : "#f87171", fontSize: 12 }}>
                                  {fmt(Number(balVal))}
                                </span>
                              </div>
                            </div>

                            {data.trade && (
                              <div
                                style={{
                                  marginTop: 8,
                                  paddingTop: 6,
                                  borderTop: "1px solid rgba(255,255,255,0.06)",
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

                            {data.hasPayout && (
                              <div
                                style={{
                                  marginTop: 8,
                                  paddingTop: 6,
                                  borderTop: '1px solid rgba(255,255,255,0.06)',
                                  color: '#fbbf24',
                                  fontWeight: 600,
                                  fontSize: 11,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <span>💸 Payout Retirado:</span>
                                <span>{fmt(-data.payoutAmount)}</span>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }} />
                  
                  <Area
                    type="monotone"
                    dataKey="pnl"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    fill="url(#gradPnLTrades)"
                    dot={false}
                    activeDot={{ r: 6 }}
                    name="Cumulative P&L"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="#a855f7"
                    strokeWidth={2.2}
                    strokeDasharray="4 4"
                    name="Operational Balance"
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (!payload.hasPayout) return null as any;
                      return (
                        <g key={`payout-dot-trades-${payload.time}`}>
                          <circle cx={cx} cy={cy} r={8} fill="#a855f7" stroke="#0c1119" strokeWidth={2} />
                          <text x={cx} y={cy + 3} textAnchor="middle" fontSize="9" fill="#ffffff" fontWeight="bold">💸</text>
                        </g>
                      ) as any;
                    }}
                  />
                </AreaChart>
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
