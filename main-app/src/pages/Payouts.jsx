import React, { useMemo, useState, useEffect } from 'react'
import { useCurrency } from '@apps/state'
import * as store from '@apps/lib/dataStore.js'
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout, updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';

// ---------------------------
// Página de listagem + CRUD
// ---------------------------

export default function Payouts() {
  const [accounts, setAccounts] = useState([])
  const [payouts, setPayouts] = useState([])

useEffect(() => {
  const data = getAll()
  setAccounts(data.accounts || [])
  setPayouts(data.payouts || [])
}, [])

  // Mantém sincronizado com o localStorage quando outros componentes/páginas alteram
  useEffect(() => {
    const sync = () => {
      const data = getAll()
      setAccounts(data.accounts || [])
      setPayouts(data.payouts || [])
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const { currency, rate } = useCurrency()
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('')
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  
  // Ordenação
  const [sortField, setSortField] = useState('dateCreated')
  const [sortDirection, setSortDirection] = useState('desc')

  const fmt = (v) =>
    currency === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  // ---------------------------
  // Processamento: filtro -> dedup -> sort -> pagina
  // ---------------------------
  const processedData = useMemo(() => {
    let filtered = payouts.filter((p) =>
      p.type.toLowerCase().includes(filter.toLowerCase())
    )

    // Deduplicação por id
    const uniqueMap = new Map()
    filtered.forEach((item) => {
      if (!uniqueMap.has(item.id)) uniqueMap.set(item.id, item)
    })
    let dedup = Array.from(uniqueMap.values())

    if (sortField) {
      dedup.sort((a, b) => {
        let aVal = a[sortField]
        let bVal = b[sortField]

        // Normaliza tipos de dados
        if (['dateCreated', 'approvedDate'].includes(sortField)) {
          aVal = new Date(aVal || 0).getTime()
          bVal = new Date(bVal || 0).getTime()
        } else if (
          ['amountSolicited', 'fee', 'amountReceived'].includes(sortField)
        ) {
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

    return dedup
  }, [payouts, filter, sortField, sortDirection])

  // Paginação final
  const totalItems = processedData.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const currentPageData = processedData.slice(
    startIndex,
    startIndex + itemsPerPage
  )

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  const SortIndicator = ({ field }) =>
    sortField === field ? <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span> : null

  // Reseta página quando o filtro muda
  useEffect(() => setCurrentPage(1), [filter])

  return (
    <div className="grid" style={{ gap: 16 }}>

      {/* ==== DASHBOARD DE RESUMO DE PAYOUTS ==== */}
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
  }}
>
  {/* CARD 1 - Total Gross */}
  <div
    style={{
      flex: 1,
      background: 'linear-gradient(180deg, var(--card-bg, #0b1018) 0%, var(--background, #0f172a) 100%)',
      borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
      padding: '16px 24px',
    }}
  >
    <h4 style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted, #b4b8c0)' }}>
      Total Gross Payouts
    </h4>
    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
      {fmt(
        payouts.reduce(
          (sum, p) => sum + (Number(p.amountSolicited) || 0),
          0
        )
      )}
    </div>
  </div>

  {/* CARD 2 - Total Fee */}
  <div
    style={{
      flex: 1,
      background: 'linear-gradient(180deg, var(--card-bg, #0b1018) 0%, var(--background, #0f172a) 100%)',
      borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
      padding: '16px 24px',
    }}
  >
    <h4 style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted, #b4b8c0)' }}>
      Total Fee Payouts
    </h4>
    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
      {fmt(
        payouts.reduce(
          (sum, p) => sum + (Number(p.fee) || 0),
          0
        )
      )}
    </div>
  </div>

  {/* CARD 3 - Total Net */}
  <div
    style={{
      flex: 1,
      background: 'linear-gradient(180deg, var(--card-bg, #0b1018) 0%, var(--background, #0f172a) 100%)',
      borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
      padding: '16px 24px',
    }}
  >
    <h4 style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted, #b4b8c0)' }}>
      Total Net Payouts
    </h4>
    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
      {fmt(
        payouts.reduce(
          (sum, p) => sum + (Number(p.amountReceived) || 0),
          0
        )
      )}
    </div>
  </div>
</div>

{/* ==== PAYOUTS POR CATEGORIA + QUANTIDADE ==== */}
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
  }}
>
  {/* CARD 4 - Payouts por Categoria */}
  <div
    style={{
      flex: 1,
      background: 'linear-gradient(180deg, var(--card-bg, #0b1018) 0%, var(--background, #05080f) 100%)',
      borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
      padding: '16px 24px',
    }}
  >
    <h4 style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted, #b4b8c0)' }}>
      Total Payouts por Categoria
    </h4>
    {['Futures', 'Forex', 'Cripto', 'Personal'].map((cat) => {
      const totalCat = payouts
        .filter((p) => p.type === cat)
        .reduce((sum, p) => sum + (Number(p.amountReceived) || 0), 0)
      return (
        <div
          key={cat}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
            color: 'var(--text)',
          }}
        >
          <span>{cat}</span>
          <span style={{ fontWeight: 600 }}>{fmt(totalCat)}</span>
        </div>
      )
    })}
  </div>

  {/* CARD 5 - Total Payouts Solicitados */}
  <div
    style={{
      flex: 1,
      background: 'linear-gradient(180deg, var(--card-bg, #0b1018) 0%, var(--background, #05080f) 100%)',
      borderRadius: 10,
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
      padding: '16px 24px',
    }}
  >
    <h4 style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-muted, #b4b8c0)' }}>
      Total de Payouts Solicitados
    </h4>
    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
      {payouts.reduce(
        (sum, p) => sum + (p.accountIds?.length || 0),
        0
      )}
    </div>
  </div>
</div>
{/* ==== FIM DOS CARDS ==== */}

      {/* Toolbar superior */}
      <div className="toolbar">
        <input
          className="input"
          placeholder="Filter by type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="select"
          value={itemsPerPage}
          onChange={(e) => {
            setItemsPerPage(Number(e.target.value))
            setCurrentPage(1)
          }}
          style={{ width: 'auto' }}
        >
          <option value={10}>10 por página</option>
          <option value={20}>20 por página</option>
          <option value={50}>50 por página</option>
          <option value={100}>100 por página</option>
        </select>
        <button className="btn" onClick={() => setShowForm(true)}>
          + Adicionar Payout
        </button>
        <ExportCSV rows={processedData} />
      </div>

      {totalItems > 0 && (
        <div style={{ color: '#666', fontSize: '14px' }}>
          Mostrando {startIndex + 1}-{Math.min(startIndex + itemsPerPage, totalItems)} de {totalItems}
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dateCreated')}>
                Data<SortIndicator field="dateCreated" />
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('accountIds')}>
                Contas<SortIndicator field="accountIds" />
              </th>
              <th className="center" style={{ cursor: 'pointer' }} onClick={() => handleSort('type')}>
                Tipo<SortIndicator field="type" />
              </th>
              <th className="center" style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                Status<SortIndicator field="status" />
              </th>
              <th className="center" style={{ cursor: 'pointer' }} onClick={() => handleSort('method')}>
                Método<SortIndicator field="method" />
              </th>
              <th className="center" style={{ cursor: 'pointer' }} onClick={() => handleSort('amountSolicited')}>
                Gross<SortIndicator field="amountSolicited" />
              </th>
              <th className="center" style={{ cursor: 'pointer' }} onClick={() => handleSort('fee')}>
                Fee<SortIndicator field="fee" />
              </th>
              <th className="center" style={{ cursor: 'pointer' }} onClick={() => handleSort('amountReceived')}>
                Net<SortIndicator field="amountReceived" />
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.map((p) => (
              <tr key={p.id}>
                <td>{p.dateCreated}</td>
                <td className="center">{(p.accountIds || []).length}</td>
                <td className="center"><span className="pill type">{p.type}</span></td>
                <td className="center">
                  <span
                    className={
                      'pill ' +
                      (p.status === 'Completed'
                        ? 'greenpayout'
                        : p.status === 'Pending'
                        ? 'yellowpayout'
                        : 'gray')
                    }
                  >
                    {p.status}
                  </span>
                </td>
                <td className="center">{p.method}</td>
                <td className="center">{fmt(p.amountSolicited)}</td>
                <td className="neg">- {fmt(p.fee)}</td>
                <td className="pos">+ {fmt(p.amountReceived)}</td>
                <td className="right">
                  <button className="btn ghost" onClick={() => setShowForm({ edit: p })}>
                    Edit
                  </button>{' '}
                 <button
  className="btn secondary"
  onClick={() => {
    const data = getAll()
    const payout = data.payouts.find(pp => pp.id === p.id)
    if (payout?.accountIds?.length) {
      const netPerAccount = (payout.amountSolicited || 0) / payout.accountIds.length
      payout.accountIds.forEach(accId => {
        const acc = data.accounts.find(a => a.id === accId)
        if (acc) {
          // devolve o valor retirado antes
          const revertedFunding = (acc.currentFunding || 0) + netPerAccount
          updateAccount(acc.id, { ...acc, currentFunding: revertedFunding })
        }
      })
    }
    deletePayout(p.id)
    const fresh = getAll()
    setPayouts(fresh.payouts)
    setAccounts(fresh.accounts)
  }}
>
  Delete
</button>


                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {currentPageData.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            {filter ? 'Nenhum resultado encontrado.' : 'Nenhum payout encontrado.'}
          </div>
        )}
      </div>

      {/* Paginação simples */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <button
            className="btn ghost"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            ← Anterior
          </button>
          <span style={{ padding: '0 16px' }}>
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

      {showForm && (
        <PayoutForm
          onClose={() => setShowForm(false)}
          edit={showForm.edit}
          accounts={accounts}
     onSave={(payload) => {
  const isEdit = !!showForm.edit
  const payoutId = showForm.edit?.id
  const data = getAll()

  // Antes de atualizar, se for edição, desfaz impacto antigo nas contas
  if (isEdit) {
    const oldPayout = data.payouts.find(p => p.id === payoutId)
    if (oldPayout?.accountIds?.length) {
      const oldNetPerAccount = (oldPayout.amountSolicited || 0) / oldPayout.accountIds.length
      oldPayout.accountIds.forEach(accId => {
        const acc = data.accounts.find(a => a.id === accId)
        if (acc) {
          // reverte o débito anterior
          const revertedFunding = (acc.currentFunding || 0) + oldNetPerAccount
          updateAccount(acc.id, { ...acc, currentFunding: revertedFunding })
        }
      })
    }
  }

  // Agora aplica o novo payout (criação ou edição)
  const updatedPayout = isEdit
    ? updatePayout(payoutId, payload)
    : createPayout(payload)

  // Aplica o novo impacto nas contas
  const netPerAccount = (payload.amountSolicited || 0) / (payload.accountIds?.length || 1)
  payload.accountIds?.forEach(accId => {
    const acc = getAll().accounts.find(a => a.id === accId)
    if (acc) {
      const updatedFunding = Math.max((acc.currentFunding || 0) - netPerAccount, 0)
      updateAccount(acc.id, { ...acc, currentFunding: updatedFunding })
    }
  })

  // Atualiza o estado local
  const fresh = getAll()
  setPayouts(fresh.payouts)
  setAccounts(fresh.accounts)
  setShowForm(false)
}}


        />
      )}
    </div>
  )
}

// ---------------------------
// Exportação CSV
// ---------------------------
function ExportCSV({ rows }) {
  const download = () => {
    const header = ['dateCreated','type','status','method','amountSolicited','fee','amountReceived','accountIds']
    const csv = [header.join(',')]
      .concat(
        rows.map(r =>
          header.map(h => {
            const v = r[h]
            return Array.isArray(v) ? `"${v.join('|')}"` : v
          }).join(',')
        )
      )
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'payouts.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return <button className="btn ghost" onClick={download}>Export CSV</button>
}

// ---------------------------
// Formulário de criação/edição
// ---------------------------
function PayoutForm({ onClose, edit, accounts, onSave }) {
  const [state, setState] = useState(
    edit
      ? { ...edit }
      : {
          dateCreated: new Date().toISOString().slice(0, 10),
          type: 'Todas',
          method: (store.getSettings().methods[0] || 'Pix'),
          status: 'Pending',
          amountSolicited: 0,
          accountIds: [],
          approvedDate: null
        }
  )

  const [methods, setMethods] = useState(store.getSettings().methods)
  const [newMethod, setNewMethod] = useState('')

  const pool = state.type === 'Todas'
  ? accounts
  : accounts.filter(a => a.type === state.type)
  const selectedSet = new Set(state.accountIds)
  const selectedAccounts = pool.filter(a => selectedSet.has(a.id))

  const equalShare = selectedAccounts.length
    ? state.amountSolicited / selectedAccounts.length
    : 0

  const preview = selectedAccounts.map(a => {
    const net = equalShare * (a.profitSplit || 1)
    const fee = equalShare - net
    return {
      id: a.id,
      name: a.name,
      split: a.profitSplit,
      share: equalShare,
      net,
      fee,
      type: a.type,
      funding: a.currentFunding,
      status: a.status
    }
  })

  const totals = preview.reduce((s, r) => ({ net: s.net + r.net, fee: s.fee + r.fee }), { net: 0, fee: 0 })

  const addMethod = () => {
    const nm = newMethod.trim()
    if (!nm) return
    const cur = store.getSettings()
    if (!cur.methods.includes(nm)) {
      const updated = store.setSettings({ methods: [...cur.methods, nm] })
      setMethods(updated.methods)
      setNewMethod('')
    }
  }

  const removeMethod = (m) => {
    const cur = store.getSettings()
    const updated = store.setSettings({ methods: cur.methods.filter(x => x !== m) })
    setMethods(updated.methods)
    if (state.method === m) {
      setState({ ...state, method: updated.methods[0] || '' })
    }
  }
const [searchTerm, setSearchTerm] = useState('')

const filteredPool = pool.filter(a =>
  a.name.toLowerCase().includes(searchTerm.toLowerCase())
)

  return (
    <div className="card">
      <h3>{edit ? '✏️ Editar Payout' : '➕ Novo Payout'}</h3>

      <div className="row">
        <div className="field">
          <label>Data</label>
          <input
            type="date"
            className="input"
            value={state.dateCreated}
            onChange={(e) => setState({ ...state, dateCreated: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Tipo</label>
<select
  className="select"
  value={state.type}
  onChange={(e) => {
    const v = e.target.value
    setState((s) => ({ ...s, type: v, accountIds: [] }))
  }}
>
  {['Todas', 'Futures', 'Forex', 'Cripto', 'Personal'].map((t) => (
    <option key={t} value={t}>{t}</option>
  ))}
</select>

        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Valor solicitado (GROSS)</label>
          <input
            type="number"
            className="input"
            value={state.amountSolicited}
            onChange={(e) =>
              setState({ ...state, amountSolicited: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
        <div className="field">
          <label>Status</label>
          <select
            className="select"
            value={state.status}
            onChange={(e) => setState({ ...state, status: e.target.value })}
          >
            {['Cancelled', 'Pending', 'Completed'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

<div className="field">
  <label>Contas ({pool.length})</label>

  {/* 🔍 Campo de busca de contas */}
  <input
    type="text"
    className="input"
    placeholder="Buscar conta..."
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    style={{ marginBottom: 8 }}
  />

  <div className="table-mini">

          <table>
            <thead>
              <tr><th></th><th>Conta</th><th>Tipo</th><th>Funding</th><th>Split</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filteredPool.map((a) => {
                const checked = selectedSet.has(a.id)
                return (
                  <tr key={a.id}>
                    <td className="center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(state.accountIds)
                          e.target.checked ? next.add(a.id) : next.delete(a.id)
                          setState({ ...state, accountIds: Array.from(next) })
                        }}
                      />
                    </td>
                    <td>{a.name}</td>
                    <td className="center"><span className="pill type">{a.type}</span></td>
                    <td>{'$' + (a.currentFunding || 0).toLocaleString()}</td>
                    <td className="center">{Math.round((a.profitSplit || 0) * 100)}%</td>
                    <td className="center">
                      <span
                        className={
                          'pill ' +
                          (a.status === 'Live'
                            ? 'green'
                            : a.status === 'Funded'
                            ? 'blue'
                            : a.status === 'Challenge'
                            ? 'yellow'
                            : 'gray')
                        }
                      >
                        {a.status}
                      </span>
                    </td>
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
            <select
              className="select"
              value={state.method}
              onChange={(e) => setState({ ...state, method: e.target.value })}
            >
              {methods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Novo método"
              value={newMethod}
              onChange={(e) => setNewMethod(e.target.value)}
            />
            <button className="btn" onClick={addMethod}>Adicionar</button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Remover:{' '}
            {methods.map((m) => (
              <button key={m} className="chip" onClick={() => removeMethod(m)}>
                {m} ✕
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Data aprovada</label>
          <input
            type="date"
            className="input"
            value={state.approvedDate || ''}
            onChange={(e) => setState({ ...state, approvedDate: e.target.value || null })}
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>💡 Prévia por conta</h3>
        <table>
          <thead>
            <tr><th>Conta</th><th>Split</th><th>Share</th><th>Fee</th><th>Net</th></tr>
          </thead>
          <tbody>
            {preview.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="center">{Math.round(r.split * 100)}%</td>
                <td className="center">{'$' + r.share.toFixed(2)}</td>
                <td className="center">{'$' + r.fee.toFixed(2)}</td>
                <td className="center">{'$' + r.net.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right' }}>Totals:</td>
              <td className="center">{'$' + totals.fee.toFixed(2)}</td>
              <td className="center">{'$' + totals.net.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button className="btn secondary" onClick={onClose}>Cancelar</button>
        <button
          className="btn"
          onClick={() => {
            const payload = {
              ...state,
              fee: totals.fee,
              amountReceived: totals.net
            }
            onSave(payload)
          }}
        >
          {edit ? 'Salvar' : 'Criar'}
        </button>
      </div>
    </div>
  )
}