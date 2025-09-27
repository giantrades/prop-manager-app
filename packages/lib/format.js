import { useCurrency } from '../state/CurrencyContext.jsx'
export function formatCurrency(value, currency, rate){
  if (currency==='USD'){
    return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value||0)
  } else {
    const brl = (value||0) * rate
    return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(brl)
  }
}
