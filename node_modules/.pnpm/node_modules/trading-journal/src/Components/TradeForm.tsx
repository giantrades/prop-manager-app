import React, { useMemo, useState, useEffect } from 'react';
import type { Trade, Execution } from '../types/trade';
import { useJournal } from '@apps/journal-state';
import { useCurrency } from '@apps/state';
import { v4 as uuidv4 } from 'uuid';
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';

type Props = {
  onClose: () => void;
  editing?: Trade | null;
};

function fmt(v: number) {
  return (v || 0).toFixed(2);
}

export default function TradeForm({ onClose, editing }: Props) {
  const { strategies = [], saveTrade } = useJournal();
  const { currency, rate } = useCurrency();
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountWeights, setAccountWeights] = useState<Record<string, number>>({});
  // Pegar contas do main-app
  const [accounts, setAccounts] = useState(() => {  try {
        return getAll().accounts || [];
      } catch {
        return [];
      }
    });
 useEffect(() => {
    // Carrega imediatamente
    const loadAccounts = () => {
      try {
        const data = getAll();
        console.log('📦 Contas carregadas no TradeForm:', data.accounts); // DEBUG
        setAccounts(data.accounts || []);
      } catch (err) {
        console.error('❌ Erro ao carregar contas:', err);
        setAccounts([]);
      }
    };

    loadAccounts(); // Executa na montagem

    // Escuta mudanças
    const refresh = () => {
      console.log('🔄 Refresh triggered'); // DEBUG
      loadAccounts();
    };
    
    window.addEventListener('storage', refresh);
    window.addEventListener('datastore:change', refresh);

    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('datastore:change', refresh);
    };
  }, []);



  // Initial form (ajustado para incluir tf_signal e remover risk_per_R)
  const [form, setForm] = useState<Partial<Trade>>(() => ({
    // ... (date, time, direction, accounts, executions, tags)
    tf_signal: editing?.tf_signal || '', // <--- NOVO: Timeframe
    volume: editing?.volume || 0,
    entry_price: editing?.entry_price || 0,
    stop_loss_price: editing?.stop_loss_price || 0,
    profit_target_price: editing?.profit_target_price || 0,
    
    result_gross: editing?.result_gross || 0, // <--- INPUT DIRETO
    // ... (commission, fees, swap, slippage, e.g. 0)
    // risk_per_R removido daqui também
    ...(editing || {}),
  }));

  // Filtrar contas ativas
  const activeAccounts = useMemo(() => 
    accounts.filter(acc => ['Live', 'Funded', 'Challenge'].includes(acc.status)),
    [accounts]
  );
// Logo após o useMemo de activeAccounts
console.log('✅ Active Accounts:', activeAccounts.length, activeAccounts);
console.log('📊 All Accounts:', accounts.length, accounts);

  // Sincronizar selectedAccounts com form.accounts
  useEffect(() => {
    if (editing && editing.accounts) {
      const accountIds = editing.accounts.map(acc => acc.accountId);
      setSelectedAccounts(accountIds);
    }
  }, [editing]);

  // Atualizar form.accounts quando selectedAccounts muda
  useEffect(() => {
    const accountWeights = selectedAccounts.map(accountId => ({
      accountId,
      weight: 1 / selectedAccounts.length // Peso igual para todas
    }));
    setForm(prev => ({ ...prev, accounts: accountWeights }));
  }, [selectedAccounts]);

  useEffect(() => {
    if (editing) {
      setForm(editing);
      // Extrair accountIds se existirem
      if (editing.accounts) {
        const accountIds = editing.accounts.map(acc => acc.accountId);
        setSelectedAccounts(accountIds);
      }
    }
  }, [editing]);

  // Inicialização dos pesos
