import React, { useMemo, useState, useEffect } from 'react';
import type { Trade, Execution, PartialExecution } from '../types/trade';
import { useJournal } from '@apps/journal-state';
import { useCurrency } from '@apps/state';
import { v4 as uuidv4 } from 'uuid';
import {getAll, createAccount,getTrades, createTrade, updateTrade, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';

type Props = {
  onClose: () => void;
  editing?: Trade | null;
};

// Corrige fuso horário e mantém aparência consistente com outros inputs
function toISOStringLocal(datetimeLocal: string) {
  const [date, time] = datetimeLocal.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const dt = new Date(year, month - 1, day, hour, minute);
  return dt.toISOString(); // armazena corretamente em UTC sem alterar a hora local exibida
}

function formatLocalDatetime(isoString: string) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

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
    entry_datetime: editing?.entry_datetime || new Date().toISOString(),
    exit_datetime: editing?.exit_datetime || null,
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
    setForm(editing); // ✅ Simplesmente copia tudo do editing
    
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


  // 🧩 Execuções parciais
const addPartial = () => {
  setForm(f => ({
    ...f,
    PartialExecutions: [
      ...(f.PartialExecutions || []),
      { id: uuidv4(), entryPrice: 0, exitPrice: 0, volume: 0, result_gross: 0,entry_datetime: new Date().toISOString(), // ✅ ADICIONADO
      exit_datetime: null, },
    ],
  }));
};

const removePartial = (idx: number) => {
  setForm(f => ({
    ...f,
    PartialExecutions: f.PartialExecutions.filter((_, i) => i !== idx),
  }));
};

const updatePartial = (
  idx: number,
  field: string,
  value: string | number | null
) => {
  setForm((f) => ({
    ...f,
    PartialExecutions: f.PartialExecutions.map((p, i) =>
      i === idx ? { ...p, [field]: value } : p
    ),
  }));
};



const handleSave = async () => {
  // Validações
  if (!form.asset?.trim()) {
    alert('Asset é obrigatório');
    return;
  }
  if (!selectedAccounts.length) {
    alert('Selecione ao menos uma conta');
    return;
  }
  if (!form.entry_datetime) {
    alert("Entry Date & Time é obrigatório");
    return;
  }
  if (form.exit_datetime && form.exit_datetime < form.entry_datetime) {
    alert("Exit Date não pode ser anterior à Entry Date");
    return;
  }

  // Garante shape accounts: [{accountId, weight}]
  const accountsPayload = selectedAccounts.map(id => {
    const defaultW = accountWeights[id];
    const weight = (typeof defaultW === 'number' && !isNaN(defaultW)) ? defaultW : 1;
    return { accountId: id, weight };
  });

  const primaryAccountId = selectedAccounts[0];

  // 🔹 Processa Execuções Parciais (se existirem)
  let updatedForm = { ...form };
  if (Array.isArray(updatedForm.PartialExecutions) && updatedForm.PartialExecutions.length > 0) {
    const totalVol = updatedForm.PartialExecutions.reduce((acc, e) => acc + (e.volume || 0), 0);
    if (totalVol > 0) {
      const avgEntry = updatedForm.PartialExecutions.reduce(
        (acc, e) => acc + (e.entryPrice * e.volume),
        0
      ) / totalVol;

      const avgExit = updatedForm.PartialExecutions.reduce(
        (acc, e) => acc + (e.exitPrice * e.volume),
        0
      ) / totalVol;

      const totalGross = updatedForm.PartialExecutions.reduce(
        (acc, e) => acc + (e.result_gross || 0),
        0
      );

      // Atualiza apenas se não foram definidos manualmente
      if (!updatedForm.entry_price || updatedForm.entry_price === 0) {
        updatedForm.entry_price = avgEntry;
      }
      if (!updatedForm.exit_price || updatedForm.exit_price === 0) {
        updatedForm.exit_price = avgExit;
      }
      if (!updatedForm.result_gross || updatedForm.result_gross === 0) {
        updatedForm.result_gross = totalGross;
      }

      updatedForm.volume = totalVol;
    }
  }

  // 🔹 Monta o tradeData FINAL
  const tradeData = {
    ...updatedForm,
    id: editing?.id || uuidv4(),
    // ✅ CRÍTICO: Mantém ISO completo (não fatiar!)
    entry_datetime: updatedForm.entry_datetime,
    exit_datetime: updatedForm.exit_datetime || null,
    isBreakeven: !!updatedForm.isBreakeven,
    accounts: accountsPayload,
    accountId: primaryAccountId,
    accountName: accounts.find(a => a.id === primaryAccountId)?.name || '',
    accountType: accounts.find(a => a.id === primaryAccountId)?.type || 'Unknown',
    tf_signal: updatedForm.tf_signal || '1h',
  };

  // 🔹 Atualiza saldo das contas com impacto do P&L

 console.log('🚀 tradeData final:', tradeData);
  // 🔹 Salva trade
  try {
    await saveTrade(tradeData);
    onClose();
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
      <div className="modal-content ">
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
          <div className="card ">
            <h4 className="font-medium mb-4">Basic Info</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="field">
                <label>Asset *</label>
                <input 
                  className="input" 
                  value={form.asset || ''} 
                  onChange={e => setForm({ ...form, asset: e.target.value })}
                  placeholder="Ex: EURUSD, BTCUSD..." 
                />
              </div>
              <div className="field ">
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
          <div className="card ">
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
  <div className="card mt-3 md:col-span-4 p-0 overflow-x-auto">
    <div className="p-4 border-b">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        📈 Execuções Parciais
      </h3>
    </div>

    {form.PartialExecutions?.length > 0 ? (
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
              #
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Entrada
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Saída
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Volume
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[170px]">
              Data &amp; Hora
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
              Gross ($)
            </th>
            <th className="px-3 py-2 w-12"></th> {/* Coluna para o botão de lixeira */}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {form.PartialExecutions.map((exe, idx) => (
            <tr key={exe.id}>
              <td className="px-3 py-1.5 whitespace-nowrap text-sm text-gray-500">
                {idx + 1}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                <input
                  type="number"
                  className="input block w-full text-sm p-1.5"
                  value={exe.entryPrice || 0}
                  onChange={e => updatePartial(idx, 'entryPrice', parseFloat(e.target.value))}
                />
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                <input
                  type="number"
                  className="input block w-full text-sm p-1.5"
                  value={exe.exitPrice || 0}
                  onChange={e => updatePartial(idx, 'exitPrice', parseFloat(e.target.value))}
                />
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                <input
                  type="number"
                  className="input block w-full text-sm p-1.5"
                  value={exe.volume || 0}
                  onChange={e => updatePartial(idx, 'volume', parseFloat(e.target.value))}
                />
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                <input
                  type="datetime-local"
                  className="input block w-full text-sm p-1.5"
                  value={exe.entry_datetime ? formatLocalDatetime(exe.entry_datetime) : ""}
                  onChange={(e) =>
                    updatePartial(
                      idx,
                      "entry_datetime",
                      e.target.value ? toISOStringLocal(e.target.value) : ""
                    )
                  }
                />
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                <input
                  type="number"
                  className="input block w-full text-sm p-1.5"
                  step="0.01"
                  value={exe.result_gross || ""}
                  onChange={(e) =>
                    updatePartial(idx, "result_gross", parseFloat(e.target.value) || 0)
                  }
                />
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap text-center">
                <button
                  className="text-gray-400 hover:text-red-500 p-1 rounded-full transition-colors duration-150"
                  onClick={() => removePartial(idx)}
                  title="Remover execução"
                >
                  X
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="px-4 py-3 text-sm text-gray-500">Nenhuma execução parcial adicionada.</p>
    )}

    <div className="p-4 border-t">
      <button
        className="btn ghost"
        onClick={addPartial}
      >
        + Adicionar Execução
      </button>
    </div>
  </div>


            

<div className="field">
  <label>Entry Date & Time *</label>
  <input
    type="datetime-local"
    className="input"
    value={form.entry_datetime ? form.entry_datetime.slice(0, 16) : ""}
    onChange={e =>
      setForm({
        ...form,
        entry_datetime: e.target.value ? e.target.value : "",
      })
    }
  />
</div>

<div className="field">
  <label>Exit Date & Time</label>
  <input
    type="datetime-local"
    className="input"
    value={form.exit_datetime ? form.exit_datetime.slice(0, 16) : ""}
    onChange={e =>
      setForm({
        ...form,
        exit_datetime: e.target.value ? e.target.value : "",
      })
    }
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
             <div className="field flex items-center gap-2 mt-4">
  <input
    type="checkbox"
    checked={!!form.isBreakeven}
    onChange={(e) => setForm({ ...form, isBreakeven: e.target.checked })}
  />
  <label>Trade foi Break-even (sem ganho nem perda)</label>
</div>

            </div>
          </div>

          {/* Risk & Costs */}
          <div className="card">
            <h4 className="font-medium mb-4">Costs</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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