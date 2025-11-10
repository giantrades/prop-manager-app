import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useCurrency } from "@apps/state";
import { useDrive } from "@apps/state/DriveContext";

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

export default function Navbar() {
  const { ready: driveReady, logged, login, logout, backup, files } = useDrive();
  const [menuOpen, setMenuOpen] = useState(false);
  const dotColor = !driveReady ? "#9CA3AF" : logged ? "#22c55e" : "#ef4444";
  const journalUrl = import.meta.env.VITE_JOURNAL_URL || "/journal/";

  const onBackup = async () => {
    try {
      const { getAll } = await import("@apps/lib/dataStore.js");
      const all = getAll();
      await backup(JSON.stringify(all));
      alert("✅ Backup salvo no Drive!");
    } catch (err) {
      console.error("Erro ao fazer backup:", err);
      alert("⚠️ Falha ao salvar backup no Drive");
    }
  };

  const onList = async () => {
    const list = await files();
    console.log("📁 Arquivos no Drive:", list);
    alert(`${list.length} arquivos encontrados no Drive`);
  };

  return (
    <nav className="navbar">
      <div className="nav-left">
        <div className="nav-logo">📊 <span>PropManager</span></div>
      </div>

      {/* BOTÃO HAMBÚRGUER */}
      <button
        className={`hamburger ${menuOpen ? "active" : ""}`}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span />
        <span />
        <span />
      </button>

      {/* LINKS E AÇÕES */}
      <div className={`nav-content ${menuOpen ? "open" : ""}`}>
        <div className="nav-links">
          <NavLink to="/" onClick={() => setMenuOpen(false)}>Dashboard</NavLink>
          <NavLink to="/accounts" onClick={() => setMenuOpen(false)}>Accounts</NavLink>
          <NavLink to="/payouts" onClick={() => setMenuOpen(false)}>Payouts</NavLink>
          <NavLink to="/goals" onClick={() => setMenuOpen(false)}>Goals</NavLink>
          <NavLink to="/firms" onClick={() => setMenuOpen(false)}>Firms</NavLink>
          <NavLink to="/settings" onClick={() => setMenuOpen(false)}>Settings</NavLink>
        </div>

        <div className="nav-actions">
          <a href={journalUrl} className="journal-link">
            Trading Journal
          </a>

          <CurrencyBox />

          <div className="drive-status">
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
                <button className="btn ghost small" onClick={logout}>
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
              <button className="btn ghost small" onClick={login}>
                Login Google
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
