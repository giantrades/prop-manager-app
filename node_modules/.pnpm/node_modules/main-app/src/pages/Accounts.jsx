// main-app/src/pages/Accounts.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useCurrency } from '@apps/state'
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
import { X } from "lucide-react"; // ícone de fechar
const statuses = ['Live','Funded','Challenge','Challenge Concluido','Standby']
const types = ['Futures', 'Forex','Personal' ,'Cripto' ]

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [firms, setFirms] = useState([])
  // ✅ NOVO: Estados para filtro de status
  const [accountStatusFilter, setAccountStatusFilter] = useState(["live", "funded", "challenge"]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);

  useEffect(() => {
  const data = getAll()
  setAccounts(data.accounts || [])
  setFirms(data.firms || [])}, []) 

  const { currency, rate } = useCurrency()
  const [selected, setSelected] = useState(null) // 'new' or accountId
  const [query, setQuery] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'dateCreated', direction: 'desc' })
  
  // Mantém sincronizado com o localStorage quando outros componentes/páginas alteram
  useEffect(() => {
    const sync = () => {
      const data = getAll()
      setAccounts(data.accounts || [])
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  // Filter accounts based on search query
// ✅ MODIFICADO: Filtrar por busca E status
  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      const matchesSearch = (a.name || '').toLowerCase().includes(query.toLowerCase());
      const matchesStatus = accountStatusFilter.length === 0 || 
                           accountStatusFilter.includes(a.status?.toLowerCase());
      return matchesSearch && matchesStatus;
    });
  }, [accounts, query, accountStatusFilter]);
  // Sort accounts based on current sort configuration
  const sortedAccounts = useMemo(() => {
    if (!sortConfig.key) return filteredAccounts

    return [...filteredAccounts].sort((a, b) => {
      let aValue = a[sortConfig.key]
      let bValue = b[sortConfig.key]

      // Handle special cases for sorting
      if (sortConfig.key === 'roi') {
        const aStats = getAccountStats(a.id) || { roi: 0 }
        const bStats = getAccountStats(b.id) || { roi: 0 }
        aValue = aStats.roi
        bValue = bStats.roi
      } else if (sortConfig.key === 'totalPayouts') {
        const aStats = getAccountStats(a.id) || { totalPayouts: 0 }
        const bStats = getAccountStats(b.id) || { totalPayouts: 0 }
        aValue = aStats.totalPayouts
        bValue = bStats.totalPayouts
      } else if (sortConfig.key === 'dateCreated') {
        aValue = new Date(aValue)
        bValue = new Date(bValue)
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase()
        bValue = bValue.toLowerCase()
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredAccounts, sortConfig, getAccountStats])

  // Handle sorting when clicking on table headers
  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Get sort indicator for table headers
  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ''
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

  // Handle account deletion
  const handleDelete = (e, accountId) => {
    e.stopPropagation() // Prevent row selection when clicking delete
    deleteAccount(accountId)
    setAccounts(getAll().accounts)
    if (selected === accountId) setSelected(null)
  }

  const fmt = (v) => currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  // Helper to get firm object by id
  const findFirm = (id) => firms.find(f => f.id === id) || null
// ==== SUMMARY STATS ====
const summary = useMemo(() => {
  const total = accounts.length

  const byType = types.map((type) => ({
    label: type,
    value: accounts.filter((a) => a.type === type).length,
    pillClass:
      type === 'Futures'
        ? 'pink'
        : type === 'Forex'
        ? 'lavander'
        : type === 'Cripto'
        ? 'orange'
        : type === 'Personal'
        ? 'purple'
        : 'gray',
  }))

  const byStatus = statuses.map((status) => ({
    label: status,
    value: accounts.filter((a) => a.status === status).length,
    pillClass:
      status === 'Live'
        ? 'green'
        : status === 'Funded'
        ? 'blue'
        : status === 'Challenge'
        ? 'yellow'
        : status === 'Challenge Concluido'
        ? 'yellow'
        : 'gray',
  }))

  return { total, byType, byStatus }
}, [accounts])

// ✅ NOVO: Fechar dropdown ao clicar fora
  useEffect(() => {
    function onDocClick(e) {
      if (!statusDropdownRef.current) return;
      if (!statusDropdownRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
      }
    }
    if (statusDropdownOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [statusDropdownOpen]);

  // ✅ NOVO: Obter todos os status disponíveis
  const accountStatuses = useMemo(() => {
    const all = (accounts || [])
      .map((a) => a.status?.toLowerCase() || "")
      .filter((s) => !!s);
    return Array.from(new Set(all));
  }, [accounts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
{/* === CARDS DE RESUMO === */}
<div
  style={{
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  }}
>
  {/* --- TOTAL --- */}
  <div
    style={{
      flex: 1,
      background: 'linear-gradient(180deg, var(--card-bg, #0b1018) 0%, var(--background, #0f172a) 100%)',
      borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
      padding: '16px 24px',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
    className="hover-card"
  >
    <h4 style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted, #b4b8c0)' }}>
      Total de Contas
    </h4>
    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-strong, #fff)' }}>
      {accounts.length}
    </div>
  </div>

  {/* --- POR CATEGORIA --- */}
  <div
    style={{
      flex: 1,
      background: 'linear-gradient(180deg, var(--card-bg, #0b1018) 0%, var(--background, #0f172a) 100%)',
      borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
      padding: '16px 24px',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
  >
    <h4 style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted, #b4b8c0)' }}>
      Por Categoria
    </h4>
    {types.map((type) => {
      const count = accounts.filter((a) => a.type === type).length
      const color =
        type === 'Forex' ? 'lavander' :
        type === 'Cripto' ? 'orange' :
        type === 'Futures' ? 'pink' :
        type === 'Personal' ? 'purple' :
        'gray'

      return (
        <div
          key={type}
          style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}
        >
          {count > 0 && (
            <span
              className={`pill ${color}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 22,
                borderRadius: '9999px',
                fontSize: 13,
                fontWeight: 600,
                marginRight: 8,
                padding: '0 6px',
                transition: 'all 0.3s ease',
              }}
            >
              {count}
            </span>
          )}
          <span>{type}</span>
        </div>
      )
    })}
  </div>

  {/* --- POR STATUS --- */}
  <div
    style={{
      flex: 1,
      background: 'linear-gradient(180deg, var(--card-bg, #0b1018) 0%, var(--background, #0f172a) 100%)',
      borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
      padding: '16px 24px',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
  >
    <h4 style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted, #b4b8c0)' }}>
      Por Status
    </h4>
    {statuses.map((status) => {
      const count = accounts.filter((a) => a.status === status).length
      const color =
        status === 'Live' ? 'green' :
        status === 'Funded' ? 'blue' :
        status === 'Challenge' ? 'yellow' :
        status === 'Challenge Concluido' ? 'yellow' :
        status === 'Standby' ? 'gray' :
        'gray'

      return (
        <div
          key={status}
          style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}
        >
          {count > 0 && (
            <span
              className={`pill ${color}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 22,
                borderRadius: '9999px',
                fontSize: 13,
                fontWeight: 600,
                marginRight: 8,
                padding: '0 6px',
                transition: 'all 0.3s ease',
              }}
            >
              {count}
            </span>
          )}
          <span>{status}</span>
        </div>
      )
    })}
  </div>
</div>


{/* ✅ FORMS COMO POPUPS MODAIS */}
      {selected && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            maxWidth: 800,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            {/* Botão X para fechar */}
            <button
              onClick={() => setSelected(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: 24,
                cursor: 'pointer',
                zIndex: 1001,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              ×
            </button>

            {selected === 'new' ? (
              <NewAccountForm
                firms={firms}
                onCreate={(accountData) => {
                  const newAccount = createAccount(accountData)
                  setAccounts(getAll().accounts)
                  setSelected(null) // ✅ Fecha o popup após criar
                }}
                onCancel={() => setSelected(null)}
              />
            ) : (
              <AccountDetail
                id={selected}
                update={updateAccount}
                getStats={getAccountStats}
                firms={firms}
                onClose={() => setSelected(null)}
              />
            )}
          </div>
        </div>
      )}

{/* Toolbar + Filtro + Create */}
      <div>
        <div className="toolbar" style={{ 
          marginBottom: 12, 
          display: 'flex', 
          gap: 12, 
          alignItems: 'center',
          flexWrap: 'wrap' 
        }}>
          {/* Busca */}
          <input 
            className="input" 
            placeholder="Search accounts..." 
            value={query} 
            onChange={e => setQuery(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
          
          {/* ✅ NOVO: Filtro de Status */}
          <div style={{ position: 'relative', flex: '0 0 auto' }} ref={statusDropdownRef}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen(v => !v); }}
              className="input"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                minWidth: 200,
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
                    onClick={() => setAccountStatusFilter(["live", "funded", "challenge"])}
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

          {/* Botão Criar */}
          <button className="btn" onClick={() => setSelected('new')} style={{ flex: '0 0 auto' }}>
            + Create Account
          </button>
        </div>

        {/* Accounts table */}
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dateCreated')}>
                  Data Criada<span style={{ float: 'right' }}>{getSortIndicator('dateCreated')}</span>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                  Conta<span style={{ float: 'right' }}>{getSortIndicator('name')}</span>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('type')}>
                  Categoria<span style={{ float: 'right' }}>{getSortIndicator('type')}</span>
                </th>
                <th style={{ cursor: 'pointer' }}>
                  Empresa
                </th>
                <th className='center' style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                  Status<span style={{ float: 'right' }}>{getSortIndicator('status')}</span>
                </th>
                <th className='center' style={{ cursor: 'pointer' }} onClick={() => handleSort('roi')}>
                  %<span style={{ float: 'right' }}>{getSortIndicator('roi')}</span>
                </th>
                <th className='center' style={{ cursor: 'pointer' }} onClick={() => handleSort('profitSplit')}>
                  Split<span style={{ float: 'right' }}>{getSortIndicator('profitSplit')}</span>
                </th>
                <th className='center' style={{ cursor: 'pointer' }} onClick={() => handleSort('totalPayouts')}>
                  Payouts<span style={{ float: 'right' }}>{getSortIndicator('totalPayouts')}</span>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('initialFunding')}>
                  Inicial<span style={{ float: 'right' }}>{getSortIndicator('initialFunding')}</span>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('currentFunding')}>
                  Atual<span style={{ float: 'right' }}>{getSortIndicator('currentFunding')}</span>
                </th>
                <th style={{ cursor: 'pointer', width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map(a => {
                const pill = a.status === 'Live' ? 'green' : a.status === 'Funded' ? 'blue' : a.status === 'Challenge' ? 'yellow' : a.status === 'Challenge Concluido'? 'yellow' : 'gray'
                const typePill = a.type === 'Forex' ? 'lavander' : a.type === 'Cripto' ? 'orange' : a.type === 'Futures' ? 'pink' : a.type === 'Personal' ? 'purple' : 'gray';
                const s = getAccountStats(a.id) || { roi: 0, totalPayouts: 0 }
                const roiPct = (s.roi * 100).toFixed(2)
                const roiClass = s.roi >= 0 ? 'value-green' : 'value-red'
                const firm = findFirm(a.firmId)
                return (
                  <tr key={a.id} onClick={() => setSelected(a.id)} style={{ cursor: 'pointer' }}>
                    <td>{new Date(a.dateCreated).toLocaleDateString('pt-BR')}</td>
                    <td>{a.name}</td>
                    <td className="center"><span className={'pill ' + typePill}>{a.type}</span></td>

                    {/* Firm column with small logo + name */}
                    <td>
                      {firm ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {firm.logo ? <img src={firm.logo} alt={firm.name} style={{ width: 36, height: 20, objectFit: 'contain' }} /> : null}
                          <span>{firm.name}</span>
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>

                    <td className="center"><span className={'pill ' + pill}>{a.status}</span></td>
                    <td className={"center " + roiClass}>{roiPct}%</td>
                    <td className="center">{Math.round((a.profitSplit || 0) * 100)}%</td>
                    <td className="center">{fmt(s.totalPayouts)}</td>
                    <td>{fmt(a.initialFunding)}</td>
                    <td>{fmt(a.currentFunding)}</td>
                    <td className="center">
                      <button
                        className="btn ghost"
                        onClick={(e) => handleDelete(e, a.id)}
                        style={{ padding: '4px 8px', fontSize: '14px', color: '#e74c3c', minWidth: 'auto' }}
                        title="Excluir conta"
                      >
                        X
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* -----------------------------
   NewAccountForm (used above)
   ----------------------------- */
function NewAccountForm({ onCreate, onCancel, firms = [] }) {
  const [form, setForm] = useState({
    name: 'New Account',
    type: 'Futures',
    firmId: null,
    status: 'Standby',
    dateCreated: new Date().toISOString().split('T')[0],
    payoutFrequency: 'monthly',
    initialFunding: 0,
    currentFunding: 0,
    profitSplit: 0.8,
    defaultWeight: 1 
  })

  const handleSubmit = () => {
    // basic validation
    if (!form.name) return alert('Nome é obrigatório')
    onCreate(form)
  }

  // preview firm logo
  const selectedFirm = firms.find(f => f.id === form.firmId) || null

  return (
    <div className="card">
      <h3>➕ Nova Conta</h3>
      <div className="field">
        <label>Nome</label>
        <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      </div>

      <div className="row">
        <div className="field">
          <label>Categoria</label>
          <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, firmId: null })}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Empresa</label>
          <select
            className="select"
            value={form.firmId || ''}
            onChange={e => setForm({ ...form, firmId: e.target.value || null })}
          >
            <option value=''>— Nenhuma —</option>
            {firms.filter(f => f.type === form.type).map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          {selectedFirm && selectedFirm.logo && (
            <div style={{ marginTop: 6 }}>
              <img src={selectedFirm.logo} alt={selectedFirm.name} style={{ width: 80, height: 36, objectFit: 'contain' }} />
            </div>
          )}
        </div>

        <div className="field">
          <label>Status</label>
          <select className="select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Data Criada</label>
          <input type="date" className="input" value={form.dateCreated} onChange={e => setForm({ ...form, dateCreated: e.target.value })} />
        </div>
        <div className="field">
          <label>Frequência de Payout</label>
          <select className="select" value={form.payoutFrequency} onChange={e => setForm({ ...form, payoutFrequency: e.target.value })}>
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="monthly">Mensal</option>
          </select>
        </div>
      </div>

      <div className="row">
  <div className="field">
    <label>Funding Inicial</label>
    <input
      type="number"
      className="input"
      value={form.initialFunding}
      onChange={e => {
        const value = parseFloat(e.target.value) || 0;
        setForm({
          ...form,
          initialFunding: value,
          currentFunding: value, // ← sincroniza automaticamente ao criar
        });
      }}
    />
  </div>

  <div className="field">
    <label>Funding Atual</label>
    <input
      type="number"
      className="input"
      value={form.currentFunding}
      readOnly // ← torna não editável durante criação
      style={{ opacity: 0.7, cursor: 'not-allowed' }}
    />
  </div>
</div>


      <div className="field">
        <label>Profit Split (%)</label>
        <input type="number" step="1" className="input" value={Math.round(form.profitSplit*100) || 0} onChange={e => setForm({ ...form, profitSplit: parseFloat(e.target.value) / 100 || 0 })} style={{ flexGrow: 1 }}/>
      
      </div>

      <div className="toolbar">
        <button className="btn" onClick={handleSubmit}>Salvar</button>
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

/* -----------------------------
   AccountDetail (edit pane)
   ----------------------------- */
function AccountDetail({ id, update, getStats, firms = [], onClose }) {
  const { currency, rate } = useCurrency();
  const [local, setLocal] = useState(null);

  // carrega a conta atual do localStorage
  useEffect(() => {
    const data = getAll();
    const acc = data.accounts.find(a => a.id === id) || null;
    setLocal(acc);
  }, [id]);

  if (!local) return <div className="card">Conta não encontrada</div>;

  const s = getStats(id) || { roi: 0, totalPayouts: 0, lastPayoutAmount: 0, nextPayout: null };

  const fmt = (v) =>
    currency === "USD"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0)
      : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((v || 0) * rate);

  const save = () => {
    const payload = {
      ...local,
      initialFunding: Number(local.initialFunding) || 0,
      currentFunding: Number(local.currentFunding) || 0,
      profitSplit: Number(local.profitSplit) || 0,
    };

    updateAccount(id, payload); // ✅ já atualiza no dataStore e localStorage

    // dispara evento de storage manualmente (para outras páginas atualizarem)
    window.dispatchEvent(new Event("storage"));

    if (onClose) onClose();
  };

  // filtra as firmas compatíveis com o tipo da conta
  const firmsForType = firms.filter((f) => f.type === (local.type || ""));

  return (
    <div className="card">
      <h3>📋 Conta</h3>

      <div className="field">
        <label>Nome</label>
        <input
          className="input"
          value={local.name || ""}
          onChange={(e) => setLocal({ ...local, name: e.target.value })}
        />
      </div>

      <div className="row">
        <div className="field">
          <label>Categoria</label>
          <select
            className="select"
            value={local.type || ""}
            onChange={(e) => setLocal({ ...local, type: e.target.value, firmId: null })}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Empresa</label>
          <select
            className="select"
            value={local.firmId || ""}
            onChange={(e) => setLocal({ ...local, firmId: e.target.value || null })}
          >
            <option value="">— Nenhuma —</option>
            {firmsForType.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {local.firmId &&
            (() => {
              const fm = firms.find((x) => x.id === local.firmId);
              return fm ? (
                <div style={{ marginTop: 6 }}>
                  <img
                    src={fm.logo}
                    alt={fm.name}
                    style={{ width: 80, height: 36, objectFit: "contain" }}
                  />
                </div>
              ) : null;
            })()}
        </div>

        <div className="field">
          <label>Status</label>
          <select
            className="select"
            value={local.status || ""}
            onChange={(e) => setLocal({ ...local, status: e.target.value })}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Data Criada</label>
          <input
            type="date"
            className="input"
            value={local.dateCreated || ""}
            onChange={(e) => setLocal({ ...local, dateCreated: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Frequência de Payout</label>
          <select
            className="select"
            value={local.payoutFrequency || ""}
            onChange={(e) => setLocal({ ...local, payoutFrequency: e.target.value })}
          >
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="monthly">Mensal</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Funding Inicial</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={local.initialFunding || 0}
            onChange={(e) => {
        const value = parseFloat(e.target.value) || 0;
        setLocal({ ...local, initialFunding: parseFloat(value.toFixed(2)) });  // ← ajustar
      }}
          />
        </div>
        <div className="field">
          <label>Funding Atual</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={local.currentFunding || 0}
            onChange={(e) => {
        const value = parseFloat(e.target.value) || 0;
        setLocal({ ...local, currentFunding: parseFloat(value.toFixed(2)) });  // ← ajustar
      }}
          />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Profit Split (%)</label>
          <input
            type="number"
            step="1"
            className="input"
            value={Math.round(local.profitSplit * 100) || 0}
            onChange={(e) =>
              setLocal({ ...local, profitSplit: parseFloat(e.target.value) / 100 || 0 })
            }
            style={{ flexGrow: 1 }}
          />
        </div>
        <div className="field">
          <label>%</label>
          <div className="input" style={{ opacity: 0.8 }} readOnly>
            {(s.roi * 100).toFixed(2)}%
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, marginBottom: 8 }}>
  <h4 style={{ margin: '6px 0' }}>📂 Payouts & Comprovantes</h4>

  {(() => {
    const allData = getAll();
    const accountPayouts = (allData.payouts || []).filter((p) =>
      (p.splitByAccount && p.splitByAccount[id]) ||
      (p.accountIds && p.accountIds.includes(id))
    );

    if (accountPayouts.length === 0) {
      return (
        <div style={{ color: 'var(--muted)', padding: 8 }}>
          Nenhum payout registrado para esta conta.
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 8 }}>
{accountPayouts.map((p) => {
  const part = p.splitByAccount?.[id] || {};

  const net = part.net ?? 0;                          
  const gross = part.gross ?? p.amountSolicited ?? 0; 
  const fee = part.fee ?? (gross - net);             

  const formattedGross = fmt(gross || 0);
  const formattedFee = fmt(fee || 0);

  const rawDate = p.approvedDate || p.dateCreated || p.date || '';
  const formattedDate = rawDate
    ? new Date(rawDate).toLocaleDateString('pt-BR')
    : '';

  const displayName = `Payout: ${fmt(net || 0)} (${formattedDate})`;

  const attachment = p.attachments?.[id] || null;

  // ✅ Função para abrir automaticamente o payout na página Payouts
  const openPayoutPage = () => {
    localStorage.setItem('openPayoutId', p.id); // será lido em Payouts.jsx
    window.location.href = '/payouts';          // ajuste se sua rota for diferente
  };

  return (
    <div
      key={p.id}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        borderRadius: 8,
        background: 'var(--card-bg)',
      }}
    >
      <div>
        {/* ✅ Título clicável */}
        <div
          style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          onClick={openPayoutPage}
        >
          {displayName}
        </div>

        {/* ✅ Subtexto apenas com Gross e Fee */}
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Gross: {formattedGross} • Fee: {formattedFee}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {attachment ? (
          <>
            <button
              className="btn ghost small"
              onClick={() =>
                window.open(attachment.url, '_blank', 'noopener,noreferrer')
              }
            >
              📁 Ver
            </button>
            <a
              className="btn small"
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              download
            >
              ⬇️ Baixar
            </a>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sem comprovante</div>
        )}
      </div>
    </div>
  );
})}

      </div>
    );
  })()}
</div>


      <div className="toolbar">
        <button className="btn" onClick={save}>
          Salvar
        </button>
        <button className="btn ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

