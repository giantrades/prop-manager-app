import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useCurrency } from '@apps/state'
import * as store from '@apps/lib/dataStore.js'
import { getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout, updatePayout, deletePayout, getFirms, createFirm, updateFirm, deleteFirm, getFirmStats } from '@apps/lib/dataStore';
import { getOrCreateFolderByPath, uploadFileToFolder, initGoogleDrive, signIn, isSignedIn } from '@apps/utils/googleDrive';
import AccountPicker from '@apps/ui/AccountPicker';

// ---------------------------
// Página de listagem + CRUD
// ---------------------------

export default function Payouts() {
  const [accounts, setAccounts] = useState([])
  const [payouts, setPayouts] = useState([])
  const [firms, setFirms] = useState([])
  const [selectedAccountIds, setSelectedAccountIds] = useState([])

  useEffect(() => {
    const data = getAll()
    setAccounts(data.accounts || [])
    setPayouts(data.payouts || [])
    setFirms(getFirms() || [])
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
      setFirms(getFirms() || [])
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
    let filtered = payouts.filter((p) => {
      // Filtrar por busca (texto ou valor)
      const q = filter.toLowerCase();
      if (q) {
        const matchType = p.type?.toLowerCase().includes(q);
        const matchAmount = String(p.amountSolicited || '').includes(q) || String(p.amountReceived || '').includes(q) || String(p.fee || '').includes(q);
        const matchMethod = p.method?.toLowerCase().includes(q);
        const matchStatus = p.status?.toLowerCase().includes(q);

        // Match archived tags
        const isArchivedSearch = q === 'arquivado' || q === 'deletado' || q === 'archived' || q === 'deleted';
        const hasArchived = p._archivedAccounts && p._archivedAccounts.length > 0;
        const matchArchivedState = isArchivedSearch && hasArchived;

        // Match archived account names
        const matchArchivedName = hasArchived && p._archivedAccounts.some(arc => arc.name?.toLowerCase().includes(q));

        // Match live account names
        const matchLiveName = (p.accountIds || []).some(id => {
          const a = accounts.find(acc => acc.id === id);
          return a && a.name?.toLowerCase().includes(q);
        }) || (p.accountId && accounts.find(acc => acc.id === p.accountId)?.name?.toLowerCase().includes(q));

        if (!matchType && !matchAmount && !matchMethod && !matchStatus && !matchArchivedState && !matchArchivedName && !matchLiveName) return false;
      }

      // Filtrar pelo AccountPicker
      if (selectedAccountIds.length > 0) {
        if (p.accountIds && p.accountIds.some(id => selectedAccountIds.includes(id))) return true;
        if (p.accountId && selectedAccountIds.includes(p.accountId)) return true;

        if (p.accounts || p.accountName) {
          const linkedAccountIds = accounts
            .filter(a => (p.accounts && p.accounts.includes(a.name)) || a.name === p.accountName)
            .map(a => a.id);
          if (linkedAccountIds.some(id => selectedAccountIds.includes(id))) return true;
        }

        return false;
      }

      return true;
    })

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
          const getAccName = (pItem) => {
            const aid = pItem.accountId || (pItem.accountIds && pItem.accountIds[0]);
            if (aid) {
              const a = accounts.find(acc => acc.id === aid);
              if (a) return a.name;
            }
            if (pItem._archivedAccounts && pItem._archivedAccounts.length > 0) return pItem._archivedAccounts[0].name;
            return '';
          };
          aVal = getAccName(a).toLowerCase();
          bVal = getAccName(b).toLowerCase();
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
  }, [payouts, filter, sortField, sortDirection, selectedAccountIds, accounts])


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
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        {/* CARD 1 - Total Gross */}
        <div style={{ flex: '1 1 200px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, background: 'radial-gradient(circle, rgba(148, 163, 184, 0.1) 0%, transparent 70%)', borderRadius: '50%' }} />
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>$</span>
            Gross Solicitado
          </h4>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f8fafc' }}>
            {fmt(payouts.reduce((sum, p) => sum + (Number(p.amountSolicited) || 0), 0))}
          </div>
        </div>

        {/* CARD 2 - Total Fee */}
        <div style={{ flex: '1 1 200px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, background: 'radial-gradient(circle, rgba(239, 68, 68, 0.1) 0%, transparent 70%)', borderRadius: '50%' }} />
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>🔻</span>
            Total de Taxas
          </h4>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>
            - {fmt(payouts.reduce((sum, p) => sum + (Number(p.fee) || 0), 0))}
          </div>
        </div>

        {/* CARD 3 - Total Net */}
        <div style={{ flex: '1 1 200px', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(34, 197, 94, 0.2)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, background: 'radial-gradient(circle, rgba(34, 197, 94, 0.2) 0%, transparent 70%)', borderRadius: '50%' }} />
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#86efac', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80' }}>
              <svg
                width="8"
                height="8"
                viewBox="0 0 100 100"
              >
                <polygon
                  points="50,10 95,90 5,90"
                  fill="#22c55e"
                />
              </svg>
            </span>
            Lucro Líquido
          </h4>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#4ade80' }}>
            + {fmt(processedData.reduce((sum, p) => sum + (Number(p.amountReceived) || 0), 0))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* CARD 4 - Categorias */}
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 500, color: '#94a3b8' }}>Líquido por Categoria</h4>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {['Futures', 'Forex', 'Cripto', 'Personal'].map((cat) => {
              const totalCat = processedData.filter((p) => p.type === cat).reduce((sum, p) => sum + (Number(p.amountReceived) || 0), 0);
              if (totalCat === 0) return null;
              let color = '#94a3b8';
              let bg = 'rgba(255,255,255,0.05)';
              if (cat === 'Forex') { color = '#c084fc'; bg = 'rgba(192, 132, 252, 0.1)'; }
              if (cat === 'Cripto') { color = '#fb923c'; bg = 'rgba(251, 146, 60, 0.1)'; }
              if (cat === 'Futures') { color = '#f472b6'; bg = 'rgba(244, 114, 182, 0.1)'; }
              if (cat === 'Personal') { color = '#a78bfa'; bg = 'rgba(167, 139, 250, 0.1)'; }

              return (
                <div key={cat} style={{ flex: 1, minWidth: 120, background: bg, padding: '12px 16px', borderRadius: 12, border: `1px solid ${bg.replace('0.1', '0.2')}` }}>
                  <div style={{ fontSize: 12, color: color, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{cat}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(totalCat)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CARD 5 - Solicitados */}
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{processedData.length}</div>
          <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>Payouts Exibidos</div>
        </div>
      </div>
      {/* ==== FIM DOS CARDS ==== */}

      {/* Toolbar superior */}
      <div className="toolbar" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Search by amount, method, type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 250, margin: 0 }}
        />

        <AccountPicker
          selectedIds={selectedAccountIds}
          onChange={setSelectedAccountIds}
          accounts={accounts}
          firms={firms}
          placeholder="Todas as contas"
        />

        <div className="spacer" />
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
                Conta / Firm<SortIndicator field="accountIds" />
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
            {currentPageData.map((p) => {
              let accName = 'Desconhecida';
              let accType = p.type || '';
              let isArchived = false;
              let firmObj = null;
              let typeColor = 'gray';

              const firstId = p.accountId || (p.accountIds && p.accountIds[0]);

              if (firstId) {
                const liveAcc = accounts.find(a => a.id === firstId);
                if (liveAcc) {
                  accName = liveAcc.name;
                  accType = liveAcc.type;
                  firmObj = firms.find(f => f.id === liveAcc.firmId);
                } else if (p._archivedAccounts && p._archivedAccounts.length > 0) {
                  const arc = p._archivedAccounts.find(a => a.id === firstId) || p._archivedAccounts[0];
                  accName = arc.name;
                  accType = arc.type;
                  firmObj = firms.find(f => f.id === arc.firmId);
                  isArchived = true;
                }
              } else if (p._archivedAccounts && p._archivedAccounts.length > 0) {
                const arc = p._archivedAccounts[0];
                accName = arc.name;
                accType = arc.type;
                firmObj = firms.find(f => f.id === arc.firmId);
                isArchived = true;
              }

              if (accType === 'Forex') typeColor = 'lavander';
              else if (accType === 'Cripto') typeColor = 'orange';
              else if (accType === 'Futures') typeColor = 'pink';
              else if (accType === 'Personal') typeColor = 'purple';

              return (
                <tr key={p.id} style={{ borderLeft: `3px solid var(--${typeColor})`, background: isArchived ? 'rgba(255,255,255,0.01)' : 'transparent', transition: 'background 0.2s' }}>
                  <td data-label="Data">{p.dateCreated}</td>

                  <td data-label="Conta">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {firmObj && firmObj.logo ? (
                        <img src={firmObj.logo} alt={firmObj.name} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.05)', padding: 2 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🏢</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 600, color: isArchived ? '#9ca3af' : '#f8fafc', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                          {accName}
                          {isArchived && <span title="Conta Deletada/Arquivada" style={{ fontSize: 12, opacity: 0.8 }}>👻</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          {firmObj ? firmObj.name : 'Unknown Firm'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Tipo" className="center"><span className={`pill ${typeColor}`}>{accType}</span></td>
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
                  <td data-label="Gross" className="center" style={{ fontWeight: 600 }}>{fmt(p.amountSolicited)}</td>
                  <td data-label="Fee" className="center" style={{ color: '#ef4444' }}>- {fmt(p.fee)}</td>
                  <td data-label="Net" className="center" style={{ color: '#22c55e', fontWeight: 700 }}>+ {fmt(p.amountReceived)}</td>
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
              )
            })}
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
    const header = ['dateCreated', 'type', 'status', 'method', 'amountSolicited', 'fee', 'amountReceived', 'accountIds']
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

  const currentAccId = state.accountIds && state.accountIds[0];
  const currentAcc = accounts.find(a => a.id === currentAccId);
  const currentFirm = currentAcc ? store.getAll().firms?.find(f => f.id === currentAcc.firmId) : null;
  const currentType = currentAcc ? currentAcc.type : 'gray';

  let headerColor = 'rgba(255,255,255,0.05)';
  if (currentType === 'Forex') headerColor = 'rgba(124, 92, 255, 0.15)';
  else if (currentType === 'Cripto') headerColor = 'rgba(249, 115, 22, 0.15)';
  else if (currentType === 'Futures') headerColor = 'rgba(236, 72, 153, 0.15)';
  else if (currentType === 'Personal') headerColor = 'rgba(168, 85, 247, 0.15)';

  const totals = {
    net: state.amountSolicited * (currentAcc?.profitSplit || 1),
    fee: state.amountSolicited - (state.amountSolicited * (currentAcc?.profitSplit || 1))
  };

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
      if (!file) {
        console.warn('⚠️ Nenhum arquivo selecionado');
        return null;
      }

      console.log('📤 Iniciando upload para conta:', accountId);
      console.log('📄 Arquivo:', file.name, file.type, file.size);

      // Inicializa Google Drive
      const initialized = await initGoogleDrive();
      if (!initialized) {
        throw new Error('Falha ao inicializar Google Drive');
      }
      console.log('✅ Google Drive inicializado');

      // ✅ APENAS verifica se está logado, SEM verificar expiração
      if (!isSignedIn()) {
        throw new Error('Você precisa estar logado no Google Drive. Por favor, faça login na página de configurações.');
      }

      // Busca dados da conta
      const account = accounts.find(a => a.id === accountId);
      if (!account) {
        throw new Error('Conta não encontrada: ' + accountId);
      }
      console.log('🏦 Conta encontrada:', account.name);

      // Monta caminho de pastas
      const allFirms = getAll().firms || [];
      const firm = account.firmId ? allFirms.find(f => f.id === account.firmId) : null;
      const company = firm?.name || 'UnknownCompany';

      const tipo = state.type || account.type || 'Other';
      const nomeConta = account.name.replace(/\s+/g, '_');
      const dataPart = `${state.amountSolicited || 0}_${state.dateCreated || new Date().toISOString().slice(0, 10)}`;
      const folderSegments = ['payouts', tipo, company, nomeConta, dataPart];

      console.log('📁 Criando caminho:', folderSegments.join('/'));

      // Mostra loading
      setUploadingMap(m => ({ ...m, [accountId]: true }));

      // Cria/encontra pasta
      const folderId = await getOrCreateFolderByPath(folderSegments);
      console.log('✅ Pasta criada/encontrada, ID:', folderId);

      // Upload do arquivo
      const ext = file.name.split('.').pop() || 'png';
      const displayName = `payout_${state.amountSolicited || 0}_${state.dateCreated || new Date().toISOString().slice(0, 10)}.${ext}`;

      console.log('📤 Enviando arquivo:', displayName);
      const uploaded = await uploadFileToFolder(folderId, file, displayName);
      console.log('✅ Upload concluído:', uploaded);

      // Monta metadados do anexo
      const attachment = {
        folderPath: folderSegments.join('/'),
        folderId,
        fileId: uploaded.id,
        fileName: uploaded.name || displayName,
        url: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
        uploadedAt: new Date().toISOString()
      };

      // Salva no estado
      if (!state.id) {
        setState(s => ({
          ...s,
          attachments: {
            ...(s.attachments || {}),
            [accountId]: attachment
          }
        }));
        console.log('💾 Anexo salvo no estado (novo payout)');
      } else {
        store.setPayoutAttachment(state.id, accountId, attachment);
        console.log('💾 Anexo salvo no dataStore (payout existente)');
      }

      setUploadingMap(m => ({ ...m, [accountId]: false }));
      alert('✅ Comprovante enviado com sucesso!');

      return attachment;
    } catch (err) {
      console.error('❌ Erro no upload:', err);
      setUploadingMap(m => ({ ...m, [accountId]: false }));

      let errorMsg = 'Erro ao enviar comprovante';
      if (err.message) errorMsg += ': ' + err.message;

      alert(errorMsg);
      return null;
    }
  }

  return (
    <div className="payouts-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ backdropFilter: 'blur(8px)' }}>
      <div className="payouts-modal-content" style={{ border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>

        {/* Header Dinâmico */}
        <div style={{ padding: '24px', background: `linear-gradient(180deg, ${headerColor} 0%, transparent 100%)`, borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {currentFirm && currentFirm.logo ? (
              <img src={currentFirm.logo} alt="Firm Logo" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'contain', background: 'rgba(0,0,0,0.3)', padding: 4 }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💰</div>
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>
                {edit ? 'Editar Payout' : 'Novo Payout'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 14, color: '#cbd5e1', fontWeight: 600 }}>{currentAcc ? currentAcc.name : 'Selecione uma Conta'}</span>
                {currentAcc && <span className={`pill ${currentType === 'Forex' ? 'lavander' : currentType === 'Cripto' ? 'orange' : currentType === 'Futures' ? 'pink' : 'purple'}`}>{currentType}</span>}
              </div>
            </div>
          </div>
          <button className="payouts-modal-close" onClick={onClose} style={{ alignSelf: 'flex-start' }}>×</button>
        </div>

        <div className="payouts-modal-body" style={{ padding: 24, overflowY: 'auto' }}>

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



          {/* Seleção de Conta Única */}
          <div className="payouts-section" style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="payouts-section-title">🏦 Conta Vinculada</div>

            <div className="payouts-field">
              <label>Selecione a Conta de Origem</label>
              <select
                className="payouts-input"
                value={currentAccId || ''}
                onChange={(e) => {
                  const selected = accounts.find(a => a.id === e.target.value);
                  setState({ ...state, accountIds: [e.target.value], type: selected?.type || 'Todas' });
                }}
                style={{ fontSize: 15, padding: '10px 14px' }}
              >
                <option value="" disabled>Selecione uma conta ativa...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type}) - {a.status}
                  </option>
                ))}
              </select>
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
                      {/* Input escondido */}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        style={{ display: 'none' }}
                        id={`file-upload-${acc.id}`}
                        onChange={async (e) => {
                          const file = e?.target?.files?.[0];
                          if (!file) return;
                          await handleUploadForAccount(acc.id, file);
                          e.target.value = ''; // Reseta para permitir re-upload
                        }}
                      />

                      {/* Botão de upload com loading */}
                      <button
                        className="btn secondary small"
                        onClick={() => document.getElementById(`file-upload-${acc.id}`).click()}
                        disabled={uploadingMap[acc.id]}
                        style={{
                          opacity: uploadingMap[acc.id] ? 0.6 : 1,
                          cursor: uploadingMap[acc.id] ? 'wait' : 'pointer',
                          position: 'relative'
                        }}
                      >
                        {uploadingMap[acc.id] ? (
                          <>⏳ Enviando...</>
                        ) : existingAttachment ? (
                          <>📤 Trocar Comprovante</>
                        ) : (
                          <>📎 Anexar Comprovante</>
                        )}
                      </button>

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
          {/* Preview de Distribuição simplificado */}
          {currentAcc && (
            <div className="payouts-preview" style={{ background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 12, marginTop: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="payouts-preview-header" style={{ marginBottom: 16 }}>
                <div className="payouts-preview-title" style={{ fontSize: 16, fontWeight: 600 }}>💡 Valores (100% para a conta {currentAcc.name})</div>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, display: 'block', textTransform: 'uppercase' }}>
                    💵 GROSS ($) Solicitado
                  </label>
                  <input
                    type="number"
                    className="payouts-input"
                    value={state.amountSolicited || ''}
                    onChange={(e) =>
                      setState({ ...state, amountSolicited: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                    style={{ padding: '12px 16px', fontSize: 18, fontWeight: 700 }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 150, background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Taxa da Firm / Split</div>
                  <div style={{ fontSize: 18, color: 'var(--yellow)', fontWeight: 600 }}>- {fmt(totals.fee)}</div>
                </div>

                <div style={{ flex: 1, minWidth: 150, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, color: '#86efac', textTransform: 'uppercase' }}>Net Líquido</div>
                  <div style={{ fontSize: 24, color: '#4ade80', fontWeight: 800 }}>+ {fmt(totals.net)}</div>
                </div>
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