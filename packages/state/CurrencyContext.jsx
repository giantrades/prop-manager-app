import React, {createContext, useContext, useMemo, useState, useEffect} from 'react'
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
const CurrencyContext = createContext(null)


export function CurrencyProvider({children}){
  const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'USD')
  const [rate, setRate] = useState(parseFloat(localStorage.getItem('usdBrlRate')) || 5.0)
  useEffect(()=>localStorage.setItem('currency', currency),[currency])
  useEffect(()=>localStorage.setItem('usdBrlRate', String(rate)),[rate])

  const format = useMemo(()=> (valueUSD)=>{
    if (currency === 'USD') return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(valueUSD||0)
    const brl = (valueUSD||0)*rate
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(brl)
  },[currency, rate])

  return <CurrencyContext.Provider value={{currency,setCurrency, rate,setRate, format}}>{children}</CurrencyContext.Provider>
}
export const useCurrency = () => useContext(CurrencyContext)
