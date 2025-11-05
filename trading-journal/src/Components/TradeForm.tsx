import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { Trade, Execution, PartialExecution } from '../types/trade';
import { useJournal } from '@apps/journal-state';
import { useCurrency } from '@apps/state';
import { v4 as uuidv4 } from 'uuid';
import {getAll, createAccount,getTrades, createTrade, updateTrade, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
import RichTextEditor from '../Components/RichTextEditor';


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
  const [accountStatusFilter, setAccountStatusFilter] = useState<string[]>(["live", "funded", "challenge"]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
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
    
    // ... (commission, fees, swap, slippage, e.g. 0)
    // risk_per_R removido daqui também
    ...(editing || {}),
  }));

  // Filtrar contas ativas
const activeAccounts = useMemo(() => {
  let accs = accounts.filter(acc => ['Live', 'Funded', 'Challenge', 'Challenge Concluido'].includes(acc.status));
  
  // ✅ NOVO: Filtro por status selecionados
  if (accountStatusFilter.length > 0) {
    accs = accs.filter(acc => accountStatusFilter.includes(acc.status?.toLowerCase()));
  }
  
  return accs;
}, [accounts, accountStatusFilter]); // adicionar accountStatusFilter nas dependências
// Logo após o useMemo de activeAccounts
console.log('✅ Active Accounts:', activeAccounts.length, activeAccounts);
console.log('📊 All Accounts:', accounts.length, accounts);
// Extrair todos os status únicos das contas
const accountStatuses = useMemo<string[]>(() => {
  const all = (accounts || [])
    .map((a) => a.status?.toLowerCase() || "")
    .filter((s): s is string => !!s);
  return Array.from(new Set(all));
}, [accounts]);

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
// Quando a strategy do form muda, (re)inicializa checklistResults com as keys da strategy
useEffect(() => {
  const strat = strategies?.find(s => s.id === form.strategyId);
  if (strat && Array.isArray(strat.checklist)) {
    // manter valores já existentes em form.checklistResults quando possível
    const base = { ...(form.checklistResults || {}) };
    for (const item of strat.checklist) {
      if (base[item.id] === undefined) base[item.id] = false;
    }
    setForm(prev => ({ ...prev, checklistResults: base }));
  } else {
    setForm(prev => ({ ...prev, checklistResults: {} }));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [form.strategyId, strategies]);

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
const totals = useMemo(() => {
  const exs = form.PartialExecutions || [];
  const sumGross = exs.reduce((s, e) => s + (e.result_gross || 0), 0);
  const sumR = exs.reduce((s, e) => s + (e.result_R || 0), 0);
  const avgR = exs.length ? sumR / exs.length : 0;
  const firstEntry = exs
    .map(e => e.entry_datetime)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
  const lastExit = exs
    .map(e => e.exit_datetime)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return { sumGross, sumR, avgR, firstEntry, lastExit };
}, [JSON.stringify(form.PartialExecutions)]);

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

  // 1. P&L Bruto = SOMA dos result_gross das execuções parciais
  const result_gross = (form.PartialExecutions || []).reduce(
    (sum, exec) => sum + (Number(exec.result_gross) || 0), 
    0
  );
    
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
    form.PartialExecutions, 
    form.result_gross, 
    form.volume, 
    form.entry_price, 
    form.stop_loss_price, 
    form.commission, 
    form.fees, 
    form.swap, 
    form.slippage,
  ]);
  
 
  // 🧩 Execuções parciais
