import React from "react";
import { NavLink } from "react-router-dom";
import { useCurrency } from "@apps/state"; // mesma store do main-app

function CurrencyBox() {
  const { currency, setCurrency, rate } = useCurrency();
  return (
    <div className="currency-toggle" title="Toggle currency">
      <span>💱</span>
      <button
        className={currency === "USD" ? "btn" : "btn ghost"}
        onClick={() => setCurrency("USD")}
      >
        USD
      </button>
      <button
        className={currency === "BRL" ? "btn" : "btn ghost"}
        onClick={() => setCurrency("BRL")}
      >
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
  const dotColor = !driveReady ? "#9CA3AF" : logged ? "#22c55e" : "#ef4444";

  // rota do main-app (ajuste se não for 5174)
  const mainAppUrl = import.meta.env.VITE_MAIN_URL || "http://localhost:5174/";

  return (
    <nav className="navbar">
      {/* Logo */}
      <div className="nav-logo">📈 <span>Trading Journal</span></div>

      {/* Links internos do journal */}
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Dashboard
        </NavLink>
        <NavLink to="/trades" className={({ isActive }) => (isActive ? "active" : "")}>
          Trades
        </NavLink>
        <NavLink to="/strategies" className={({ isActive }) => (isActive ? "active" : "")}>
          Strategies
        </NavLink>
        <NavLink to="/montecarlo" className={({ isActive }) => (isActive ? "active" : "")}>
          Monte Carlo
        </NavLink>

        {/* Voltar para Main-App */}
        <a href={mainAppUrl} className="external-link">← Main App</a>
      </div>

      <div className="spacer" />

      {/* Currency */}
      <CurrencyBox />

      {/* Status + Drive actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16 }}>
        <span
          title={
            !driveReady
              ? "Drive não inicializado"
              : logged
              ? "Conectado ao Google"
              : "Desconectado do Google"
          }
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: dotColor,
            display: "inline-block",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.1)",
          }}
        />
        {logged ? (
          <>
            <button className="btn ghost small" onClick={onLogout}>
              Logout
            </button>
            <button className="btn ghost small" onClick={onBackup}>
              Backup
            </button>
            <button className="btn ghost small" onClick={onList}>
              Listar
            </button>
          </>
        ) : (
          <button className="btn ghost small" onClick={onLogin}>
            Login Google
          </button>
        )}
      </div>
    </nav>
  );
}
