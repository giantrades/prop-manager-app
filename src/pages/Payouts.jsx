import React, { useMemo, useState } from 'react'
import { useData } from '../state/DashboardDataContext.jsx'
import { useCurrency } from '../state/CurrencyContext.jsx'

const methods = ['Rise','Wise','Pix','Paypal','Cripto']
const statuses = ['Cancelled','Pending','Completed']
const types = ['Futures','Forex','Cripto','Personal']

export default function Payouts(){
  const { accounts, payouts, createPayout, updatePayout, deletePayout } = useData()
  const { currency, rate } = useCurrency()
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('')
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  
  // Sorting state
  const [sortField, setSortField] = useState('dateCreated')
  const [sortDirection, setSortDirection] = useState('desc')

  const fmt = (v)=> currency==='USD'
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v||0)
    : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)*rate)

  // Process data: filter -> deduplicate -> sort -> paginate
  const processedData = useMemo(() => {
    // First filter
    let filtered = payouts.filter(p=> p.type.toLowerCase().includes(filter.toLowerCase()))
    
    // Then deduplicate to prevent duplicate keys
    const uniqueMap = new Map()
    filtered.forEach(item => {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item)
      }
    })
    let deduplicated = Array.from(uniqueMap.values())
    
    // Then sort if needed
    if (sortField) {
      deduplicated.sort((a, b) => {
        let aVal = a[sortField]
        let bVal = b[sortField]
        
        // Handle different field types
        if (sortField === 'dateCreated' || sortField === 'approvedDate') {
          aVal = new Date(aVal || 0).getTime()
          bVal = new Date(bVal || 0).getTime()
        } else if (sortField === 'amountSolicited' || sortField === 'fee' || sortField === 'amountReceived') {
          aVal = Number(aVal) || 0
          bVal = Number(bVal) || 0
        } else if (sortField === 'accountIds') {
          aVal = (aVal || []).length
          bVal = (bVal || []).length
        } else {
          aVal = String(aVal || '').toLowerCase()
          bVal = String(bVal || '').toLowerCase()
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }
    
    return deduplicated
  }, [payouts, filter, sortField, sortDirection])

  // Pagination
  const totalItems = processedData.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const currentPageData = processedData.slice(startIndex, startIndex + itemsPerPage)

  // Handle sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  // Sort indicator
  const SortIndicator = ({ field }) => {
    if (sortField !== field) return null
    return <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [filter])

  return (
    <div className="grid" style={{gap:16}}>
      <div className="toolbar">
        <input className="input" placeholder="Filter by type..." value={filter} onChange={e=>setFilter(e.target.value)} />
        <select 
          className="select" 
          value={itemsPerPage} 
          onChange={e => {
            setItemsPerPage(Number(e.target.value))
            setCurrentPage(1)
          }}
          style={{width: 'auto'}}
        >
          <option value={10}>10 por página</option>
          <option value={20}>20 por página</option>
          <option value={50}>50 por página</option>
          <option value={100}>100 por página</option>
        </select>
        <button className="btn" onClick={()=>setShowForm(true)}>+ Adicionar Payout</button>
        <ExportCSV rows={processedData} />
      </div>

      {/* Results info */}
      {totalItems > 0 && (
        <div style={{color: '#666', fontSize: '14px'}}>
          Mostrando {startIndex + 1}-{Math.min(startIndex + itemsPerPage, totalItems)} de {totalItems} resultados
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{cursor: 'pointer'}} onClick={() => handleSort('dateCreated')}>
                Data<SortIndicator field="dateCreated" />
              </th>
              <th style={{cursor: 'pointer'}} onClick={() => handleSort('accountIds')}>
                Contas<SortIndicator field="accountIds" />
              </th>
              <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('type')}>
                Tipo<SortIndicator field="type" />
              </th>
              <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('status')}>
                Status<SortIndicator field="status" />
              </th>
              <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('method')}>
                Método<SortIndicator field="method" />
              </th>
              <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('amountSolicited')}>
                Gross<SortIndicator field="amountSolicited" />
              </th>
              <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('fee')}>
                Fee<SortIndicator field="fee" />
              </th>
              <th className='center' style={{cursor: 'pointer'}} onClick={() => handleSort('amountReceived')}>
                Net<SortIndicator field="amountReceived" />
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.map(p=> (
              <tr key={p.id}>
                <td>{p.dateCreated}</td>
                <td className='center'>{(p.accountIds||[]).length}</td>
                <td className='center'><span className='pill type'>{p.type}</span></td>
                <td className='center'><span className={'pill '+(p.status==='Completed'?'greenpayout':p.status==='Pending'?'yellowpayout':'gray')}>{p.status}</span></td>
                <td className='center'>{p.method}</td>
                <td className='center'>{fmt(p.amountSolicited)}</td>
                <td className='neg'>- {fmt(p.fee)}</td>
                <td className='pos'>+ {fmt(p.amountReceived)}</td>
                <td className="right">
                  <button className="btn ghost" onClick={()=>setShowForm({edit:p})}>Edit</button>{' '}
                  <button className="btn secondary" onClick={()=>deletePayout(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {currentPageData.length === 0 && (
          <div style={{textAlign: 'center', padding: '40px', color: '#666'}}>
            {filter ? 'Nenhum resultado encontrado.' : 'Nenhum payout encontrado.'}
          </div>
        )}
      </div>

      {/* Simple Pagination */}
      {totalPages > 1 && (
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center'}}>
          <button 
            className="btn ghost" 
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            ← Anterior
          </button>
          
          <span style={{padding: '0 16px'}}>
            Página {currentPage} de {totalPages}
          </span>
          
          <button 
            className="btn ghost" 
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Próximo →
          </button>
        </div>
      )}

      {showForm ? (
        <PayoutForm onClose={()=>setShowForm(false)} edit={showForm.edit} accounts={accounts} onSave={(payload)=>{
          if (showForm.edit){
            updatePayout(showForm.edit.id, payload)
          } else {
            createPayout(payload)
          }
          setShowForm(false)
        }} />
      ) : null}
    </div>
  )
}

function ExportCSV({rows}){
  const download = ()=>{
    const header = ['dateCreated','type','status','method','amountSolicited','fee','amountReceived','accountIds']
    const csv = [header.join(',')].concat(rows.map(r=> header.map(h=>{
      const v = r[h]; return Array.isArray(v) ? '"'+v.join('|')+'"' : v
    }).join(','))).join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'payouts.csv'; a.click()
    URL.revokeObjectURL(url)
  }
  return <button className="btn ghost" onClick={download}>Export CSV</button>
}

import * as store from '../lib/dataStore.js'

function PayoutForm({onClose, edit, accounts, onSave}){
  const [state, setState] = React.useState(edit ? {...edit} : {
    dateCreated: new Date().toISOString().slice(0,10),
    type: 'Forex',
    method: (store.getSettings().methods[0]||'Pix'),
    status: 'Pending',
    amountSolicited: 0,
    accountIds: [],
    approvedDate: null
  })
  const [methods, setMethods] = React.useState(store.getSettings().methods)
  const [newMethod, setNewMethod] = React.useState('')

  // Só contas da categoria escolhida
  const pool = accounts.filter(a=> a.type === state.type)
  const selectedSet = new Set(state.accountIds)
  const selectedAccounts = pool.filter(a=> selectedSet.has(a.id))

  const equalShare = selectedAccounts.length ? state.amountSolicited / selectedAccounts.length : 0
  const preview = selectedAccounts.map(a=>{
    const net = equalShare * (a.profitSplit || 1)
    const fee = equalShare - net
    return { id:a.id, name:a.name, split:a.profitSplit, share: equalShare, net, fee, type:a.type, funding:a.currentFunding, status:a.status }
  })
  const totals = preview.reduce((s,r)=> ({net:s.net+r.net, fee:s.fee+r.fee}), {net:0, fee:0})

  const addMethod = ()=>{
    const nm = newMethod.trim()
    if (!nm) return
    const cur = store.getSettings()
    if (!cur.methods.includes(nm)){
      const updated = store.setSettings({ methods: [...cur.methods, nm] })
      setMethods(updated.methods)
      setNewMethod('')
    }
  }
  const removeMethod = (m)=>{
    const cur = store.getSettings()
    const updated = store.setSettings({ methods: cur.methods.filter(x=>x!==m) })
    setMethods(updated.methods)
    if (state.method===m){
      setState({...state, method: updated.methods[0] || ''})
    }
  }

  return (
    <div className="card">
      <h3>{edit?'✏️ Editar Payout':'➕ Novo Payout'}</h3>

      <div className="row">
        <div className="field">
          <label>Data</label>
          <input type="date" className="input" value={state.dateCreated} onChange={e=>setState({...state, dateCreated:e.target.value})} />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select className="select" value={state.type} onChange={e=>{ const v=e.target.value; setState(s=>({...s, type:v, accountIds: []})) }}>
            {['Futures','Forex','Cripto','Personal'].map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Valor solicitado (GROSS)</label>
          <input type="number" className="input" value={state.amountSolicited} onChange={e=>setState({...state, amountSolicited:parseFloat(e.target.value)})} />
        </div>
        <div className="field">
          <label>Status</label>
          <select className="select" value={state.status} onChange={e=>setState({...state, status:e.target.value})}>
            {['Cancelled','Pending','Completed'].map(s=> <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Contas ({pool.length})</label>
        <div className="table-mini">
          <table>
            <thead><tr><th></th><th>Conta</th><th>Tipo</th><th>Funding</th><th>Split</th><th>Status</th></tr></thead>
            <tbody>
              {pool.map(a=>{
                const checked = selectedSet.has(a.id)
                return (
                  <tr key={a.id}>
                    <td className="center">
                      <input type="checkbox" checked={checked} onChange={(e)=>{
                        const next = new Set(state.accountIds)
                        e.target.checked ? next.add(a.id) : next.delete(a.id)
                        setState({...state, accountIds: Array.from(next)})
                      }} />
                    </td>
                    <td>{a.name}</td>
                    <td className="center"><span className="pill type">{a.type}</span></td>
                    <td>{'$'+(a.currentFunding||0).toLocaleString()}</td>
                    <td className="center">{Math.round((a.profitSplit||0)*100)}%</td>
                    <td className="center"><span className={'pill '+(a.status==='Live'?'green':a.status==='Funded'?'blue':a.status==='Challenge'?'yellow':'gray')}>{a.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Método</label>
          <div className="flex">
            <select className="select" value={state.method} onChange={e=>setState({...state, method:e.target.value})}>
              {methods.map(m=> <option key={m} value={m}>{m}</option>)}
            </select>
            <input className="input" placeholder="Novo método" value={newMethod} onChange={e=>setNewMethod(e.target.value)} />
            <button className="btn" onClick={addMethod}>Adicionar</button>
          </div>
          <div className="muted" style={{marginTop:8}}>
            Remover: {methods.map(m=> <button key={m} className="chip" onClick={()=>removeMethod(m)}>{m} ✕</button>)}
          </div>
        </div>
        <div className="field">
          <label>Data aprovada</label>
          <input type="date" className="input" value={state.approvedDate||''} onChange={e=>setState({...state, approvedDate:e.target.value||null})} />
        </div>
      </div>

      <div className="card" style={{marginTop:12}}>
        <h3>💡 Prévia por conta</h3>
        <table>
          <thead><tr><th>Conta</th><th>Split</th><th>Share</th><th>Fee</th><th>Net</th></tr></thead>
          <tbody>
            {preview.map(r=>(
              <tr key={r.id}>
                <td>{r.name}</td><td>{(r.split*100).toFixed(0)}%</td>
                <td>${r.share.toFixed(2)}</td>
                <td className="neg">- ${r.fee.toFixed(2)}</td>
                <td className="pos">+ ${r.net.toFixed(2)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan="3" className="right"><b>Totals</b></td>
              <td className="neg">- ${totals.fee.toFixed(2)}</td>
              <td className="pos">+ ${totals.net.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="toolbar" style={{marginTop:12}}>
        <button className="btn" onClick={()=> onSave({ ...state })}>{edit?'Salvar':'Criar'}</button>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}