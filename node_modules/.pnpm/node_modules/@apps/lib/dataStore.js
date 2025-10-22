// src/lib/dataStore.js
import { v4 as uuid } from 'uuid'

const LS_KEY = 'propmanager-data-v1'

const seed = {
  accounts: [],
  payouts: [],
  settings: { methods: ['Rise','Wise','Pix','Paypal','Cripto'] },
  firms: [],
  trades: [],   // ADICIONADO: armazena trades
  goals: []     // ADICIONADO: armazena goals
}

function load() {
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) { 
    localStorage.setItem(LS_KEY, JSON.stringify(seed)); 
    return JSON.parse(JSON.stringify(seed)) 
  }
  try {
    const data = JSON.parse(raw)
    // MIGRATION: garante chaves obrigatórias
    data.settings = data.settings || { methods: ['Rise','Wise','Pix','Paypal','Cripto'] }
    data.accounts = data.accounts || []
    data.payouts = data.payouts || []
    data.firms = data.firms || []
    data.trades = data.trades || []
    data.goals = data.goals || []
    return data
  } catch (e) {
    localStorage.setItem(LS_KEY, JSON.stringify(seed))
    return JSON.parse(JSON.stringify(seed))
  }
}

// SAVE agora dispara evento datastore:change
function save(data){ 
  localStorage.setItem(LS_KEY, JSON.stringify(data))
  // Dispara evento para as UIs sincronizarem
  try {
    window.dispatchEvent(new CustomEvent('datastore:change', { detail: { timestamp: Date.now() } }))
  } catch(e) {}
}

/* --------------------
   Export helpers / functions
   -------------------- */
export function getAll(){ return load() }
export function getSettings(){ return load().settings }
export function setSettings(patch){
  const data = load()
  data.settings = { ...data.settings, ...patch }
  save(data); return data.settings
}

/* --------------------
   ACCOUNTS
   -------------------- */
export function createAccount(partial){
  const data = load()
  const acc = { id: uuid(), name:'', type:'Forex', dateCreated: new Date().toISOString().slice(0,10), status:'Standby',
    initialFunding:0, currentFunding:0, profitSplit:0.8, payoutFrequency:'monthly', defaultWeight:1, ...partial }
  data.accounts.push(acc); save(data); return acc
}
export function updateAccount(id, patch){
  const data = load()
  const idx = data.accounts.findIndex(a=>a.id===id); if (idx===-1) return null
  data.accounts[idx] = { ...data.accounts[idx], ...patch }
  save(data); return data.accounts[idx]
}
export function deleteAccount(id){
  const data = load()
  data.accounts = data.accounts.filter(a=>a.id!==id)
  data.payouts = data.payouts.map(p=> ({...p, accountIds: p.accountIds?.filter(aid=>aid!==id) || []}))
  // remove trades that referenced this account (or keep but mark?) -> we'll remove references
  data.trades = data.trades.map(t => t.accountId === id ? ({...t, accountId: null}) : t)
  save(data)
}

/* --------------------
   PAYOUTS
   (mantive sua lógica)
   -------------------- */
function computeSplit(amount, accounts){
  if (!accounts.length) return { totalNet:0, totalFee:0, splitMap:{}, deductions:{} }
  const share = amount / accounts.length
  let totalNet = 0, totalFee = 0, splitMap = {}, deductions = {}
  for (const a of accounts){
    const net = share * (a.profitSplit || 1)
    const fee = share - net
    splitMap[a.id] = { gross: share, net: Number(net.toFixed(2)), fee: Number(fee.toFixed(2)) }
    totalNet += net
    totalFee += fee
  }
  return { totalNet: Number(totalNet.toFixed(2)), totalFee: Number(totalFee.toFixed(2)), splitMap, deductions }
}

