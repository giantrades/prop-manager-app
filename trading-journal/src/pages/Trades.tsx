import React, { useMemo, useEffect, useState, useRef } from 'react';
import TradeTable from '../Components/TradeTable';
import TradeForm from '../Components/TradeForm';
import { useJournal } from '@apps/journal-state';
import { useCurrency } from '@apps/state';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { EnrichedTrade, Trade, AccountWeight } from '../types/trade'; // Ajuste o caminho se necessário
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';



export default function TradesPage() {
   console.log("🧩 TradesPage renderizou");
const [open, setOpen] = useState(false);
const [editing, setEditing] = useState<EnrichedTrade | null>(null);  // 💥 CORRIGIDO: Garante que strategies seja desestruturado
const { trades = [], deleteTrade, ready, strategies = [] } = useJournal(); 
const [filters, setFilters] = useState({
    account: '', // Filtro por ID da conta
    category: '', // Filtro por Categoria de Mercado (Futures, Forex, Cripto, etc.)
    strategyId: '', // Filtro por ID da Estratégia
    timeframe: ''
  });

  const [searchAccount, setSearchAccount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  // Após os estados existentes (depois de selectedAccount)
const [accountStatusFilter, setAccountStatusFilter] = useState<string[]>(["live", "funded"]);
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

    const refresh = () => {
      try {
        const d = getAll();
        setAccounts(d.accounts || []);
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('datastore:change', refresh);

    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('datastore:change', refresh);
    };
  }, []);

// Após o useEffect existente de accounts
useEffect(() => {
  function onDocClick(e: MouseEvent) {
    if (!statusDropdownRef.current) return;
    if (!statusDropdownRef.current.contains(e.target as Node)) {
      setStatusDropdownOpen(false);
    }
  }
  if (statusDropdownOpen) document.addEventListener('mousedown', onDocClick);
  return () => document.removeEventListener('mousedown', onDocClick);
}, [statusDropdownOpen]);
  // usecurrency para mudar o rate
  
const { currency, rate } = useCurrency();
const fmt = (v: number) => currency === 'USD'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate);

  // Enriquecer trades com informações das contas e da Estratégia
  const enrichedTrades: EnrichedTrade[] = useMemo(() => {
    // Mapeia Estratégias para fácil lookup
    const strategyMap = strategies.reduce((acc, s) => {
      acc[s.id] = s.name;
      return acc;
    }, {} as Record<string, string>);

    return trades.map(trade => {
      let primaryAccount = null;
      
      // Lógica de busca de conta principal (a sua lógica estava correta)
      if (trade.accountId) {
        primaryAccount = accounts.find(acc => acc.id === trade.accountId);
      } else if (trade.accounts && trade.accounts.length > 0) {
        const primaryAccId = trade.accounts.sort((a, b) => (b.weight || 0) - (a.weight || 0))[0]?.accountId;
        primaryAccount = accounts.find(acc => acc.id === primaryAccId);
      }
      
      let strategyName = null;
      if (trade.strategyId) {
        const strategy = strategies.find(s => s.id === trade.strategyId);
        strategyName = strategy?.name || 'ID Inválido';
      }
      
      const enrichedTrade: EnrichedTrade = {
        ...trade,
        accountName: primaryAccount?.name,
        accountType: primaryAccount?.type, // Tipo da conta
        account: primaryAccount,
        // Adiciona o nome da Estratégia para ser exibido na tabela (opcional)
        strategyName: trade.strategyId ? strategyMap[trade.strategyId] : undefined,
      } as EnrichedTrade;

      return enrichedTrade;
    });
  }, [trades, accounts, strategies]); // strategies adicionado como dependência

  // 💥 Lógica de Filtro CORRIGIDA
