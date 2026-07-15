// main-app/src/pages/Goals.jsx
import React, { useEffect, useState, useMemo } from 'react'
import { getAll, getAllGoals, createGoal, updateGoal, deleteGoal, archiveGoal, createTag, getAllTags, ensureJournalSynced } from '@apps/lib/dataStore'
import { useCurrency } from '@apps/state'
import { v4 as uuid } from 'uuid'
import { useJournal } from '@apps/journal-state'

const glassBase = {
  background: "rgba(255, 255, 255, 0.02)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid rgba(255, 255, 255, 0.05)",
  borderRadius: "16px",
};

const typeHexColors = {
  profit: '#10B981',
  profitWithConsistency: '#3B82F6',
  roi: '#FBBF24',
  payout: '#8B5CF6',
  tradeCount: '#EC4899',
  winRate: '#06B6D4',
  avgR: '#F97316'
};

export default function Goals() {
  const [goals, setGoals] = useState([])
  const [accounts, setAccounts] = useState([])
  const [strategies, setStrategies] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filters, setFilters] = useState({ type: '', status: '', accountId: '' })
  const { currency, rate } = useCurrency()
  const [activeFilter, setActiveFilter] = useState('all');
  const journal = useJournal();
  const trades = journal?.trades || [];

  const formatValue = (value, type) => {
    const v = Number(value || 0);
    switch (type) {
      case 'roi':
      case 'winRate':
        return `${v.toFixed(2)}%`;
      case 'tradeCount':
        return `${v.toFixed(0)}`;
      case 'avgR':
        return `${v.toFixed(2)}R`;
      case 'profit':
      case 'profitWithConsistency':
      case 'payout':
      default:
        return currency === 'USD'
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
          : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v * rate);
    }
  };

  function updateGoalProgressFromTrades(goals = [], tradesList = []) {
    if (!Array.isArray(goals)) return [];
    if (!Array.isArray(tradesList)) tradesList = [];
    const num = v => Number(v || 0);

    return goals.map(goal => {
      if (!goal || !goal.type) return goal;

      const goalAccounts = Array.isArray(goal.linkedAccounts) && goal.linkedAccounts.length > 0
        ? goal.linkedAccounts : null;

      const relevantTrades = goalAccounts
        ? tradesList.filter(t => {
          if (Array.isArray(t.accounts)) {
            return t.accounts.some(acc => goalAccounts.includes(acc.accountId))
          }
          return goalAccounts.includes(t.accountId)
        })
        : tradesList.slice()

      const target = num(goal.targetValue || 0);
      let currentValue = 0;

      switch (goal.type) {
        case 'profit':
        case 'profitWithConsistency':
        case 'payout':
          currentValue = relevantTrades.reduce((s, t) => s + num(t.result_net), 0);
          break;
        case 'roi':
          const pnl = relevantTrades.reduce((s, t) => s + num(t.result_net), 0);
          const invested = relevantTrades.reduce((s, t) => s + num(t.volume), 0);
          currentValue = invested > 0 ? (pnl / invested) * 100 : 0;
          break;
        case 'tradeCount':
          currentValue = relevantTrades.length;
          break;
        case 'winRate': {
          const wins = relevantTrades.filter(t => num(t.result_net) > 0).length;
          currentValue = relevantTrades.length ? (wins / relevantTrades.length) * 100 : 0;
          break;
        }
        case 'avgR': {
          const rVals = relevantTrades.map(t => num(t.result_R ?? t.R ?? t.rMultiple ?? t.result_R_multiple))
            .filter(v => !Number.isNaN(v));
          currentValue = rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : 0;
          break;
        }
        default:
          currentValue = goal.currentValue ?? 0;
          break;
      }

      let subProgresses = [];
      let combinedProgress = 0;

      if (Array.isArray(goal.subGoals) && goal.subGoals.length > 0) {
        const totalWeight = goal.subGoals.reduce((s, sg) => s + num(sg.weight || 1), 0);

        subProgresses = goal.subGoals.map((sg, idx) => {
          const subAccs = Array.isArray(sg.linkedAccounts) && sg.linkedAccounts.length
            ? sg.linkedAccounts : goalAccounts;

          const subTrades = subAccs
            ? relevantTrades.filter(t => subAccs.includes(t.accountId))
            : relevantTrades.slice();

          let subValue = 0;
          const targetSub = num(sg.targetValue || 0);
          const sgType = sg.type || goal.type;

          switch (sgType) {
            case 'profit':
            case 'profitWithConsistency':
            case 'payout':
              subValue = subTrades.reduce((s, t) => s + num(t.result_net), 0);
              break;
            case 'roi':
              const roiPnL = subTrades.reduce((s, t) => s + num(t.result_net), 0);
              const roiVol = subTrades.reduce((s, t) => s + num(t.volume), 0);
              subValue = roiVol > 0 ? (roiPnL / roiVol) * 100 : 0;
              break;
            case 'tradeCount':
              subValue = subTrades.length;
              break;
            case 'winRate':
              const subWins = subTrades.filter(t => num(t.result_net) > 0).length;
              subValue = subTrades.length ? (subWins / subTrades.length) * 100 : 0;
              break;
            case 'avgR':
              const subR = subTrades.map(t => num(t.result_R ?? t.R ?? t.rMultiple ?? t.result_R_multiple)).filter(v => !Number.isNaN(v));
              subValue = subR.length ? subR.reduce((a, b) => a + b, 0) / subR.length : 0;
              break;
            default:
              subValue = 0;
          }

          let subProgress = targetSub > 0 ? (subValue / targetSub) * 100 : 0;
          if (subProgress > 100) subProgress = 100;

          const uniqueDays = [...new Set(subTrades.map(t => new Date(t.entry_datetime).toDateString()))];
          const daysActive = uniqueDays.length;

          return {
            ...sg,
            type: sgType,
            currentValue: subValue,
            progress: subProgress,
            completed: subProgress >= 100,
            daysActive,
            uniqueDays
          };
        });

        if (goal.mode === 'sequential') {
          const firstIncomplete = subProgresses.findIndex(sg => !sg.completed);
          combinedProgress = subProgresses.reduce((acc, sg, idx) => {
            if (idx < firstIncomplete) return acc + (100 / subProgresses.length);
            if (idx === firstIncomplete) return acc + (sg.progress / subProgresses.length);
            return acc;
          }, 0);
        } else {
          combinedProgress = subProgresses.reduce((acc, sg) => acc + (num(sg.weight || 1) * (sg.progress || 0)), 0) / totalWeight;
        }
      }

      let progress = 0;
      if (subProgresses.length > 0) {
        progress = combinedProgress;
      } else if (target > 0) {
        progress = (currentValue / target) * 100;
      }

      if (progress > 100) progress = 100;
      if (progress < 0) progress = 0;

      return {
        ...goal,
        currentValue,
        progress,
        completed: progress >= 100,
        subProgresses
      };
    });
  }

  let isLoadingGoals = false;
  let lastLoadTime = 0;

  async function loadData() {
    const now = Date.now();
    if (isLoadingGoals || now - lastLoadTime < 500) return;
    isLoadingGoals = true;

    try {
      await ensureJournalSynced();
      const d = getAll();
      const g = getAllGoals({ includeArchived: true }) || [];

      setAccounts((d.accounts || []).filter(a => a.hidden !== true));
      setStrategies(d.strategies || []);

      const sourceTrades = Array.isArray(trades) && trades.length > 0 ? trades : (d.trades || []);
      const updated = updateGoalProgressFromTrades(g, sourceTrades);

      setGoals(updated);
    } catch (err) {
      console.error("Error loading goals:", err);
    } finally {
      isLoadingGoals = false;
      lastLoadTime = Date.now();
    }
  }

  useEffect(() => {
    loadData();
    let timeout;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        loadData();
      }, 600);
    };

    window.addEventListener("datastore:change", handler);
    window.addEventListener("storage", handler);
    window.addEventListener("journal:change", handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("datastore:change", handler);
      window.removeEventListener("storage", handler);
      window.removeEventListener("journal:change", handler);
    };
  }, []);

  const filteredGoals = useMemo(() => {
    let list = goals
    if (activeFilter === 'completed') {
      list = list.filter(g => g.completed && !g.archived)
    } else if (activeFilter === 'progress') {
      list = list.filter(g => !g.completed && !g.archived)
    } else if (activeFilter === 'archived') {
      list = list.filter(g => g.archived)
    } else {
      list = list.filter(g => !g.archived)
    }
    if (filters.type) list = list.filter(g => g.type === filters.type)
    if (filters.accountId) list = list.filter(g => g.linkedAccounts?.includes(filters.accountId))
    return list
  }, [goals, filters, activeFilter])

  const handleCreate = () => { setEditing(null); setModalOpen(true) }
  const handleEdit = (g) => { setEditing(g); setModalOpen(true) }
  const handleDelete = (id) => { if (confirm('Delete goal?')) { deleteGoal(id); loadData() } }

  const handleSave = (form) => {
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

  const summaryHexColors = {
    all: '#a855f7',
    progress: '#3b82f6',
    completed: '#22c55e',
    archived: '#6b7280'
  };

  return (
    <div className="goals-page" style={{ display: "grid", gap: 20 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>🎯 Goals</h1>
        <button className="btn accent" onClick={() => setModalOpen(true)}>+ New Goal</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { key: 'all', title: 'Total Goals', count: goals.length, desc: 'goals created' },
          { key: 'progress', title: 'In Progress', count: goals.filter(g => !g.completed && !g.archived).length, desc: 'active goals' },
          { key: 'completed', title: 'Completed', count: goals.filter(g => g.completed && !g.archived).length, desc: 'finished goals' },
          { key: 'archived', title: 'Archived', count: goals.filter(g => g.archived).length, desc: 'archived goals' },
        ].map(card => {
          const hexColor = summaryHexColors[card.key];
          const isActive = activeFilter === card.key;

          return (
            <div
              key={card.key}
              onClick={() => setActiveFilter(card.key)}
              style={{
                ...glassBase,
                position: 'relative',
                overflow: 'hidden',
                padding: '20px 24px',
                cursor: 'pointer',
                border: isActive ? `1px solid ${hexColor}` : glassBase.border,
                boxShadow: isActive ? `0 0 20px ${hexColor}20` : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: `radial-gradient(circle, ${hexColor}33 0%, transparent 70%)`, borderRadius: '50%' }} />

              <h4 style={{ position: 'relative', zIndex: 1, margin: '0 0 8px 0', fontWeight: 600, color: 'var(--muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {card.title}
              </h4>
              <div style={{ position: 'relative', zIndex: 1, fontSize: 32, fontWeight: 800, color: 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
                {card.count}
              </div>
              <div style={{ position: 'relative', zIndex: 1, fontSize: 12, color: 'var(--muted)' }}>
                {card.desc}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ ...glassBase, padding: "16px 20px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })} className="input" style={{ backgroundColor: '#131825', color: '#fff', width: 'auto', flex: '1', minWidth: '150px' }}>
          <option value="">Type (All)</option>
          <option value="profit">Profit</option>
          <option value="roi">ROI</option>
          <option value="payout">Payout</option>
          <option value="tradeCount">Trades</option>
          <option value="winRate">Win Rate</option>
          <option value="avgR">Avg R</option>
        </select>

        <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className="input" style={{ backgroundColor: '#131825', color: '#fff', width: 'auto', flex: '1', minWidth: '150px' }}>
          <option value="">Status (All)</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>

        <select value={filters.accountId} onChange={e => setFilters({ ...filters, accountId: e.target.value })} className="input" style={{ backgroundColor: '#131825', color: '#fff', width: 'auto', flex: '1.5', minWidth: '180px' }}>
          <option value="">Accounts (All)</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <button className="btn ghost" onClick={() => setFilters({ type: '', status: '', accountId: '' })} style={{ flex: '0 0 auto' }}>Clear</button>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {filteredGoals.length === 0 ? (
          <div style={{ ...glassBase, textAlign: "center", padding: "40px", color: "var(--muted)" }}>
            <p style={{ marginBottom: 16 }}>No goals found for these filters.</p>
            <button className="btn accent" onClick={handleCreate}>Create first goal</button>
          </div>
        ) : filteredGoals.map(goal => (
          <GoalCard key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} formatValue={formatValue} accounts={accounts} />
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

function GoalCard({ goal, onEdit, onDelete, formatValue, accounts }) {
  const [isFading, setIsFading] = useState(false)

  const allLinked = goal.linkedAccounts || []
  const linkedNames = allLinked
    .map(id => accounts.find(a => a.id === id)?.name || '—')
    .filter(Boolean)

  let accountDisplay = 'All'
  if (linkedNames.length > 0) {
    accountDisplay = linkedNames.length > 3 ? `${linkedNames[0]} +${linkedNames.length - 1}` : linkedNames.join(', ')
  }

  const typeLabels = {
    profit: 'Profit', roi: 'ROI %', payout: 'Payout', tradeCount: 'Trades', winRate: 'Win Rate', avgR: 'Avg R', profitWithConsistency: 'Profit + Consist.'
  }

  const typePillClasses = {
    profit: 'green', profitWithConsistency: 'blue', roi: 'yellow', payout: 'purple', tradeCount: 'pink', winRate: 'lavander', avgR: 'orange'
  }

  const periodLabels = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', allTime: 'All-time'
  }

  const activeColor = useMemo(() => {
    if (goal.subProgresses && goal.subProgresses.length > 0) {
      const firstIncomplete = goal.subProgresses.find(sg => !sg.completed);
      if (firstIncomplete) {
        return typeHexColors[firstIncomplete.type] || typeHexColors[goal.type] || '#6d4aff';
      }
    }
    return typeHexColors[goal.type] || '#6d4aff';
  }, [goal]);

  return (
    <div
      style={{
        ...glassBase,
        position: 'relative',
        overflow: 'hidden',
        padding: '20px 24px',
        opacity: isFading ? 0 : 1,
        transition: 'opacity 0.3s ease, transform 0.2s ease',
        transform: isFading ? 'scale(0.98)' : 'scale(1)',
      }}
    >
      <div style={{ position: 'absolute', top: -80, left: -80, width: 250, height: 250, background: `radial-gradient(circle, ${activeColor}20 0%, transparent 70%)`, borderRadius: '50%', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '15%', borderLeft: `4px solid ${activeColor}`, borderTop: `4px solid ${activeColor}`, borderTopLeftRadius: '16px', pointerEvents: 'none', boxSizing: 'border-box', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>

        <div style={{ flex: '1.5', minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {goal.completed && <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 'bold' }}>✓</span>}
            {goal.archived && <span style={{ fontSize: 16 }}>📦</span>}
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>{goal.title}</h3>
            {goal.tag?.name && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: '12px', background: `${goal.tag.color || '#6d4aff'}20`, color: goal.tag.color || '#6d4aff', border: `1px solid ${goal.tag.color || '#6d4aff'}40` }}>
                {goal.tag.name}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`pill ${typePillClasses[goal.type] || 'gray'}`} style={{ fontSize: 11, padding: '2px 8px' }}>
              {typeLabels[goal.type] || goal.type}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>• {periodLabels[goal.period] || goal.period}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>• {accountDisplay}</span>
            {!goal.perpetual && goal.deadline && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>• Deadline: {new Date(goal.deadline).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div style={{ flex: '2', minWidth: '300px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-end' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
              {goal.currentValue !== undefined ? `${formatValue(goal.currentValue, goal.type)} / ${formatValue(goal.targetValue, goal.type)}` : 'Progress'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: goal.completed ? 'var(--green)' : 'var(--text)' }}>
              {(goal.progress || 0).toFixed(1)}%
            </div>
          </div>
          <div style={{ height: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ height: '100%', width: `${Math.min(100, goal.progress || 0)}%`, background: goal.completed ? 'var(--green)' : `linear-gradient(90deg, ${activeColor}80 0%, ${activeColor} 100%)`, borderRadius: 5, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn ghost small" onClick={() => onEdit(goal)} style={{ padding: '6px 12px' }}>Edit</button>
          <button
            className="btn ghost small"
            onClick={() => {
              setIsFading(true)
              setTimeout(() => {
                const ok = archiveGoal(goal.id, !goal.archived)
                if (ok) window.dispatchEvent(new CustomEvent('datastore:change'))
              }, 300)
            }}
            title={goal.archived ? 'Unarchive' : 'Archive'}
            style={{ padding: '6px 12px' }}
          >
            {goal.archived ? '⬆️' : '📦'}
          </button>
          <button className="btn ghost small" onClick={() => onDelete(goal.id)} style={{ color: 'var(--red)', padding: '6px 12px' }}>Delete</button>
        </div>
      </div>

      {goal.subProgresses && goal.subProgresses.length > 0 && (
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Milestones ({goal.mode === 'sequential' ? 'Sequential' : 'Weighted'})
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {goal.subProgresses.map((s, idx) => {
              const seqMode = goal.mode === 'sequential';
              const firstIncomplete = seqMode ? goal.subProgresses.findIndex(sg => !sg.completed) : -1;
              const isCompleted = !!s.completed;
              const isCurrent = seqMode && firstIncomplete === idx;
              const isLocked = seqMode && firstIncomplete !== -1 && idx > firstIncomplete;
              const sgColor = typeHexColors[s.type] || activeColor;

              return (
                <div key={s.id} style={{
                  background: isCurrent ? `${sgColor}15` : 'rgba(0,0,0,0.2)',
                  border: isCurrent ? `1px solid ${sgColor}50` : '1px solid rgba(255,255,255,0.05)',
                  borderLeft: `4px solid ${isCompleted ? 'var(--green)' : sgColor}`,
                  padding: '12px 16px',
                  borderRadius: 12,
                  opacity: isLocked ? 0.4 : 1,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center'
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                    background: isCompleted ? 'var(--green)' : (isCurrent ? sgColor : 'rgba(255,255,255,0.1)'),
                    color: isCompleted || isCurrent ? '#fff' : 'var(--muted)'
                  }}>
                    {isCompleted ? '✓' : (isCurrent ? '▶' : (idx + 1))}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.title}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatValue(s.currentValue, s.type)} / {formatValue(s.targetValue, s.type)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, s.progress)}%`, background: isCompleted ? 'var(--green)' : sgColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{(s.progress || 0).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function GoalModal({ goal, accounts = [], strategies = [], onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    title: goal?.title || '', description: goal?.description || '', type: goal?.type || 'profit', period: goal?.period || 'monthly',
    perpetual: goal?.perpetual || false, linkedAccounts: goal?.linkedAccounts || [], targetValue: goal?.targetValue || 0,
    startDate: goal?.startDate ? goal.startDate.split('T')[0] : new Date().toISOString().split('T')[0],
    deadline: goal?.deadline ? goal.deadline.split('T')[0] : '', subGoals: (goal?.subGoals || []).map(s => ({ ...s })),
    tag: goal?.tag || { name: '', color: '#6366f1' }, minDays: goal?.minDays || 0, consistencyLimit: goal?.consistencyLimit ?? 50, mode: goal?.mode || 'parallel'
  }))
  const [availableTags, setAvailableTags] = useState(getAllTags())

  useEffect(() => {
    const handler = () => setAvailableTags(getAllTags())
    window.addEventListener('datastore:change', handler)
    return () => window.removeEventListener('datastore:change', handler)
  }, [])

  const addSubGoal = () => {
    setForm(f => ({
      ...f, subGoals: [...f.subGoals, { id: uuid(), title: '', type: 'profit', targetValue: 0, weight: 1, minDays: 0, daysActive: 0, uniqueDays: [], linkedAccounts: [] }]
    }))
  }
  const removeSub = (id) => setForm(f => ({ ...f, subGoals: f.subGoals.filter(s => s.id !== id) }))
  const updateSub = (id, field, value) => setForm(f => ({ ...f, subGoals: f.subGoals.map(s => s.id === id ? ({ ...s, [field]: value }) : s) }))

  const handleSubmit = () => {
    if (!form.title) return alert('Title is required')
    if ((!form.subGoals || form.subGoals.length === 0) && (!form.targetValue || form.targetValue <= 0)) return alert('Target value is required')
    onSave(form)
  }

  const getTargetLabel = (type) => {
    if (type === 'roi' || type === 'winRate') return 'Target Value (%)';
    if (type === 'tradeCount') return 'Target Value (Count)';
    if (type === 'avgR') return 'Target Value (R)';
    return 'Target Value (Currency)';
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...glassBase, background: '#131825', width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', padding: 24, position: 'relative' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{goal ? "Edit Goal" : "New Goal"}</h2>
          <button className="btn ghost small" onClick={onClose} style={{ padding: '4px 8px', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Goal Title</label>
            <input className="input" style={{ backgroundColor: '#131825', color: '#fff' }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Tag / Category</label>
              <input className="input" list="tags-list" placeholder="e.g., Personal, Challenge..." style={{ backgroundColor: '#131825', color: '#fff' }} value={form.tag.name} onChange={(e) => {
                const value = e.target.value;
                const existing = availableTags.find((t) => t.name === value);
                if (existing) setForm({ ...form, tag: existing });
                else setForm({ ...form, tag: { name: value, color: form.tag.color || "#6d4aff" } });
              }} />
              <datalist id="tags-list">{availableTags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
            </div>
            <div style={{ width: 120 }}>
              <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Badge Color</label>
              <div className="input" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 42, backgroundColor: "#131825", color: '#fff' }}>
                <div style={{ position: 'relative', width: 20, height: 20, borderRadius: '50%', background: form.tag.color || "#6366f1", border: "1px solid rgba(255,255,255,0.2)", overflow: 'hidden' }}>
                  <input type="color" value={form.tag.color || "#6366f1"} onChange={(e) => setForm({ ...form, tag: { ...form.tag, color: e.target.value } })} style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", opacity: 0, cursor: "pointer" }} />
                </div>
                <span style={{ fontSize: 12, fontFamily: "monospace" }}>{form.tag.color || "#6366f1"}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Type</label>
              <select className="select" style={{ backgroundColor: '#131825', color: '#fff' }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="profit">Profit</option>
                <option value="profitWithConsistency">Profit + Consistency</option>
                <option value="roi">ROI %</option>
                <option value="payout">Payout</option>
                <option value="tradeCount">Trade Count</option>
                <option value="winRate">Win Rate</option>
                <option value="avgR">Avg R</option>
              </select>
            </div>

            {form.type === 'profitWithConsistency' && (
              <div style={{ width: 100 }}>
                <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Consist. (%)</label>
                <input type="number" min={0} max={100} className="input" style={{ backgroundColor: '#131825', color: '#fff' }} value={form.consistencyLimit ?? 50} onChange={(e) => setForm({ ...form, consistencyLimit: Number(e.target.value) })} />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Period</label>
              <select className="select" style={{ backgroundColor: '#131825', color: '#fff' }} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="allTime">All-time</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Start Date</label>
              <input type="date" className="input" style={{ backgroundColor: '#131825', color: '#fff' }} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div style={{ width: 100 }}>
              <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Min. Days</label>
              <input type="number" className="input" style={{ backgroundColor: '#131825', color: '#fff' }} value={form.minDays || 0} onChange={(e) => setForm({ ...form, minDays: Number(e.target.value) })} />
            </div>
            {!form.perpetual && (
              <div style={{ flex: 1, minWidth: 120 }}>
                <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Deadline</label>
                <input type="date" className="input" style={{ backgroundColor: '#131825', color: '#fff' }} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', height: 42, paddingLeft: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.perpetual} onChange={(e) => setForm({ ...form, perpetual: e.target.checked })} /> Perpetual
              </label>
            </div>
          </div>

          {(!form.subGoals || form.subGoals.length === 0) && (
            <div>
              <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
                {getTargetLabel(form.type)}
              </label>
              <input type="number" step="any" className="input" style={{ backgroundColor: '#131825', color: 'white', fontSize: 18, fontWeight: 700 }} value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: Number(e.target.value) })} />
            </div>
          )}

          <div style={{ padding: 16, background: 'rgba(0,0,0,0.15)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.03)', marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14 }}>Milestones</h4>
              <select className="select" style={{ backgroundColor: '#131825', color: '#fff', width: 'auto', padding: '4px 8px', fontSize: 12 }} value={form.mode || "parallel"} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
                <option value="parallel">Mode: Weighted (Parallel)</option>
                <option value="sequential">Mode: Sequential (Strict order)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {form.subGoals.map((s, idx) => (
                <div key={s.id} style={{ padding: 12, background: 'var(--card-bg)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input className="input" placeholder="Milestone title" style={{ flex: 1, padding: '6px 10px', fontSize: 13, backgroundColor: '#131825', color: '#fff' }} value={s.title} onChange={(e) => updateSub(s.id, "title", e.target.value)} />
                    <button className="btn ghost small" onClick={() => removeSub(s.id)} style={{ color: 'var(--red)', padding: '6px 10px' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className="select" style={{ flex: 1, padding: '6px 10px', fontSize: 12, backgroundColor: '#131825', color: '#fff' }} value={s.type} onChange={(e) => updateSub(s.id, "type", e.target.value)}>
                      <option value="profit">Profit</option>
                      <option value="roi">ROI</option>
                      <option value="tradeCount">Trades</option>
                      <option value="winRate">Win Rate</option>
                      <option value="avgR">Avg R</option>
                    </select>
                    <input type="number" step="any" placeholder="Target" title={getTargetLabel(s.type)} className="input" style={{ width: 100, padding: '6px 10px', fontSize: 13, backgroundColor: '#131825', color: '#fff' }} value={s.targetValue} onChange={(e) => updateSub(s.id, "targetValue", Number(e.target.value))} />
                    <input type="number" placeholder="Weight" title="Milestone weight" className="input" style={{ width: 60, padding: '6px 10px', fontSize: 13, backgroundColor: '#131825', color: '#fff' }} value={s.weight} onChange={(e) => updateSub(s.id, "weight", Number(e.target.value))} />
                  </div>
                </div>
              ))}
              <button className="btn ghost small" onClick={addSubGoal} style={{ borderStyle: 'dashed' }}>+ Add Milestone</button>
            </div>
          </div>

          <div>
            <label className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Linked Accounts</label>
            <select multiple className="input" style={{ height: 100, backgroundColor: '#131825', color: '#fff', padding: 8 }} value={form.linkedAccounts} onChange={(e) => setForm({ ...form, linkedAccounts: Array.from(e.target.selectedOptions, (o) => o.value) })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} style={{ padding: '4px 8px', borderRadius: 4 }}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" onClick={handleSubmit}>Save Goal</button>
        </div>
      </div>
    </div>
  );
}