const addPartial = () => {
  setForm(f => ({
    ...f,
    PartialExecutions: [
      ...(f.PartialExecutions || []),
      {
        id: uuidv4(),
        entryPrice: 0,
        exitPrice: 0,
        volume: 0,
        result_gross: 0,
        result_R: 0,
        take_profit: 0,
        stop_loss: 0,
        entry_datetime: new Date().toISOString(),
        exit_datetime: null,
      },
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
  setForm((f) => {
    const updated = f.PartialExecutions.map((p, i) => {
      if (i !== idx) return p;
      
      const newExe = { ...p, [field]: value };
      
      // Recalcula R automaticamente
      const { entryPrice, exitPrice, stop_loss } = newExe;
      if (entryPrice && stop_loss && exitPrice) {
        const isLong = stop_loss < entryPrice;
        const risk = Math.abs(entryPrice - stop_loss);
        const diff = isLong ? exitPrice - entryPrice : entryPrice - exitPrice;
        newExe.result_R = risk > 0 ? diff / risk : 0;
      }
      
      return newExe;
    });
    
    return { ...f, PartialExecutions: updated };
  });
};



const handleSave = async () => {
  try {
    // 🔹 Recalcula antes de salvar
    recalc();

    // 🔹 Validações
    if (!form.asset?.trim()) return alert('Asset é obrigatório');
    if (!selectedAccounts.length) return alert('Selecione ao menos uma conta');
    if (!form.entry_datetime) return alert('Entry Date & Time é obrigatório');
    if (form.exit_datetime && form.exit_datetime < form.entry_datetime)
      
      return alert('Exit Date não pode ser anterior à Entry Date');

    // 🔹 Monta payload de contas
    const accountsPayload = selectedAccounts.map(id => ({
      accountId: id,
      weight: accountWeights[id] ?? 1 / selectedAccounts.length,
    }));

    const primaryAccountId = selectedAccounts[0];

    // 🔹 Atualiza médias e totais com base nas execuções parciais
    let updatedForm = { ...form };
    if (Array.isArray(updatedForm.PartialExecutions) && updatedForm.PartialExecutions.length > 0) {
      const totalVol = updatedForm.PartialExecutions.reduce((sum, e) => sum + (e.volume || 0), 0);
      const totalGross = updatedForm.PartialExecutions.reduce((sum, e) => sum + (Number(e.result_gross) || 0), 0);
      const avgEntry =
        totalVol > 0
          ? updatedForm.PartialExecutions.reduce((sum, e) => sum + (e.entryPrice * e.volume), 0) / totalVol
          : 0;
      const avgExit =
        totalVol > 0
          ? updatedForm.PartialExecutions.reduce((sum, e) => sum + (e.exitPrice * e.volume), 0) / totalVol
          : 0;

      updatedForm.entry_price = avgEntry;
      updatedForm.exit_price = avgExit;
      updatedForm.result_gross = totalGross;
      updatedForm.volume = totalVol;
    }
// ✅ Garante que entry_datetime e exit_datetime do trade
// sempre reflitam o período total das PartialExecutions
if (Array.isArray(updatedForm.PartialExecutions) && updatedForm.PartialExecutions.length > 0) {
  const validEntries = updatedForm.PartialExecutions
    .map(e => e.entry_datetime)
    .filter(d => !!d);
  const validExits = updatedForm.PartialExecutions
    .map(e => e.exit_datetime)
    .filter(d => !!d);

  if (validEntries.length > 0) {
    updatedForm.entry_datetime = validEntries.sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    )[0];
  }

  if (validExits.length > 0) {
    updatedForm.exit_datetime = validExits.sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    )[0];
  } else {
    // Ainda sem saída? então mantemos null para dashboard entender como trade em aberto
    updatedForm.exit_datetime = null;
  }
}

    // 🔹 Prepara tradeData final
    const tradeData = {
      ...updatedForm,
      id: editing?.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      entry_datetime: updatedForm.entry_datetime,
      exit_datetime: updatedForm.exit_datetime || null,
      accounts: accountsPayload,
      accountId: primaryAccountId,
      accountName: accounts.find(a => a.id === primaryAccountId)?.name || '',
      accountType: accounts.find(a => a.id === primaryAccountId)?.type || 'Unknown',
      tf_signal: updatedForm.tf_signal || '1h',
      checklistResults: updatedForm.checklistResults ?? {},
    };
    

    console.log('💾 Salvando trade:', tradeData);

    await saveTrade(tradeData);

    onClose();
  } catch (err) {
    console.error('❌ Erro ao salvar trade:', err);
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
//Para filtrar as checklists da estrategia
const selectedStrategy = strategies.find(s => s.id === form.strategyId);

// Fechar dropdown ao clicar fora
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
<div className="card">
  <h4 className="font-medium mb-4">Basic Info</h4>
  <div className="basic-info-grid">
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
        <option value="">Selecione</option>
        <option value="Long">Long</option>
        <option value="Short">Short</option>
      </select>
    </div>

    <div className="field">
      <label>Timeframe da Operação</label>
      <input
        className="input"
        value={form.tf_signal || ''}
        onChange={(e) => setForm({ ...form, tf_signal: e.target.value })}
        placeholder="Ex: H1, M15, Diário"
      />
    </div>
  </div>
</div>
         
{/* Account Selection */}
<div className="card account-selection-card">
  <h4 className="font-medium mb-4 flex items-center gap-2">
    🏦 Seleção de Contas
    {selectedAccounts.length > 0 && (
      <span className="badge-count">{selectedAccounts.length}</span>
    )}
  </h4>
  
  {/* Filtro de Categoria */}
  <div className="account-filter">
    <div className="field">
      <label>📂 Categorias de Contas</label>
      <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
        <option value="">🌐 Todas as Categorias</option>
        <option value="Forex">💱 Forex</option>
        <option value="Futures">📈 Futures</option>
        <option value="Cripto">₿ Cripto</option>
        <option value="Personal">👤 Personal</option>
      </select>
    </div>
    {/* Logo após o select de Categorias de Contas */}

{/* Dropdown de Status */}
<div className="field" style={{ position: 'relative' }} ref={statusDropdownRef}>
  <label>📊 Status das Contas</label>
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen(v => !v); }}
    className="input"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      cursor: "pointer",
      textAlign: "left"
    }}
  >
    {accountStatusFilter.length > 0
      ? `${accountStatusFilter.length} status selecionados`
      : "Selecionar status"}
    <span style={{ opacity: 0.7, marginLeft: 8 }}>▾</span>
  </button>

  {statusDropdownOpen && accountStatuses.length > 0 && (
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
        minWidth: "100%",
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
          type="button"
          className="btn ghost small"
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => setAccountStatusFilter(["live", "funded", "challenge"])}
        >
          Padrão
        </button>

        <button
          type="button"
          className="btn ghost small"
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => setAccountStatusFilter(accountStatuses.slice())}
        >
          Todos
        </button>
      </div>
    </div>
  )}
