import React, { useMemo, useEffect, useState } from 'react';
import { Trade, AccountWeight, EnrichedTrade } from '../types/trade'; // Certifique-se do path correto
import { useJournal } from "@apps/journal-state";
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';


type Props = {
  trades: EnrichedTrade[];
  onEdit?: (t: EnrichedTrade) => void;
  onDelete?: (id: string) => void;
};

export default function TradeTable({ trades, onEdit, onDelete }: Props) {
  const [accounts, setAccounts] = useState(() => getAll().accounts || []);

useEffect(() => {
  setAccounts(getAll().accounts || []);
}, []);

  
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<'date' | 'result_net' | 'result_R' | 'asset' |'tf_signal' | string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Função para resolver nomes das contas
  function resolveAccountNames(tradeAccounts?: Array<{ accountId: string; weight?: number }>) {
    if (!tradeAccounts || tradeAccounts.length === 0) return 'N/A';
    
    return tradeAccounts
      .map(a => {
        const acc = accounts.find(x => x.id === a.accountId);
        return acc ? acc.name : a.accountId;
      })
      .join(', ');
  }

  // Filtrar e ordenar trades
  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return trades.filter(t => {
      if (!query) return true;
      return (t.asset || '').toLowerCase().includes(lower)
        || (t.accountName || '').toLowerCase().includes(lower)
        || (t.strategyId || '').toLowerCase().includes(lower)
        || (t.notes || '').toLowerCase().includes(lower)
        || (t.direction || '').toLowerCase().includes(lower)
        || (t.tf_signal||'').toLowerCase().includes(lower);
    }).sort((a, b) => {
      let av: any = (a as any)[sortKey] || 0;
      let bv: any = (b as any)[sortKey] || 0;
      
      if (sortKey === 'date') {
        av = new Date(av);
        bv = new Date(bv);
      }
      
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [trades, query, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(dir => dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const toggleSelection = (id: string) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSelectAll = () => {
    const allSelected = filtered.every(t => selected[t.id]);
    const newSelection: Record<string, boolean> = {};
    if (!allSelected) {
      filtered.forEach(t => newSelection[t.id] = true);
    }
    setSelected(newSelection);
  };

  const bulkDelete = () => {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (!ids.length) return alert('Nenhum trade selecionado');
    if (!confirm(`Excluir ${ids.length} trade(s)?`)) return;
    ids.forEach(id => onDelete && onDelete(id));
    setSelected({});
  };

  const getSortIndicator = (key: string) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // Get account type color class
  const getAccountTypeClass = (type: string) => {
    switch (type) {
      case 'Forex': return 'lavander';
      case 'Cripto': return 'orange';
      case 'Futures': return 'pink';
      case 'Personal': return 'purple';
      default: return 'gray';
    }
  };

  if (trades.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📊</div>
        <div className="text-xl font-semibold mb-2">Nenhum trade encontrado</div>
        <div className="text-muted">
          Clique em "Novo Trade" para começar a registrar seus trades.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <input 
            className="input" 
            style={{ width: 300 }}
            placeholder="Buscar por asset, conta, direção..." 
            value={query} 
            onChange={e => setQuery(e.target.value)} 
          />
          <select 
            className="input" 
            value={sortKey} 
            onChange={e => setSortKey(e.target.value as any)}
          >
            <option value="date">Data</option>
            <option value="asset">Asset</option>
            <option value="result_net">P&L ($)</option>
            <option value="result_R">R</option>
          </select>
          <button 
            className="btn ghost" 
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {Object.values(selected).some(Boolean) && (
            <button className="btn ghost" onClick={bulkDelete}>
              Excluir ({Object.values(selected).filter(Boolean).length})
            </button>
          )}
          <div className="muted text-sm">
            {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-mini">
        <table>
          <thead>
            <tr>
              {/* Cabeçalhos da tabela */}
              <th style={{ width: 40 }}>
                <input 
                  type="checkbox" 
                  checked={filtered.length > 0 && filtered.every(t => selected[t.id])}
                  onChange={toggleSelectAll}
                />
              </th>
              <th 
                style={{ cursor: 'pointer' }} 
                onClick={() => toggleSort('date')}
              >
                Date{getSortIndicator('date')}
              </th>
              <th 
                style={{ cursor: 'pointer' }} 
                onClick={() => toggleSort('asset')}
              >
                Asset/TF{getSortIndicator('asset')}
              </th>
              <th>Market/Accounts</th>
              <th>Strategy</th>
              <th>Dir</th>
              
              <th>Volume</th>
              <th>Entry</th>
              <th>Exit</th>
              <th 
                style={{ cursor: 'pointer' }} 
                onClick={() => toggleSort('result_net')}
              >
                P&L ($){getSortIndicator('result_net')}
              </th>
              
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            
            {filtered.map(t => (
              <tr key={t.id} className="hover:bg-[#071023]">
                <td>
                  <input 
                    type="checkbox" 
                    checked={!!selected[t.id]} 
                    onChange={() => toggleSelection(t.id)} 
                  />
                </td>
                <td>
                  <div>{new Date(t.date).toLocaleDateString('pt-BR')}</div><span className="muted">{t.entry_time}</span> <span className="muted">→ {t.exit_time ||'' } </span>
                </td>
                <td style={{ padding: "6px" }}>{t.asset} <span className="muted">• {t.tf_signal || ''}</span></td>
                <td style={{ padding: "6px" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t.accountType && (
                    <span className={`pill ${getAccountTypeClass(t.accountType)}`} 
                      style={{ fontSize: 8, padding: '2px 4px' }}>
                      {t.accountType}
                    </span>
                  )}
                  <span style={{ fontSize: 11 }}>{t.accountName || 'N/A'}</span>
                </div>

                </td>
                <td>
                  <div className="text-sm">{t.strategyName || '-'}</div>
                </td>
                <td>
                  <span className={`pill type ${t.direction === 'Long' ? 'lavander' : 'orange'}`}>
                    {t.direction}
                  </span>
                </td>
                <td>{(t.volume || 0).toLocaleString()}</td>
                <td>
                  {(t.entryVwap || t.entry_price || 0).toFixed?.(2) ?? '-'}
                </td>
                <td>
                  {(t.exitVwap || t.exit_price || 0).toFixed?.(2) ?? '-'}
                </td>
                <td className={`font-medium ${(t.result_net || 0) >= 0 ? 'pos' : 'neg'}`}>
                  ${(t.result_net || 0).toFixed(2)}
                </td>
 
                <td>
                  <div className="flex gap-1">
                    <button 
                      className="btn ghost small" 
                      onClick={() => onEdit && onEdit(t)}
                      title="Editar trade"
                    >
                      ✏️
                    </button>
                    <button 
                      className="btn ghost small" 
                      onClick={() => onDelete && onDelete(t.id)}
                      title="Excluir trade"
                      style={{ color: '#e74c3c' }}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && query && (
        <div className="text-center py-8">
          <div className="text-muted">
            Nenhum trade encontrado para "{query}"
          </div>
          <button 
            className="btn ghost mt-2" 
            onClick={() => setQuery('')}
          >
            Limpar busca
          </button>
        </div>
      )}
    </div>
  );
}