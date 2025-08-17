import React from 'react'
import { NavLink, Routes, Route, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Accounts from './pages/Accounts.jsx'
import Payouts from './pages/Payouts.jsx'
import Settings from './pages/Settings.jsx'
import { useCurrency } from './state/CurrencyContext.jsx'
import Navbar from './Navbar';



function CurrencyBox() {
  const { currency, setCurrency, rate } = useCurrency()
  return (
    <div className="currency-toggle" title="Toggle currency">
      <span>💱</span>
      <button className={currency === 'USD' ? 'btn' : 'btn ghost'} onClick={() => setCurrency('USD')}>USD</button>
      <button className={currency === 'BRL' ? 'btn' : 'btn ghost'} onClick={() => setCurrency('BRL')}>BRL</button>
      <span className="muted">1 USD = {rate} BRL</span>
    </div>
  )
}

export default function App() {
  const loc = useLocation()
  return (
    <div>
      <Navbar />

      <main className="container">
        <Routes location={loc}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/payouts" element={<Payouts />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