</div>
  </div>

  {/* Multi-select de Contas com botões de ação */}
  <div className="field">
    <div className="flex items-center justify-between mb-2">
      <label className="mb-0">💼 Contas Disponíveis *</label>
      <div className="account-actions">
        <button
          className="account-action-btn"
          onClick={() => setSelectedAccounts(filteredAccounts.map(a => a.id))}
          type="button"
        >
          ✓ Todas
        </button>
        <button
          className="account-action-btn"
          onClick={() => setSelectedAccounts([])}
          type="button"
        >
          ✕ Limpar
        </button>
      </div>
    </div>
    <p className="text-xs text-muted mb-2">Selecione múltiplas com Ctrl/Cmd</p>
<select 
  className="account-multiselect input"
  multiple
  size={Math.min(5, filteredAccounts.length)}
  value={selectedAccounts}
  onChange={e => {
    const options = e.target.options;
    const selected: string[] = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selected.push(options[i].value);
      }
    }
    setSelectedAccounts(selected);
  }}
>
  {filteredAccounts.map(acc => (
    <option key={acc.id} value={String(acc.id)}>
      {acc.name} [{acc.status}] ({acc.type}) - ${acc.currentFunding?.toLocaleString()}
    </option>
  ))}
</select>
  </div>

 {/* Pesos das Contas - Grid 3 colunas scrollable */}
{selectedAccounts.length > 0 && (
  <div className="account-weights-section">
    <div className="section-title">
      ⚖️ Pesos das Contas
      <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--muted)' }}>
        (Defina o peso de cada conta)
      </span>
    </div>
    <div className="account-weights-grid">
      {selectedAccounts.map(id => {
        const acc = accounts.find(a => a.id === id);
        return (
          <div key={id} className="account-weight-item">
            <span title={acc?.name}>{acc?.name}</span>
            <input
              type="number"
              className="input account-weight-input"
              placeholder="Peso"
              value={accountWeights[id] ?? ''}
              onChange={(e) => setAccountWeights({...accountWeights, [id]: Number(e.target.value)})}
              min="0"
              step="0.1"
            />
          </div>
        );
      })}
    </div>
  </div>
)}

  {/* Preview das Contas Selecionadas - Grid 2x2 scrollable */}
  {selectedAccounts.length > 0 && (
    <div className="selected-accounts-preview">
      <div className="section-title">
        ✅ Contas Selecionadas
      </div>
      <div className="selected-accounts-grid">
        {selectedAccounts.map(accountId => {
          const acc = accounts.find(a => a.id === accountId);
          return acc ? (
            <div key={accountId} className="selected-account-card">
              <span className={`pill ${getAccountTypeClass(acc.type)}`}>
                {acc.type}
              </span>
              <div className="selected-account-info">
                <div className="font-medium">{acc.name}</div>
                <div className="text-sm text-muted">
                  ${acc.currentFunding?.toLocaleString()}
                  {accountWeights[accountId] && (
                    <span style={{ marginLeft: '4px', color: 'var(--primary)' }}>
                      • Peso: {accountWeights[accountId]}x
                    </span>
                  )}
                </div>
              </div>
              <button 
                className="account-remove-btn"
                onClick={() => setSelectedAccounts(prev => prev.filter(id => id !== accountId))}
                title="Remover conta"
                type="button"
              >
                ×
              </button>
            </div>
          ) : null;
        })}
      </div>
    </div>
  )}