export function createPayout(partial){
  const data = load()
  const p = { id: uuid(), dateCreated: new Date().toISOString(), amountSolicited:0, method:'Rise', status:'Pending', accountIds: [], splitByAccount: {}, ...partial }
  if (p.accountIds && p.accountIds.length){
    const accounts = p.accountIds.map(id=> data.accounts.find(a=>a.id===id)).filter(Boolean)
    const c = computeSplit(p.amountSolicited, accounts)
    p.splitByAccount = {}
    accounts.forEach(a => p.splitByAccount[a.id] = c.splitMap[a.id])
  }
  data.payouts.push(p)
  save(data)
  return p
}
export function updatePayout(id, patch){
  const data = load()
  const idx = data.payouts.findIndex(p=>p.id===id); if (idx===-1) return null
  data.payouts[idx] = { ...data.payouts[idx], ...patch }
  // recompute split if accountIds/amount changed
  const p = data.payouts[idx]
  if (p.accountIds && p.amountSolicited !== undefined) {
    const accounts = p.accountIds.map(id => data.accounts.find(a => a.id === id)).filter(Boolean)
    const c = computeSplit(p.amountSolicited, accounts)
    p.splitByAccount = {}
    accounts.forEach(a => p.splitByAccount[a.id] = c.splitMap[a.id])
  }
  save(data); return data.payouts[idx]
}
export function deletePayout(id){
  const data = load()
  data.payouts = data.payouts.filter(p=>p.id!==id)
  save(data)
}

/* --------------------
   Account stats
   -------------------- */
export function getAccountStats(accountId){
  const data = load()
  const acc = data.accounts.find(a=>a.id===accountId)
  if (!acc) return null
  const payouts = data.payouts.filter(p=> (p.splitByAccount && p.splitByAccount[accountId]))
  const totalNet = payouts.reduce((s,p)=> s + (p.splitByAccount[accountId]?.net||0), 0)
  const last = payouts.slice().sort((a,b)=> (a.dateCreated>b.dateCreated?-1:1))[0]
  const roi = acc.initialFunding>0 ? (totalNet + (acc.currentFunding - acc.initialFunding)) / acc.initialFunding : 0
  const totalPayouts = totalNet
  const lastPayoutAmount = last ? (last.splitByAccount[accountId]?.net||0) : 0
  const freqDays = acc.payoutFrequency==='daily' ? 1 : acc.payoutFrequency==='weekly' ? 7 : acc.payoutFrequency==='biweekly' ? 14 : 30
  const lastDate = last?.approvedDate || last?.dateCreated || acc.dateCreated
  const nextPayout = lastDate ? new Date(new Date(lastDate).getTime()+freqDays*86400000).toISOString().slice(0,10) : null
  return { roi, totalPayouts, lastPayoutAmount, nextPayout }
}

/* --------------------
   FIRMS
   -------------------- */
export function getFirms(){ return load().firms || [] }
export function createFirm(partial){
  const data = load()
  const f = { id: uuid(), name: partial.name || '', type: partial.type || 'Futures', logo: partial.logo || null, dateCreated: new Date().toISOString().slice(0,10), ...partial }
  data.firms.push(f); save(data); return f
}
export function updateFirm(id, patch){
  const data = load()
  const idx = data.firms.findIndex(x=>x.id===id); if (idx===-1) return null
  data.firms[idx] = { ...data.firms[idx], ...patch }
  save(data); return data.firms[idx]
}
export function deleteFirm(id){
  const data = load()
  data.firms = data.firms.filter(x=>x.id!==id)
  data.accounts = data.accounts.map(a => a.firmId === id ? ({ ...a, firmId: null }) : a)
  save(data)
  return true
}
export function getFirmStats(firmId){
  const data = load()
  const accounts = (data.accounts || []).filter(a => a.firmId === firmId)
  const accountIds = accounts.map(a => a.id)
  const totalFunding = accounts.reduce((s,a) => s + (Number(a.currentFunding)||0), 0)
  let totalPayouts = 0
  ;(data.payouts || []).forEach(p => {
    if (!p.splitByAccount) return
    accountIds.forEach(id => {
      const part = p.splitByAccount[id]
      if (part && part.net) totalPayouts += Number(part.net) || 0
    })
  })
  return { totalFunding: Number(totalFunding.toFixed(2)), totalPayouts: Number(totalPayouts.toFixed(2)), accountCount: accounts.length }
}