useEffect(() => {
  if (selectedAccounts.length) {
    const newWeights: Record<string, number> = {}
    selectedAccounts.forEach(id => {
      const acc = accounts.find(a => a.id === id)
      newWeights[id] = acc?.defaultWeight ?? (1 / selectedAccounts.length)
    })
    setAccountWeights(newWeights)
  }
}, [selectedAccounts, accounts])
  // Computed: VWAP / PnL / R
  const computeVWAP = (execs: Execution[], side: 'entry' | 'exit') => {
    const arr = execs.filter(e => e.side === side);
    const denom = arr.reduce((s, a) => s + a.quantity, 0);
    if (!denom) return 0;
    const num = arr.reduce((s, a) => s + a.price * a.quantity, 0);
    return num / denom;
  };

  const recalc = () => {
    const entries = (form.executions || []).filter(e => e.side === 'entry');
    const exits = (form.executions || []).filter(e => e.side === 'exit');
    const entryVwap = computeVWAP(entries, 'entry') || form.entry_price || 0;
    const exitVwap = computeVWAP(exits, 'exit') || form.exit_price || 0;

    // 1. P&L Bruto é o valor do input (result_gross)
    const result_gross = form.result_gross || 0;
    
    // 2. Custos e P&L Líquido
    const costs = (form.commission || 0) + (form.fees || 0) + (form.swap || 0) + (form.slippage || 0);
    const result_net = result_gross - costs; // P&L Líquido = P&L Bruto (Input) - Custos
    
    // 3. Cálculo do R-Múltiplo (result_R)
    const entry = form.entry_price || 0;
    const stop = form.stop_loss_price || 0;
    const takeprofit= form.profit_target_price ||0;
    const exit = form.exit_price|| 0;
    const netprofit= form.result_net ||0;
    
    // Risco em Pontos (1R) = |Entry Price - Stop-Loss Price|
    const initialRiskPriceDiff = Math.abs(entry - stop);
    
const isLong = stop < entry; // Se stop está abaixo da entrada = Long
const isShort = stop > entry; // Se stop está acima da entrada = Short

// Calcula a diferença de preço com sinal correto
let priceDiff = 0;
if (isLong) {
    priceDiff = exit - entry; // Long: se exit > entry = lucro (+), se exit < entry = prejuízo (-)
} else if (isShort) {
    priceDiff = entry - exit; // Short: se entry > exit = lucro (+), se entry < exit = prejuízo (-)
}

// R-Múltiplo = Diferença de Preço / Risco Inicial
let result_R = 0;
if (initialRiskPriceDiff > 0) {
    result_R = priceDiff / initialRiskPriceDiff;
}
    
  setForm(prev => {
      let update: Partial<Trade> = {};
      
      if (prev.entryVwap !== entryVwap) update.entryVwap = entryVwap;
      if (prev.exitVwap !== exitVwap) update.exitVwap = exitVwap;

      if (prev.result_net !== result_net) update.result_net = result_net;
      if (prev.result_R !== result_R) update.result_R = result_R;
      
      return (Object.keys(update).length > 0) ? { ...prev, ...update } : prev;
    });
  };

  useEffect(() => {
       recalc();
  }, [
    form.executions, 
    form.result_gross, 
    form.volume, 
    form.entry_price, 
    form.stop_loss_price, 
    form.commission, 
    form.fees, 
    form.swap, 
    form.slippage,
  ]);
  
 const save = () => {
    // ... (Mesma lógica de recalculo que o useEffect para salvar)
    const costs = (form.commission || 0) + (form.fees || 0) + (form.swap || 0) + (form.slippage || 0);
    const result_gross = form.result_gross || 0;
    const entry = form.entry_price || 0;
    const stop = form.stop_loss_price || 0;
    const riskInDollars = (form.volume || 0) * Math.abs(entry - stop);
    const result_R = riskInDollars > 0 ? result_gross / riskInDollars : 0;
    
    const tradeToSave: Trade = {
      ...form as Trade,
      // ... (id, accounts, tags)
      result_net: result_gross - costs,
      result_R: result_R,
      // @ts-ignore: Garante a remoção de campos indesejados (se existirem)
      risk_per_R: undefined, 
    };
    
    saveTrade(tradeToSave);
    onClose();
  };



  // Executions helpers
  const addExecution = (side: 'entry' | 'exit') => {
    const ex: Execution = {
      id: uuidv4(),
      date: form.date || new Date().toISOString().slice(0, 10),
      entry_time: form.entry_time || new Date().toISOString().slice(11, 16),
      exit_time: form.exit_time || new Date().toISOString().slice(11, 16),
      price: side === 'entry' ? (form.entry_price || 0) : 0,
      quantity: form.volume || 0,
      side
    };
    setForm(prev => ({ ...prev, executions: [...(prev.executions || []), ex] }));
  };

  const updateExec = (id: string, patch: Partial<Execution>) => {
    setForm(prev => ({
      ...prev,
      executions: (prev.executions || []).map(e => e.id === id ? { ...e, ...patch } : e)
    }));
  };

  const removeExec = (id: string) => {
    setForm(prev => ({
      ...prev,
      executions: (prev.executions || []).filter(e => e.id !== id)
    }));
  };

  // no topo do componente TradeForm, garanta:
