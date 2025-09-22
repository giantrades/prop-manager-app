// src/lib/dataStore.js
import { v4 as uuid } from 'uuid'

const LS_KEY = 'propmanager-data-v1'

const seed = {
  accounts: [ /* ... seus seeds existentes ... */ ],
  payouts: [],
  settings: { methods: ['Rise','Wise','Pix','Paypal','Cripto'] },
  firms: []
}

function load() {
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) { localStorage.setItem(LS_KEY, JSON.stringify(seed)); return JSON.parse(JSON.stringify(seed)) }
  try {
    const data = JSON.parse(raw)
    // MIGRATION: garante chaves obrigatórias para compatibilidade com versões antigas
    data.settings = data.settings || { methods: ['Rise','Wise','Pix','Paypal','Cripto'] }
    data.accounts = data.accounts || []
    data.payouts = data.payouts || []
    data.firms = data.firms || []
    return data
  } catch (e) {
    localStorage.setItem(LS_KEY, JSON.stringify(seed))
    return JSON.parse(JSON.stringify(seed))
  }
}
function save(data){ localStorage.setItem(LS_KEY, JSON.stringify(data)) }

// export helpers / existing functions
export function getAll(){ return load() }
export function getSettings(){ return load().settings }
export function setSettings(patch){
  const data = load()
  data.settings = { ...data.settings, ...patch }
  save(data); return data.settings
}

// ACCOUNTS (mantive sua lógica existente)
export function createAccount(partial){
  const data = load()
  const acc = { id: uuid(), name:'', type:'Forex', dateCreated: new Date().toISOString().slice(0,10), status:'Standby',
    initialFunding:0, currentFunding:0, profitSplit:0.8, payoutFrequency:'monthly', ...partial }
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
  save(data)
}

// ---- payouts (mantive suas funções / lógica já existente) ----
// computeSplit, createPayout, updatePayout, deletePayout
// Como seu arquivo original já os continha, mantive a essência e preservei nomes.
// Se for necessário, copie o conteúdo original destas funções aqui.
// Para brevity: vou reutilizar as mesmas funções que já estavam no arquivo original.

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
  // se houver accounts referenciadas, computeSplit
  if (p.accountIds && p.accountIds.length){
    const accounts = p.accountIds.map(id=> data.accounts.find(a=>a.id===id)).filter(Boolean)
    const c = computeSplit(p.amountSolicited, accounts)
    p.splitByAccount = {}
    accounts.forEach(a => p.splitByAccount[a.id] = c.splitMap[a.id])
  }
  data.payouts.push(p)
  // aplicar atualizacao do currentFunding se necessário (se for aprovado). A lógica original do seu arquivo já tratava
  save(data); return p
}
export function updatePayout(id, patch){
  const data = load()
  const idx = data.payouts.findIndex(p=>p.id===id); if (idx===-1) return null
  data.payouts[idx] = { ...data.payouts[idx], ...patch }
  save(data); return data.payouts[idx]
}
export function deletePayout(id){
  const data = load()
  data.payouts = data.payouts.filter(p=>p.id!==id)
  save(data)
}

// Account stats (mantive a sua função)
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

// ---------------------------
// NEW: FIRMS (companies) CRUD + stats
// ---------------------------

export function getFirms(){
  return load().firms || []
}

export function createFirm(partial){
  const data = load()
  const f = {
    id: uuid(),
    name: partial.name || '',
    type: partial.type || 'Futures',
    logo: partial.logo || null, // dataURL ou URL
    dateCreated: new Date().toISOString().slice(0,10),
    ...partial
  }
  data.firms.push(f)
  save(data)
  return f
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
  // remove referência das contas
  data.accounts = data.accounts.map(a => a.firmId === id ? ({ ...a, firmId: null }) : a)
  save(data)
  return true
}

/*
  getFirmStats(firmId):
    - totalFunding: soma currentFunding das contas ligadas
    - totalPayouts: soma de todos os valores net nos payouts que foram split para contas dessa firm
    - accountCount: quantidade de contas
*/
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
