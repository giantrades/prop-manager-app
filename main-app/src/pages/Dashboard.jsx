import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@apps/state'
import { useFilters } from '@apps/state'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid,
  AreaChart, Area, Treemap
} from 'recharts'
import { getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout, updatePayout, deletePayout, getFirms, createFirm, updateFirm, deleteFirm, getFirmStats } from '@apps/lib/dataStore';
import { getAllGoals } from '@apps/lib/dataStore';
import AccountPicker from '@apps/ui/AccountPicker';

// ─── Design helpers (mesma linguagem do Accounts) ────────────────────────────

/** Card glass base — igual ao padrão do Accounts */
const glass = (borderColor = 'rgba(255,255,255,0.05)') => ({
  background: 'rgba(255,255,255,0.02)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: `1px solid ${borderColor}`,
  borderRadius: 16,
  padding: '20px 24px',
  position: 'relative',
  overflow: 'hidden',
  boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
})

/** Orb de glow posicionado no canto superior direito */
function GlowOrb({ color, size = 120, top = -40, right = -40 }) {
  return (
    <div style={{
      position: 'absolute', top, right,
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      pointerEvents: 'none',
    }} />
  )
}

/** Header padrão para cards de gráfico */
function ChartHeader({ title, action }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 18,
    }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.1px' }}>
        {title}
      </h3>
      {action}
    </div>
  )
}

/** Linha de separação discreta */
const SEP = { borderTop: '1px solid rgba(255,255,255,0.05)', margin: 0 }

// ─── Categoria → classe pill e cor hex ───────────────────────────────────────
const catPillClass = (type) =>
  type === 'Forex' ? 'lavander' : type === 'Cripto' ? 'orange' :
    type === 'Futures' ? 'pink' : type === 'Personal' ? 'purple' : 'gray'

const CAT_HEX = {
  Forex: '#8b5cf6', Cripto: '#f97316', Futures: '#ff4fa3', Personal: '#a855f7',
}

/* =========================================================
   1) Barra de filtros (categorias + range)  —  UNCHANGED
   ========================================================= */
function FiltersBar({
  categories, accountStatusFilter, setAccountStatusFilter,
  statusDropdownOpen, setStatusDropdownOpen, statusDropdownRef, accountStatuses,
  dateFilter = { start: null, end: null }, setDateFilter,
  showCalendar, setShowCalendar, calendarRef,
  selectedAccountIds, setSelectedAccountIds, allAccounts, firms,
}) {
  const {
    categories: sel, toggleCategory, markAll, clearCategories,
    timeRange, setRange, isMarkAllActive
  } = useFilters()

  const catColors = {
    'Forex': '#8b5cf6', 'Cripto': '#f97316', 'Futures': '#ff4fa3', 'Personal': '#a855f7'
  }

  const chipStyle = (item, active) => {
    const color = catColors[item] || 'var(--primary, #7c5cff)'
    return {
      borderColor: active ? color : 'rgba(255,255,255,0.06)',
      backgroundColor: active ? `${color}22` : 'transparent',
      color: active ? color : 'var(--text-secondary)'
    }
  }

  const [filtersOpen, setFiltersOpen] = useState(false)

  return (
    <div className="filters">
      <div className="filters-toggle">
        <button onClick={() => setFiltersOpen(v => !v)}>
          {filtersOpen ? "Ocultar Filtros ▲" : "Mostrar Filtros ▼"}
        </button>
      </div>

      <div className={`filters-content ${filtersOpen ? "open" : ""}`}>
        <div className="filters-left">
          <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>🔎 Filters:</span>
          <div className="category-chips">
            {categories.map(item => {
              const active = sel.includes(item)
              return (
                <button key={item} className={`chip ${active ? 'active' : ''}`}
                  style={chipStyle(item, active)} onClick={() => toggleCategory(item)}>
                  {active && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: catColors[item] || 'var(--primary, #7c5cff)', marginRight: 6 }} />}
                  {item}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`chip ${isMarkAllActive ? 'active' : ''}`}
              style={{ borderColor: 'var(--primary)', backgroundColor: isMarkAllActive ? 'var(--primary)20' : 'transparent', color: 'var(--primary)' }}
              onClick={() => markAll(categories)}>✅ All</button>
            <button className="chip" onClick={clearCategories}>🧹 Clear</button>
          </div>
        </div>

        <div className="filters-right">
          <div style={{ position: 'relative' }} ref={statusDropdownRef}>
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen(v => !v) }}
              className={`chip account-status-chip ${accountStatusFilter?.length > 0 ? 'status-active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 16px' }}>
              <span style={{ fontSize: 13 }}>Account Status</span>
              <span style={{ opacity: 0.7, marginLeft: 8 }}>▾</span>
            </button>

            {statusDropdownOpen && accountStatuses && accountStatuses.length > 0 && (
              <div className="card"
                style={{ position: 'absolute', top: '110%', left: 0, zIndex: 9999, background: 'var(--bg, #0f1218)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px', boxShadow: '0 8px 20px rgba(0,0,0,0.3)', minWidth: 200 }}
                onClick={(e) => e.stopPropagation()}>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {accountStatuses.map((status) => {
                    const st = String(status || '')
                    const checked = accountStatusFilter.includes(st)
                    return (
                      <label key={st} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer', fontSize: 14, color: '#e6e6e9', textTransform: 'capitalize' }}>
                        <input type="checkbox" checked={checked} onChange={(e) => {
                          const next = e.target.checked
                            ? Array.from(new Set([...accountStatusFilter, st]))
                            : accountStatusFilter.filter(s => s !== st)
                          setAccountStatusFilter(next)
                        }} style={{ width: 16, height: 16 }} />
                        <span>{st}</span>
                      </label>
                    )
                  })}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="btn ghost small" style={{ flex: 1 }} onClick={() => setAccountStatusFilter(['live', 'funded', 'archived'])}>Reset Default</button>
                  <button className="btn ghost small" style={{ flex: 1 }} onClick={() => setAccountStatusFilter(accountStatuses.slice())}>Select All</button>
                </div>
              </div>
            )}
          </div>

          <AccountPicker selectedIds={selectedAccountIds} onChange={setSelectedAccountIds} accounts={allAccounts} firms={firms} placeholder="Todas as contas" />

          <div className="range">
            {['7', '30', '180', '365', 'all'].map(r => (
              <button key={r} className={'chip ' + (timeRange === r ? 'active' : '')} onClick={() => setRange(r)}>
                {r === '7' ? '7d' : r === '30' ? '30d' : r === '180' ? '180d' : r === '365' ? '1y' : 'All'}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', flex: '0 0 auto' }} ref={calendarRef}>
            <button className={`calendar-btn ${(dateFilter.start || dateFilter.end) ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setShowCalendar(v => !v) }} title="Filtrar por data">
              <svg className="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
            {showCalendar && (
              <div className="calendar-dropdown">
                <div className="calendar-header">
                  <h4 style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>Filter by Date</h4>
                  {(dateFilter.start || dateFilter.end) && (
                    <button className="btn ghost small" onClick={() => setDateFilter({ start: null, end: null })} style={{ fontSize: 11 }}>Clear</button>
                  )}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div className="calendar-label">Start Date</div>
                  <input type="date" className="calendar-input" value={dateFilter.start || ''} onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))} />
                </div>
                <div>
                  <div className="calendar-label">End Date</div>
                  <input type="date" className="calendar-input" value={dateFilter.end || ''} onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))} />
                </div>
                <div className="calendar-actions">
                  <button className="btn ghost small" style={{ flex: 1 }} onClick={() => {
                    const today = new Date().toISOString().split('T')[0]
                    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    setDateFilter({ start: lastMonth, end: today })
                  }}>Last Month</button>
                  <button className="btn primary small" style={{ flex: 1 }} onClick={() => setShowCalendar(false)}>Apply</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   2) Hook para filtrar contas/payouts  —  UNCHANGED
   ========================================================= */