</div>

          {/* Strategy */}
          <div className="card ">
            <h4 className="font-medium mb-4">Estratégia</h4>
            <div className="field">
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
              
              {selectedStrategy?.checklist && selectedStrategy.checklist.length > 0 && (
  <div className="mt-4">
    <h5 className="font-medium ">Checklist:</h5>
    <div className="flex flex-col gap-2 mt-2">
      {selectedStrategy.checklist.map(item => (
        <label key={item.id} className="flex items-center gap-2 px-3 py-2 bg-soft rounded-lg text-sm">
          <input
            type="checkbox"
            checked={!!form.checklistResults?.[item.id]}
            onChange={(e) => setForm(prev => ({
              ...prev,
              checklistResults: { ...(prev.checklistResults || {}), [item.id]: e.target.checked }
            }))}
          />
          <span>{item.title}</span>
        </label>
      ))}
     
    </div>
  </div>
)}
            </div>
          </div>


{/* ===================== EXECUÇÕES PARCIAIS ===================== */}
<div className="grid grid-cols-1 gap-4 md:grid-cols-1">
  <div className="card mt-3 md:col-span-1 p-0 overflow-hidden relative">
    {/* Cabeçalho da Seção */}
    <div className="p-4 border-b bg-panel">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-100">
        📊 Execuções Parciais
      </h3>
    </div>

    {/* Lista de Execuções */}
    {form.PartialExecutions?.length > 0 ? (
      <div className="p-4 space-y-5 bg-soft/30">
        {form.PartialExecutions.map((exe, idx) => (
          <div key={exe.id} className="exec-card relative">
            {/* Cabeçalho da Execução */}
            <div className="exec-card-header">
              <div className="exec-card-header-left">
                <div className="exec-card-number">{idx + 1}</div>
                <span className="font-medium text-gray-200">
                  Execução #{idx + 1}
                </span>
              </div>
            </div>

            {/* Botão “X” flutuante */}
            <button
              className="exec-remove-btn"
              onClick={() => removePartial(idx)}
              title="Remover execução"
            >
              ×
            </button>

            {/* === Linha 1 === */}
            <div className="exec-grid cols-4">
              <div>
                <label>💰 Entrada</label>
                <input
                  type="number"
                  className="input"
                  value={exe.entryPrice || ""}
                  onChange={(e) =>
                    updatePartial(idx, "entryPrice", parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              <div>
                <label>📅 Data Entrada</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={exe.entry_datetime ? formatLocalDatetime(exe.entry_datetime) : ""}
                  onChange={(e) =>
                    updatePartial(
                      idx,
                      "entry_datetime",
                      e.target.value ? toISOStringLocal(e.target.value) : ""
                    )
                  }
                />
              </div>

              <div>
                <label>💵 Saída</label>
                <input
                  type="number"
                  className="input"
                  value={exe.exitPrice || ""}
                  onChange={(e) =>
                    updatePartial(idx, "exitPrice", parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              <div>
                <label>📅 Data Saída</label>
                <input
                  type="datetime-local"
                  className="input"
min={
    exe.entry_datetime
      ? formatLocalDatetime(exe.entry_datetime)
      : undefined
  }
  value={exe.exit_datetime ? formatLocalDatetime(exe.exit_datetime) : ""}
  onChange={(e) =>
    updatePartial(
      idx,
      "exit_datetime",
      e.target.value ? toISOStringLocal(e.target.value) : ""
    )
  }
/>
              </div>
            </div>

            {/* === Linha 2 === */}
            <div className="exec-grid cols-5">
              <div>
                <label>🎯 Take Profit</label>
                <input
                  type="number"
                  className="input"
                  value={exe.take_profit || ""}
                  onChange={(e) =>
                    updatePartial(idx, "take_profit", parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              <div>
                <label>🛑 Stop Loss</label>
                <input
                  type="number"
                  className="input"
                  value={exe.stop_loss || ""}
                  onChange={(e) =>
                    updatePartial(idx, "stop_loss", parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              <div>
                <label>📦 Volume</label>
                <input
                  type="number"
                  className="input"
                  value={exe.volume || ""}
                  onChange={(e) =>
                    updatePartial(idx, "volume", parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              <div>
                <label>📈 R</label>
                <input
                  type="number"
                  className="input"
                  value={exe.result_R || ""}
                  onChange={(e) =>
                    updatePartial(idx, "result_R", parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              <div>
                <label>💲 Gross ($)</label>
                <input
                  type="number"
                  className="input"
                  value={exe.result_gross || ""}
                  onChange={(e) =>
                    updatePartial(idx, "result_gross", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="p-8 text-center text-gray-400">
        Nenhuma execução parcial adicionada
      </div>
    )}

    {/* Botão Adicionar Execução */}
    <div className="border-t border-soft">
      <button
        className="exec-add-btn"
        onClick={addPartial}
      >
        <span className="icon">➕</span> Adicionar Execução
      </button>
    </div>
  </div>
</div>



{/* Risk & Costs */}
<div className="card">
  <h4 className="font-medium mb-4">Costs</h4>
  <div className="costs-grid">
    <div className="field">
      <label>Comissão ($)</label>
      <input 
        className="input"
        step="0.01" 
        type="number" 
        value={form.commission || ''} 
        onChange={e => setForm({ ...form, commission: Number(e.target.value)||0 })} 
        placeholder="0.00"
      />
    </div>
    <div className="field">
      <label>Fees ($)</label>
      <input 
        className="input"
        step="0.01" 
        type="number" 
        value={form.fees || ''} 
        onChange={e => setForm({ ...form, fees: Number(e.target.value)||0 })} 
        placeholder="0.00"
      />
    </div>
    <div className="field">
      <label>Swap ($)</label>
      <input
        type="number"
        step="0.01"
        className="input"
        value={form.swap || ''}
        onChange={(e) => setForm({ ...form, swap: Number(e.target.value) || 0 })}
        placeholder="0.00"
      />
    </div>
  </div>
</div>

{/* Notes */}
<div className="card">
  <h4 className="font-medium mb-4">📝 Observações</h4>
  <div className="field">
    <RichTextEditor
      value={form.notes || ''}
      onChange={(content) => setForm({ ...form, notes: content })}
      placeholder="Escreva suas observações sobre o trade... 
      
- Use / para comandos
- Arraste blocos para reordenar  
- Cole ou arraste imagens"
    />
  </div>
</div>

          {/* Summary */}
 <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
  <div className="card accent3">
    <div className="muted text-xs">P&L Bruto</div>
    <div className={`stat ${totals.sumGross >= 0 ? "pos" : "neg"}`}>
      ${fmt(totals.sumGross)}
    </div>
  </div>

  <div className="card accent4">
    <div className="muted text-xs">R Total</div>
    <div className={`stat ${totals.sumR >= 0 ? "pos" : "neg"}`}>
      {totals.sumR.toFixed(2)} R
    </div>
  </div>

  <div className="card accent5">
    <div className="muted text-xs">R Médio</div>
    <div className={`stat ${totals.avgR >= 0 ? "pos" : "neg"}`}>
      {totals.avgR.toFixed(2)} R
    </div>
  </div>

  <div className="card accent2">
    <div className="muted text-xs">Período Execuções</div>
    <div className="text-sm">
      {totals.firstEntry
        ? `${new Date(totals.firstEntry).toLocaleDateString()} → ${
            totals.lastExit
              ? new Date(totals.lastExit).toLocaleDateString()
              : new Date(totals.firstEntry).toLocaleDateString()
          }`
        : "—"}
    </div>
  </div>

  <div className="card accent1">
    <div className="muted text-xs">P&L Líquido</div>
    <div className={`stat ${(form.result_net || 0) >= 0 ? "pos" : "neg"}`}>
      ${fmt(form.result_net || 0)}
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