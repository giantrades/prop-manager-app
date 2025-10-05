import React, { useMemo, useEffect, useState } from 'react';
import TradeTable from '../Components/TradeTable';
import TradeForm from '../Components/TradeForm';
import { useJournal } from '@apps/journal-state';
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


  // Filtros com tipos corretos
  

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
    
    // 1. Filtro por Categoria de Mercado (MarketCategory)
    if (filters.category) {
      // CORREÇÃO: filtra pelo  pelo accountType
      filtered = filtered.filter(t => t.accountType === filters.category); 
    }

    // 2. Filtro por Estratégia (strategyId)
    if (filters.strategyId) {
      filtered = filtered.filter(t => t.strategyId === filters.strategyId);
    }
    
    // 3. Filtro por Conta Específica (accountId)
    if (filters.account) {
      filtered = filtered.filter(t => 
        t.accountId === filters.account || 
        (t.accounts && t.accounts.some(acc => acc.accountId === filters.account))
      );
    }
    
    // Filtro por Timeframe (se você implementar)
    // if (filters.timeframe) {
    //   filtered = filtered.filter(t => t.tf_signal === filters.timeframe);
    // }
    
    // Retorna ordenado por data
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [enrichedTrades, filters]);

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
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((t, index) => {
        acc += (t.result_net || 0);
        return { 
          x: t.date,
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
  const activeAccounts = useMemo(() => 
    accounts.filter(acc => ['Live', 'Funded', 'Challenge'].includes(acc.status)),
    [accounts]
  );

  const clearFilters = () => {
    setFilters({ account: '', category: '', timeframe: '', strategyId: ''});
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
            Equity: ${data.y.toFixed(2)}
          </div>
          {data.trade && (
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
              {data.trade.asset} ({data.trade.direction}) • R: {data.trade.result_R?.toFixed(2)}
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
      <div className="card p-3 flex gap-4 items-center">
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

        {/* 3. Filtro por conta específica */}
        {activeAccounts.length > 0 && (
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
        )}

        <button className="btn ghost" onClick={clearFilters}>
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
              ${filteredStats.totalPnL.toFixed(2)}
            </div>
            <div className="muted">resultado líquido</div>
          </div>
        </div>

        {/* Gráfico */}
        {equitySeries.length > 0 && (
          <div className="card">
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
                    tickFormatter={(value) => `${value.toFixed(0)}`}
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
          <div className="muted">
            {filteredTrades.length} de {enrichedTrades.length} trades
          </div>
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