// const { strategies = [], saveTrade, exportToDrive } = useJournal();


const handleSave = async () => {
  // validações
  if (!form.asset?.trim()) { alert('Asset é obrigatório'); return; }
  if (!selectedAccounts.length) { alert('Selecione ao menos uma conta'); return; }

  // garante shape accounts: [{accountId, weight}]
  const accountsPayload = selectedAccounts.map(id => {
    const defaultW = accountWeights[id];
    const weight = (typeof defaultW === 'number' && !isNaN(defaultW)) ? defaultW : (1);
    return { accountId: id, weight };
  });

  const primaryAccountId = selectedAccounts[0];

  const tradeData = {
    ...form,
    id: editing?.id || uuidv4(),
    accounts: accountsPayload,
    accountId: primaryAccountId, // principal
    accountName: accounts.find(a => a.id === primaryAccountId)?.name || '',
    accountType: accounts.find(a => a.id === primaryAccountId)?.type || 'Unknown',
    tf_signal: form.tf_signal || '1h',
  };

  // Atualiza accounts: aplicar impacto do result_net * weight (multiplicador), conforme você pediu:
  if (typeof form.result_net === 'number') {
    const net = Number(form.result_net) || 0;
    for (const entry of accountsPayload) {
      const acc = accounts.find(a => a.id === entry.accountId);
      if (!acc) continue;
      const pnlImpact = net * (entry.weight ?? 1); // MULTIPLICADOR, não divisão
      try {
        // atualiza no dataStore central (persistence)
        updateAccount(acc.id, { ...acc, currentFunding: (acc.currentFunding || 0) + pnlImpact, defaultWeight: entry.weight });
      } catch (err) {
        console.error('Erro ao atualizar conta via dataStore', err);
      }
    }
  }

  // salva trade no journal local (IndexedDB) como antes
  try {
    await saveTrade(tradeData);
    onClose(); // fechar popup
  } catch (err) {
    console.error('Erro ao salvar trade', err);
    alert('Erro ao salvar trade: ' + (err?.message || 'desconhecido'));
  }
};



  // Auto-populate tags when strategy changes
  useEffect(() => {
    if (form.strategyId) {
      const strat = strategies.find(s => s.id === form.strategyId);
      if (strat && Array.isArray(strat.checklist)) {
        const tags = { ...(form.tags || {}) };
        for (const item of strat.checklist) {
          tags[item] = tags[item] ?? false;
        }
        setForm(prev => ({ ...prev, tags }));
      }
    }
  }, [form.strategyId, strategies]);

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
 const handleOverlayClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      onClose();
    }
  };
const [filterType, setFilterType] = useState<string>('');