/* --------------------
   TRADES (REVISADO)
   -------------------- */
export function getTrades() {
  const data = load();
  return data.trades || [];
}

export function createTrade(partial) {
  const data = load();
  const id = partial.id || uuid(); // 🔹 mantém id se vier de edição
  const t = {
    id,
    entry_datetime: partial.entry_datetime || new Date().toISOString(),
    exit_datetime: partial.exit_datetime || null,
    asset: partial.asset || '',
    accountId: partial.accountId || null,
    strategyId: partial.strategyId || null,
    direction: partial.direction || 'Long',
    volume: partial.volume || 0,
    entry_price: partial.entry_price || 0,
    exit_price: partial.exit_price || 0,
    entry_time: partial.entry_time || null,
    exit_time: partial.exit_time || null,
    result_net: partial.result_net || 0,
    result_R: partial.result_R || 0,
    notes: partial.notes || '',
    PartialExecutions: partial.PartialExecutions || [],
    accounts: partial.accounts || [],
    ...partial
  };

  // Evita duplicados — se já existir com o mesmo ID, substitui
  const existingIdx = data.trades.findIndex(tr => tr.id === id);
  if (existingIdx !== -1) {
    data.trades[existingIdx] = { ...data.trades[existingIdx], ...t };
  } else {
    data.trades.push(t);
  }

  save(data);
  return t;
}

export function updateTrade(id, patch) {
  const data = load();
  const trades = data.trades || [];
  const idx = trades.findIndex(x => x.id === id);

  // Se existir, substitui
  if (idx !== -1) {
    trades[idx] = { ...trades[idx], ...patch };
  } else {
    // Se não achar (caso raro), cria novo com o id recebido
    console.warn('updateTrade: trade não encontrado, criando novo', id);
    trades.push({ id, ...patch });
  }

  data.trades = trades;
  save(data);
  return patch;
}

export function deleteTrade(id) {
  const data = load();
  data.trades = data.trades.filter(t => t.id !== id);
  save(data);
}

/* --------------------
   GOALS (NOVO)
   -------------------- */
// helpers
function isInPeriod(dateToCheckISO, period, startDateISO) {
  if (!dateToCheckISO) return false
  const checkDate = new Date(dateToCheckISO)
  const start = startDateISO ? new Date(startDateISO) : new Date(0)
  const now = new Date()
  if (checkDate < start) return false
  if (period === 'allTime') return checkDate >= start
  const periodDays = { daily:1, weekly:7, monthly:30, quarterly:90, yearly:365 }
  const days = periodDays[period] || 30
  const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return checkDate >= Math.max(start, cutoffDate) && checkDate <= now
}

// calcula métricas a partir de trades/accounts/payouts
function calculateMetric(type, trades, accounts, config = {}) {
  const period = config.period || 'allTime'
  const startDate = config.startDate || null
  // Filtra trades relevantes
  const relevantTrades = (trades || []).filter(trade => {
    if (!trade) return false
    if (!isInPeriod(trade.date, period, startDate)) return false
    if (config.linkedAccounts && config.linkedAccounts.length) {
      if (!config.linkedAccounts.includes(trade.accountId)) return false
    }
    if (config.linkedStrategies && config.linkedStrategies.length) {
      if (!config.linkedStrategies.includes(trade.strategyId)) return false
    }
    return true
  })

  switch(type) {
    case 'profit':
      return relevantTrades.reduce((sum, t) => sum + (Number(t.result_net) || 0), 0)

    case 'tradeCount':
      return relevantTrades.length

    case 'winRate': {
      const wins = relevantTrades.filter(t => (Number(t.result_R) || 0) > 0).length
      const total = relevantTrades.length
      return total > 0 ? (wins / total) * 100 : 0
    }

    case 'avgR': {
      const totalR = relevantTrades.reduce((s,t)=> s + (Number(t.result_R) || 0), 0)
      return relevantTrades.length > 0 ? totalR / relevantTrades.length : 0
    }

    case 'roi': {
      const linked = (config.linkedAccounts && config.linkedAccounts.length) 
        ? accounts.filter(acc=> config.linkedAccounts.includes(acc.id))
        : accounts
      const totalInitial = linked.reduce((s, a) => s + (Number(a.initialFunding)||0), 0)
      const totalCurrent = linked.reduce((s, a) => s + (Number(a.currentFunding)||0), 0)
      return totalInitial > 0 ? ((totalCurrent - totalInitial) / totalInitial) * 100 : 0
    }

    case 'payout': {
      const payouts = load().payouts || []
      const relevantPayouts = payouts.filter(p => {
        // p.accountIds may be array; consider any matching account
        const anyMatch = !config.linkedAccounts?.length || (p.accountIds || []).some(id => config.linkedAccounts.includes(id))
        const inPeriod = isInPeriod(p.dateCreated || p.approvedDate || p.date, period, startDate)
        return anyMatch && inPeriod
      })
      return relevantPayouts.reduce((s,p)=> s + (Number(p.amountReceived || p.amountSolicited || 0)), 0)
    }

    default:
      return 0
  }
}

