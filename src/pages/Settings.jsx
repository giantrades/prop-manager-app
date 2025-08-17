import React from 'react'
import { useCurrency } from '../state/CurrencyContext.jsx'

export default function Settings(){
  const { rate, setRate } = useCurrency()
  return (
    <div className="grid" style={{gap:16}}>
      <div className="card">
        <h3>⚙️ Settings</h3>
        <div className="field" style={{maxWidth:320}}>
          <label>USD → BRL</label>
          <input type="number" step="0.01" className="input" value={rate} onChange={e=>setRate(parseFloat(e.target.value||'0')||0)} />
        </div>
        <p className="muted">Esse valor será usado para o seletor de moeda no topo (USD/BRL) e aplicado ao Dashboard, Contas e Payouts.</p>
      </div>
    </div>
  )
}


