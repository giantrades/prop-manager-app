import React from "react";
import { NavLink } from "react-router-dom";
import { useCurrency } from "@apps/state";
import { useDrive } from "@apps/state/DriveContext"; // ✅ usa o contexto global

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
      <div className="nav-logo">
        📊 <span>Gian PropManager</span>
      </div>

      <div className="nav-links">
        <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")}>
          Dashboard
        </NavLink>
        <NavLink to="/accounts" className={({ isActive }) => (isActive ? "active" : "")}>
          Accounts
        </NavLink>
        <NavLink to="/payouts" className={({ isActive }) => (isActive ? "active" : "")}>
          Payouts
        </NavLink>
        <NavLink to="/goals" className={({ isActive }) => (isActive ? "active" : "")}>
          Goals
        </NavLink>
        <NavLink to="/firms" className={({ isActive }) => (isActive ? "active" : "")}>
          Firms
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Settings
        </NavLink>
      </div>

      <div className="spacer" />

      {/* Botão para o Journal */}
      <a
        href={journalUrl}
        style={{
          color: "#fff",
          padding: "8px 14px",
          border: "2px solid var(--color-border-soft, #ffffffff)",
          borderRadius: "16px",
          fontWeight: "600",
          fontSize: "1.1rem",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.borderColor = "var(--color-accent-2, #161725ff)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.borderColor = "var(--color-accent-1, 15, 18, 24, 0.85)")
        }
      >
        <span style={{ fontSize: "1rem" }}></span>Trading Journal
      </a>

      <CurrencyBox />

      {/* Drive Status */}
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
    </nav>
  );
}
