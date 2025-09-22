// src/Navbar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useCurrency } from "./state/CurrencyContext.jsx";

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
