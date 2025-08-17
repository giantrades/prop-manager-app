import { v4 as uuid } from 'uuid'

const LS_KEY = 'propmanager-data-v1'

const seed = {
  accounts: [ /* ... seus seeds existentes ... */ ],
  payouts: [],
  settings: { methods: ['Rise','Wise','Pix','Paypal','Cripto'] }
}

function load() {
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) { localStorage.setItem(LS_KEY, JSON.stringify(seed)); return seed }
  try { 
    const data = JSON.parse(raw)
    if (!data.settings) data.settings = { methods: ['Rise','Wise','Pix','Paypal','Cripto'] }
    return data
  } catch { return seed }
}
function save(data){ localStorage.setItem(LS_KEY, JSON.stringify(data)) }

export function getAll(){ return load() }
export function getSettings(){ return load().settings }
export function setSettings(patch){
  const data = load()
  data.settings = { ...data.settings, ...patch }
  save(data); return data.settings
}

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

// ---- payouts afetam funding atual ----
function computeSplit(amount, accounts){
  if (!accounts.length) return { totalNet:0, totalFee:0, splitMap:{}, deductions:{} }
  const share = amount / accounts.length
  let totalNet = 0, totalFee = 0, splitMap = {}, deductions = {}
  for (const a of accounts){
    const net = share * (a.profitSplit || 1)
    const fee = share - net
    totalNet += net; totalFee += fee
    splitMap[a.id] = { share, split: a.profitSplit || 1, net, fee }
    deductions[a.id] = share // GROSS abatido do funding
  }
  return { totalNet, totalFee, splitMap, deductions }
}
function applyDeductions(data, deductions, sign= -1){
  for (const [aid, amt] of Object.entries(deductions||{})){
    const idx = data.accounts.findIndex(a=>a.id===aid)
    if (idx!==-1){
      const cur = data.accounts[idx].currentFunding || 0
      data.accounts[idx].currentFunding = Number((cur + sign*amt).toFixed(2))
    }
  }
}

export function createPayout(partial){
  const data = load()
  const p = { id: uuid(), dateCreated: new Date().toISOString().slice(0,10), accountIds: [], type:'Forex', amountSolicited:0,
    method:'Pix', status:'Pending', approvedDate:null, amountReceived:0, fee:0, splitByAccount:{}, deductionsByAccount:{}, ...partial }
  const accounts = data.accounts.filter(a => p.accountIds.includes(a.id))
  const { totalNet, totalFee, splitMap, deductions } = computeSplit(p.amountSolicited||0, accounts)
  p.amountReceived = Number(totalNet.toFixed(2))
  p.fee = Number(totalFee.toFixed(2))
  p.splitByAccount = splitMap
  p.deductionsByAccount = deductions
  applyDeductions(data, deductions, -1)
  data.payouts.push(p); save(data); return p
}
export function updatePayout(id, patch){
  const data = load()
  const idx = data.payouts.findIndex(p=>p.id===id); if (idx===-1) return null
  const prev = data.payouts[idx]
  applyDeductions(data, prev.deductionsByAccount, +1) // desfaz anterior

  const merged = { ...prev, ...patch }
  const accounts = data.accounts.filter(a => merged.accountIds.includes(a.id))
  const { totalNet, totalFee, splitMap, deductions } = computeSplit(merged.amountSolicited||0, accounts)
  merged.amountReceived = Number(totalNet.toFixed(2))
  merged.fee = Number(totalFee.toFixed(2))
  merged.splitByAccount = splitMap
  merged.deductionsByAccount = deductions

  applyDeductions(data, deductions, -1) // aplica novo
  data.payouts[idx] = merged; save(data); return merged
}
export function deletePayout(id){
  const data = load()
  const idx = data.payouts.findIndex(p=>p.id===id); if (idx===-1) return
  applyDeductions(data, data.payouts[idx].deductionsByAccount, +1)
  data.payouts.splice(idx,1)
  save(data)
}

// ---- stats por conta (ROI, último payout, próximo payout) ----
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
