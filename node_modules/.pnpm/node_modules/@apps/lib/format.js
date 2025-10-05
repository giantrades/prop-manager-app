import { useCurrency } from '../state/CurrencyContext.jsx'
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';

export function formatCurrency(value, currency, rate){
  if (currency==='USD'){
    return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value||0)
  } else {
    const brl = (value||0) * rate
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(brl)
  }
}
