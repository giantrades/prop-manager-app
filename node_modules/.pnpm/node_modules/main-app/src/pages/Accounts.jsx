// main-app/src/pages/Accounts.jsx
import React, { useMemo, useState, useEffect } from 'react'
import { useData } from '@apps/state'
import { useCurrency } from '@apps/state'

const statuses = ['Standby', 'Live', 'Challenge', 'Funded']
const types = ['Futures', 'Forex', 'Cripto', 'Personal']

export default function Accounts() {
  const { accounts = [], createAccount, updateAccount, deleteAccount, getAccountStats, firms = [] } = useData()
  const { currency, rate } = useCurrency()
  const [selected, setSelected] = useState(null) // 'new' or accountId
  const [query, setQuery] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'dateCreated', direction: 'desc' })

  // Filter accounts based on search query
  const filteredAccounts = accounts.filter(a => (a.name || '').toLowerCase().includes(query.toLowerCase()))

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
    if (selected === accountId) setSelected(null)
  }

  const fmt = (v) => currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  // Helper to get firm object by id
  const findFirm = (id) => firms.find(f => f.id === id) || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* FORM APPEARS ABOVE THE TABLE SO IT PUSHES THE TABLE DOWN */}
      {selected && (
        <div>
          {selected === 'new' ? (
            <NewAccountForm
              firms={firms}
              onCreate={(accountData) => {
                const newAccount = createAccount(accountData)
                setSelected(newAccount.id)
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
      )}

      {/* Toolbar + Create */}
      <div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <input className="input" placeholder="Search accounts..." value={query} onChange={e => setQuery(e.target.value)} />
          <button className="btn" onClick={() => setSelected('new')}>+ Create Account</button>
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
                  ROI<span style={{ float: 'right' }}>{getSortIndicator('roi')}</span>
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
                const pill = a.status === 'Live' ? 'green' : a.status === 'Funded' ? 'blue' : a.status === 'Challenge' ? 'yellow' : 'gray'
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
          <input type="number" className="input" value={form.initialFunding} onChange={e => setForm({ ...form, initialFunding: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="field">
          <label>Funding Atual</label>
          <input type="number" className="input" value={form.currentFunding} onChange={e => setForm({ ...form, currentFunding: parseFloat(e.target.value) || 0 })} />
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
  const { accounts } = useData()
  const { currency, rate } = useCurrency()
  const acc = accounts.find(a => a.id === id) || null
  const s = getStats(id) || { roi: 0, totalPayouts: 0, lastPayoutAmount: 0, nextPayout: null }

  const fmt = (v) => currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  const [local, setLocal] = useState(acc)
  useEffect(() => setLocal(acc), [id, acc?.id])

  if (!acc) return <div className="card">Conta não encontrada</div>

  const save = () => {
    // basic normalization
    const payload = {
      ...local,
      initialFunding: Number(local.initialFunding) || 0,
      currentFunding: Number(local.currentFunding) || 0,
      profitSplit: Number(local.profitSplit) || 0
    }
    update(id, payload)
    if (onClose) onClose()
  }

  // Filter firms for the current account type
  const firmsForType = firms.filter(f => f.type === (local.type || acc.type))

  return (
    <div className="card">
      <h3>📋 Conta</h3>
      <div className="field">
        <label>Nome</label>
        <input className="input" value={local.name || ''} onChange={e => setLocal({ ...local, name: e.target.value })} />
      </div>

      <div className="row">
        <div className="field">
          <label>Categoria</label>
          <select className="select" value={local.type || ''} onChange={e => setLocal({ ...local, type: e.target.value, firmId: null })}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Empresa</label>
          <select className="select" value={local.firmId || ''} onChange={e => setLocal({ ...local, firmId: e.target.value || null })}>
            <option value=''>— Nenhuma —</option>
            {firmsForType.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {local.firmId && (() => {
            const fm = firms.find(x => x.id === local.firmId)
            return fm ? <div style={{ marginTop: 6 }}><img src={fm.logo} alt={fm.name} style={{ width: 80, height: 36, objectFit: 'contain' }} /></div> : null
          })()}
        </div>

        <div className="field">
          <label>Status</label>
          <select className="select" value={local.status || ''} onChange={e => setLocal({ ...local, status: e.target.value })}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Data Criada</label>
          <input type="date" className="input" value={local.dateCreated || ''} onChange={e => setLocal({ ...local, dateCreated: e.target.value })} />
        </div>
        <div className="field">
          <label>Frequência de Payout</label>
          <select className="select" value={local.payoutFrequency || ''} onChange={e => setLocal({ ...local, payoutFrequency: e.target.value })}>
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
          <input type="number" className="input" value={local.initialFunding || 0} onChange={e => setLocal({ ...local, initialFunding: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="field">
          <label>Funding Atual</label>
          <input type="number" className="input" value={local.currentFunding || 0} onChange={e => setLocal({ ...local, currentFunding: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Profit Split (%)</label>
          <input type="number" step="1" className="input" value={Math.round(local.profitSplit*100) || 0} onChange={e => setLocal({ ...local, profitSplit: parseFloat(e.target.value) / 100 || 0 })}style={{ flexGrow: 1 }} />
        </div>
        <div className="field">
          <label>ROI</label>
          <div className="input" style={{ opacity: 0.8 }} readOnly>{(s.roi * 100).toFixed(2)}%</div>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Próximo Payout</label>
          <div className="input" readOnly>{s.nextPayout || '-'}</div>
        </div>
        <div className="field">
          <label>Último Payout</label>
          <div className="input" readOnly>{fmt(s.lastPayoutAmount)}</div>
        </div>
      </div>

      <div className="field">
        <label>Total Payouts</label>
        <div className="input" readOnly>{fmt(s.totalPayouts)}</div>
      </div>

      <div className="toolbar">
        <button className="btn" onClick={save}>Salvar</button>
        <button className="btn ghost" onClick={onClose}>Fechar</button>
      </div>
    </div>
  )
}