function useFiltered(accountStatusFilter = ['live', 'funded'], dateFilter = {}, selectedAccountIds = []) {
  const [accounts, setAccounts] = useState([])
  const [payouts, setPayouts] = useState([])
  const [firms, setFirms] = useState([])

  useEffect(() => {
    const data = getAll()
    setAccounts((data.accounts || []).filter(a => a.hidden !== true))
    setPayouts(data.payouts || [])
    setFirms(data.firms || [])
  }, [])

  const { categories: selCats, timeRange, isMarkAllActive } = useFilters()
  const now = new Date()
  const start = timeRange === 'all'
    ? new Date('1970-01-01')
    : new Date(now.getTime() - parseInt(timeRange, 10) * 86400000)
  start.setHours(0, 0, 0, 0)

  // Collect types from active accounts
  const activeCatTypes = Array.from(new Set(accounts.map(a => a.type).filter(Boolean)))
  // Also collect types from archived/deleted accounts stored in payouts
  // so that deleted account categories are still considered when filtering
  const archivedCatTypes = Array.from(new Set(
    payouts.flatMap(p => (p._archivedAccounts || []).map(arc => arc.type).filter(Boolean))
  ))
  const allCats = Array.from(new Set([...activeCatTypes, ...archivedCatTypes]))
  const effectiveCats = (!selCats?.length || isMarkAllActive) ? allCats : selCats
  const catSet = new Set(effectiveCats)

  // Whether "archived" (deleted) accounts should be shown based on status filter
  const showArchived = !accountStatusFilter || accountStatusFilter.length === 0 ||
    accountStatusFilter.includes('archived')

  const filteredAccounts = accounts.filter(a => {
    const matchesCategory = catSet.has(a.type)
    const matchesTimeRange = new Date(a.dateCreated) >= start
    const matchesStatus = !accountStatusFilter || accountStatusFilter.length === 0 ||
      accountStatusFilter.includes(a.status?.toLowerCase()) ||
      selectedAccountIds.includes(a.id)
    let matchesDateFilter = true
    if (dateFilter?.start || dateFilter?.end) {
      const startDate = dateFilter.start ? new Date(dateFilter.start) : new Date('1970-01-01')
      const endDate = dateFilter.end ? new Date(dateFilter.end) : new Date()
      endDate.setHours(23, 59, 59, 999)
      const createdDate = new Date(a.dateCreated)
      matchesDateFilter = createdDate >= startDate && createdDate <= endDate
    }
    const matchesAccountPicker = selectedAccountIds.length === 0 || selectedAccountIds.includes(a.id)
    return matchesCategory && matchesTimeRange && matchesStatus && matchesDateFilter && matchesAccountPicker
  })

  const accById = Object.fromEntries(filteredAccounts.map(a => [a.id, a]))
  const accByName = Object.fromEntries(filteredAccounts.map(a => [a.name, a]))
  const firmById = Object.fromEntries(firms.map(f => [f.id, f]))

  const payoutBelongs = (p) => {
    const d = new Date(p.dateCreated || p.date)
    if (isNaN(+d) || d < start) return false
    if (dateFilter?.start || dateFilter?.end) {
      const startDate = dateFilter.start ? new Date(dateFilter.start) : new Date('1970-01-01')
      const endDate = dateFilter.end ? new Date(dateFilter.end) : new Date()
      endDate.setHours(23, 59, 59, 999)
      if (d < startDate || d > endDate) return false
    }
    const checkAccountStatus = (acc) => { if (!acc) return false; return catSet.has(acc.type) }
    if (Array.isArray(p.accountIds) && p.accountIds.some(id => checkAccountStatus(accById[id]))) return true
    if (p.accountId && checkAccountStatus(accById[p.accountId])) return true
    if (Array.isArray(p.accounts) && p.accounts.some(n => checkAccountStatus(accByName[n]))) return true
    if (p.accountName && checkAccountStatus(accByName[p.accountName])) return true
    // Payouts from deleted/archived accounts: include if user has "archived" status filter active
    // and the archived account type matches the active category filter
    if (showArchived && p._archivedAccounts?.length) {
      const hasMatchingArchivedAcc = p._archivedAccounts.some(arc => catSet.has(arc.type))
      if (hasMatchingArchivedAcc) return true
    }
    // Payouts linked directly to a firm (no account): include if the firm's type matches
    if (p.firmId && firmById[p.firmId] && catSet.has(firmById[p.firmId].type)) return true
    return false
  }

  return {
    accounts: filteredAccounts,
    payouts: payouts.filter(payoutBelongs),
    allAccounts: accounts, firms, categorySet: catSet, timeRange
  }
}

