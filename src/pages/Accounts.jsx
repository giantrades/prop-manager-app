import React, { useMemo, useState } from 'react'
import { useData } from '../state/DashboardDataContext.jsx'
import { useCurrency } from '../state/CurrencyContext.jsx'

const statuses = ['Standby','Live','Challenge','Funded']
const types = ['Futures','Forex','Cripto','Personal']

export default function Accounts(){
  const { accounts, createAccount, updateAccount, deleteAccount, getAccountStats } = useData()
  const { currency, rate } = useCurrency()
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'dateCreated', direction: 'desc' })

  // Filter accounts based on search query
  const filteredAccounts = accounts.filter(a=> a.name.toLowerCase().includes(query.toLowerCase()))

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

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
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
    if (selected === accountId) {
      setSelected(null) // Clear selection if deleting selected account
    }
  }

  const fmt = (v)=> currency==='USD'
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v||0)
    : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)*rate)

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      <div>
        <div className="toolbar" style={{marginBottom:12}}>
          <input className="input" placeholder="Search accounts..." value={query} onChange={e=>setQuery(e.target.value)} />
          <button className="btn" onClick={()=>{
            setSelected('new') // Set to 'new' instead of creating immediately
          }}>+ Create Account</button>
        </div>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{cursor: 'pointer'}} onClick={() => handleSort('dateCreated')}>
                  Data Criada<span style={{float: 'right'}}>{getSortIndicator('dateCreated')}</span>
                </th>
                <th style={{cursor: 'pointer'}} onClick={() => handleSort('name')}>
                  Conta<span style={{float: 'right'}}>{getSortIndicator('name')}</span>
                </th>
                <th style={{cursor: 'pointer'}} onClick={() => handleSort('type')}>
                  Categoria<span style={{float: 'right'}}>{getSortIndicator('type')}</span>
                </th>
                <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('status')}>
                  Status<span style={{float: 'right'}}>{getSortIndicator('status')}</span>
                </th>
                <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('roi')}>
                  ROI<span style={{float: 'right'}}>{getSortIndicator('roi')}</span>
                </th>
                <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('profitSplit')}>
                  Split<span style={{float: 'right'}}>{getSortIndicator('profitSplit')}</span>
                </th>
                <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('totalPayouts')}>
                  Payouts<span style={{float: 'right'}}>{getSortIndicator('totalPayouts')}</span>
                </th>
                <th style={{cursor: 'pointer'}} onClick={() => handleSort('initialFunding')}>
                  Inicial<span style={{float: 'right'}}>{getSortIndicator('initialFunding')}</span>
                </th>
                <th style={{cursor: 'pointer'}} onClick={() => handleSort('currentFunding')}>
                  Atual<span style={{float: 'right'}}>{getSortIndicator('currentFunding')}</span>
                </th>
                
                <th style={{cursor: 'pointer', width: '40px'}}></th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map(a=>{
                const pill = a.status==='Live'?'green':a.status==='Funded'?'blue':a.status==='Challenge'?'yellow':'gray'
                const typePill = a.type === 'Forex' ? 'lavander'
                 : a.type === 'Cripto' ? 'orange'
                 : a.type === 'Futures' ? 'pink'
                 : a.type === 'Personal' ? 'purple'
                 : 'gray';
                return (
                  <tr key={a.id} onClick={()=>setSelected(a.id)} style={{cursor:'pointer'}}>
                    <td>{new Date(a.dateCreated).toLocaleDateString('pt-BR')}</td>
                    <td>{a.name}</td>
                    <td className="center"><span className={'pill ' + typePill}>{a.type}</span></td>
                    <td className="center"><span className={'pill '+pill}>{a.status}</span></td>
                    {(() => {
                      const s = getAccountStats(a.id) || {roi:0,totalPayouts:0}
                      const roiPct = (s.roi*100).toFixed(2)
                      const roiClass = s.roi >= 0 ? 'value-green' : 'value-red'
                      return (<>
                        <td className={"center "+roiClass}>{roiPct}%</td>
                        <td className="center">{Math.round((a.profitSplit||0)*100)}%</td>
                        <td className="center">{fmt(s.totalPayouts)}</td>
                      </>)
                    })()}
                    <td>{fmt(a.initialFunding)}</td>
                    <td>{fmt(a.currentFunding)}</td>
                    
                    <td className="center">
                      <button 
                        className="btn ghost" 
                        onClick={(e) => handleDelete(e, a.id)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '14px',
                          color: '#e74c3c',
                          minWidth: 'auto'
                        }}
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

      {(selected && selected !== null) && (
        <div>
          {selected === 'new' ? (
            <NewAccountForm 
              onCreate={(accountData) => {
                const newAccount = createAccount(accountData)
                setSelected(newAccount.id)
              }} 
              onCancel={() => setSelected(null)}
            />
          ) : (
            <AccountDetail id={selected} update={updateAccount} getStats={getAccountStats} />
          )}
        </div>
      )}
    </div>
  )
}

