import React, {createContext, useContext, useMemo, useState, useEffect} from 'react'
import * as store from '../lib/dataStore.js'

const DataCtx = createContext(null)

export function DataProvider({children}){
  const [accounts, setAccounts] = useState(store.getAll().accounts)
  const [payouts, setPayouts] = useState(store.getAll().payouts)

  // A simple subscription by polling localStorage changes (intra-tab)
  useEffect(()=>{
    const i = setInterval(()=>{
      const {accounts:a, payouts:p} = store.getAll()
      setAccounts(a); setPayouts(p)
    }, 500)
    return ()=>clearInterval(i)
  }, [])

  const api = useMemo(()=> ({
    createAccount: (partial)=>{ const a = store.createAccount(partial); setAccounts(store.getAll().accounts); return a },
    updateAccount: (id, patch)=>{ const a = store.updateAccount(id, patch); setAccounts(store.getAll().accounts); return a },
    deleteAccount: (id)=>{ store.deleteAccount(id); const all = store.getAll(); setAccounts(all.accounts); setPayouts(all.payouts) },
    createPayout: (partial)=>{ const p = store.createPayout(partial); setPayouts(store.getAll().payouts); return p },
    updatePayout: (id, patch)=>{ const p = store.updatePayout(id, patch); setPayouts(store.getAll().payouts); return p },
    deletePayout: (id)=>{ store.deletePayout(id); setPayouts(store.getAll().payouts) },
    getAccountStats: store.getAccountStats,
    accounts, payouts
  }), [accounts, payouts])

  return <DataCtx.Provider value={api}>{children}</DataCtx.Provider>
}

export const useData = ()=> useContext(DataCtx)
