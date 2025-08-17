import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useCurrency } from './state/CurrencyContext.jsx';

function CurrencyBox() {
  const { currency, setCurrency, rate } = useCurrency();
  return (
    <div className="currency-toggle" title="Toggle currency">
      <span>💱</span>
      <button
        className={currency === 'USD' ? 'btn' : 'btn ghost'}
        onClick={() => setCurrency('USD')}
      >
        USD
      </button>
      <button
        className={currency === 'BRL' ? 'btn' : 'btn ghost'}
        onClick={() => setCurrency('BRL')}
      >
        BRL
      </button>
      <span className="muted">1 USD = {rate} BRL</span>
    </div>
  );
}

export default function Navbar() {
  const loc = useLocation();

  return (
    <nav className="navbar">
      <div className="nav-logo">📊 <span>Gian PropManager</span></div>
      <div className="nav-links">
        <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>Dashboard</NavLink>
        <NavLink to="/accounts" className={({ isActive }) => isActive ? 'active' : ''}>Accounts</NavLink>
        <NavLink to="/payouts" className={({ isActive }) => isActive ? 'active' : ''}>Payouts</NavLink>
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>Settings</NavLink>
      </div>
      <div className="spacer" />
      <CurrencyBox />
    </nav>
  );
}