const filteredAccounts = useMemo(() => {
  if (!Array.isArray(activeAccounts)) return [];
  return activeAccounts.filter(acc => !filterType || acc.type === filterType);
}, [activeAccounts, filterType]);


  return (
       <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
      <button className="modal-close" onClick={onClose}>×</button>
        {/* header com save/cancel */}
        <div className="sticky top-0 bg-panel p-6 border-b border-soft">
          <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold mb-4">
            {editing ? 'Editar Trade' : 'Novo Trade'}
            </h2>

            <div className="flex items-center gap-2">
              <button className="btn ghost" onClick={onClose}>Cancelar</button>
              <button className="btn" onClick={handleSave}>Salvar</button>
            </div>
          </div>
        </div>

          <div className="form-body">
 
          {/* Alerta se não há contas */}
          {filteredAccounts.length === 0 && (
            <div className="card" style={{ 
              background: 'linear-gradient(180deg, #2e2b12 0%, #1b2010 100%)',
              borderColor: '#594e19' 
            }}>
              <div style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                Nenhuma conta ativa encontrada
              </div>
              <div className="muted text-sm">
                Crie contas no main-app primeiro para poder associar trades.
              </div>
            </div>
          )}

          {/* Basic Info */}
          <div className="card">
            <h4 className="font-medium mb-4">Basic Info</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="field">
                <label>Data</label>
                <input 
                  className="input" 
                  type="date" 
                  value={form.date} 
                  onChange={e => setForm({ ...form, date: e.target.value })} 
                />
              </div>
              <div className="field">
                <label>Asset *</label>
                <input 
                  className="input" 
                  value={form.asset || ''} 
                  onChange={e => setForm({ ...form, asset: e.target.value })}
                  placeholder="Ex: EURUSD, BTCUSD..." 
                />
              </div>
              <div className="field">
                <label>Direção</label>
                <select 
                  className="input" 
                  value={form.direction || ''} 
                  onChange={e => setForm({ ...form, direction: e.target.value as any })}
                >
                  <option value=""> </option>
                  <option value="Long">Long</option>
                  <option value="Short">Short</option>
                </select> </div>
               <div className="grid grid-cols-2 gap-4">

              {/* Campo Timeframe da Operação (tf_signal) - NOVO */}
              <div>
                <label className="form-label">Timeframe da Operação</label>
                <input
                  className="input w-full"
                  value={form.tf_signal || ''}
                  onChange={(e) => setForm({ ...form, tf_signal: e.target.value })}
                  placeholder="Ex: H1, M15, Diário"
                />
              </div>
              </div>
            </div>
          </div>
          <div className="field">
           <label>Categorias de Contas</label>
          <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Todos</option>
          <option value="Forex">Forex</option>
          <option value="Futures">Futures</option>
          <option value="Cripto">Cripto</option>
         <option value="Personal">Personal</option>
          </select>
          </div>
          {/* Account Selection */}
          <div className="card">
            <h4 className="font-medium mb-4">Seleção de Contas</h4>
            <div className="field">
              <label>Contas * (selecione múltiplas com Ctrl/Cmd)</label>
              <select 
                className="input"
                multiple
                size={Math.min(5, filteredAccounts.length)}
                value={selectedAccounts}
                onChange={e => setSelectedAccounts(Array.from(e.target.selectedOptions, o => o.value))}
                style={{ height: 'auto', minHeight: 120 }}
              >
                {filteredAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type}) - ${acc.currentFunding?.toLocaleString()}
                  </option>
                ))}
              </select>
              {/* Multiplier do weight das contas */}
          {selectedAccounts.map(id => {
          const acc = accounts.find(a => a.id === id);
          return (<div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{acc?.name}</span>
          <input
          type="number"
          className="input"
          placeholder="Peso"
          value={accountWeights[id] ?? ''}
          onChange={(e) =>setAccountWeights({...accountWeights,[id]: Number(e.target.value)})}
      style={{ width: 72 }}
      />
    </div>
  );
})}


              {/* Preview das contas selecionadas */}
              {selectedAccounts.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-sm font-medium">Contas selecionadas:</div>
                  {selectedAccounts.map(accountId => {
                    const acc = accounts.find(a => a.id === accountId);
                    return acc ? (
                      <div key={accountId} className="flex items-center gap-3 p-2 bg-soft rounded">
                        <span className={`pill ${getAccountTypeClass(acc.type)}`}>
                          {acc.type}
                        </span>
                        <div className="flex-1">
                          <div className="font-medium">{acc.name}</div>
                          <div className="text-sm text-muted">
                            ${acc.currentFunding?.toLocaleString()} • {acc.status}
                          </div>
                        </div>
                        <button 
                          className="btn ghost small"
                          onClick={() => setSelectedAccounts(prev => prev.filter(id => id !== accountId))}
                        >
                          ×
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Strategy */}
          <div className="card">
            <h4 className="font-medium mb-4">Estratégia</h4>
            <div className="field">
              <label>Estratégia</label>
              <select 
                className="input" 
                value={form.strategyId || ''} 
                onChange={e => setForm({ ...form, strategyId: e.target.value || null })}
              >
                <option value="">Nenhuma estratégia</option>
                {strategies.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Tags/Checklist */}
            {Object.keys(form.tags || {}).length > 0 && (
              <div className="mt-4">
                <label className="font-medium">Checklist</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(form.tags || {}).map(([k, v]) => (
                    <label key={k} className="flex items-center gap-2 px-3 py-2 bg-soft rounded-lg text-sm">
                      <input 
                        type="checkbox" 
                        checked={!!v} 
                        onChange={e => setForm(prev => ({
                          ...prev, 
                          tags: { ...(prev.tags || {}), [k]: e.target.checked }
                        }))} 
                      />
                      <span>{k}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Trade Details */}
          <div className="card">
            <h4 className="font-medium mb-4">Detalhes do Trade</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <div className="field">
                <label> Volume / Quantidade</label>
                <input
                  type="number"
                  step="0.01"
                  className="input w-full"
                  value={form.volume || ''}
                  onChange={(e) => setForm({ ...form, volume: Number(e.target.value) || 0 })}
                  placeholder="Ex: 0.1, 1, 100"
                />
              </div>
            
              <div className="field">
                <label>Entry Price</label>
                <input 
                  className="input w-full" 
                  type="number" 
                  step="0.01"
                  value={form.entry_price || ''} 
                  onChange={e => setForm({ ...form, entry_price: Number(e.target.value) || 0 })} 
                />
              </div>
              <div className="field">
                <label>Entry time</label>
                <input 
                  className="input" 
                  type="time" 
                  value={form.entry_time} 
                  onChange={e => setForm({ ...form, entry_time: e.target.value })} 
                />
              </div>
              <div className="field">
                <label>Exit Price</label>
                <input 
                  className="input w-full" 
                  type="number" 
                  step="0.01"
                  value={form.exit_price || ''} 
                  onChange={e => setForm({ ...form, exit_price: Number(e.target.value) || 0 })} 
                />
              </div>
              <div className="field">
                <label>Exit time</label>
                <input 
                  className="input" 
                  type="time" 
                  value={form.exit_time} 
                  onChange={e => setForm({ ...form, exit_time: e.target.value })} 
                />
              </div>
               <div className="field">
                <label>Take Profit</label>
                <input 
                  className="input w-full" 
                  type="number" 
                  step="0.01"
                  value={form.profit_target_price || ''} 
                  onChange={e => setForm({ ...form, profit_target_price: Number(e.target.value)|| 0 })} 
                />
              </div>
              <div className="field">
                <label>Stop Loss</label>
                <input 
                  className="input w-full" 
                  type="number" 
                  step="0.01"
                  value={form.stop_loss_price || ''} 
                  onChange={e => setForm({ ...form, stop_loss_price: Number(e.target.value)|| 0 })} 
                />
              </div>
             
            </div>
          </div>

          {/* Risk & Costs */}
          <div className="card">
            <h4 className="font-medium mb-4">PnL & Costs</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="field">
                <label>Gross PnL ($)</label>
                <input 
                  className="input text-xl font-semibold" 
                  type="number" 
                  step="0.01"
                  value={form.result_gross || ''} 
                  onChange={e => setForm({ ...form, result_gross: Number(e.target.value)||0 })}
                  placeholder ="0.00" 
                />
              </div>
              <div className="field">
                <label>Comissão ($)</label>
                <input 
                  className="input w-full"
                  step="0.01" 
                  type="number" 
                  value={form.commission || ''} 
                  onChange={e => setForm({ ...form, commission: Number(e.target.value)||0 })} 
                />
              </div>
              <div className="field">
                <label>Fees ($)</label>
                <input 
                  className="input w-full"
                  step="0.01" 
                  type="number" 
                  value={form.fees || ''} 
                  onChange={e => setForm({ ...form, fees: Number(e.target.value)||0 })} 
                />
              </div>
              <div className="field">
                <label>Swap ($)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input w-full"
                  value={form.swap || ''}
                  onChange={(e) => setForm({ ...form, swap: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <h4 className="font-medium mb-4">Observações</h4>
            <div className="field">
              <textarea 
                className="input" 
                rows={3} 
                value={form.notes || ''} 
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Observações sobre o trade..."
              />
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="card accent1">
              <div className="muted">Entry VWAP</div>
              <div className="stat">{fmt(form.entryVwap || 0)}</div>
            </div>
            <div className="card accent2">
              <div className="muted">Exit VWAP</div>
              <div className="stat">{fmt(form.exitVwap || 0)}</div>
            </div>
            <div className="card accent3">
              <div className="muted">P&L Bruto</div>
              <div className={`stat ${(form.result_gross || 0) >= 0 ? 'pos' : 'neg'}`}>
                ${fmt(form.result_gross || 0)}
              </div>
            </div>
            <div className="card accent4">
              <div className="muted">P&L Líquido</div>
              <div className={`stat ${(form.result_net || 0) >= 0 ? 'pos' : 'neg'}`}>
                ${fmt(form.result_net || 0)}
              </div>
            </div>
            <div className="card accent5">
              <div className="muted">R</div>
              <div className={`stat ${(form.result_R || 0) >= 0 ? 'pos' : 'neg'}`}>
                {fmt(form.result_R || 0)}
              </div>
            </div>
          </div>
        </div>
          <div className="flex justify-end p-4 border-t border-soft">
          <button className="btn ghost mr-2" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={handleSave}>Salvar</button>
        </div>
        
      </div>
    </div>
  );
}