function NewAccountForm({ onCreate, onCancel }) {
  const [formData, setFormData] = useState({
    name: 'New Account',
    type: 'Futures',
    status: 'Standby',
    dateCreated: new Date().toISOString().split('T')[0],
    payoutFrequency: 'monthly',
    initialFunding: 0,
    currentFunding: 0,
    profitSplit: 0.8
  })

  const handleSubmit = () => {
    onCreate(formData)
  }

  return (
    <div className="card">
      <h3>➕ Nova Conta</h3>
      <div className="field">
        <label>Nome</label>
        <input 
          className="input" 
          value={formData.name} 
          onChange={e => setFormData({...formData, name: e.target.value})} 
        />
      </div>
      <div className="row">
        <div className="field">
          <label>Categoria</label>
          <select 
            className="select" 
            value={formData.type} 
            onChange={e => setFormData({...formData, type: e.target.value})}
          >
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select 
            className="select" 
            value={formData.status} 
            onChange={e => setFormData({...formData, status: e.target.value})}
          >
            {statuses.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Data Criada</label>
          <input 
            type="date" 
            className="input" 
            value={formData.dateCreated} 
            onChange={e => setFormData({...formData, dateCreated: e.target.value})} 
          />
        </div>
        <div className="field">
          <label>Frequência de Payout</label>
          <select 
            className="select" 
            value={formData.payoutFrequency} 
            onChange={e => setFormData({...formData, payoutFrequency: e.target.value})}
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
            className="input" 
            value={formData.initialFunding} 
            onChange={e => setFormData({...formData, initialFunding: parseFloat(e.target.value) || 0})} 
          />
        </div>
        <div className="field">
          <label>Funding Atual</label>
          <input 
            type="number" 
            className="input" 
            value={formData.currentFunding} 
            onChange={e => setFormData({...formData, currentFunding: parseFloat(e.target.value) || 0})} 
          />
        </div>
      </div>
      <div className="field">
        <label>Profit Split (0-1)</label>
        <input 
          type="number" 
          step="0.01" 
          className="input" 
          value={formData.profitSplit} 
          onChange={e => setFormData({...formData, profitSplit: parseFloat(e.target.value) || 0})} 
        />
      </div>
      <div className="toolbar">
        <button className="btn" onClick={handleSubmit}>Salvar</button>
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function AccountDetail({id, update, getStats}){
  const { accounts } = useData()
  const { currency, rate } = useCurrency()
  const acc = accounts.find(a=>a.id===id)
  const s = getStats(id) || {roi:0,totalPayouts:0,lastPayoutAmount:0,nextPayout:null}
  const fmt = (v)=> currency==='USD'
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v||0)
    : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)*rate)

  const [local, setLocal] = useState(acc)
  React.useEffect(()=> setLocal(acc), [id, acc?.id])

  const save = ()=> update(id, local)

  return (
    <div className="card">
      <h3>📋 Conta</h3>
      <div className="field">
        <label>Nome</label>
        <input className="input" value={local.name} onChange={e=>setLocal({...local, name:e.target.value})} />
      </div>
      <div className="row">
        <div className="field">
          <label>Categoria</label>
          <select className="select" value={local.type} onChange={e=>setLocal({...local, type:e.target.value})}>
            {types.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select className="select" value={local.status} onChange={e=>setLocal({...local, status:e.target.value})}>
            {statuses.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Data Criada</label>
          <input type="date" className="input" value={local.dateCreated} onChange={e=>setLocal({...local, dateCreated:e.target.value})} />
        </div>
        <div className="field">
          <label>Frequência de Payout</label>
          <select className="select" value={local.payoutFrequency} onChange={e=>setLocal({...local, payoutFrequency:e.target.value})}>
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
          <input type="number" className="input" value={local.initialFunding} onChange={e=>setLocal({...local, initialFunding:parseFloat(e.target.value)})} />
        </div>
        <div className="field">
          <label>Funding Atual</label>
          <input type="number" className="input" value={local.currentFunding} onChange={e=>setLocal({...local, currentFunding:parseFloat(e.target.value)})} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Profit Split (0-1)</label>
          <input type="number" step="0.01" className="input" value={local.profitSplit} onChange={e=>setLocal({...local, profitSplit:parseFloat(e.target.value)})} />
        </div>
        <div className="field">
          <label>ROI</label>
          <div className="input" style={{opacity:0.8}} readOnly>{(s.roi*100).toFixed(2)}%</div>
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
      </div>
    </div>
  )
}