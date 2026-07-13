// src/lib/dataStore.js
import { v4 as uuid } from 'uuid'
import { openDB } from 'idb';




const LS_KEY = 'propmanager-data-v1'

const seed = {
  accounts: [],
  payouts: [],
  settings: {
    methods: ['Rise','Wise','Pix','Paypal','Cripto'],
    platforms: {
      quantower: {
        enabled: false,
        bridgeUrl: 'http://localhost:8787',
        autoSync: true,
        syncIntervalMs: 2000,
        lastSync: null,
        accountMapping: {}   // { platformAccountId: internalAccountId }
      },
      ctrader: {
        enabled: false,
        accessToken: null,
        refreshToken: null,
        autoSync: true,
        syncIntervalMs: 5000,
        lastSync: null,
        accountMapping: {}
      }
    }
  },
  connectionFirmMap: {},     // { [connectionId]: firmId }  — Nível 1: toda a conexão → Firm
  accountFirmOverride: {},   // { [accountId]: firmId }      — Nível 2: override por conta
  firms: [],
  trades: [],   // armazena trades
  goals: [],    // armazena goals
  livePositions: [],  // posições abertas em tempo real
  tradeLedger: {},  // { platformTradeId: { internalTradeId, status, platformAccountId, internalAccountId, firstSeenAt, lastSeenAt } }
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
    // Platform settings migration (backward-compatible)
    if (!data.settings.platforms) {
      data.settings.platforms = seed.settings.platforms;
    } else {
      // Ensure each platform config has all keys
      for (const [pid, defaults] of Object.entries(seed.settings.platforms)) {
        data.settings.platforms[pid] = { ...defaults, ...(data.settings.platforms[pid] || {}) };
      }
    }
    data.accounts = data.accounts || []
    data.payouts = data.payouts || []
    
    // MIGRATION: Fix archived accounts missing profitSplit AND recalculate fee/net
    let needsSave = false;
    data.payouts.forEach(p => {
      if (p._archivedAccounts && p._archivedAccounts.length > 0) {
        let hasFix = false;
        p._archivedAccounts.forEach(acc => {
          if (acc.profitSplit === undefined || acc.profitSplit === 1) {
            acc.profitSplit = 0.8; // Default fee 80% if missing
            hasFix = true;
          }
        });
        
        // Se corrigimos o profitSplit OU se o fee está zerado num payout que devia ter fee
        if (hasFix || p.fee === 0) {
          const split = p._archivedAccounts[0].profitSplit || 0.8;
          const gross = p.amountSolicited || 0;
          p.amountReceived = gross * split;
          p.fee = gross - p.amountReceived;
          
          if (p.splitByAccount) {
             Object.keys(p.splitByAccount).forEach(id => {
               const partGross = p.splitByAccount[id].gross || gross;
               p.splitByAccount[id].net = partGross * split;
               p.splitByAccount[id].fee = partGross - p.splitByAccount[id].net;
             });
          }
          needsSave = true;
        }
      }
    });

    data.firms = data.firms || []
    data.trades = data.trades || []
    data.goals = data.goals || []
    data.livePositions = data.livePositions || []
    // Migration: connection/firm mapping (backward-compatible)
    data.connectionFirmMap = data.connectionFirmMap || {}
    data.accountFirmOverride = data.accountFirmOverride || {}

    if (needsSave) {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    }
    return data
  } catch (e) {
    localStorage.setItem(LS_KEY, JSON.stringify(seed))
    return JSON.parse(JSON.stringify(seed))
  }
}

// SAVE agora dispara evento datastore:change
let _broadcastChannel = null;
try {
  _broadcastChannel = new BroadcastChannel('propmanager-datastore');
} catch (e) {
  console.warn('[dataStore] BroadcastChannel not available:', e);
}

