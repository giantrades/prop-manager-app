import React, { useMemo, useState, useEffect,useRef } from 'react'
import { useCurrency } from '@apps/state'
import * as store from '@apps/lib/dataStore.js'
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout, updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
import { getOrCreateFolderByPath, uploadFileToFolder, initGoogleDrive } from '@apps/utils/googleDrive'; 

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
useEffect(() => {
  const idToOpen = localStorage.getItem('openPayoutId');
  if (idToOpen && payouts.length > 0) {
    const found = payouts.find(p => p.id === idToOpen);
    if (found) {
      setShowForm({ edit: found }); // abre o modal com dados do payout
      localStorage.removeItem('openPayoutId'); // não repetir
    }
  }
}, [payouts]);
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
      <div className="payouts-page grid" style={{ gap: 16 }}>

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
      <td data-label="Data">{p.dateCreated}</td>
      <td data-label="Contas" className="center">{(p.accountIds || []).length}</td>
      <td data-label="Tipo" className="center"><span className="pill type">{p.type}</span></td>
      <td data-label="Status" className="center">
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
      <td data-label="Método" className="center">{p.method}</td>
      <td data-label="Gross" className="center">{fmt(p.amountSolicited)}</td>
      <td data-label="Fee" className="center" style={{ color: '#ef4444', fontWeight: 600 }}>- {fmt(p.fee)}</td>
      <td data-label="Net" className="center" style={{ color: '#22c55e', fontWeight: 600 }}>+ {fmt(p.amountReceived)}</td>
      <td className="right" data-label="Ações">
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
    if (!payload.attachments) payload.attachments = {};
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
  const [searchTerm, setSearchTerm] = useState('')
const [accountStatusFilter, setAccountStatusFilter] = useState(['live', 'funded'])
const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
const statusDropdownRef = useRef(null)

  const { currency, rate } = useCurrency()
  const fmt = (v) =>
    currency === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  const pool = state.type === 'Todas'
    ? accounts
    : accounts.filter(a => a.type === state.type)
  
 const filteredPool = pool.filter(a => {
  const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase())
  const matchesStatus = accountStatusFilter.length === 0 || 
                       accountStatusFilter.includes(a.status?.toLowerCase())
  return matchesSearch && matchesStatus
})
const accountStatuses = useMemo(() => {
  const all = pool
    .map((a) => a.status?.toLowerCase() || '')
    .filter((s) => !!s)
  return Array.from(new Set(all))
}, [pool])
useEffect(() => {
  function onDocClick(e) {
    if (!statusDropdownRef.current) return
    if (!statusDropdownRef.current.contains(e.target)) {
      setStatusDropdownOpen(false)
    }
  }
  if (statusDropdownOpen) document.addEventListener('mousedown', onDocClick)
  return () => document.removeEventListener('mousedown', onDocClick)
}, [statusDropdownOpen])
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
// estado local para acompanhar uploads (opcional: para UI)
const [uploadingMap, setUploadingMap] = useState({}) // { accountId: boolean }