/* =========================================================
   3) Summary Cards  —  GLASSMORPHISM PREMIUM
   ========================================================= */
function SummaryCards({ accountStatusFilter = [], dateFilter = {}, selectedAccountIds = [] }) {
  const { accounts, payouts, allAccounts } = useFiltered(accountStatusFilter, dateFilter, selectedAccountIds)
  const { currency, rate } = useCurrency()

  const totalFunding = accounts.reduce((s, a) => s + (a.currentFunding || 0), 0)
  const totalNetPayouts = payouts.reduce((s, p) => s + (p.amountReceived || 0), 0)
  const roi = totalFunding > 0 ? (totalNetPayouts / totalFunding) : 0
  const fmt = (v) => currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  const allPossibleStatuses = Array.from(new Set(allAccounts.map(a => a.status?.toLowerCase()).filter(Boolean)))
  const noStatusSelected = accountStatusFilter.length === 0
  const allSelected = accountStatusFilter.length > 0 &&
    accountStatusFilter.length === allPossibleStatuses.length &&
    allPossibleStatuses.every(s => accountStatusFilter.includes(s))

  // Count payouts that come (wholly or partially) from deleted accounts
  const deletedAccPayouts = payouts.filter(p => p._archivedAccounts?.length > 0).length

  const CARDS = [
    {
      label: 'Total Payouts', value: fmt(totalNetPayouts),
      color: '#10b981', glow: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.2)',
      sub: payouts.length === 0
        ? '0 payouts'
        : `${payouts.length} payout${payouts.length !== 1 ? 's' : ''}${deletedAccPayouts > 0 ? ` · 👻 ${deletedAccPayouts} from deleted accounts` : ''
        }`,
    },
    {
      label: 'Capital Deployed', value: fmt(totalFunding),
      color: '#3b82f6', glow: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.2)',
      sub: `Across ${accounts.length} account${accounts.length !== 1 ? 's' : ''}`,
    },
    {
      label: 'ROI', value: `${(roi * 100).toFixed(2)}%`,
      color: roi >= 0 ? '#7c5cff' : '#ef4444',
      glow: roi >= 0 ? 'rgba(124,92,255,0.15)' : 'rgba(239,68,68,0.15)',
      border: roi >= 0 ? 'rgba(124,92,255,0.2)' : 'rgba(239,68,68,0.2)',
      sub: 'Net payouts / funding',
    },
    {
      label: 'Active Accounts', value: noStatusSelected ? '0' : String(accounts.length),
      color: '#f59e0b', glow: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.2)',
      sub: noStatusSelected ? 'No status selected' : allSelected ? 'All statuses' : accountStatusFilter.join(', '),
    },
  ]

  return (
    <div className="grid cards">
      {CARDS.map(({ label, value, color, glow, border, sub }) => (
        <div key={label} style={{
          background: 'rgba(255,255,255,0.02)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: `1px solid ${border}`,
          borderRadius: 16,
          padding: '20px 24px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
        }}>
          <GlowOrb color={glow} />
          <h4 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>
            {label}
          </h4>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color, lineHeight: 1.1, letterSpacing: '-0.5px' }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8, textTransform: 'capitalize' }}>
              {sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* =========================================================
   4) Patrimônio & Financiamento  —  GLASS UPGRADE
   ========================================================= */
function PatrimonioLine({ accountStatusFilter = ['live', 'funded'], dateFilter = {} }) {
  const { accounts, payouts, allAccounts, firms } = useFiltered(accountStatusFilter, dateFilter)
  const { currency, rate } = useCurrency()
  const { categories: selected, timeRange } = useFilters()
  const [activeTab, setActiveTab] = React.useState('payouts')

  const cur = (v) => currency === 'USD' ? v : v * rate
  const dStr = (d) => new Date(d).toISOString().slice(0, 10)

  const range = React.useMemo(() => {
    const end = new Date()
    let start
    if (timeRange === '7') start = new Date(end.getTime() - 6 * 86400000)
    else if (timeRange === '30') start = new Date(end.getTime() - 29 * 86400000)
    else if (timeRange === '180') start = new Date(end.getTime() - 179 * 86400000)
    else if (timeRange === '365') start = new Date(end.getTime() - 364 * 86400000)
    else {
      // Include payout dates in the range calculation in case all accounts are deleted
      const accDates = allAccounts.map(a => +new Date(a.dateCreated))
      const payoutDates = payouts.map(p => +new Date(p.dateCreated))
      const allDates = [...accDates, ...payoutDates].filter(n => !isNaN(n))
      const min = allDates.length ? Math.min(...allDates) : +end
      start = new Date(min)
    }
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
    return { start, end, startKey: dStr(start), endKey: dStr(end) }
  }, [allAccounts, payouts, timeRange])

  const ALL_CATS = React.useMemo(() => {
    const fromAccounts = allAccounts.map(a => a.type).filter(Boolean)
    const fromArchived = payouts.flatMap(p => (p._archivedAccounts || []).map(arc => arc.type).filter(Boolean))
    const fromFirms = firms.filter(f => f.type).map(f => f.type)
    return Array.from(new Set([...fromAccounts, ...fromArchived, ...fromFirms]))
  }, [allAccounts, payouts, firms])
  const showTotalOnly = selected.length === 0 || selected.length === ALL_CATS.length
  const activeCats = showTotalOnly ? ALL_CATS : selected

  const [catColors, setCatColors] = React.useState({})
  React.useEffect(() => {
    const cls = (c) => c === 'Forex' ? 'lavander' : c === 'Cripto' ? 'orange' : c === 'Futures' ? 'pink' : c === 'Personal' ? 'purple' : 'gray'
    const map = {}
    for (const c of ALL_CATS) {
      const el = document.createElement('span'); el.className = `pill ${cls(c)}`
      document.body.appendChild(el); map[c] = getComputedStyle(el).color; document.body.removeChild(el)
    }
    setCatColors(map)
  }, [ALL_CATS])

  const colorFor = (k) => k === 'Total' ? '#34d399' : (catColors[k] || '#94a3b8')

  const fundingEvents = React.useMemo(() => {
    const ev = new Map()
    for (const a of accounts) {
      if (!activeCats.includes(a.type)) continue
      const key = dStr(a.dateCreated)
      if (new Date(key) < range.start || new Date(key) > range.end) continue
      const m = ev.get(key) || {}; m[a.type] = (m[a.type] || 0) + (+a.currentFunding || 0); ev.set(key, m)
    }
    return ev
  }, [accounts, activeCats, range])

  const payoutEvents = React.useMemo(() => {
    const ev = new Map()
    for (const p of payouts) {
      const key = dStr(p.dateCreated)
      if (new Date(key) < range.start || new Date(key) > range.end) continue
      let bucket = ev.get(key) || {}
      let contributed = false
      // Try to resolve via live accountIds
      const ids = p.accountIds || []
      for (const id of ids) {
        const acc = accounts.find(a => a.id === id) || allAccounts.find(a => a.id === id)
        if (!acc || !activeCats.includes(acc.type)) continue
        bucket[acc.type] = (bucket[acc.type] || 0) + (+p.amountReceived || 0)
        contributed = true
      }
      // Fall back to archived account snapshots for deleted accounts
      if (!contributed && p._archivedAccounts?.length) {
        for (const arc of p._archivedAccounts) {
          if (!activeCats.includes(arc.type)) continue
          bucket[arc.type] = (bucket[arc.type] || 0) + (+p.amountReceived || 0)
          contributed = true
        }
      }
      // Fall back to firm type for firm-only payouts (no account linked)
      if (!contributed && p.firmId) {
        const firm = firms.find(f => f.id === p.firmId)
        if (firm?.type && activeCats.includes(firm.type)) {
          bucket[firm.type] = (bucket[firm.type] || 0) + (+p.amountReceived || 0)
          contributed = true
        }
      }
      if (contributed) ev.set(key, bucket)
    }
    return ev
  }, [payouts, accounts, allAccounts, activeCats, range])

  function buildStepSeries(eventsMap) {
    const dates = Array.from(eventsMap.keys()).sort()
    const cumByCat = Object.create(null); const rows = []
    if (showTotalOnly) rows.push({ date: range.startKey, Total: cur(0) })
    else { const row = { date: range.startKey }; for (const c of activeCats) row[c] = cur(0); rows.push(row) }
    for (const key of dates) {
      const deltas = eventsMap.get(key) || {}
      for (const [cat, inc] of Object.entries(deltas)) cumByCat[cat] = (cumByCat[cat] || 0) + inc
      if (showTotalOnly) {
        const total = Object.values(cumByCat).reduce((s, v) => s + v, 0)
        rows.push({ date: key, Total: cur(total) })
      } else {
        const row = { date: key }; for (const c of activeCats) row[c] = cur(cumByCat[c] || 0); rows.push(row)
      }
    }
    if (rows.length === 0 || rows[rows.length - 1].date !== range.endKey) {
      const last = rows[rows.length - 1] || (showTotalOnly ? { Total: cur(0) } : Object.fromEntries(activeCats.map(c => [c, cur(0)])))
      rows.push({ ...last, date: range.endKey })
    }
    return rows
  }

  const fundingData = React.useMemo(() => buildStepSeries(fundingEvents), [fundingEvents, showTotalOnly, activeCats, currency, rate])
  const payoutData = React.useMemo(() => buildStepSeries(payoutEvents), [payoutEvents, showTotalOnly, activeCats, currency, rate])
  const keys = showTotalOnly ? ['Total'] : activeCats.slice()

  const fmtTick = (v) => timeRange === 'all'
    ? new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : new Date(v).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })

  const fmtVal = (v) => {
    if (v == null) return ''
    return currency === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
  }

  const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#0f1218', border: '1px solid #2a3246', borderRadius: 8, padding: '8px 12px' }}>
        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>{new Date(label).toLocaleDateString('en-US')}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.dataKey}: {fmtVal(p.value)}</div>
        ))}
      </div>
    )
  }

  const chartData = activeTab === 'payouts' ? payoutData : fundingData

  return (
    <div style={{ ...glass(), marginBottom: 0 }}>
      <GlowOrb color={activeTab === 'payouts' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)'} size={160} top={-60} right={-60} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12, position: 'relative' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
          📈 Equity and Funding
        </h3>
        {/* Tab switcher — unchanged */}
        <div style={{ display: 'inline-flex', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 3 }}>
          <button onClick={() => setActiveTab('payouts')} style={{
            background: activeTab === 'payouts' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
            color: activeTab === 'payouts' ? '#ffffff' : '#94a3b8',
            border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <span>💸</span> Payouts & Withdrawals
          </button>
          <button onClick={() => setActiveTab('funding')} style={{
            background: activeTab === 'funding' ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'transparent',
            color: activeTab === 'funding' ? '#ffffff' : '#94a3b8',
            border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <span>💰</span> Funding
          </button>
        </div>
      </div>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 15, right: 15, left: 40, bottom: 25 }}>
            <defs>
              {keys.map(k => {
                const col = colorFor(k)
                return (
                  <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={col} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={col} stopOpacity={0.02} />
                  </linearGradient>
                )
              })}
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#374151" opacity={0.3} horizontal vertical={false} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtTick} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtVal} />
            <Tooltip content={<Tip />} />
            <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
            {keys.map(k => (
              <Area key={k + activeTab} type="monotone" dataKey={k}
                stroke={colorFor(k)} strokeWidth={2.5} fill={`url(#grad-${k})`}
                dot={(props) => {
                  const { cx, cy, payload } = props
                  const isEvent = (activeTab === 'funding' && fundingEvents.has(payload.date)) || (activeTab === 'payouts' && payoutEvents.has(payload.date))
                  if (!isEvent) return null
                  return <circle key={`${payload.date}-${k}`} cx={cx} cy={cy} r={5} stroke="#0f1218" strokeWidth={2} fill={colorFor(k)} />
                }}
                activeDot={{ r: 6, stroke: '#0f1218', strokeWidth: 2 }}
                name={k} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* =========================================================
   5) Funding per Account  —  GLASS UPGRADE
   ========================================================= */
function FundingPerAccount({ accountStatusFilter = ['live', 'funded'], dateFilter = {} }) {
  const { accounts } = useFiltered(accountStatusFilter, dateFilter)
  const { currency, rate } = useCurrency()
  const [firms, setFirms] = React.useState([])

  React.useEffect(() => { const data = getAll(); setFirms(data.firms || []) }, [])

  const getFirm = React.useCallback((firmId) => {
    return firms.find((x) => x.id === firmId) || null
  }, [firms])

  const fmt = (v) => {
    if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0)
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0)
  }

  const fmtShort = (v) => {
    const abs = Math.abs(v)
    if (abs >= 1e6) return `${currency === 'USD' ? '$' : 'R$'}${(abs / 1e6).toFixed(1)}M`
    if (abs >= 1e3) return `${currency === 'USD' ? '$' : 'R$'}${(abs / 1e3).toFixed(0)}k`
    return fmt(v)
  }

  const data = React.useMemo(() => {
    return accounts
      .map((a) => {
        const firm = getFirm(a.firmId)
        return {
          name: a.name,
          size: currency === 'USD' ? a.currentFunding : a.currentFunding * rate,
          fill: firm?.color || '#6b7280',
          firmName: firm?.name || 'Unassigned',
          status: a.status,
          type: a.type,
        }
      })
      .sort((a, b) => b.size - a.size)
  }, [accounts, currency, rate, getFirm])

  const CustomTreemapContent = (props) => {
    const { x, y, width, height, name, value, fill } = props
    if (width <= 0 || height <= 0) return null
    const showLabel = width > 50 && height > 24
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} ry={4} opacity={0.85}
          stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        {showLabel && (
          <>
            <text x={x + 8} y={y + 14} fill="#f1f5f9" fontSize={11} fontWeight={600}>
              {name.length > 14 ? name.slice(0, 13) + '…' : name}
            </text>
            <text x={x + 8} y={y + 28} fill="rgba(255,255,255,0.6)" fontSize={9}>
              {fmtShort(value)}
            </text>
          </>
        )}
      </g>
    )
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background: '#0f1218', border: `1px solid ${d.fill}`, borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
        <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>{d.name}</div>
        <div style={{ color: d.fill, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{fmt(d.value)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
          <span>{d.firmName}</span>
          <span>·</span>
          <span>{d.status}</span>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div style={glass()}>
        <GlowOrb color="rgba(59,130,246,0.1)" />
        <ChartHeader title="📦 Funding by Account" />
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569', fontSize: 13 }}>
          No accounts match current filters
        </div>
      </div>
    )
  }

  return (
    <div style={glass()}>
      <GlowOrb color="rgba(59,130,246,0.1)" />
      <ChartHeader title="📦 Funding by Account" />

      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            ratio={4 / 3}
            stroke="rgba(255,255,255,0.04)"
            fill="#6b7280"
            content={<CustomTreemapContent />}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      <div style={{ ...SEP, paddingTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
        {Array.from(new Set(data.map(d => d.firmName))).map((firm) => {
          const color = data.find(d => d.firmName === firm)?.fill || '#6b7280'
          const total = data.filter(d => d.firmName === firm).reduce((s, d) => s + d.size, 0)
          return (
            <div key={firm} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '3px 10px' }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{firm}</span>
              <span style={{ fontSize: 10, color: '#64748b' }}>{fmtShort(total)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FundingPerCategory({ accountStatusFilter = ['live', 'funded'], dateFilter = {} }) {
  const { accounts } = useFiltered(accountStatusFilter, dateFilter)
  const { currency, rate } = useCurrency()

  // ← remove useState(categoryColors) e o useEffect inteiro
  const getCatColor = (name) => CAT_HEX[name] || '#6b7280'

  const byCat = useMemo(() => {
    const calc = {}
    for (const a of accounts)
      calc[a.type] = (calc[a.type] || 0) + (currency === 'USD' ? a.currentFunding : a.currentFunding * rate)
    return calc
  }, [accounts, currency, rate])

  const data = useMemo(() => Object.entries(byCat).map(([name, value]) => ({ name, value })), [byCat])
  const total = data.reduce((sum, item) => sum + item.value, 0)

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const dp = payload[0].payload
    const color = getCatColor(dp.name)                         // ← usa getCatColor
    const valueFormatted = currency === 'USD'
      ? `$${dp.value.toLocaleString()}` : `R$${dp.value.toLocaleString()}`
    const pct = ((dp.value / total) * 100).toFixed(1)
    return (
      <div style={{
        background: '#0f1218', border: `1px solid ${color}`,
        color: '#e7eaf0', padding: 10, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
      }}>
        <p style={{ fontWeight: 700, margin: '0 0 4px' }}>{dp.name}</p>
        <p style={{ color, margin: 0, fontWeight: 600 }}>{`${valueFormatted} (${pct}%)`}</p>
      </div>
    )
  }

  const fmtAbbr = (v) => {
    const abs = Math.abs(v)
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`
    return v.toFixed(0)
  }

  const fmtTotal = (v) => {
    if (currency === 'USD') return `$${fmtAbbr(v)}`
    return `R$${fmtAbbr(v)}`
  }

  return (
    <div style={glass()}>
      <GlowOrb color="rgba(124,92,255,0.1)" />
      <ChartHeader title="🧭 Funding by Category" action={
        total > 0 ? <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Total {fmtTotal(total)}</span> : null
      } />

      <div style={{ height: 240, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={95} innerRadius={55}>
              {data.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={getCatColor(entry.name)} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {total > 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2 }}>{fmtTotal(total)}</div>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>total</div>
          </div>
        )}
      </div>

      <div style={{ ...SEP, marginTop: 4 }}>
        {data.map((row) => {
          const color = getCatColor(row.name)                  // ← usa getCatColor
          const valueFormatted = currency === 'USD'
            ? `$${row.value.toLocaleString()}` : `R$${row.value.toLocaleString()}`
          const pct = ((row.value / total) * 100).toFixed(1)
          return (
            <div key={row.name} style={{
              display: 'flex', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span className={`pill ${catPillClass(row.name)}`} style={{ fontSize: 11 }}>{row.name}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{valueFormatted}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{pct}%</div>
              </div>
              <div style={{
                width: 60, height: 4, background: 'rgba(255,255,255,0.05)',
                borderRadius: 2, marginLeft: 12, overflow: 'hidden'
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%', background: color,
                  borderRadius: 2, transition: 'width 0.4s ease'
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
/* =========================================================
   7) Goals Distribution  —  GLASS UPGRADE
   ========================================================= */
function GoalsDistributionChart() {
  const [goals, setGoals] = useState([])

  useEffect(() => {
    const data = getAllGoals({ includeArchived: true })
    setGoals(data.map(g => ({
      ...g,
      status: g.status === 'in-progress' ? 'inProgress' : g.status === 'not-started' ? 'notStarted' :
        g.status === 'completed' ? 'completed' : g.status === 'archived' ? 'archived' : g.status
    })))
  }, [])

  const stats = {
    total: goals.filter(g => !g.archived).length,
    concluido: goals.filter(g => g.completed && !g.archived).length,
    emProgresso: goals.filter(g => !g.completed && !g.archived).length,
    arquivado: goals.filter(g => g.archived).length,
  }

  const chartData = [
    { name: 'Completed', value: stats.concluido },
    { name: 'In Progress', value: stats.emProgresso },
    { name: 'Archived', value: stats.arquivado },
  ]
  const colors = ['#10B981', '#8B5CF6', '#475569']

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const { name, value } = payload[0]
    const color = colors[chartData.findIndex(d => d.name === name)] || '#fff'
    return (
      <div style={{ background: '#0f1218', border: `1px solid ${color}40`, borderRadius: 8, padding: '8px 12px', boxShadow: `0 4px 16px rgba(0,0,0,0.3)` }}>
        <p style={{ margin: 0, fontWeight: 600, color }}>{name}: <span style={{ color: '#f1f5f9' }}>{value}</span></p>
      </div>
    )
  }

  if (stats.total === 0 && stats.arquivado === 0) {
    return (
      <div style={glass()}>
        <GlowOrb color="rgba(139,92,246,0.1)" />
        <ChartHeader title="🎯 Goals by Status" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: 8 }}>
          <div style={{ fontSize: 32, opacity: 0.3 }}>🎯</div>
          <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center' }}>No goals yet</div>
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center' }}>Create goals to track your progress</div>
        </div>
      </div>
    )
  }

  return (
    <div style={glass()}>
      <GlowOrb color="rgba(139,92,246,0.1)" />
      <ChartHeader title="🎯 Goals by Status" action={
        <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
          {stats.total} goal{stats.total !== 1 ? 's' : ''}
          {stats.concluido > 0 && ` · ${((stats.concluido / (stats.total || 1)) * 100).toFixed(0)}% done`}
        </span>
      } />

      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={95} innerRadius={55} stroke="none">
              {chartData.map((entry, i) => <Cell key={i} fill={colors[i]} />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...SEP, marginTop: 4 }}>
        {chartData.filter(r => r.value > 0).map((row, i) => {
          const pct = ((row.value / (stats.total || 1)) * 100).toFixed(1)
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[i] }} />
                <span style={{ fontSize: 13, color: '#cbd5e1' }}>{row.name}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: colors[i] }}>{row.value}</span>
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>({pct}%)</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* =========================================================
   8) Recent Payouts  —  GLASS UPGRADE
   ========================================================= */
function RecentPayouts({ accountStatusFilter = ['live', 'funded'], dateFilter = {} }) {
  const { payouts } = useFiltered(accountStatusFilter, dateFilter)
  const { currency, rate } = useCurrency()
  const navigate = useNavigate()
  const fmt = (v) => currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  const rows = payouts.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated)).slice(0, 6)
  const fmtDate = (d) => { if (!d) return '--'; return new Date(d).toLocaleDateString('en-US') }
  const navigateToPayout = (id) => {
    localStorage.setItem('openPayoutId', id)
    navigate('/payouts')
  }

  // Helper: detect if a payout belongs (even partially) to a deleted account
  const isDeletedAccountPayout = (p) => p._archivedAccounts?.length > 0

  return (
    <div style={glass()}>
      <GlowOrb color="rgba(16,185,129,0.08)" />
      <ChartHeader title="🧾 Recent Payouts" />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Type', 'Status', 'Net'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px 0', color: '#475569', fontSize: 13 }}>No payouts in this period</td></tr>
            ) : rows.map((r) => {
              const fromDeleted = isDeletedAccountPayout(r)
              const archivedNames = (r._archivedAccounts || []).map(a => a.name).join(', ')
              return (
                <tr key={r.id} onClick={() => navigateToPayout(r.id)}
                  style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13, color: '#94a3b8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{fmtDate(r.dateCreated)}</span>
                      {fromDeleted && (
                        <span
                          title={`Conta(s) excluída(s): ${archivedNames || 'desconhecido'}`}
                          style={{
                            fontSize: 10, fontWeight: 600, color: '#94a3b8',
                            background: 'rgba(148,163,184,0.12)',
                            border: '1px solid rgba(148,163,184,0.2)',
                            borderRadius: 4, padding: '1px 5px',
                            cursor: 'help', letterSpacing: '0.3px',
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          👻 deleted
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className={`pill ${catPillClass(r.type)}`}>{r.type || '--'}</span>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className={`pill ${r.status === 'Completed' ? 'greenpayout' : r.status === 'Pending' ? 'yellowpayout' : 'gray'}`}>{r.status}</span>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#22c55e', fontWeight: 700, fontSize: 14 }}>+{fmt(r.amountReceived || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* =========================================================
   9) Shared horizontal ranking list for firms
   ========================================================= */
function FirmRankingList({ title, icon, glowColor, data, fmt }) {
  const [showAll, setShowAll] = useState(false)
  const maxVal = data.length > 0 ? data[0].value : 0

  if (data.length === 0) {
    return (
      <div style={glass()}>
        <GlowOrb color={glowColor} />
        <ChartHeader title={`${icon} ${title}`} />
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569', fontSize: 13 }}>
          No data available
        </div>
      </div>
    )
  }

  const displayData = showAll ? data : data.slice(0, 8)

  return (
    <div style={glass()}>
      <GlowOrb color={glowColor} />
      <ChartHeader title={`${icon} ${title}`} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {displayData.map((d, i) => {
          const pct = maxVal > 0 ? (d.value / maxVal) * 100 : 0
          return (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 10,
              background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
              transition: 'background 0.15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              {/* Rank */}
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: d.value > 0 ? `${d.color}22` : 'transparent',
                border: d.value > 0 ? `1px solid ${d.color}44` : '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                color: d.value > 0 ? d.color : '#475569',
                flexShrink: 0,
              }}>{i + 1}</span>

              {/* Logo / Name */}
              <div style={{ width: 80, flexShrink: 0 }}>
                {d.logo ? (
                  <img src={d.logo} alt={d.name} style={{ height: 16, width: 'auto', objectFit: 'contain', display: 'block' }} />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{d.name}</span>
                )}
              </div>

              {/* Bar */}
              <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.max(pct, d.value > 0 ? 4 : 0)}%`, height: '100%',
                  background: d.value > 0 ? d.color : 'transparent',
                  borderRadius: 4, transition: 'width 0.6s ease',
                }} />
              </div>

              {/* Value */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap' }}>{fmt(d.value)}</span>
                {d.hasArchived && (
                  <span style={{ fontSize: 9, color: '#94a3b8', background: 'rgba(148,163,184,0.12)', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                    archived
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {data.length > 8 && (
        <div style={{ ...SEP, paddingTop: 12, textAlign: 'center' }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              color: '#94a3b8', padding: '6px 16px', borderRadius: 8,
              fontSize: 12, cursor: 'pointer', fontWeight: 600,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#e2e8f0' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#94a3b8' }}
          >
            {showAll ? '▲ Show less' : `▼ Show all (${data.length})`}
          </button>
        </div>
      )}
    </div>
  )
}

/* =========================================================
   10) Funding per Firm  —  RANKING LIST
   ========================================================= */
function FundingPerFirmChart({ accountStatusFilter = ['live', 'funded'], dateFilter = {} }) {
  const { accounts = [] } = useFiltered(accountStatusFilter, dateFilter) || {}
  const { currency = 'USD', rate = 1 } = useCurrency() || {}
  const [firms, setFirms] = React.useState([])

  React.useEffect(() => { const data = getAll(); setFirms(data.firms || []) }, [])

  const fmt = (v) => {
    if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
  }

  const data = React.useMemo(() => {
    const mapped = firms.map((f) => {
      const totalRaw = accounts.filter((a) => a.firmId === f.id).reduce((s, a) => s + (a.currentFunding || 0), 0)
      return { id: f.id, name: f.name, type: f.type || '', logo: f.logo, color: f.color || '#6b7280', value: currency === 'USD' ? totalRaw : totalRaw * rate }
    })
    return mapped.sort((a, b) => b.value - a.value)
  }, [firms, accounts, currency, rate])

  return <FirmRankingList title="Funding by Firm" icon="💰" glowColor="rgba(245,158,11,0.08)" data={data} fmt={fmt} />
}

/* =========================================================
   11) Payouts per Firm  —  RANKING LIST
   ========================================================= */
function PayoutsPerFirmChart({ accountStatusFilter = ['live', 'funded'], dateFilter = {} }) {
  const { payouts = [], accounts = [] } = useFiltered(accountStatusFilter, dateFilter) || {}
  const { currency = 'USD', rate = 1 } = useCurrency() || {}
  const [firms, setFirms] = React.useState([])

  React.useEffect(() => { const data = getAll(); setFirms(data.firms || []) }, [])

  const fmt = (v) => {
    if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
  }

  const data = React.useMemo(() => {
    const totals = {}
    const archivedFlags = {}
    payouts.forEach((p) => {
      const amountRaw = p.amountReceived ?? p.amount ?? 0
      const amount = currency === 'USD' ? amountRaw : amountRaw * rate
      let resolved = false
      if (p.firmId) { totals[p.firmId] = (totals[p.firmId] || 0) + amount; resolved = true }
      else if (Array.isArray(p.accountIds) && p.accountIds.length) {
        p.accountIds.forEach((accId) => { const acc = accounts.find((a) => a.id === accId); if (acc?.firmId) { totals[acc.firmId] = (totals[acc.firmId] || 0) + amount; resolved = true } })
      } else if (p.accountId) {
        const acc = accounts.find((a) => a.id === p.accountId); if (acc?.firmId) { totals[acc.firmId] = (totals[acc.firmId] || 0) + amount; resolved = true }
      } else if (Array.isArray(p.accounts)) {
        p.accounts.forEach((name) => { const acc = accounts.find((a) => a.name === name); if (acc?.firmId) { totals[acc.firmId] = (totals[acc.firmId] || 0) + amount; resolved = true } })
      } else if (p.accountName) {
        const acc = accounts.find((a) => a.name === p.accountName); if (acc?.firmId) { totals[acc.firmId] = (totals[acc.firmId] || 0) + amount; resolved = true }
      }
      if (!resolved && p._archivedAccounts?.length) {
        p._archivedAccounts.forEach((arc) => { if (arc.firmId) { totals[arc.firmId] = (totals[arc.firmId] || 0) + amount; archivedFlags[arc.firmId] = true } })
      }
      if (p._archivedAccounts?.length) {
        p._archivedAccounts.forEach((arc) => { if (arc.firmId) archivedFlags[arc.firmId] = true })
      }
    })
    const mapped = firms.map((f) => ({ id: f.id, name: f.name, logo: f.logo, type: f.type, color: f.color || '#6b7280', value: totals[f.id] || 0, hasArchived: !!archivedFlags[f.id] }))
    return mapped.sort((a, b) => b.value - a.value)
  }, [payouts, accounts, firms, currency, rate])

  return <FirmRankingList title="Payouts by Firm" icon="🧾" glowColor="rgba(16,185,129,0.08)" data={data} fmt={fmt} />
}

/* =========================================================
   11) Accounts Overview  —  RICH CARDS
   ========================================================= */
function AccountsOverview({ accountStatusFilter = ['live', 'funded'], dateFilter = {} }) {
  const { accounts } = useFiltered(accountStatusFilter, dateFilter)
  const [firms, setFirms] = React.useState([])
  const [showAll, setShowAll] = useState(false)
  const { currency, rate } = useCurrency()

  React.useEffect(() => { const data = getAll(); setFirms(data.firms || []) }, [])

  const getFirm = (firmId) => firms.find((f) => f.id === firmId) || null

  const fmt = (v) => {
    if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0)
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v * rate || 0)
  }

  const sorted = [...accounts].sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
  const display = showAll ? sorted : sorted.slice(0, 5)

  return (
    <div style={glass()}>
      <GlowOrb color="rgba(124,92,255,0.08)" />
      <ChartHeader title="🗂️ Accounts Overview" action={
        sorted.length > 5 ? (
          <button onClick={() => setShowAll(!showAll)}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              color: '#94a3b8', padding: '3px 10px', borderRadius: 6,
              fontSize: 11, cursor: 'pointer', fontWeight: 600,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#e2e8f0' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#94a3b8' }}
          >
            {showAll ? '▲ Less' : `▼ ${sorted.length} accounts`}
          </button>
        ) : null
      } />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {display.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#475569', fontSize: 13 }}>No accounts match current filters</div>
        ) : display.map((a) => {
          const firm = getFirm(a.firmId)
          const firmColor = firm?.color || '#6b7280'
          const statusColor = a.status === 'Live' ? '#22c55e' : a.status === 'Funded' ? '#3b82f6' : a.status === 'Challenge' ? '#e1b12c' : '#5b6270'
          const statusBg = a.status === 'Live' ? 'rgba(34,197,94,0.1)' : a.status === 'Funded' ? 'rgba(59,130,246,0.1)' : a.status === 'Challenge' ? 'rgba(225,177,44,0.1)' : 'rgba(91,98,112,0.1)'
          return (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 10,
              background: `linear-gradient(135deg, ${firmColor}08 0%, transparent 100%)`,
              border: '1px solid rgba(255,255,255,0.04)',
              transition: 'all 0.15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${firmColor}44`; e.currentTarget.style.background = `linear-gradient(135deg, ${firmColor}12 0%, rgba(255,255,255,0.02) 100%)` }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.background = `linear-gradient(135deg, ${firmColor}08 0%, transparent 100%)` }}>
              {/* Firm avatar/icon */}
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${firmColor}18`,
                border: `1px solid ${firmColor}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, overflow: 'hidden',
              }}>
                {firm?.logo ? (
                  <img src={firm.logo} alt={firm.name} style={{ width: 20, height: 16, objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: 14 }}>🏦</span>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{a.name}</span>
                  <span className={`pill ${catPillClass(a.type)}`} style={{ fontSize: 9, padding: '1px 7px' }}>{a.type}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
                    color: statusColor, background: statusBg,
                  }}>{a.status}</span>
                </div>
                {firm && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {firm.name}
                  </div>
                )}
              </div>

              {/* Funding */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{fmt(a.currentFunding)}</div>
                <div style={{ fontSize: 10, color: '#475569' }}>
                  {new Date(a.dateCreated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* =========================================================
   12) Dashboard — página principal
   ========================================================= */
export default function Dashboard() {
  const [accountStatusFilter, setAccountStatusFilter] = useState(['live', 'funded', 'archived'])
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef(null)
  const [dateFilter, setDateFilter] = useState({ start: null, end: null })
  const [showCalendar, setShowCalendar] = useState(false)
  const calendarRef = useRef(null)
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [firms, setFirms] = useState([])
  const [allAccountsData, setAllAccountsData] = useState([])

  useEffect(() => {
    const data = getAll(); setAllAccountsData((data.accounts || []).filter(a => a.hidden !== true)); setFirms(getFirms())
  }, [])

  const cats = useMemo(() => Array.from(new Set(allAccountsData.map(a => a.type))), [allAccountsData])

  const accountStatuses = useMemo(() => {
    const all = (allAccountsData || []).map((a) => a.status?.toLowerCase() || '').filter((s) => !!s)
    const set = new Set(all); set.add('archived'); return Array.from(set)
  }, [allAccountsData])

  const props = { accountStatusFilter, dateFilter }

  return (
    <div className="dashboard-page" style={{ display: 'flex', flexDirection: 'column', gap: 20, overflowX: 'hidden' }}>
      {/* Overlays invisíveis para capturar cliques fora e fechar dropdowns */}
      {statusDropdownOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen(false) }} />
      )}
      {showCalendar && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={(e) => { e.stopPropagation(); setShowCalendar(false) }} />
      )}
      
      <FiltersBar
        categories={cats}
        accountStatusFilter={accountStatusFilter} setAccountStatusFilter={setAccountStatusFilter}
        statusDropdownOpen={statusDropdownOpen} setStatusDropdownOpen={setStatusDropdownOpen}
        statusDropdownRef={statusDropdownRef} accountStatuses={accountStatuses}
        dateFilter={dateFilter} setDateFilter={setDateFilter}
        showCalendar={showCalendar} setShowCalendar={setShowCalendar}
        calendarRef={calendarRef}
        selectedAccountIds={selectedAccountIds} setSelectedAccountIds={setSelectedAccountIds}
        allAccounts={allAccountsData} firms={firms}
      />

      <SummaryCards {...props} selectedAccountIds={selectedAccountIds} />
      <PatrimonioLine {...props} />

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <FundingPerCategory {...props} />
        <GoalsDistributionChart />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <FundingPerAccount {...props} />
        <RecentPayouts {...props} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <FundingPerFirmChart {...props} />
        <PayoutsPerFirmChart {...props} />
      </div>

      <AccountsOverview {...props} />
    </div>
  )
}