export function save(data){ 
  localStorage.setItem(LS_KEY, JSON.stringify(data))
  // Dispara evento para as UIs sincronizarem
  try {
    window.dispatchEvent(new CustomEvent('datastore:change', { detail: { timestamp: Date.now() } }))
  } catch(e) {}
  // Broadcast to other tabs/apps
  if (_broadcastChannel) {
    try {
      _broadcastChannel.postMessage({ type: 'datastore:change', timestamp: Date.now() });
    } catch (e) {}
  }
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
export async function getAllTradesSafe() {
  try {
    const data = load();
    if (data.trades && data.trades.length > 0) {
      return data.trades;
    }

    console.log('📥 Carregando trades do Journal (IndexedDB) para dataStore...');
    const db = await openDB('journal-db', 2);
    const trades = await db.getAll('trades');
    return trades || [];
  } catch (err) {
    console.warn('⚠️ Falha ao carregar trades via IndexedDB:', err);
    return [];
  }
}
// 🔹 Fallback: garante que o dataStore possa puxar trades do IndexedDB (Journal)
// ✅ Evita loop infinito e só sincroniza quando necessário
export async function ensureJournalSynced() {
  try {
    const data = load();

    // Se já tem trades no dataStore, não faz nada
    if (Array.isArray(data.trades) && data.trades.length > 0) {
      return;
    }

    console.log('📥 Carregando trades do Journal (IndexedDB) para dataStore...');
    const db = await openDB('journal-db', 2);
    const trades = await db.getAll('trades');

    if (Array.isArray(trades) && trades.length > 0) {
      data.trades = trades;
      save(data);
      console.log(`✅ Trades sincronizados do Journal → dataStore: ${trades.length}`);
      // Dispara um evento único, controlado
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('datastore:change', { detail: { source: 'journal-sync' } }));
      }, 100);
    } else {
      console.log('ℹ️ Nenhum trade encontrado no IndexedDB — nada a sincronizar.');
    }
  } catch (err) {
    console.warn('⚠️ Falha ao sincronizar journal no dataStore:', err);
  }
}

/* --------------------
   ACCOUNTS
   -------------------- */
export function createAccount(partial){
  const data = load()
  const acc = { id: uuid(), name:'', type:'Forex', dateCreated: new Date().toISOString().slice(0,10), status:'Standby',
    initialFunding:0, currentFunding:0, profitSplit:0.8, payoutFrequency:'monthly', defaultWeight:1,
    platformAccountId: null, platformName: null, lastPlatformSync: null,
    ...partial }
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
  // Capture account snapshot BEFORE removing it
  const accountToDelete = data.accounts.find(a => a.id === id)

  data.accounts = data.accounts.filter(a => a.id !== id)

  // Instead of silently dropping the accountId from payouts, preserve a snapshot
  // of the deleted account inside each affected payout so historical data is kept.
  data.payouts = data.payouts.map(p => {
    const isInAccountIds = Array.isArray(p.accountIds) && p.accountIds.includes(id)
    const isInSplit      = p.splitByAccount && p.splitByAccount[id]
    if (!isInAccountIds && !isInSplit) return p

    // Build the archived snapshot entry
    const archivedEntry = {
      id,
      name:        accountToDelete?.name        || 'Conta Deletada',
      type:        accountToDelete?.type        || 'Futures',
      firmId:      accountToDelete?.firmId      || null,
      profitSplit: accountToDelete?.profitSplit ?? 1,
    }

    // Move the live splitByAccount[id] entry to a keyed archive slot
    const updatedSplit = { ...(p.splitByAccount || {}) }
    if (updatedSplit[id]) {
      updatedSplit[`__archived_${id}`] = {
        ...updatedSplit[id],
        _archived:     true,
        _accountName:  archivedEntry.name,
        _accountType:  archivedEntry.type,
      }
      delete updatedSplit[id]
    }

    return {
      ...p,
      accountIds:        (p.accountIds || []).filter(aid => aid !== id),
      splitByAccount:    updatedSplit,
      // _archivedAccounts is a list of snapshot objects for all deleted accounts
      _archivedAccounts: [...(p._archivedAccounts || []), archivedEntry],
    }
  })

  data.trades = data.trades.map(t => t.accountId === id ? ({ ...t, accountId: null }) : t)
  save(data)
}