const filteredTrades = useMemo(() => {
  let filtered = enrichedTrades;
  
  // 1. Filtro por Categoria de Mercado
  if (filters.category) {
    filtered = filtered.filter(t => t.accountType === filters.category); 
  }

  // 2. Filtro por Estratégia
  if (filters.strategyId) {
    filtered = filtered.filter(t => t.strategyId === filters.strategyId);
  }
  
  // 3. Filtro por Conta Específica (campo select)
  if (filters.account) {
    filtered = filtered.filter(t => 
      t.accountId === filters.account || 
      (t.accounts && t.accounts.some(acc => acc.accountId === filters.account))
    );
  }
  
  // 4. Filtro por Conta Selecionada (busca)
  if (selectedAccount) {
    filtered = filtered.filter(t =>
      t.accountId === selectedAccount.id ||
      t.accountName === selectedAccount.name ||
      (Array.isArray(t.accounts) &&
        t.accounts.some(a => a.accountId === selectedAccount.id))
    );
  }
  
  // ✅ 5. NOVO: Filtro por Status de Conta
  if (accountStatusFilter.length > 0) {
    // Primeiro, pega IDs das contas que correspondem aos status filtrados
    const allowedAccountIds = accounts
      .filter(acc => accountStatusFilter.includes(acc.status?.toLowerCase()))
      .map(acc => acc.id);
    
    // Filtra trades que pertencem a essas contas
    filtered = filtered.filter(t => {
      // Verifica se o trade tem accountId direto
      if (t.accountId && allowedAccountIds.includes(t.accountId)) {
        return true;
      }
      // Verifica se o trade tem array de accounts
      if (Array.isArray(t.accounts)) {
        return t.accounts.some(acc => allowedAccountIds.includes(acc.accountId));
      }
      // Se não tem conta definida, não passa no filtro
      return false;
    });
  }
  
  // Retorna ordenado por data
  return filtered.sort((a, b) => 
    new Date(b.entry_datetime).getTime() - new Date(a.entry_datetime).getTime()
  );
}, [enrichedTrades, filters, selectedAccount, accountStatusFilter, accounts]); // ✅ Adicionar accountStatusFilter e accounts nas dependências

  // Calcular estatísticas dos trades filtrados (sua lógica estava correta)
  const filteredStats = useMemo(() => {
    const total = filteredTrades.length;
    const wins = filteredTrades.filter(t => (t.result_R || 0) > 0).length;
    const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.result_net || 0), 0);
    const avgR = total > 0 
      ? filteredTrades.reduce((sum, t) => sum + (t.result_R || 0), 0) / total
      : 0;
    
    return { total, winrate, avgR, totalPnL };
  }, [filteredTrades]);

  // Preparar série de equity (sua lógica estava correta)
  const equitySeries = useMemo(() => {
    let acc = 0;
    return filteredTrades
      .slice()
      .sort((a, b) => new Date(a.entry_datetime).getTime() - new Date(b.entry_datetime).getTime())
      .map((t, index) => {
        acc += (t.result_net || 0);
        return { 
          x: t.entry_datetime,
          y: acc,
          index,
          trade: t
        };
      });
  }, [filteredTrades]);

  // Categorias de Mercado disponíveis para filtro (Futures, Forex, Cripto, etc.)
  const accountType = useMemo(() => {
    const categories = new Set<string>();
    trades.forEach(t => {
        if (t.accountType) categories.add(t.accountType);
    });
    return Array.from(categories).sort();
  }, [trades]);

  // Contas ativas para filtro
const activeAccounts = useMemo(() => {
  let accs = accounts || [];
  
  // Filtro de status
  if (accountStatusFilter.length > 0) {
    accs = accs.filter(a =>
      accountStatusFilter.includes(a.status?.toLowerCase())
    );
  }
  
  return accs;
}, [accounts, accountStatusFilter]);
  // Após o useMemo de activeAccounts
const accountStatuses = useMemo<string[]>(() => {
  const all = (accounts || [])
    .map((a) => a.status?.toLowerCase() || "")
    .filter((s): s is string => !!s);
  return Array.from(new Set(all));
}, [accounts]);