// helper: upload file and attach metadata to payout (creates folder path then upload)
async function handleUploadForAccount(accountId, file) {
  try {
    if (!file) return null;

    // inicializa gdrive (se necessário) - não força prompt
    await initGoogleDrive();

    // monta a árvore de pastas: payouts > tipo > empresa > nomeConta > valor_data
    const account = accounts.find(a => a.id === accountId);
    const company = (account && account.firmId && (getAll().firms || []).find(f => f.id === account.firmId)?.name) || (account && account.company) || (state.company || 'UnknownCompany');
    const tipo = state.type || (account && account.type) || 'Other';
    const nomeConta = account ? account.name.replace(/\s+/g,'_') : 'Conta';
    const dataPart = (state.amountSolicited || 0).toString().replace(/\./g,'').trim() + '_' + (state.dateCreated || new Date().toISOString().slice(0,10));
    const folderSegments = ['payouts', tipo, company || 'Unknown', nomeConta, dataPart];

    setUploadingMap(m => ({ ...m, [accountId]: true }));

    // garante pasta final
    const folderId = await getOrCreateFolderByPath(folderSegments);

    // nome do arquivo exibido: 'payout_{valor_data}.{ext}' (exibido na UI)
    const ext = (file.name.split('.').pop() || 'png');
    const displayName = `payout_${state.amountSolicited || 0}_${state.dateCreated || new Date().toISOString().slice(0,10)}.${ext}`;

    // faz upload físico para a pasta
    const uploaded = await uploadFileToFolder(folderId, file, displayName);

    // monta metadados
    const attachment = {
      folderPath: folderSegments.join('/'),
      folderId,
      fileId: uploaded.id,
      fileName: uploaded.name || displayName,
      url: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      uploadedAt: new Date().toISOString()
    };

    // salva referência no dataStore
    // se payout ainda não existe (criando novo), guardamos em state e depois quando salvar o payout chamamos update/create
    if (!state.id) {
      // mantemos num map temporário
      setState(s => ({ ...s, attachments: { ...(s.attachments || {}), [accountId]: attachment } }));
    } else {
      // já tem payout id salvo (edit mode) -> atualiza no datastore
      store.setPayoutAttachment(state.id, accountId, attachment);
    }

    setUploadingMap(m => ({ ...m, [accountId]: false }));
    return attachment;
  } catch (err) {
    console.error('Upload failed:', err);
    setUploadingMap(m => ({ ...m, [accountId]: false }));
    alert('Erro ao enviar comprovante: ' + (err.message || err));
    return null;
  }
}

  return (
    <div className="payouts-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="payouts-modal-content">
        
        {/* Header */}
        <div className="payouts-modal-header">
          <h2>💰 {edit ? 'Editar Payout' : 'Novo Payout'}</h2>
          <button className="payouts-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="payouts-modal-body">
          
         {/* Informações Básicas - Data, Data Aprovação e Status do PAYOUT */}
<div className="payouts-section">
  <div className="payouts-section-title">Informações Básicas</div>
  
  <div className="payouts-field-row payouts-field-row-3">
    <div className="payouts-field">
      <label>📅 Data</label>
      <input
        type="date"
        className="payouts-input"
        value={state.dateCreated}
        onChange={(e) => setState({ ...state, dateCreated: e.target.value })}
      />
    </div>
    <div className="payouts-field">
      <label>✅ Data Aprovação</label>
      <input
        type="date"
        className="payouts-input"
        value={state.approvedDate || ''}
        onChange={(e) => setState({ ...state, approvedDate: e.target.value || null })}
      />
    </div>
    <div className="payouts-field">
      <label>📊 Status do Payout</label>
      <select
        className="payouts-input"
        value={state.status}
        onChange={(e) => setState({ ...state, status: e.target.value })}
      >
        <option value="Cancelled">Cancelled</option>
        <option value="Pending">Pending</option>
        <option value="Completed">Completed</option>
      </select>
    </div>
  </div>
</div>



{/* Seleção de Contas */}
<div className="payouts-section">
  <div className="payouts-section-title">Contas Vinculadas</div>
  
  {/* Linha com busca + TIPO + filtro de STATUS DE CONTA */}
  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
    {/* 1. BUSCA */}
    <div style={{ flex: 1 }}>
      <input
        type="text"
        className="payouts-input"
        placeholder="🔍 Buscar conta..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ width: '100%', height: '100%' }}
      />
    </div>

    {/* 2. TIPO */}
    <div style={{ minWidth: 150 }}>
      <select
        className="payouts-input"
        value={state.type}
        onChange={(e) => {
          const v = e.target.value
          setState((s) => ({ ...s, type: v, accountIds: [] }))
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <option value="Todas">🏷️ Todas</option>
        <option value="Futures">Futures</option>
        <option value="Forex">Forex</option>
        <option value="Cripto">Cripto</option>
        <option value="Personal">Personal</option>
      </select>
    </div>

    {/* 3. DROPDOWN DE STATUS DE CONTA */}
    <div style={{ position: 'relative', minWidth: 200 }} ref={statusDropdownRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen(v => !v); }}
        className="payouts-input"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          width: '100%',
          height: '100%',
          padding: '10px 12px',
          textAlign: 'left'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {accountStatusFilter && accountStatusFilter.length > 0
            ? `Status: ${accountStatusFilter.join(", ")}`
            : "Filtrar Status"}
        </span>
        <span style={{ opacity: 0.7, marginLeft: 8, flexShrink: 0 }}>▾</span>
      </button>

      {statusDropdownOpen && accountStatuses && accountStatuses.length > 0 && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            zIndex: 9999,
            background: "var(--card-bg, #1e1e2b)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: "8px 10px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
            minWidth: 220,
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
              style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
              onClick={() => setAccountStatusFilter(["live", "funded"])}
            >
              Resetar padrão
            </button>

            <button
              className="btn ghost small"
              style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
              onClick={() => setAccountStatusFilter(accountStatuses.slice())}
            >
              Marcar todos
            </button>
          </div>
        </div>
      )}
    </div>
  </div>

  <p className="payouts-hint">
    💡 {filteredPool.length} conta(s) disponível(eis) • {selectedAccounts.length} selecionada(s)
  </p>

  <div className="payouts-table-wrapper">
    <table className="payouts-table">
      <thead>
        <tr>
          <th style={{ width: 40 }}></th>
          <th>Nome da Conta</th>
          <th className="center">Tipo</th>
          <th className="center">Funding</th>
          <th className="center">Split</th>
          <th className="center">Status</th>
        </tr>
      </thead>
      <tbody>
        {filteredPool.length === 0 ? (
          <tr>
            <td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              Nenhuma conta encontrada.
            </td>
          </tr>
        ) : (
          filteredPool.map((a) => {
            const checked = selectedSet.has(a.id)
            return (
              <tr key={a.id}>
                <td className="center">
                  <input
                    type="checkbox"
                    className="payouts-checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(state.accountIds)
                      e.target.checked ? next.add(a.id) : next.delete(a.id)
                      setState({ ...state, accountIds: Array.from(next) })
                    }}
                  />
                </td>
                <td>{a.name}</td>
                <td className="center">
                  <span className="payouts-pill payouts-pill-type">{a.type.toUpperCase()}</span>
                </td>
                <td className="center">{fmt(a.currentFunding || 0)}</td>
                <td className="center">{Math.round((a.profitSplit || 0) * 100)}%</td>
                <td className="center">
                  <span
                    className={
                      'payouts-pill ' +
                      (a.status === 'Live'
                        ? 'payouts-pill-green'
                        : a.status === 'Funded'
                        ? 'payouts-pill-blue'
                        : a.status === 'Challenge'
                        ? 'payouts-pill-yellow'
                        : a.status === 'Challenge Concluido'
                        ? 'payouts-pill-yellow'
                        : 'payouts-pill-gray')
                    }
                  >
                    {a.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  </div>
</div>
          {/* Upload de comprovantes por conta selecionada */}
{selectedAccounts.length > 0 && (
  <div className="payouts-section" style={{ marginTop: 20 }}>
    <div className="payouts-section-title">📎 Comprovantes por Conta</div>

    {selectedAccounts.map((acc) => {
      // Verifica se já existe anexo no estado atual (novo payout) ou no banco (editando payout)
      const existingAttachment =
        (state.attachments && state.attachments[acc.id]) ||
        (state.id &&
          store.getAll().payouts.find((p) => p.id === state.id)?.attachments?.[acc.id])

      return (
        <div
          key={acc.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {/* Nome da conta e infos */}
          <div>
            <strong>{acc.name}</strong>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {acc.type?.toUpperCase()} • {acc.status}
            </p>
          </div>

          {/* Botões de Upload / Ver / Trocar */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Botão de upload */}
            <label className="btn secondary small" style={{ cursor: 'pointer' }}>
              {existingAttachment ? '📤 Trocar Comprovante' : '📎 Anexar Comprovante'}
              <input
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
onChange={async (e) => {
  const file = e?.target?.files?.[0] || e?.dataTransfer?.files?.[0];
  if (!file) return;
  await handleUploadForAccount(acc.id, file);
}}

              />
            </label>

            {/* Se já existir comprovante */}
            {existingAttachment && (
              <a
                href={existingAttachment.url}
                target="_blank"
                rel="noreferrer"
                className="btn small"
              >
                📁 Ver Arquivo
              </a>
            )}
          </div>
        </div>
      )
    })}
  </div>
)}

          {/* Método de Pagamento */}
          <div className="payouts-section">
            <div className="payouts-section-title">Método de Pagamento</div>
            
            <div className="payouts-field-row payouts-field-row-2">
              <div className="payouts-field">
                <label>Método Atual</label>
                <select
                  className="payouts-input"
                  value={state.method}
                  onChange={(e) => setState({ ...state, method: e.target.value })}
                >
                  {methods.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="payouts-field">
                <label>Adicionar Novo</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="payouts-input"
                    placeholder="Nome do método..."
                    style={{ flex: 1 }}
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                  />
                  <button className="payouts-btn payouts-btn-ghost" onClick={addMethod}>+</button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Métodos Cadastrados
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {methods.map((m) => (
                  <span key={m} className="payouts-chip" onClick={() => removeMethod(m)}>
                    {m} ✕
                  </span>
                ))}
              </div>
            </div>
          </div>
{/* Preview com GROSS no header */}
{preview.length > 0 && (
  <div className="payouts-preview">
    <div className="payouts-preview-header">
      <div className="payouts-preview-title">💡 Prévia de Distribuição</div>
      
      {/* Campo GROSS movido para cá */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>
            💵 GROSS ($)
          </label>
          <input
            type="number"
            className="payouts-input"
            value={state.amountSolicited}
            onChange={(e) =>
              setState({ ...state, amountSolicited: parseFloat(e.target.value) || 0 })
            }
            placeholder="0.00"
            style={{ padding: '8px 12px', fontSize: 14 }}
          />
        </div>

        <div className="payouts-stats-mini">
          <div className="payouts-stat-mini">
            <div className="payouts-stat-mini-label">Total</div>
            <div className="payouts-stat-mini-value">{fmt(state.amountSolicited)}</div>
          </div>
          <div className="payouts-stat-mini">
            <div className="payouts-stat-mini-label">Taxa</div>
            <div className="payouts-stat-mini-value">{fmt(totals.fee)}</div>
          </div>
          <div className="payouts-stat-mini">
            <div className="payouts-stat-mini-label">Contas</div>
            <div className="payouts-stat-mini-value">{selectedAccounts.length}</div>
          </div>
        </div>
      </div>
    </div>

    <div className="payouts-table-wrapper" style={{ maxHeight: 240 }}>
      <table className="payouts-table">
        <thead>
          <tr>
            <th>Conta</th>
            <th className="center">Split</th>
            <th className="center">Base</th>
            <th className="center">Taxa</th>
            <th className="center">Líquido</th>
          </tr>
        </thead>
        <tbody>
          {preview.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="center">{Math.round(r.split * 100)}%</td>
              <td className="center">{fmt(r.share)}</td>
              <td className="center" style={{ color: 'var(--yellow)' }}>{fmt(r.fee)}</td>
              <td className="center" style={{ color: 'var(--green)', fontWeight: 700 }}>{fmt(r.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}

        </div>

        {/* Footer Actions */}
        <div className="payouts-modal-footer">
          <button className="payouts-btn payouts-btn-secondary" onClick={onClose}>
            Cancelar
          </button>
<button
  className="payouts-btn payouts-btn-primary"
  onClick={() => {
    const payload = {
      ...state,
      fee: totals.fee,
      amountReceived: totals.net,
      attachments: state.attachments || {}   // ✅ garante que os arquivos enviados sejam salvos junto
    }
    onSave(payload) // quem salva de verdade é a função enviada pelo componente Payouts
  }}
>
  💾 {edit ? 'Salvar' : 'Criar Payout'}
</button>

        </div>

      </div>
    </div>
  )
}