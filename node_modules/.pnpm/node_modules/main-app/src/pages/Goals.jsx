// src/pages/Goals.jsx
import React, { useEffect, useState, useMemo } from 'react'
import { getAll, getAllGoals, createGoal, updateGoal, deleteGoal, archiveGoal} from '@apps/lib/dataStore'
import { useCurrency } from '@apps/state'
import { v4 as uuid } from 'uuid'
import { PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { createTag, getAllTags } from '@apps/lib/dataStore'

function hexToRgba(hex, alpha = 1) {
  const cleanHex = hex.replace('#', '')
  const bigint = parseInt(cleanHex, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function Goals() {
  const [goals, setGoals] = useState([])
  const [accounts, setAccounts] = useState([])
  const [strategies, setStrategies] = useState([]) // se você tiver strategies
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filters, setFilters] = useState({ type: '', status: '', accountId: '' })
  const { currency, rate } = useCurrency()
  const [showArchived, setShowArchived] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    loadData()
    const handler = () => loadData()
    window.addEventListener('datastore:change', handler)
    window.addEventListener('storage', handler)
    const interval = setInterval(() => loadData(), 15 * 60 * 1000) // atualiza a cada 15minutos
    return () => {
      window.removeEventListener('datastore:change', handler)
      window.removeEventListener('storage', handler)
      clearInterval(interval)
    }
  }, [])

  function loadData() {
    const d = getAll()
    setAccounts(d.accounts || [])
    setStrategies(d.strategies || [])
    const g = getAllGoals({ includeArchived: true })
    setGoals(g)
  }

const filteredGoals = useMemo(() => {
  let list = goals

  if (activeFilter === 'completed') {
    list = list.filter(g => g.completed && !g.archived)
  } else if (activeFilter === 'progress') {
    list = list.filter(g => !g.completed && !g.archived)
  } else if (activeFilter === 'archived') {
    list = list.filter(g => g.archived)
  } else {
    // "Todos" → tudo exceto arquivadas
    list = list.filter(g => !g.archived)
  }

  if (filters.type) list = list.filter(g => g.type === filters.type)
  if (filters.accountId) list = list.filter(g => g.linkedAccounts?.includes(filters.accountId))

  return list
}, [goals, filters, activeFilter])


  const handleCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const handleEdit = (g) => { setEditing(g); setModalOpen(true) }
  const handleDelete = (id) => { if (confirm('Excluir meta?')) { deleteGoal(id); loadData() } }

  const handleSave = (form) => {
    // normalize dates -> ISO strings
    const payload = {
      ...form,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : new Date().toISOString(),
      deadline: form.perpetual ? null : (form.deadline ? new Date(form.deadline).toISOString() : null)
    }
    if (editing) {
      updateGoal(editing.id, payload)
    } else {
      createGoal(payload)
    }
    setModalOpen(false)
    loadData()
  }

  const fmt = (v) => currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)


    
  return (
    <div className="goals-page">
<div className="page-header" style={{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}}>
  <h1 className="text-2xl font-semibold flex items-center gap-2">
    🎯 Goals
  </h1>
  <button
    className="btn"
    style={{
      padding: '0.6rem 1.2rem',
      fontWeight: 600,
      background: '#6d4aff',
      color: '#fff',
      border: 'none',
      borderRadius: '0.6rem',
    }}
    onClick={() => setModalOpen(true)}
  >
    + Nova Meta
  </button>
</div>
{/* 📊 Painel de Resumo (Cards + Donut) */}
<div
  className="grid gap-4"
  style={{
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', // 4 cards + gráfico
    alignItems: 'stretch',
    marginBottom: '1.5rem',
  }}
>
  {[
    { key: 'all', title: '🎯 Total Goals', count: goals.length, desc: 'metas criadas', accent: 'accent8' },
    { key: 'progress', title: '🕓 Em Progresso', count: goals.filter(g => !g.completed && !g.archived).length, desc: 'metas em andamento', accent: 'accent9' }, 
    { key: 'completed', title: '✅ Concluídos', count: goals.filter(g => g.completed && !g.archived).length, desc: 'metas finalizadas', accent: 'accent7' },
    { key: 'archived', title: '📦 Arquivadas', count: goals.filter(g => g.archived).length, desc: 'metas arquivadas', accent: 'accent1' },
  ].map(card => (
    <div
      key={card.key}
      className={`card small clickable ${card.accent}`}
      onClick={() => setActiveFilter(card.key)}
      style={{
        cursor: 'pointer',
        border: activeFilter === card.key ? '2px solid var(--primary)' : '1px solid transparent',
        boxShadow: activeFilter === card.key ? '0 0 15px rgba(99,102,241,0.3)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      <h3>{card.title}</h3>
      <div className="stat sm">{card.count}</div>
      <div className="muted text-xs">{card.desc}</div>
    </div>
  ))}

</div>

      <div className="card filters">
        <select value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})} className="input">
          <option value="">Todos</option>
          <option value="profit">Profit</option>
          <option value="roi">ROI</option>
          <option value="payout">Payout</option>
          <option value="tradeCount">Trades</option>
          <option value="winRate">WinRate</option>
          <option value="avgR">Avg R</option>
        </select>

        <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="input">
          <option value="">Todos status</option>
          <option value="active">Ativos</option>
          <option value="completed">Completados</option>
        </select>

        <select value={filters.accountId} onChange={e => setFilters({...filters, accountId: e.target.value})} className="input">
          <option value="">Todas contas</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <button className="btn ghost" onClick={() => setFilters({ type:'', status:'', accountId:'' })}>Limpar</button>
      </div>

      <div className="goals-list">
        {filteredGoals.length === 0 ? (
          <div className="card empty-state">
            <p>Nenhuma meta encontrada.</p>
            <button className="btn" onClick={handleCreate}>Criar primeira meta</button>
          </div>
        ) : filteredGoals.map(goal => (
          <GoalCard key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} fmt={fmt} accounts={accounts} />
        ))}
      </div>

      {modalOpen && (
        <GoalModal
          goal={editing}
          accounts={accounts}
          strategies={strategies}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

// subcomponents
function GoalCard({ goal, onEdit, onDelete, fmt, accounts }) {
  const allLinked = goal.linkedAccounts || []
  const linkedNames = allLinked
    .map(id => accounts.find(a => a.id === id)?.name || '—')
    .filter(Boolean)

  let accountDisplay = 'Todas'
  if (linkedNames.length > 0) {
    accountDisplay =
      linkedNames.length > 3
        ? `${linkedNames[0]} +${linkedNames.length - 1}`
        : linkedNames.join(', ')
  }

  const typeLabels = {
    profit: 'Lucro',
    roi: 'ROI %',
    payout: 'Payout',
    tradeCount: 'Trades',
    winRate: 'Win Rate',
    avgR: 'Média R',
  }

  const periodLabels = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    yearly: 'Anual',
    allTime: 'Desde o Início',
  }
const [isFading, setIsFading] = useState(false)

  return (
<div
   className={`card goal-card ${goal.completed ? 'completed' : ''} ${isFading ? 'fade-out' : ''}`}
  style={{
    padding: '1.5rem',
    marginBottom: '1.25rem',
    transition: 'opacity 0.3s ease, transform 0.3s ease, background-color 0.2s ease',
    backgroundColor: goal.tag?.color ? hexToRgba(goal.tag.color, 0.08) : 'var(--card-bg)',
    border: goal.tag?.color ? `1px solid ${goal.tag.color}` : '1px solid transparent',
  }}
  onMouseEnter={(e) => {
    if (goal.tag?.color) {
      e.currentTarget.style.backgroundColor = hexToRgba(goal.tag.color, 0.15)
    }
  }}
  onMouseLeave={(e) => {
    if (goal.tag?.color) {
      e.currentTarget.style.backgroundColor = hexToRgba(goal.tag.color, 0.08)
    }
  }}
>

      {/* HEADER */}
      <div className="goal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        
        {/* LEFT SIDE */}
        <div>
          <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
  {goal.completed && <span className="badge green">✓</span>}
  {goal.archived && <span className="badge gray">📦</span>}
  <span>{goal.title}</span>

{goal.tag?.name && (
  <span
    className="tag-banner"
    style={{
      background: goal.tag.color || '#6d4aff',
      color: '#fff',
      fontSize: '0.7rem',
      padding: '0.2rem 0.7rem',
      borderRadius: '999px',
      fontWeight: 600,
      marginLeft: '0.5rem',
      letterSpacing: '0.3px',
      boxShadow: `0 0 6px ${goal.tag.color}55`,
    }}
  >
    {goal.tag.name}
  </span>
)}

</h3>


          <div className="goal-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.9rem' }}>
<span className="muted">
  Tipo:{' '}
  <span
    style={{
      display: 'inline-block',
      background:
        goal.type === 'profit' ? '#10B98120' :
        goal.type === 'roi' ? '#FBBF2420' :
        goal.type === 'payout' ? '#3B82F620' :
        goal.type === 'tradeCount' ? '#EC489920' :
        goal.type === 'winRate' ? '#06B6D420' :
        '#8B5CF620',
      color:
        goal.type === 'profit' ? '#10B981' :
        goal.type === 'roi' ? '#FBBF24' :
        goal.type === 'payout' ? '#3B82F6' :
        goal.type === 'tradeCount' ? '#EC4899' :
        goal.type === 'winRate' ? '#06B6D4' :
        '#8B5CF6',
      padding: '2px 8px',
      borderRadius: '9999px',
      fontWeight: 500,
      fontSize: '0.75rem',
    }}
  >
    {typeLabels[goal.type] || goal.type}
  </span>
</span>
            <span className="muted">Período: <strong>{periodLabels[goal.period] || goal.period}</strong></span>
            <span className="muted">Conta(s): <strong>{accountDisplay}</strong></span>
            {!goal.perpetual && goal.deadline && (
              <span className="muted">Prazo: <strong>{new Date(goal.deadline).toLocaleDateString()}</strong></span>
            )}
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <span
              className="btn ghost small"
              style={{ padding: '2px 6px', fontSize: 12 }}
              onClick={() => onEdit(goal)}
            >
              ✏️
            </span>
<button
  className="btn ghost small"
  style={{ padding: '2px 6px', fontSize: 12 }}
  onClick={() => {
    setIsFading(true)
setTimeout(() => {
  const ok = archiveGoal(goal.id, !goal.archived)
  if (ok) {
    // Garante atualização suave na tela
    window.dispatchEvent(new CustomEvent('datastore:change'))
  } else {
    console.error('Falha ao arquivar meta:', goal.id)
  }
}, 300)
 // ⏳ aguarda o fade antes de atualizar
  }}
  title={goal.archived ? 'Desarquivar' : 'Arquivar'}
>
  📦
</button>

            <button
              className="btn ghost small"
              style={{ padding: '2px 6px', fontSize: 14, color: '#f66' }}
              onClick={() => onDelete(goal.id)}
              title="Excluir"
            >
              ✕
            </button>
          </div>   
         <div className="muted small" style={{ fontSize: '0.7rem' }}>
            {new Date(goal.createdAt).toLocaleDateString()}
            {goal.completedAt && (
              <span className="muted"> → {new Date(goal.completedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* PROGRESS */}
      <div className="progress-container" style={{ marginTop: '1rem' }}>
        <div className="progress-bar" >
          <div className="progress-fill" style={{ width: `${Math.min(100, goal.progress || 0)}%`}}  />
        </div>
        <div className="progress-text" style={{ marginTop: '0.4rem' }}>
          {goal.minDays > 0 && (
  <div className="muted small" style={{ marginTop: '0.3rem' }}>
    Dias ativos: <strong>{goal.daysActive || 0}</strong> / {goal.minDays}
  </div>
)}

          <strong>{(goal.progress || 0).toFixed(1)}%</strong>
          {goal.currentValue !== undefined && (
            <span className="muted"> ({fmt(goal.currentValue)} / {fmt(goal.targetValue)})</span>
          )}
        </div>
      </div>

{/* SUBGOALS */}
{goal.subProgresses && goal.subProgresses.length > 0 && (
  (() => {
    const seqMode = goal.mode === 'sequential'
    // índice do primeiro subgoal não concluído (o "atual" no modo sequencial)
    const firstIncomplete = seqMode
      ? goal.subProgresses.findIndex(s => !s.completed)
      : -1

    // cor / estilo herdado do card principal
    const tagColor = goal.tag?.color || '#6d4aff'
    const cardBorder = `1px solid ${tagColor}`
    const cardShadow = `0 6px 18px ${hexToRgba(tagColor, 0.12)}`

    return (
      <div className="subgoals" style={{ marginTop: '1rem', position: 'relative' }}>
        {goal.subProgresses.map((s, idx) => {
          const isCompleted = !!s.completed
          const isCurrent = seqMode && firstIncomplete === idx
          const isLocked = seqMode && firstIncomplete !== -1 && idx > firstIncomplete

          // estilos dinâmicos:
          const wrapperStyle = {
            marginBottom: '1rem',
            borderRadius: 8,
            padding: '0.8rem 1rem',
            transition: 'all 0.18s ease',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            background: isCurrent ? hexToRgba(tagColor, 0.03) : 'transparent',
            border: isCurrent ? cardBorder : '1px solid rgba(255,255,255,0.03)',
            boxShadow: isCurrent ? cardShadow : 'none',
            opacity: isCompleted ? 0.6 : (isLocked ? 0.45 : 1),
            filter: isLocked ? 'grayscale(60%) blur(0.3px)' : 'none',
            pointerEvents: isLocked ? 'none' : 'auto' // opcional: impede clique nos bloqueados
          }

          return (
            <div key={s.id} style={{ position: 'relative' }}>
              <div className="subgoal" style={wrapperStyle}>
                <span className={isCompleted ? 'completed' : 'pending'}>
                  {isCompleted ? '✓' : (isCurrent ? '▶' : '⏳')}
                </span>

                <div style={{ flex: 1 }}>
                  <div className="subgoal-title" style={{ fontWeight: isCurrent ? 700 : 600 }}>
                    {s.title}
                  </div>

                  <div className="mini-bar" style={{ marginTop: 8 }}>
                    <div style={{ width: `${Math.min(100, s.progress)}%` }} />
                  </div>

                  <div className="muted small" style={{ marginTop: '0.3rem' }}>
                    {(s.progress || 0).toFixed(0)}% ({fmt(s.currentValue ?? 0)} / {fmt(s.targetValue)})
                  </div>

                  {s.minDays > 0 && (
                    <div className="muted small" style={{ marginTop: '0.3rem' }}>
                      Dias ativos: <strong>{s.daysActive || 0}</strong> / {s.minDays}
                    </div>
                  )}
                </div>
              </div>

              {/* seta entre subgoals (modo sequencial) */}
              {goal.mode === 'sequential' && idx < goal.subProgresses.length - 1 && (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: '1.4rem',
                    opacity: isLocked ? 0.2 : 0.5,
                    margin: '-0.5rem 0 0.5rem 0',
                    color: isLocked ? '#777' : undefined
                  }}
                >
                  ↓
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  })()
)}

    </div>
)}



function GoalModal({ goal, accounts = [], strategies = [], onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    title: goal?.title || '',
    description: goal?.description || '',
    type: goal?.type || 'profit',
    period: goal?.period || 'monthly',
    perpetual: goal?.perpetual || false,
    linkedAccounts: goal?.linkedAccounts || [],
    linkedStrategies: goal?.linkedStrategies || [],
    targetValue: goal?.targetValue || 0,
    startDate: goal?.startDate ? goal.startDate.split('T')[0] : new Date().toISOString().split('T')[0],
    deadline: goal?.deadline ? goal.deadline.split('T')[0] : '',
    subGoals: (goal?.subGoals || []).map(s => ({ ...s })),
    tag: goal?.tag || { name: '', color: '' },
    minDays: goal?.minDays || 0,
  }))
const [availableTags, setAvailableTags] = useState(getAllTags())

useEffect(() => {
  const handler = () => setAvailableTags(getAllTags())
  window.addEventListener('datastore:change', handler)
  return () => window.removeEventListener('datastore:change', handler)
}, [])

const { currency, rate } = useCurrency()
const fmt = (v) => currency === 'USD'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

// 🔎 Estados e filtro de contas
const [query, setQuery] = useState('')
const [filterType, setFilterType] = useState('')

const filteredAccounts = useMemo(() => {
  const lower = query.toLowerCase()
  return accounts.filter(acc => {
    if (filterType && acc.type !== filterType) return false
    if (!query) return true
    return (
      (acc.name || '').toLowerCase().includes(lower) ||
      (acc.firmName || '').toLowerCase().includes(lower) ||
      String(acc.currentFunding || '').includes(lower)
    )
  })
}, [accounts, query, filterType])

const addSubGoal = () => {
  setForm(f => ({
    ...f,
    subGoals: [
      ...f.subGoals,
      {
        id: uuid(),
        title: '',
        type: 'profit',
        targetValue: 0,
        weight: 1,
        minDays: 0,
        daysActive: 0,       // 👈 novo campo
        uniqueDays: [],      // 👈 novo campo
        linkedAccounts: [],
        linkedStrategies: []
      }
    ]
  }))
}

  const removeSub = (id) => setForm(f => ({ ...f, subGoals: f.subGoals.filter(s => s.id !== id) }))
  const updateSub = (id, field, value) => setForm(f => ({ ...f, subGoals: f.subGoals.map(s => s.id === id ? ({ ...s, [field]: value }) : s) }))

  const handleSubmit = () => {
    // basic validation
    if (!form.title) return alert('Título obrigatório')
    if ((!form.subGoals || form.subGoals.length === 0) && (!form.targetValue || form.targetValue <= 0)) return alert('Valor alvo obrigatório')
    // pass up
    onSave(form)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{goal ? 'Editar Meta' : 'Nova Meta'}</h2>

        <div className="field">
          <label>Título</label>
          <input className="input" value={form.title} onChange={e => setForm({...form, title: e.target.value})}/>
        </div>
        <div className="field">
  <label>Tag / Categoria</label>
  <div className="flex items-center gap-2 mb-2">
    <input
      className="input"
      list="tags-list"
      placeholder="Digite ou selecione uma tag (ex: Pessoal, Payout...)"
      value={form.tag.name}
      onChange={(e) => {
        const value = e.target.value
        const existing = availableTags.find(t => t.name === value)
        if (existing) {
          setForm({ ...form, tag: existing })
        } else {
          setForm({ ...form, tag: { name: value, color: form.tag.color || '#6d4aff' } })
        }
      }}
      style={{ flex: 1 }}
    />
    <datalist id="tags-list">
      {availableTags.map(t => (
        <option key={t.id} value={t.name} />
      ))}
    </datalist>

    <input
      type="color"
      value={form.tag.color || '#6d4aff'}
      onChange={(e) =>
        setForm({ ...form, tag: { ...form.tag, color: e.target.value } })
      }
      title="Escolha uma cor"
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        cursor: 'pointer',
        border: 'none',
      }}
    />
  </div>

  <button
    className="btn ghost small"
    onClick={() => {
      const name = form.tag.name.trim()
      if (!name) return alert('Digite o nome da tag para salvar.')
      const newTag = createTag(form.tag)
      setAvailableTags((prev) =>
        prev.some((t) => t.id === newTag.id)
          ? prev
          : [...prev, newTag]
      )
      alert(`✅ Tag "${newTag.name}" criada e salva.`)
    }}
  >
    💾 Salvar nova tag
  </button>

  <p className="muted small mt-1">
    Digite para criar uma nova tag ou selecione uma existente.  
    A cor será usada na borda e hover do card.
  </p>
        </div>

        <div className="field">
          <label>Descrição</label>
          <textarea className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
        </div>

        <div className="row">
          <div className="field">
            <label>Tipo</label>
            <select className="input" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
              <option value="profit">Profit</option>
              <option value="roi">ROI %</option>
              <option value="payout">Payout</option>
              <option value="tradeCount">Trade Count</option>
              <option value="winRate">winRate</option>
              <option value="avgR">avgR</option>
            </select>
          </div>
          <div className="field">
            <label>Only considers Trades & Payouts from:</label>
            <select className="input" value={form.period} onChange={e => setForm({...form, period: e.target.value})}>
              <option value="daily">Today</option>
              <option value="weekly">This Week</option>
              <option value="monthly">This Month</option>
              <option value="quarterly">This Quarter</option>
              <option value="yearly">This Year</option>
              <option value="allTime">Start</option>
            </select>
          </div>
        </div>

        <div className="field">
  <label>
    <input 
      type="checkbox" 
      checked={form.perpetual} 
      onChange={e => setForm({...form, perpetual: e.target.checked})}
    /> 
    Meta contínua (Global)
  </label>
</div>

<div className="row" style={{ display: 'flex', gap: '16px', flexWrap: 'nowrap' }}>
  <div className="field" style={{ flex: '1 1 auto', minWidth: '0' }}>
    <label>Data Início</label>
    <input 
      type="date" 
      className="input" 
      value={form.startDate} 
      onChange={e => setForm({...form, startDate: e.target.value})}
    />
  </div>
  
  {!form.perpetual && (
    <div className="field" style={{ flex: '1 1 auto', minWidth: '0' }}>
      <label>Data Limite</label>
      <input 
        type="date" 
        className="input" 
        value={form.deadline} 
        onChange={e => setForm({...form, deadline: e.target.value})}
      />
    </div>
  )}
  
  <div className="field" style={{ flex: '0 0 120px' }}>
    <label>Prazo mínimo (dias)</label>
    <input
      type="number"
      className="input"
      min="0"
      max="999"
      style={{ textAlign: 'center' }}
      value={form.minDays || 0}
      onChange={e => setForm({ ...form, minDays: Number(e.target.value) })}
    />
  </div>
</div>

<p className="muted small" style={{ marginTop: '8px' }}>
  💡 Dias de trades diferentes necessários para completar a meta, mesmo atingindo o valor alvo antes.
</p>

        {/* 🔍 Filtro e busca de contas */}
<div className="field">
  <label>Filtrar Contas</label>
  <div className="flex items-center gap-2">
    <input
      className="input"
      placeholder="Buscar por nome, equity ou empresa..."
      value={query}
      onChange={e => setQuery(e.target.value)}
      style={{ flex: 1 }}
    />
    <select
      className="input"
      value={filterType}
      onChange={e => setFilterType(e.target.value)}
      style={{ width: 180 }}
    >
      <option value="">Todas categorias</option>
      <option value="Forex">Forex</option>
      <option value="Futures">Futures</option>
      <option value="Cripto">Cripto</option>
      <option value="Personal">Personal</option>
    </select>
    
  </div>
</div>

        {/* 🧾 Lista de contas filtradas */}
        <div className="field">
  <label>Contas vinculadas (Ctrl/Cmd múltipla)</label>
  <select
    multiple
    className="input"
    style={{ height: 120 }}
    value={form.linkedAccounts}
    onChange={e =>
      setForm({
        ...form,
        linkedAccounts: Array.from(e.target.selectedOptions, o => o.value),
      })
    }
  >
   {filteredAccounts.map(a => (
<option key={a.id} value={a.id}>
  {a.name} ({a.type})
  {a.currentFunding !== undefined ? ` — ${fmt(a.currentFunding)}` : ''}
</option>

    ))}
  </select>
  <p className="muted small">Se nenhuma conta for selecionada, esta meta se aplicará a todas as contas.</p>
        </div>

<div className="subgoals-section">
  <h3>SubGoals</h3>
  
  <div className="field" style={{ marginBottom: '6px' }}>
    <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
      Modo de progresso
    </label>
    <select
      className="input"
      value={form.mode || 'parallel'}
      onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}
      style={{ maxWidth: '400px' }}
    >
      <option value="parallel">Ponderado (Subgoals independentes)</option>
      <option value="sequential">Sequencial (Subgoals em ordem)</option>
    </select>
    <p className="muted small" style={{ marginTop: '6px', lineHeight: '1.5' }}>
      {form.mode === 'parallel'
        ? '💡 Todos os subgoals contribuem de forma ponderada para o progresso total.'
        : '📋 Cada subgoal deve ser concluído antes do próximo começar.'}
    </p>
  </div>

  {form.subGoals.map((s, idx) => (
    <div key={s.id} className="card subgoal-form">
      <div className="field">
        <label>Título</label>
        <input className="input" value={s.title} onChange={e => updateSub(s.id, 'title', e.target.value)}/>
      </div>

      <div className="row" style={{ display: 'flex', gap: '12px', flexWrap: 'nowrap' }}>
        <div className="field" style={{ flex: '0 0 140px' }}>
          <label>Tipo</label>
          <select
            className="input"
            value={s.type}
            onChange={e => updateSub(s.id, 'type', e.target.value)}
          >
            <option value="profit">Profit</option>
            <option value="roi">ROI %</option>
            <option value="payout">Payout</option>
            <option value="tradeCount">Trade Count</option>
            <option value="winRate">WinRate</option>
            <option value="avgR">AvgR</option>
          </select>
        </div>

        <div className="field" style={{ flex: '1 1 auto', minWidth: '0' }}>
          <label>Alvo ($)</label>
          <input
            type="number"
            className="input"
            value={s.targetValue}
            onChange={e => updateSub(s.id, 'targetValue', Number(e.target.value))}
          />
        </div>

        <div className="field" style={{ flex: '0 0 90px' }}>
          <label>Peso - <small className="muted">{(() => {
      const totalWeight = form.subGoals.reduce((sum, sg) => sum + (Number(sg.weight) || 0), 0)
      const pct = totalWeight > 0 ? (s.weight / totalWeight) * 100 : 0
      return `(${pct.toFixed(1)}%)`})()}</small></label>
          <input
            type="number"
            step="0.1"
            className="input"
            value={s.weight}
            onChange={e => updateSub(s.id, 'weight', Number(e.target.value))}
            style={{ textAlign: 'center' }}
          />
        </div>

        <div className="field" style={{ flex: '0 0 90px' }}>
          <label>Dias mín.</label>
          <input
            type="number"
            className="input"
            min="0"
            value={s.minDays || 0}
            onChange={e => updateSub(s.id, 'minDays', Number(e.target.value))}
            style={{ textAlign: 'center' }}
          />
        </div>
      </div>

      <button className="btn ghost small" onClick={() => removeSub(s.id)}>Remover SubGoal</button>
      {/* Seta para o próximo subgoal */}
    {form.mode === 'sequential' && idx < form.subGoals.length - 1 && (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '8px 0',
        color: '#888'
      }}>
        <span style={{ fontSize: '18px' }}>↓</span>
      </div>
    )}
  </div>
  ))}

          <button className="btn ghost" onClick={addSubGoal}>+ Adicionar SubGoal</button>
        </div>

        {(!form.subGoals || form.subGoals.length === 0) && (
          <div className="field">
            <label>Valor Alvo ($)</label>
            <input type="number" className="input" value={form.targetValue} onChange={e => setForm({...form, targetValue: Number(e.target.value)})}/>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={handleSubmit}>Salvar meta</button>
        </div>
      </div>
    </div>
  )
}