const visibleAccounts = useMemo(() => {
  let accs = accounts || [];
  
  // ✅ Filtro de status
  if (accountStatusFilter.length > 0) {
    accs = accs.filter(a => accountStatusFilter.includes(a.status?.toLowerCase()));
  }
  
  // Filtra por categoria (se selecionada)
  if (filters.category) {
    accs = accs.filter(a => a.type === filters.category);
  }
  
  // Filtra por texto da busca
  if (searchAccount.trim()) {
    const q = searchAccount.toLowerCase();
    accs = accs.filter(a =>
      (a.name?.toLowerCase().includes(q)) ||
      String(a.currentFunding || a.initialFunding || 0).includes(q)
    );
  }
  
  return accs;
}, [accounts, accountStatusFilter, filters.category, searchAccount]); // ✅ Adicionar accountStatusFilter

  const clearFilters = () => {
    setFilters({ account: '', category: '', timeframe: '', strategyId: ''});
    setAccountStatusFilter(["live", "funded"]);
  };

  // Custom Tooltip para o gráfico (mantido, pois estava correto)
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          background: '#0f1218',
          border: '1px solid #2a3246',
          borderRadius: 8,
          padding: '12px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
            {new Date(label).toLocaleDateString('pt-BR')}
          </div>
          <div style={{ color: '#10b981', fontWeight: 600 }}>
            Equity: {fmt(data.y)}
          </div>
          {data.trade && (
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
              {data.trade.asset} ({data.trade.direction}) • R: {(data.trade.result_R.toFixed(2))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Funções de Ação
  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  
  const handleEdit = (t: EnrichedTrade) => {
    setEditing(t);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este trade?')) {
      await deleteTrade(id);
    }
  };


  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text">📊 Trades</h2>
        <div className="flex items-center gap-2">
          <button 
            className="btn" 
            onClick={openNew}
            disabled={activeAccounts.length === 0}
          >
            + Novo Trade
          </button>
        </div>
      </div>

      {/* Alerta se não há contas */}
      {activeAccounts.length === 0 && (
        <div className="card" style={{ 
          background: 'linear-gradient(180deg, #2e2b12 0%, #1b2010 100%)',
          borderColor: '#594e19' 
        }}>
          <h3>⚠️ Nenhuma conta ativa</h3>
          <div className="muted">
            Para criar trades, você precisa ter contas ativas no main-app. 
            Vá para a página de contas e crie ou ative suas contas primeiro.
          </div>
        </div>
      )}

      {/* 💥 NOVO: Filtros */}
<div className="card p-3 flex gap-4 items-center flex-wrap">
  <span className="text-sm font-medium text-muted">🔎 Filtros:</span>

  {/* 1. Filtro de Categoria de Mercado */}
  <select 
    className="input w-1/5" 
    value={filters.category}
    onChange={e => setFilters({...filters, category: e.target.value})}
  >
    <option value="">All Markets</option>
    {accountType.map(c => <option key={c} value={c}>{c}</option>)}
  </select>
  
  {/* 2. Filtro de Estratégia */}
  <select 
    className="input w-1/5" 
    value={filters.strategyId}
    onChange={e => setFilters({...filters, strategyId: e.target.value})}
  >
    <option value="">All Strategies</option>
    {strategies.map(s => (
      <option key={s.id} value={s.id}>{s.name}</option>
    ))}
  </select>
{/* 🔽 Filtro de Status da Conta */}
<div style={{ position: 'relative' }} ref={statusDropdownRef}>
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen(v => !v); }}
    className="input"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      minWidth: 180,
      cursor: "pointer"
    }}
  >
    {accountStatusFilter && accountStatusFilter.length > 0
      ? `Status: ${accountStatusFilter.join(", ")}`
      : "Filtrar Status"}
    <span style={{ opacity: 0.7, marginLeft: 8 }}>▾</span>
  </button>

  {statusDropdownOpen && accountStatuses && accountStatuses.length > 0 && (
    <div
      className="card"
      style={{
        position: "absolute",
        top: "110%",
        left: 0,
        zIndex: 9999,
        background: "var(--card-bg, #1e1e2b)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "8px 10px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
        minWidth: 200,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {accountStatuses.map((status) => {
          const st = String(status || '');
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
                    : accountStatusFilter.filter(s => s !== st);
                  setAccountStatusFilter(next);
                }}
                style={{ width: 16, height: 16 }}
              />
              <span>{st}</span>
            </label>
          );
        })}
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
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
  {/* ✅ 3. NOVO: Busca de Conta */}
  <div style={{ position: "relative", minWidth: 260 }} className="account-search-container">
    <input
      type="text"
      placeholder="🔍 Buscar conta..."
      className="input w-full"
      value={searchAccount}
      onChange={(e) => setSearchAccount(e.target.value)}
      style={{
        paddingRight: selectedAccount ? '40px' : '12px' // espaço para botão de limpar
      }}
    />

    {/* Dropdown de resultados */}
    {searchAccount && (
      <div
        style={{
          position: "absolute",
          top: "110%",
          left: 0,
          width: "100%",
          background: "#0f172a",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          zIndex: 50,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {visibleAccounts.length === 0 ? (
          <div
            style={{
              padding: 10,
              fontSize: 12,
              color: "#94a3b8",
              textAlign: "center",
            }}
          >
            Nenhuma conta encontrada
          </div>
        ) : (
          visibleAccounts.map((acc) => (
            <div
              key={acc.id}
              onClick={() => {
                setSelectedAccount(acc);
                setSearchAccount(""); // Fecha dropdown
              }}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                background: "#0f172a",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1e293b")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#0f172a")}
            >
              <div style={{ fontWeight: 600, color: "#f9fafb" }}>{acc.name}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                {acc.type} • Balance: {fmt(acc.currentFunding || acc.balance || 0)}
              </div>
            </div>
          ))
        )}
      </div>
    )}

    {/* ✅ Conta selecionada (filtro ativo) */}
    {selectedAccount && (
      <div
        style={{
          marginTop: 8,
          background: "linear-gradient(90deg, #1a1f2e 0%, #151a27 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          animation: "fadeIn 0.2s ease",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, color: "#f9fafb" }}>{selectedAccount.name}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {selectedAccount.type} • Balance: {fmt(selectedAccount.currentFunding || selectedAccount.balance || 0)}
          </div>
        </div>
        <button
          onClick={() => setSelectedAccount(null)}
          style={{
            fontSize: 12,
            color: "#f87171",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          Limpar conta ✕
        </button>
      </div>
    )}
  </div>

  {/* 4. Filtro Select de Conta (mantido para compatibilidade) }
  {activeAccounts.length > 0 && !selectedAccount && (
    <select 
      className="input w-1/5"
      value={filters.account}
      onChange={(e) => setFilters(prev => ({ ...prev, account: e.target.value }))}
    >
      <option value="">All Accounts</option>
      {activeAccounts.map(acc => (
        <option key={acc.id} value={acc.id}>
          {acc.name} ({acc.status})
        </option>
      ))}
    </select>
  )}   */}

  <button className="btn ghost" onClick={() => {
    clearFilters();
    setSelectedAccount(null); // ✅ Limpa também a conta selecionada
    setSearchAccount(""); // ✅ Limpa o campo de busca
  }}>
    🧹 Limpar
  </button>
</div>

      {/* KPI + Chart em 2 colunas */}
      <div
        className="grid gap-6"
        style={{
          gridTemplateColumns: '1fr 2fr', 
          alignItems: 'start'
        }}
      >
        {/* Cards: 2x2 */}
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
        >
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

        {/* Gráfico */}
        {equitySeries.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3>📈 Curva de Equity</h3>
                    <div className="flex items-center gap-2">
        {/* ✅ ADICIONAR: Indicador de conta selecionada */}
        {selectedAccount && (
          <span style={{
            fontSize: 11,
            color: '#9ca3af',
            background: 'rgba(139, 92, 246, 0.2)',
            padding: '4px 8px',
            borderRadius: 6
          }}>
            📊 {selectedAccount.name}
          </span>
        )}
              <div className="muted">{filteredTrades.length} trades</div>
            </div>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={equitySeries}
                  margin={{ top: 15, right: 15, left: 40, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="#374151" opacity={0.3} horizontal vertical={false}/>
                  <XAxis
                    dataKey="x"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill:'#94a3b8', fontSize:11 }}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })
                    }
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill:'#94a3b8', fontSize:11 }}
                    tickFormatter={(value) => `${fmt(value.toFixed(0))}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="y"
                    stroke="#2ecc71"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6, stroke: '#0f1218', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>


      {/* Trades Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3>📋 Lista de Trades</h3>
        </div>
        
        <TradeTable
          trades={filteredTrades}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Trade Form Modal */}
      {open && (
        <TradeForm 
          onClose={() => { setOpen(false); setEditing(null); }} 
          editing={editing} 
        />
      )}
    </div>
  );
}