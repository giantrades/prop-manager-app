import React, { useMemo, useState } from 'react';
import TradeTable from '../Components/TradeTable';
import TradeForm from '../Components/TradeForm';
import { useJournal } from '@apps/journal-state';
import { useData } from '@apps/state';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { EnrichedTrade, Trade, AccountWeight } from '../types/trade'; // Ajuste o caminho se necessário


export default function TradesPage() {
  const { trades = [], saveTrade, deleteTrade, ready } = useJournal();
  const { accounts = [] } = useData();
  
  if (!ready) {
    return <div className="p-6 text-text">Carregando trades…</div>;
  }
  
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedTrade | null>(null);

  // Filtros com tipos corretos
  const [filters, setFilters] = useState({
    account: '',
    category: '',
    timeframe: ''
  });

  // Enriquecer trades com informações das contas
  const enrichedTrades: EnrichedTrade[] = useMemo(() => {
    return trades.map(trade => {
      // Buscar conta principal (primeira do array ou accountId)
      let primaryAccount = null;
      
      if (trade.accountId) {
        primaryAccount = accounts.find(acc => acc.id === trade.accountId);
      } else if (trade.accounts && trade.accounts.length > 0) {
        primaryAccount = accounts.find(acc => acc.id === trade.accounts[0].accountId);
      }
      
      return {
        ...trade,
        accountType: primaryAccount?.type || trade.accountType || 'Unknown',
        accountName: primaryAccount?.name || trade.accountName || 'Unknown Account',
        account: primaryAccount
      };
    });
  }, [trades, accounts]);

  // Filtrar trades
  const filteredTrades = useMemo(() => {
    let filtered = enrichedTrades;
    
    if (filters.account) {
      filtered = filtered.filter(t => 
        t.accountId === filters.account || 
        (t.accounts && t.accounts.some(acc => acc.accountId === filters.account))
      );
    }
    if (filters.category) {
      filtered = filtered.filter(t => t.accountType === filters.category);
    }
    
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [enrichedTrades, filters]);

  // Calcular estatísticas dos trades filtrados
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

  // Preparar série de equity
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

  // Categorias disponíveis para filtro
  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    accounts.forEach(acc => {
      if (acc.type) categories.add(acc.type);
    });
    return Array.from(categories).sort();
  }, [accounts]);

  // Contas ativas para filtro
  const activeAccounts = useMemo(() => 
    accounts.filter(acc => ['Live', 'Funded', 'Challenge'].includes(acc.status)),
    [accounts]
  );

  const clearFilters = () => {
    setFilters({ account: '', category: '', timeframe: '' });
  };

  // Função para alterar filtro de categoria - CORRIGIDO
  const handleCategoryFilter = (category: string) => {
    setFilters(prev => ({ 
      ...prev, 
      category: prev.category === category ? '' : category 
    }));
  };

  // Custom Tooltip para o gráfico
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

  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text">📊 Trades</h2>
        <div className="flex items-center gap-2">
          <button 
            className="btn" 
            onClick={() => { setEditing(null); setOpen(true); }}
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

      {/* Filtros */}
      <div className="filters">
        <span>🔎 Filtros:</span>
        
        {/* Filtro por categoria - ERROS CORRIGIDOS */}
        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          {availableCategories.map((cat: string) => {
            const active = filters.category === cat;
            const className = cat === 'Forex' ? 'lavander'
                            : cat === 'Cripto' ? 'orange'
                            : cat === 'Futures' ? 'pink'
                            : cat === 'Personal' ? 'purple'
                            : 'gray';
            return (
              <button 
                key={cat}
                className={`chip ${active ? 'active' : ''}`}
                onClick={() => handleCategoryFilter(cat)}
              >
                <span className={`pill ${className}`} style={{ 
                  display: 'inline-block', 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  marginRight: 6,
                  padding: 0,
                  fontSize: 0
                }}></span>
                {cat}
              </button>
            );
          })}
        </div>

        {/* Filtro por conta específica */}
        {activeAccounts.length > 0 && (
          <select 
            value={filters.account}
            onChange={(e) => setFilters(prev => ({ ...prev, account: e.target.value }))}
            style={{
              background: '#111623',
              border: '1px solid #273044',
              color: '#e7eaf0',
              padding: '6px 10px',
              borderRadius: '10px',
              marginLeft: 16
            }}
          >
            <option value="">Todas as contas</option>
            {activeAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.type})
              </option>
            ))}
          </select>
        )}

        <button className="chip" onClick={clearFilters}>
          🧹 Limpar
        </button>
      </div>

     {/* KPI + Chart em 2 colunas */}
<div
  className="grid gap-6"
  style={{
    gridTemplateColumns: '1fr 2fr',   // ← esquerda menor, direita maior
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
          onEdit={(t) => { setEditing(t); setOpen(true); }}
          onDelete={async (id) => {
            if (confirm('Tem certeza que deseja excluir este trade?')) {
              await deleteTrade(id);
            }
          }}
        />
      </div>

      {/* Trade Form Modal - TIPO CORRIGIDO */}
      {open && (
        <TradeForm 
          onClose={() => setOpen(false)} 
          editing={editing} 
        />
      )}
    </div>
  );
}