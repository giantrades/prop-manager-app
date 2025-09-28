// main-app/src/Navbar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useCurrency } from '@apps/state'

function CurrencyBox() {
  const { currency, setCurrency, rate } = useCurrency();
  return (
    <div className="currency-toggle" title="Toggle currency">
      <span>💱</span>
      <button className={currency === "USD" ? "btn" : "btn ghost"} onClick={() => setCurrency("USD")}>
        USD
      </button>
      <button className={currency === "BRL" ? "btn" : "btn ghost"} onClick={() => setCurrency("BRL")}>
        BRL
      </button>
      <span className="muted">1 USD = {rate} BRL</span>
    </div>
  );
}

export default function Navbar({
  driveReady,
  logged,
  onLogin,
  onLogout,
  onBackup,
  onList,
}) {
  const dotColor = !driveReady ? "#9CA3AF" : (logged ? "#22c55e" : "#ef4444");
  const journalUrl = import.meta.env.VITE_JOURNAL_URL || '/journal/';

  return (
    <nav className="navbar">
      <div className="nav-logo">📊 <span>Gian PropManager</span></div>

      <div className="nav-links">
        <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")}>Dashboard</NavLink>
        <NavLink to="/accounts" className={({ isActive }) => (isActive ? "active" : "")}>Accounts</NavLink>
        <NavLink to="/payouts"  className={({ isActive }) => (isActive ? "active" : "")}>Payouts</NavLink>
        <NavLink to="/firms" className={({isActive}) => isActive ? 'active' : ''}>Empresas</NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>Settings</NavLink>
        
      </div>

      <div className="spacer" />

      <a href={journalUrl}  style={{ 
    // Aparência de destaque (simulando um botão azul ou pílula)
    color: '#fff', // Texto branco
    padding: '8px 14px',
    border: '2px solid var(--color-border-soft, #ffffffff)',
    borderRadius: '16px', // Bordas bem arredondadas (estilo pílula)
    fontWeight: '600',
    fontSize: '1.1rem',

    
    // Alinhamento e Layout
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'background-color 0.2s', // Efeito de hover
  }}
  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent-2, #161725ff)'} // Escurece no hover
  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-accent-1, 15, 18, 24, 0.85)'} // Volta ao normal
>
  <span style={{ fontSize: '1rem' }}></span>Trading Journal</a>

      <CurrencyBox />

      {/* Status + Ações Drive */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16 }}>
        <span
          title={ !driveReady ? "Drive não inicializado" : (logged ? "Conectado ao Google" : "Desconectado do Google") }
          style={{
            width: 12, height: 12, borderRadius: "50%",
            backgroundColor: dotColor, display: "inline-block",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.1)"
          }}
        />
        {logged ? (
          <>
            <button className="btn ghost small" onClick={onLogout}>Logout</button>
            <button className="btn ghost small" onClick={onBackup}>Backup</button>
            <button className="btn ghost small" onClick={onList}>Listar</button>
          </>
        ) : (
          <button className="btn ghost small" onClick={onLogin}>Login Google</button>
        )}
      </div>
    </nav>
  );
}