// getGoalProgress
export function getGoalProgress(goalId) {
  const data = load();
  const goals = data.goals || [];
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return null;

  const trades = data.trades || [];
  const accounts = data.accounts || [];

  // 🔹 SE TEM SUBGOALS
  if (goal.subGoals && goal.subGoals.length) {
    const subProgresses = goal.subGoals.map(sub => {
      const config = {
        ...sub,
        period: sub.period || goal.period,
        startDate: sub.startDate || goal.startDate,
      };

      // Herda contas se o sub não tiver suas próprias
      if (
        (!sub.linkedAccounts || !sub.linkedAccounts.length) &&
        goal.linkedAccounts &&
        goal.linkedAccounts.length
      ) {
        config.linkedAccounts = goal.linkedAccounts;
      }

      // Calcula métrica atual
      const currentValue = calculateMetric(sub.type, trades, accounts, config);
      const progress = sub.targetValue > 0 ? Math.min(100, (currentValue / sub.targetValue) * 100) : 0;

      // 🔹 Cálculo dos dias ativos (subgoal individual)
      let daysActive = 0;
      if (sub.minDays && sub.minDays > 0) {
        const relevantTrades = (trades || []).filter(t =>
          isInPeriod(t.date, config.period, config.startDate)
        );
        const uniqueDays = new Set(relevantTrades.map(t => new Date(t.date).toISOString().split("T")[0]));
        daysActive = uniqueDays.size;
      }

      // 🔹 Condições de conclusão
      const meetsValue = progress >= 100;
      const meetsDays = !sub.minDays || daysActive >= sub.minDays;
      const completed = meetsValue && meetsDays;

      return {
        id: sub.id,
        title: sub.title,
        type: sub.type,
        targetValue: sub.targetValue,
        currentValue,
        progress,
        completed,
        weight: sub.weight || 1,
        minDays: sub.minDays || 0,
        daysActive,
      };
    });

    // 🔹 Cálculo de progresso total conforme o modo
    let totalProgress = 0;

    if (goal.mode === "sequential") {
      // ✅ MODO SEQUENCIAL — cada sub depende do anterior
      for (let i = 0; i < subProgresses.length; i++) {
        const s = subProgresses[i];
        if (i === 0) {
          totalProgress += s.progress / subProgresses.length;
        } else {
          const prev = subProgresses[i - 1];
          if (prev.completed) {
            totalProgress += s.progress / subProgresses.length;
          } else {
            break; // interrompe se o anterior não estiver completo
          }
        }
      }
    } else {
      // ✅ MODO PARALELO (ponderado)
      const totalWeight = subProgresses.reduce((s, sg) => s + (sg.weight || 1), 0);
      const weightedSum = subProgresses.reduce((s, sg) => s + sg.progress * (sg.weight || 1), 0);
      totalProgress = totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    // 🔹 Cálculo dos dias ativos do goal principal
    let daysActive = 0;
    if (goal.minDays && goal.minDays > 0) {
      const relevantTrades = (trades || []).filter(t =>
        isInPeriod(t.date, goal.period, goal.startDate)
      );
      const uniqueDays = new Set(relevantTrades.map(t => new Date(t.date).toISOString().split("T")[0]));
      daysActive = uniqueDays.size;
    }

    // 🔹 Condições para completar o goal
    const meetsValue = totalProgress >= 100;
    const meetsDays = !goal.minDays || daysActive >= goal.minDays;
    const completed = meetsValue && meetsDays;

    return {
      progress: totalProgress,
      completed,
      daysActive,
      minDays: goal.minDays || 0,
      subProgresses,
    };
  }

  // 🔹 SE FOR GOAL SIMPLES (sem subgoals)
  const cfg = { ...goal };
  const currentValue = calculateMetric(goal.type, trades, accounts, cfg);
  const progress = goal.targetValue > 0 ? Math.min(100, (currentValue / goal.targetValue) * 100) : 0;

  return {
    currentValue,
    progress,
    completed: progress >= 100,
  };
}


// getAllGoals retorna goals com progresso aplicado
// agora aceita opção: getAllGoals({ includeArchived: false }) se quiser que inclua esses Goals em graficos botar "true"
// getAllGoals retorna goals com progresso e status
// agora aceita opção: getAllGoals({ includeArchived: false })
export function getAllGoals(opts = { includeArchived: false }) {
  const data = load()
  let goals = data.goals || []

  goals = goals.filter(g => g && typeof g === 'object' && g.id) // segurança extra
  if (!opts.includeArchived) {
    goals = goals.filter(g => !g.archived)
  }

  return goals.map(g => {
    const p = getGoalProgress(g.id) || {}
    const completed = !!p.completed
    const progress = p.progress ?? 0

    let status = 'not-started'
    if (progress > 0 && progress < 100) status = 'in-progress'
    if (completed) status = 'completed'
    if (g.archived) status = 'archived'

    return {
      ...g,
      ...p,
      status,
      createdAt: g.createdAt || new Date().toISOString(),
      completedAt: completed
        ? g.completedAt || new Date().toISOString()
        : g.completedAt || null,
      archived: !!g.archived,
    }
  })
}

// CRUD goals
export function createGoal(goalData) {
  const now = new Date().toISOString()
  const data = load()
  const subGoals = (goalData.subGoals || []).map(s => ({
  ...s,
  id: s.id || uuid(),
  weight: s.weight !== undefined ? s.weight : 1,
  createdAt: s.createdAt || new Date().toISOString(),
  completedAt: s.completedAt || null,
  archived: s.archived || false
}))
  const goal = { ...goalData, id: uuid(), subGoals, completedAt: null, createdAt: now, updatedAt: now, archived: goalData.archived || false }

  // Recalcula progresso imediato e dispara event se já estiver completa
  try {
    const prog = getGoalProgress(goal.id)
    if (prog && prog.completed) {
      goal.completedAt = goal.completedAt || new Date().toISOString()
      try { window.dispatchEvent(new CustomEvent('goal:completed', { detail: { goalId: goal.id, completedAt: goal.completedAt } })) } catch (e) {}
    }
  } catch (e) {
    console.warn('createGoal: não foi possível calcular progresso imediato', e)
  }

  // >>> Adiciona apenas UMA vez
  data.goals = [...(data.goals || []), goal]
  save(data)
  return goal
}


export function updateGoal(id, patch) {
  const data = load()
  const idx = (data.goals || []).findIndex(g => g.id === id)
  if (idx === -1) throw new Error('Goal not found')
  if (patch.subGoals) {
    patch.subGoals = patch.subGoals.map(s => ({ ...s, id: s.id || uuid(), weight: s.weight !== undefined ? s.weight : 1 }))
  }
  data.goals[idx] = { ...data.goals[idx], ...patch, updatedAt: new Date().toISOString() }
  // recalcula completedAt
  const prog = getGoalProgress(id)
  if (prog && prog.completed && !data.goals[idx].completedAt) data.goals[idx].completedAt = new Date().toISOString()
  else if (prog && !prog.completed && data.goals[idx].completedAt) data.goals[idx].completedAt = null
// depois de ajustar completedAt no updateGoal:
  if (prog && prog.completed && !data.goals[idx].completedNotified) {
    // marca como notificado para evitar múltiplos eventos
    data.goals[idx].completedNotified = true;
    try { window.dispatchEvent(new CustomEvent('goal:completed', { detail: { goalId: id, completedAt: data.goals[idx].completedAt } })); } catch(e){}
  } else if (prog && !prog.completed && data.goals[idx].completedNotified) {
    // replayable: se for reaberto, resetamos a flag
    data.goals[idx].completedNotified = false;
  }
  save(data)
  return data.goals[idx]
}

export function deleteGoal(id) {
  const data = load()
  // Tenta remover como goal principal
  const mainIndex = (data.goals || []).findIndex(g => g.id === id)
  if (mainIndex !== -1) {
    data.goals.splice(mainIndex, 1)
    save(data)
    return
  }

  // Se não for goal principal, remove de subGoals dentro das metas
  let removed = false
  data.goals = (data.goals || []).map(g => {
    if (!g.subGoals || !g.subGoals.length) return g
    const beforeLen = g.subGoals.length
    g.subGoals = g.subGoals.filter(sg => sg.id !== id)
    if (g.subGoals.length !== beforeLen) removed = true
    return g
  })

  if (removed) {
    save(data)
  } else {
    // se nada foi removido, mantemos o comportamento antigo (não crashar)
    console.warn('deleteGoal: id não encontrado nem como goal nem como subGoal:', id)
  }
}

export function archiveGoal(id, archived = true) {
  const data = load()
  if (!data.goals) data.goals = []

  let changed = false

  // 🔹 Atualiza goal principal
  data.goals = data.goals.map(g => {
    if (g.id === id) {
      changed = true
      return {
        ...g,
        archived,
        archivedAt: archived ? new Date().toISOString() : null,
        completedAt: archived && !g.completedAt ? new Date().toISOString() : g.completedAt,
      }
    }

    // 🔹 Atualiza subgoals, se existir
    if (Array.isArray(g.subGoals)) {
      const subs = g.subGoals.map(s => {
        if (s.id === id) {
          changed = true
          return {
            ...s,
            archived,
            archivedAt: archived ? new Date().toISOString() : null,
            completedAt: archived && !s.completedAt ? new Date().toISOString() : s.completedAt,
          }
        }
        return s
      })
      return { ...g, subGoals: subs }
    }

    return g
  })

  // 🔹 Se mudou algo, salva
  if (changed) {
    save({ ...data }) // forçar nova referência (garante persistência)
    console.log(`📦 Goal ${id} ${archived ? 'arquivado' : 'desarquivado'} com sucesso`)
    window.dispatchEvent(new CustomEvent('datastore:change'))
    return true
  }

  console.warn('⚠️ archiveGoal: ID não encontrado:', id)
  return false
}

export function createTag(tag) {
  const data = load()
  if (!data.tags) data.tags = []

  // Evita duplicadas pelo nome (case-insensitive)
  const exists = data.tags.find(t => t.name.toLowerCase() === tag.name.toLowerCase())
  if (exists) return exists

  const newTag = { id: uuid(), ...tag }
  data.tags.push(newTag)
  save(data)
  window.dispatchEvent(new CustomEvent('datastore:change'))
  return newTag
}

export function getAllTags() {
  const data = load()
  return data.tags || []
}


/* --------------------
   Export default summary (optional)
   -------------------- */
export default {
  getAll, getSettings, setSettings,
  createAccount, updateAccount, deleteAccount,
  createPayout, updatePayout, deletePayout,
  getAccountStats,
  getFirms, createFirm, updateFirm, deleteFirm, getFirmStats,
  getTrades, createTrade, updateTrade, deleteTrade,
  getAllGoals, createGoal, updateGoal, deleteGoal, getGoalProgress, archiveGoal, calculateMetric
}
