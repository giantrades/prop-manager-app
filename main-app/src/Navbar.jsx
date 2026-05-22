import React, { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { useCurrency } from "@apps/state";
import { useDrive } from "@apps/state/DriveContext";
import PlatformStatusIndicator from "@apps/ui/PlatformStatusIndicator";
import { usePlatform } from "@apps/state/usePlatform";

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
  const { statuses, liveCount, lastSync, isRunning, startSync, stopSync } = usePlatform();
  const [menuOpen, setMenuOpen] = useState(false);
  const dotColor = !driveReady ? "#9CA3AF" : logged ? "#22c55e" : "#ef4444";
  const journalUrl = import.meta.env.VITE_JOURNAL_URL || "/journal/";
  const navRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuOpen && navRef.current && !navRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);
  const onBackup = async () => {
    try {
      const { getAll } = await import("@apps/lib/dataStore.js");
      const all = getAll();
      await backup(JSON.stringify(all));
      alert("✅ Backup saved to Drive!");
    } catch (err) {
      console.error("Backup error:", err);
      alert("⚠️ Failed to save backup to Drive");
    }
  };

  return (
    <nav className="navbar" ref={navRef}>
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
          <PlatformStatusIndicator
            statuses={statuses}
            liveCount={liveCount}
            lastSync={lastSync}
            isRunning={isRunning}
            onToggleSync={isRunning ? stopSync : startSync}
          />

          <a href={journalUrl} className="journal-link">
            Trading Journal
          </a>

          <CurrencyBox />

          <div className="drive-status">
            <span
              title={
                !driveReady
                  ? "Drive not initialized"
                  : logged
                    ? "Connected to Google"
                    : "Disconnected from Google"
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
                <button className="btn ghost small icon-only" title="Logout do Google" onClick={logout}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
                <button className="btn ghost small icon-only" title="Salvar backup no Drive" onClick={onBackup}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                </button>
              </>
            ) : (
              <button className="btn ghost small" onClick={login}>Google</button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
