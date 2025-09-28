import React, { useMemo, useState, useEffect } from 'react';
import type { Trade, Execution } from '../types/trade';
import { useJournal } from '@apps/journal-state';
import { useData, useCurrency } from '@apps/state';
import { v4 as uuidv4 } from 'uuid';

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
  
  // Pegar contas do main-app
  const { accounts = [] } = useData();
  console.log("accounts disponíveis", accounts);
  
  // Filtrar contas ativas
  const activeAccounts = useMemo(() => 
    accounts.filter(acc => ['Live', 'Funded', 'Challenge'].includes(acc.status)),
    [accounts]
  );

  // Initial form
  const [form, setForm] = useState<Partial<Trade>>(() => ({
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toISOString().slice(11, 16),
    direction: 'Long',
    accounts: [], // Array de AccountWeight
    executions: [],
    tags: {},
    volume: 0,
    entry_price: 0,
    exit_price: 0,
    stop_loss_price: 0,
    profit_target_price: 0,
    result_gross: 0,
    risk_per_R: 100,
    commission: 0,
    fees: 0,
    swap: 0,
    slippage: 0
  }));

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
    const qtyTotal = entries.reduce((s, a) => s + a.quantity, 0) || form.volume || 0;
    const directionSign = form.direction === 'Long' ? 1 : -1;
    const pnlGross = qtyTotal ? ((exitVwap - entryVwap) * directionSign * qtyTotal) : 0;
    const costs = (form.commission || 0) + (form.fees || 0) + (form.swap || 0) + (form.slippage || 0);
    const net = pnlGross - costs;
    const riskAmount = form.risk_per_R || 100;
    const r = riskAmount ? net / riskAmount : 0;
    
    setForm(prev => ({ 
      ...prev, 
      entryVwap, 
      exitVwap, 
      result_gross: pnlGross, 
      result_net: net, 
      result_R: r 
    }));
  };

  useEffect(() => {
    recalc();
  }, [form.executions, form.direction, form.risk_per_R, form.commission, form.fees, form.swap, form.slippage, form.entry_price,form.exit_price, form.volume]);

  // Executions helpers
  const addExecution = (side: 'entry' | 'exit') => {
    const ex: Execution = {
      id: uuidv4(),
      date: form.date || new Date().toISOString().slice(0, 10),
      time: form.time || new Date().toISOString().slice(11, 16),
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

  const handleSave = async () => {
    // Validações básicas
    if (!form.asset?.trim()) {
      alert('Asset é obrigatório');
      return;
    }

    if (!selectedAccounts.length) {
      alert('Selecione ao menos uma conta');
      return;
    }

    // Preparar dados do trade com informações enriquecidas
    const primaryAccount = accounts.find(acc => acc.id === selectedAccounts[0]);
    const tradeData = {
      ...form,
      id: editing?.id || uuidv4(),
      accounts: selectedAccounts.map(id => ({ accountId: id, weight: 1 / selectedAccounts.length })),
      // Campos enriquecidos para compatibilidade
      accountId: selectedAccounts[0], // Conta principal
      accountType: primaryAccount?.type || 'Unknown',
      accountName: primaryAccount?.name || 'Unknown Account',
      tf_signal: form.tf_signal || '1h' // Default
    };

    console.log('Salvando trade:', tradeData);

    try {
      await saveTrade(tradeData);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar trade:', error);
      alert('Erro ao salvar trade: ' + (error.message || 'Erro desconhecido'));
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-panel rounded-2xl shadow-xl z-10 max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-panel p-6 border-b border-soft">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text">
              {editing ? 'Editar Trade' : 'Novo Trade'}
            </h3>
            <div className="flex items-center gap-2">
              <button className="btn ghost" onClick={onClose}>Cancelar</button>
              <button className="btn" onClick={handleSave}>Salvar</button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Debug Info */}
          <div className="card" style={{ background: '#1a1a2e', border: '1px solid #16213e' }}>
            <h4 className="font-medium mb-2">Debug Info</h4>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#a0a0a0' }}>
              <div>Contas disponíveis: {accounts.length}</div>
              <div>Contas ativas: {activeAccounts.length}</div>
              <div>Contas selecionadas: {selectedAccounts.length}</div>
              <div>Form accounts: {form.accounts?.length || 0}</div>
            </div>
          </div>

          {/* Alerta se não há contas */}
          {activeAccounts.length === 0 && (
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
            <h4 className="font-medium mb-4">Informações Básicas</h4>
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
                <label>Hora</label>
                <input 
                  className="input" 
                  type="time" 
                  value={form.time} 
                  onChange={e => setForm({ ...form, time: e.target.value })} 
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
                  value={form.direction || 'Long'} 
                  onChange={e => setForm({ ...form, direction: e.target.value as any })}
                >
                  <option value="Long">Long</option>
                  <option value="Short">Short</option>
                </select>
              </div>
            </div>
          </div>

          {/* Account Selection */}
          <div className="card">
            <h4 className="font-medium mb-4">Seleção de Contas</h4>
            <div className="field">
              <label>Contas * (selecione múltiplas com Ctrl/Cmd)</label>
              <select 
                className="input"
                multiple
                size={Math.min(5, activeAccounts.length)}
                value={selectedAccounts}
                onChange={e => setSelectedAccounts(Array.from(e.target.selectedOptions, o => o.value))}
                style={{ height: 'auto', minHeight: 120 }}
              >
                {activeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type}) - ${acc.currentFunding?.toLocaleString()}
                  </option>
                ))}
              </select>
              
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
                <label>Volume</label>
                <input 
                  className="input" 
                  type="number" 
                  value={form.volume || 0} 
                  onChange={e => setForm({ ...form, volume: Number(e.target.value) })} 
                />
              </div>
              <div className="field">
                <label>Preço de Entrada</label>
                <input 
                  className="input" 
                  type="number" 
                  step="0.00001"
                  value={form.entry_price || 0} 
                  onChange={e => setForm({ ...form, entry_price: Number(e.target.value) })} 
                />
              </div>
              <div className="field">
                <label>Preço de Saída</label>
                <input 
                  className="input" 
                  type="number" 
                  step="0.00001"
                  value={form.exit_price || 0} 
                  onChange={e => setForm({ ...form, exit_price: Number(e.target.value) })} 
                />
              </div>
              <div className="field">
                <label>Stop Loss</label>
                <input 
                  className="input" 
                  type="number" 
                  step="0.00001"
                  value={form.stop_loss_price || 0} 
                  onChange={e => setForm({ ...form, stop_loss_price: Number(e.target.value) })} 
                />
              </div>
              <div className="field">
                <label>Take Profit</label>
                <input 
                  className="input" 
                  type="number" 
                  step="0.00001"
                  value={form.profit_target_price || 0} 
                  onChange={e => setForm({ ...form, profit_target_price: Number(e.target.value) })} 
                />
              </div>
            </div>
          </div>

          {/* Risk & Costs */}
          <div className="card">
            <h4 className="font-medium mb-4">Risco e Custos</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="field">
                <label>Risco por R ($)</label>
                <input 
                  className="input" 
                  type="number" 
                  value={form.risk_per_R || 100} 
                  onChange={e => setForm({ ...form, risk_per_R: Number(e.target.value) })} 
                />
              </div>
              <div className="field">
                <label>Comissão ($)</label>
                <input 
                  className="input" 
                  type="number" 
                  value={form.commission || 0} 
                  onChange={e => setForm({ ...form, commission: Number(e.target.value) })} 
                />
              </div>
              <div className="field">
                <label>Taxas ($)</label>
                <input 
                  className="input" 
                  type="number" 
                  value={form.fees || 0} 
                  onChange={e => setForm({ ...form, fees: Number(e.target.value) })} 
                />
              </div>
              <div className="field">
                <label>Swap/Slippage ($)</label>
                <input 
                  className="input" 
                  type="number" 
                  value={(form.swap || 0) + (form.slippage || 0)} 
                  onChange={e => {
                    const v = Number(e.target.value);
                    setForm({ ...form, swap: v * 0.5, slippage: v * 0.5 });
                  }} 
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
      </div>
    </div>
  );
}