export function recalcAccountFunding(accountId) {
  const data = load();
  const account = data.accounts.find(a => a.id === accountId);
  if (!account) return null;

  // Filtra todos os trades relacionados a essa conta
  const trades = (data.trades || []).filter(t => t.accountId === accountId);

  // Soma apenas result_net válidos
  const totalPnL = trades.reduce((sum, t) => sum + (Number(t.result_net) || 0), 0);

  // Recalcula o funding atual baseado no funding inicial
  account.currentFunding = (Number(account.initialFunding) || 0) + totalPnL;

  // Salva e dispara evento
  save(data);
  return account;
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

// --------------------
// PAYOUTS (com attachments por conta)
// --------------------
export function createPayout(partial){
  const data = load()
  const p = {
    id: uuid(),
    dateCreated: new Date().toISOString(),
    amountSolicited:0,
    method:'Rise',
    status:'Pending',
    accountIds: [],
    splitByAccount: {},
    attachments: {}, // novo: mapa accountId -> { folderPath, fileId, fileName, url, uploadedAt }
    ...partial
  }
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
  // preserve existing attachments when updating
  const existing = data.payouts[idx]
  data.payouts[idx] = { ...existing, ...patch, attachments: { ...(existing.attachments||{}), ...(patch.attachments||{}) } }
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

/**
 * Anexa/atualiza um arquivo (attachment) para uma conta dentro de um payout.
 * attachment: { folderPath, folderId(optional), fileId, fileName, url, uploadedAt }
 */
export function setPayoutAttachment(payoutId, accountId, attachment) {
  const data = load();
  const idx = data.payouts.findIndex(p => p.id === payoutId);
  if (idx === -1) return null;
  if (!data.payouts[idx].attachments) data.payouts[idx].attachments = {};
  data.payouts[idx].attachments[accountId] = {
    ...(data.payouts[idx].attachments[accountId] || {}),
    ...attachment,
  };
  save(data);
  return data.payouts[idx].attachments[accountId];
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
  const payouts = data.payouts.filter(p=> (p.splitByAccount && p.splitByAccount[accountId]) || (p.splitByAccount && p.splitByAccount[`__archived_${accountId}`]))
  const totalNet = payouts.reduce((s,p)=> s + ((p.splitByAccount[accountId]?.net || p.splitByAccount[`__archived_${accountId}`]?.net) || 0), 0)
  const last = payouts.slice().sort((a,b)=> (a.dateCreated>b.dateCreated?-1:1))[0]
  const roi = acc.initialFunding>0 ? (totalNet + (acc.currentFunding - acc.initialFunding)) / acc.initialFunding : 0
  const totalPayouts = totalNet
  const lastPayoutAmount = last ? ((last.splitByAccount[accountId]?.net || last.splitByAccount[`__archived_${accountId}`]?.net) || 0) : 0
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
  const f = { id: uuid(), name: partial.name || '', type: partial.type || 'Futures', logo: partial.logo || null, color: partial.color || "#6366f1", dateCreated: new Date().toISOString().slice(0,10), ...partial }
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
    // Include payouts from archived/deleted accounts
    if (p._archivedAccounts) {
      p._archivedAccounts.forEach(arc => {
        if (arc.firmId === firmId && arc.net) {
          totalPayouts += Number(arc.net) || 0
        }
      })
    }
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
    // Platform integration fields
    source: partial.source || 'manual',                // 'manual' | 'quantower' | 'ctrader' | 'csv'
    platformTradeId: partial.platformTradeId || null,   // Original ID from platform (for dedup)
    platformName: partial.platformName || null,         // 'Quantower', 'cTrader', etc.
    connectionName: partial.connectionName || null,     // Sub-connection: 'Rithmic', 'DXFeed', etc.
    isLive: partial.isLive || false,                    // true if position still open
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

// ===============================
// ✅ CÁLCULO DE MÉTRICAS REVISADO
// ===============================
function calculateMetric(type, trades, accounts, config = {}) {
  const period = config.period || "allTime";
  const startDate = config.startDate || null;

  // 🔹 Filtra trades válidos dentro do período
  const relevantTrades = (trades || []).filter(trade => {
    if (!trade) return false;
    if (!isInPeriod(trade.entry_datetime || trade.date, period, startDate)) return false;

    // filtro por contas
    if (config.linkedAccounts?.length && !config.linkedAccounts.includes(trade.accountId)) {
      return false;
    }

    // filtro por estratégia
    if (config.linkedStrategies?.length && !config.linkedStrategies.includes(trade.strategyId)) {
      return false;
    }

    return true;
  });

  switch (type) {
    case "profit": {
      const total = relevantTrades.reduce((s, t) => s + (Number(t.result_net) || 0), 0);
      return total;
    }

    case "profitWithConsistency": {
      const consistencyLimit = Number(config.consistencyLimit || 50); // % limite desejado
      const targetProfit = Number(config.targetValue || 0);

      // 🔹 Agrupa lucros diários
      const dailyProfits = {};
      for (const t of relevantTrades) {
        const d = (t.entry_datetime || t.date || "").split("T")[0];
        const p = Number(t.result_net) || 0;
        dailyProfits[d] = (dailyProfits[d] || 0) + p;
      }

      const values = Object.values(dailyProfits);
      const totalProfit = values.reduce((a, b) => a + b, 0);
      const maxDay = Math.max(0, ...values);
      const ratio = totalProfit > 0 ? (maxDay / totalProfit) * 100 : 0;

      // 🔹 Cálculo de progresso
      const profitProgress =
        targetProfit > 0 ? Math.min(100, (totalProfit / targetProfit) * 100) : 0;
      const consistencyProgress =
        ratio > 0 ? Math.min(100, (consistencyLimit / ratio) * 100) : 100;

      // Combinação ponderada
      const progress = Math.min(100, profitProgress * 0.7 + consistencyProgress * 0.3);

      return {
        totalProfit,
        ratio,
        progress,
        completed: progress >= 100,
        profitProgress,
        consistencyProgress,
        consistencyLimit,
      };
    }

    case "tradeCount":
      return relevantTrades.length;

    case "winRate": {
      const wins = relevantTrades.filter(t => Number(t.result_R || 0) > 0).length;
      const total = relevantTrades.length;
      return total > 0 ? (wins / total) * 100 : 0;
    }

    case "avgR": {
      const totalR = relevantTrades.reduce((s, t) => s + (Number(t.result_R) || 0), 0);
      return relevantTrades.length > 0 ? totalR / relevantTrades.length : 0;
    }

    case "roi": {
      const linked = config.linkedAccounts?.length
        ? accounts.filter(a => config.linkedAccounts.includes(a.id))
        : accounts;
      const totalInit = linked.reduce((s, a) => s + (Number(a.initialFunding) || 0), 0);
      const totalNow = linked.reduce((s, a) => s + (Number(a.currentFunding) || 0), 0);
      return totalInit > 0 ? ((totalNow - totalInit) / totalInit) * 100 : 0;
    }

    default:
      return 0;
  }
}

// ===============================
// ✅ PROGRESSO DE GOAL REVISADO
// ===============================
export function getGoalProgress(goalId) {
  const data = load();
  const goals = data.goals || [];
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return null;

  const trades = data.trades || [];
  const accounts = data.accounts || [];

  // ---------------------------
  // 📍 SE EXISTEM SUBGOALS
  // ---------------------------
  if (Array.isArray(goal.subGoals) && goal.subGoals.length > 0) {
    const subProgresses = goal.subGoals.map((sub, index) => {
      const cfg = {
        ...sub,
        period: sub.period || goal.period,
        startDate: sub.startDate || goal.startDate,
        linkedAccounts: sub.linkedAccounts?.length
          ? sub.linkedAccounts
          : goal.linkedAccounts || [],
      };

      const metric = calculateMetric(sub.type, trades, accounts, cfg);
      const isComplex = typeof metric === "object" && "progress" in metric;

      const currentValue = isComplex ? metric.totalProfit || 0 : metric || 0;
      let progress = isComplex
        ? metric.progress
        : sub.targetValue > 0
        ? Math.min(100, (currentValue / sub.targetValue) * 100)
        : 0;

      // ⏳ Cálculo dos dias ativos
      let daysActive = 0;
      if (sub.minDays && sub.minDays > 0) {
        const relevant = trades.filter(t =>
          isInPeriod(t.entry_datetime || t.date, cfg.period, cfg.startDate)
        );
        const unique = new Set(
          relevant.map(t => (t.entry_datetime || t.date || "").split("T")[0])
        );
        daysActive = unique.size;
      }

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

    // ---------------------------
    // 🧩 APLICA MODO DE PROGRESSO
    // ---------------------------
    let totalProgress = 0;

    if (goal.mode === "sequential") {
      // ✅ Cada sub só progride após o anterior estar completo
      for (let i = 0; i < subProgresses.length; i++) {
        const prev = subProgresses[i - 1];
        const cur = subProgresses[i];

        if (i === 0) {
          totalProgress += cur.progress / subProgresses.length;
        } else if (prev?.completed) {
          totalProgress += cur.progress / subProgresses.length;
        } else {
          // bloqueia progresso de subgoals futuros
          cur.progress = 0;
          cur.locked = true;
        }
      }
    } else {
      // ✅ Modo paralelo ponderado
      const totalWeight = subProgresses.reduce((s, sg) => s + (sg.weight || 1), 0);
      const weightedSum = subProgresses.reduce(
        (s, sg) => s + (sg.progress * (sg.weight || 1)),
        0
      );
      totalProgress = totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    // ---------------------------
    // 🎯 Goal principal
    // ---------------------------
    const meetsValue = totalProgress >= 100;
    const relevantTrades = trades.filter(t =>
      isInPeriod(t.entry_datetime || t.date, goal.period, goal.startDate)
    );
    const uniqueDays = new Set(
      relevantTrades.map(t => (t.entry_datetime || t.date || "").split("T")[0])
    );

    const meetsDays = !goal.minDays || uniqueDays.size >= goal.minDays;
    const completed = meetsValue && meetsDays;

    return {
      progress: totalProgress,
      completed,
      daysActive: uniqueDays.size,
      minDays: goal.minDays || 0,
      subProgresses,
    };
  }

  // ---------------------------
  // 🎯 GOAL SIMPLES
  // ---------------------------
  const cfg = { ...goal };
  const result = calculateMetric(goal.type, trades, accounts, cfg);
  const isComplex = typeof result === "object" && "progress" in result;

  const currentValue = isComplex ? result.totalProfit || 0 : result || 0;
  const progress = isComplex
    ? result.progress
    : goal.targetValue > 0
    ? Math.min(100, (currentValue / goal.targetValue) * 100)
    : 0;

  return {
    currentValue,
    progress,
    completed: progress >= 100,
  };
}


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
   PLATFORM INTEGRATION
   -------------------- */

/**
 * Get platform-specific settings.
 * @param {string} platformId - e.g. 'quantower', 'ctrader'
 */
export function getPlatformSettings(platformId) {
  const data = load();
  return data.settings?.platforms?.[platformId] || null;
}

/**
 * Update platform-specific settings (merges with existing).
 * @param {string} platformId
 * @param {Object} patch
 */
export function setPlatformSettings(platformId, patch) {
  const data = load();
  if (!data.settings.platforms) data.settings.platforms = {};
  data.settings.platforms[platformId] = {
    ...(data.settings.platforms[platformId] || {}),
    ...patch,
  };
  save(data);
  return data.settings.platforms[platformId];
}

/**
 * Find a trade by its platform-specific ID (for deduplication).
 * @param {string} platformTradeId - e.g. 'qt_12345'
 * @returns {Object|null}
 */
export function getTradeByPlatformId(platformTradeId) {
  if (!platformTradeId) return null;
  const data = load();
  return (data.trades || []).find(t => t.platformTradeId === platformTradeId) || null;
}

/**
 * Insert or update a trade from a platform (upsert by platformTradeId).
 * If the trade already exists (same platformTradeId), updates it.
 * If not, creates a new one.
 * @param {Object} normalizedTrade - Trade with platformTradeId set
 * @returns {{ trade: Object, isNew: boolean }}
 */
export function upsertTradeFromPlatform(normalizedTrade) {
  const data = load();
  const existing = (data.trades || []).findIndex(
    t => t.platformTradeId && t.platformTradeId === normalizedTrade.platformTradeId
  );

  let trade, isNew;

  if (existing !== -1) {
    // Update existing trade (preserve internal fields like notes, strategyId)
    data.trades[existing] = {
      ...data.trades[existing],
      ...normalizedTrade,
      id: data.trades[existing].id, // keep internal ID
    };
    trade = data.trades[existing];
    isNew = false;
  } else {
    // Create new trade
    trade = {
      id: uuid(),
      ...normalizedTrade,
    };
    data.trades.push(trade);
    isNew = true;
  }

  save(data);
  return { trade, isNew };
}

/**
 * Get all live (open) positions from cache.
 * @returns {Array}
 */
export function getLivePositions() {
  const data = load();
  return data.livePositions || [];
}

/**
 * Update the cached live positions (replaces entire array).
 * @param {Array} positions
 */
export function updateLivePositions(positions) {
  const data = load();
  data.livePositions = positions || [];
  save(data);
}

/**
 * Mark a live position as closed — converts it into a completed trade.
 * @param {string} platformPositionId
 * @param {Object} exitData - { exitPrice, exitTime, netPnl, grossPnl, fee }
 * @returns {Object|null} The created/updated trade, or null
 */
export function closeLivePosition(platformPositionId, exitData = {}) {
  const data = load();
  const posIdx = (data.livePositions || []).findIndex(
    p => p.platformPositionId === platformPositionId
  );

  if (posIdx === -1) return null;

  const pos = data.livePositions[posIdx];

  // Remove from live positions
  data.livePositions.splice(posIdx, 1);

  // Handle both old (entryPrice/entryTime) and new (openPrice/openTime) field names
  const entryTime = pos.openTime || pos.entryTime;
  const entryPrice = pos.openPrice ?? pos.entryPrice;

  // Create or update trade from the closed position
  const tradeData = {
    entry_datetime: entryTime,
    exit_datetime: exitData.exitTime || new Date().toISOString(),
    asset: pos.symbol,
    accountId: pos.internalAccountId || (pos.platformAccountId ? getAccountMapping(pos.platformId)?.[pos.platformAccountId] : null) || null,
    direction: pos.side === 'Short' ? 'Short' : 'Long',
    volume: pos.quantity,
    entry_price: entryPrice,
    exit_price: exitData.exitPrice || pos.currentPrice,
    result_net: exitData.netPnl ?? pos.netPnl ?? 0,
    source: pos.platformId || 'quantower',
    platformTradeId: pos.platformPositionId,
    platformName: pos.platformName || 'Quantower',
    connectionName: pos.connectionName || '',
    isLive: false,
  };

  const result = upsertTradeFromPlatform(tradeData);
  save(data);
  return result.trade;
}

/**
 * Get account mapping for a platform.
 * @param {string} platformId
 * @returns {Object} { platformAccountId: internalAccountId }
 */
export function getAccountMapping(platformId) {
  const settings = getPlatformSettings(platformId);
  return settings?.accountMapping || {};
}

/**
 * Set account mapping for a platform.
 * @param {string} platformId
 * @param {string} platformAccountId
 * @param {string} internalAccountId
 */
export function setAccountMapping(platformId, platformAccountId, internalAccountId) {
  const data = load();
  if (!data.settings.platforms[platformId]) return null;
  if (!data.settings.platforms[platformId].accountMapping) {
    data.settings.platforms[platformId].accountMapping = {};
  }
  data.settings.platforms[platformId].accountMapping[platformAccountId] = internalAccountId;
  save(data);
  return data.settings.platforms[platformId].accountMapping;
}

/* --------------------
   QUANTOWER ACCOUNT UPSERT
   Creates or updates internal account from Quantower bridge data.
   -------------------- */
export function upsertQuantowerAccount(platformAccount, firmId, connectionId, connectionName) {
  const data = load();
  const platformAccountId = platformAccount.platformAccountId;
  const platformAccountName = platformAccount.name || platformAccountId;
  
  // First try exact platform match
  let existingIdx = data.accounts.findIndex(a => 
    a.platformName === 'quantower' && a.platformAccountId === platformAccountId
  );

  // Fallback: match by name if platform fields missing (user created account manually)
  if (existingIdx === -1) {
    existingIdx = data.accounts.findIndex(a => 
      (!a.platformName || !a.platformAccountId) && a.name === platformAccountName
    );
  }

  const now = new Date().toISOString();
  const balance = Number(platformAccount.balance) || 0;

  let accountType = 'Futures';
  if (firmId) {
    const firm = data.firms.find(f => f.id === firmId);
    if (firm) accountType = firm.type;
  }

  const accountData = {
    name: platformAccountName,
    type: accountType,
    status: 'Live',
    initialFunding: balance,
    currentFunding: balance,
    profitSplit: 0.8,
    payoutFrequency: 'monthly',
    defaultWeight: 1,
    currency: platformAccount.currency || 'USD',
    connectionId: connectionId || '',
    connectionName: connectionName || '',
    platformAccountId: platformAccountId,
    platformName: 'quantower',
    lastPlatformSync: now,
    firmId: firmId || null,
    dateCreated: now.split('T')[0],
  };

  let internalAccountId;
  if (existingIdx !== -1) {
    const existing = data.accounts[existingIdx];
    data.accounts[existingIdx] = { ...existing, ...accountData };
    internalAccountId = data.accounts[existingIdx].id;
  } else {
    internalAccountId = uuid();
    data.accounts.push({ id: internalAccountId, ...accountData });
  }

  // Update account mapping
  if (!data.settings.platforms.quantower) {
    data.settings.platforms.quantower = { enabled: true, bridgeUrl: 'http://localhost:8787', autoSync: true, accountMapping: {} };
  }
  if (!data.settings.platforms.quantower.accountMapping) {
    data.settings.platforms.quantower.accountMapping = {};
  }
  data.settings.platforms.quantower.accountMapping[platformAccountId] = internalAccountId;
  data.settings.platforms.quantower.enabled = true;

  save(data);
  return { internalAccountId, isNew: existingIdx === -1 };
}

/* --------------------
   TRADE LEDGER (IndexedDB for performance + localStorage backup)
   Deduplicates trades by platformTradeId across reconnections.
   status: 'imported' | 'deleted' | 'ignored'
   -------------------- */

async function getLedgerDB() {
  return openDB('quantower-ledger', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tradeLedger')) {
        const store = db.createObjectStore('tradeLedger', { keyPath: 'platformTradeId' });
        store.createIndex('internalAccountId', 'internalAccountId');
        store.createIndex('platformAccountId', 'platformAccountId');
      }
    }
  });
}

export async function getTradeLedger() {
  try {
    const db = await getLedgerDB();
    return await db.getAll('tradeLedger');
  } catch (err) {
    console.warn('[TradeLedger] Failed to load from IndexedDB:', err);
    const data = load();
    return Object.values(data.tradeLedger || {});
  }
}

export async function getTradeLedgerEntry(platformTradeId) {
  try {
    const db = await getLedgerDB();
    return await db.get('tradeLedger', platformTradeId);
  } catch (err) {
    const data = load();
    return data.tradeLedger?.[platformTradeId] || null;
  }
}

export async function setTradeLedgerEntry(platformTradeId, entry) {
  try {
    const db = await getLedgerDB();
    await db.put('tradeLedger', { platformTradeId, ...entry });
  } catch (err) {
    console.warn('[TradeLedger] Failed to save to IndexedDB:', err);
  }
  // Also persist to localStorage as backup
  const data = load();
  if (!data.tradeLedger) data.tradeLedger = {};
  data.tradeLedger[platformTradeId] = { platformTradeId, ...entry };
  save(data);
}

export async function deleteTradeLedgerEntry(platformTradeId) {
  try {
    const db = await getLedgerDB();
    await db.delete('tradeLedger', platformTradeId);
  } catch (err) {
    console.warn('[TradeLedger] Failed to delete from IndexedDB:', err);
  }
  const data = load();
  if (data.tradeLedger) delete data.tradeLedger[platformTradeId];
  save(data);
}

export async function isTradeImported(platformTradeId) {
  const entry = await getTradeLedgerEntry(platformTradeId);
  return entry?.status === 'imported';
}

export async function markTradeDeleted(platformTradeId) {
  await setTradeLedgerEntry(platformTradeId, { status: 'deleted', deletedAt: new Date().toISOString() });
}

export async function markTradeIgnored(platformTradeId) {
  await setTradeLedgerEntry(platformTradeId, { status: 'ignored', ignoredAt: new Date().toISOString() });
}

/* --------------------
   CONNECTION → FIRM MAPPING (Nível 1)
   Vincula toda uma conexão do Quantower a uma Firm.
   -------------------- */
export function getConnectionFirmMap() {
  const data = load();
  return data.connectionFirmMap || {};
}

export function setConnectionFirmMap(map) {
  const data = load();
  data.connectionFirmMap = { ...map };
  save(data);
  return data.connectionFirmMap;
}

export function setConnectionFirmEntry(connectionId, firmId) {
  const data = load();
  if (!data.connectionFirmMap) data.connectionFirmMap = {};
  if (firmId === null || firmId === undefined) {
    delete data.connectionFirmMap[connectionId];
  } else {
    data.connectionFirmMap[connectionId] = firmId;
  }
  save(data);
  return data.connectionFirmMap;
}

/* --------------------
   ACCOUNT → FIRM OVERRIDE (Nível 2)
   Permite que uma conta específica use uma Firm diferente da conexão.
   -------------------- */
export function getAccountFirmOverride() {
  const data = load();
  return data.accountFirmOverride || {};
}

export function setAccountFirmOverride(map) {
  const data = load();
  data.accountFirmOverride = { ...map };
  save(data);
  return data.accountFirmOverride;
}

export function setAccountFirmEntry(accountId, firmId) {
  const data = load();
  if (!data.accountFirmOverride) data.accountFirmOverride = {};
  if (firmId === null || firmId === undefined) {
    delete data.accountFirmOverride[accountId];
  } else {
    data.accountFirmOverride[accountId] = firmId;
  }
  save(data);
  return data.accountFirmOverride;
}

/* --------------------
   RESOLVER: Firma efetiva para uma conta
   Prioridade: Override (Nível 2) > Conexão (Nível 1) > firmId da conta
   -------------------- */
export function resolveFirmForAccount(account, firms) {
  if (!account) return null;
  const override = getAccountFirmOverride();
  const connMap  = getConnectionFirmMap();

  const firmId =
    override[account.id] ||
    (account.connectionId ? connMap[account.connectionId] : null) ||
    account.firmId ||
    null;

  if (!firmId) return null;
  return (firms || []).find(f => f.id === firmId) || null;
}

/* --------------------
   TRADE DEDUPLICATION
   Removes duplicate trades from the same position (Quantower entry+exit issue).
   Keeps the trade with actual PnL (the exit trade).
   -------------------- */
export function deduplicateTradesByPosition() {
  const data = load();
  const trades = data.trades || [];
  
  // Group trades by positionId
  const tradesByPosition = new Map();
  for (const trade of trades) {
    const key = trade.positionId || trade.platformTradeId || trade.id;
    if (!tradesByPosition.has(key)) {
      tradesByPosition.set(key, []);
    }
    tradesByPosition.get(key).push(trade);
  }

  // For each position, keep the trade with actual PnL (the exit trade)
  const deduplicatedTrades = [];
  let removedCount = 0;
  
  for (const [positionId, positionTrades] of tradesByPosition) {
    if (positionTrades.length === 1) {
      deduplicatedTrades.push(positionTrades[0]);
    } else {
      // Keep the trade with non-zero PnL (the exit trade)
      const exitTrade = positionTrades.find(t => (t.netPnl !== 0 || t.grossPnl !== 0));
      if (exitTrade) {
        deduplicatedTrades.push(exitTrade);
      } else {
        // All zero PnL, keep the last one (most recent)
        deduplicatedTrades.push(positionTrades[positionTrades.length - 1]);
      }
      removedCount += positionTrades.length - 1;
    }
  }

  if (removedCount > 0) {
    data.trades = deduplicatedTrades;
    save(data);
    console.log(`[deduplicateTradesByPosition] Removed ${removedCount} duplicate trades`);
  }
  
  return { removedCount, totalRemaining: deduplicatedTrades.length };
}

/* --------------------
   Export default summary (optional)
   -------------------- */
export default {
  getAll, getSettings, setSettings,
  createAccount, updateAccount, deleteAccount, recalcAccountFunding,
  createPayout, updatePayout, deletePayout,
  getAccountStats,
  getFirms, createFirm, updateFirm, deleteFirm, getFirmStats,
  getTrades, createTrade, updateTrade, deleteTrade,
  getAllGoals, createGoal, updateGoal, deleteGoal, getGoalProgress, archiveGoal, calculateMetric, getAllTradesSafe,
  // Platform integration
  getPlatformSettings, setPlatformSettings,
  getTradeByPlatformId, upsertTradeFromPlatform,
  getLivePositions, updateLivePositions, closeLivePosition,
  getAccountMapping, setAccountMapping,
  upsertQuantowerAccount,
  // Trade Ledger
  getTradeLedger, getTradeLedgerEntry, setTradeLedgerEntry, deleteTradeLedgerEntry,
  isTradeImported, markTradeDeleted, markTradeIgnored,
  // Trade Deduplication
  deduplicateTradesByPosition,
  // Connection → Firm mapping
  getConnectionFirmMap, setConnectionFirmMap, setConnectionFirmEntry,
  getAccountFirmOverride, setAccountFirmOverride, setAccountFirmEntry,
  resolveFirmForAccount,
}
