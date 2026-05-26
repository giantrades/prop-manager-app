import React, { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { useCurrency } from "@apps/state";
import { useDrive } from "@apps/state/DriveContext";
import { usePlatform } from "@apps/state/usePlatform";
import {
  LayoutDashboard,
  CandlestickChart,
  Lightbulb,
  Settings,
  BarChart2,
  Activity,
  ChevronsLeft,
  ChevronsRight,
  X,
  Menu,
  CloudUpload,
  LogOut,
  LogIn,
  ExternalLink,
  Cloud
} from "lucide-react";

/* ── Platform logos ── */
const PLATFORM_LOGOS = {
  quantower: (
    <img
      src={`${import.meta.env.BASE_URL || "/"}assets/logos/quantower.png`}
      style={{ width: 16, height: 16, objectFit: "contain" }}
      alt="quantower"
    />
  ),
  ctrader: (
    <img
      src={`${import.meta.env.BASE_URL || "/"}assets/logos/ctrader.png`}
      style={{ width: 16, height: 16, objectFit: "contain" }}
      alt="ctrader"
    />
  ),
  ibkr: (
    <img
      src={`${import.meta.env.BASE_URL || "/"}assets/logos/ibkr.png`}
      style={{ width: 16, height: 16, objectFit: "contain" }}
      alt="ibkr"
    />
  ),
};

function timeAgo(isoString) {
  if (!isoString) return "Never";
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 5000) return "Just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

const NAV_LINKS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/trades", label: "Trades", icon: CandlestickChart },
  { to: "/Strategies", label: "Strategies", icon: Lightbulb },
  { to: "/Settings", label: "Settings", icon: Settings },
];

export default function Navbar({ isPinned, onTogglePin }) {
  const { ready: driveReady, logged, login, logout, backup } = useDrive();
  const { currency, setCurrency, rate } = useCurrency();
  const { statuses, liveCount, lastSync, isRunning, startSync, stopSync } =
    usePlatform();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [platformDropdownTop, setPlatformDropdownTop] = useState(240);

  const platformItemRef = useRef(null);
  const platformDropdownRef = useRef(null);

  const mainAppUrl = import.meta.env.DEV
    ? import.meta.env.VITE_MAIN_URL || "http://localhost:5174/"
    : "/";

  const dotColor = !driveReady
    ? "#9CA3AF"
    : logged
    ? "#22c55e"
    : "#ef4444";
  const driveTitle = !driveReady
    ? "Drive não inicializado"
    : logged
    ? "Conectado ao Google"
    : "Desconectado do Google";

  const hasOnline = statuses.some((s) => s.online);
  const allOffline =
    statuses.length > 0 && statuses.every((s) => !s.online);
  const platformDotColor = hasOnline
    ? "#22c55e"
    : allOffline
    ? "#ef4444"
    : "#9CA3AF";

  const isExpanded = isPinned || isHovered || mobileOpen;

  /* Close platform dropdown on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (
        platformOpen &&
        platformDropdownRef.current &&
        !platformDropdownRef.current.contains(e.target) &&
        platformItemRef.current &&
        !platformItemRef.current.contains(e.target)
      ) {
        setPlatformOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [platformOpen]);

  /* Close mobile on resize */
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth > 768) setMobileOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const togglePlatform = () => {
    if (!platformOpen && platformItemRef.current) {
      const rect = platformItemRef.current.getBoundingClientRect();
      setPlatformDropdownTop(rect.top);
    }
    setPlatformOpen((p) => !p);
  };

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

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="sb-mobile-trigger"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="sb-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <nav
        className={`sidebar${isPinned ? " pinned" : ""}${
          mobileOpen ? " mobile-open" : ""
        }`}
        onMouseEnter={() => !isPinned && setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setPlatformOpen(false);
        }}
      >
        {/* Header */}
        <div className="sb-header">
          <div className="sb-logo">
            <span className="sb-logo-icon">📈</span>
            <span className="sb-logo-text">Trading Journal</span>
          </div>
          <div className="sb-header-actions">
            <button
              className="sb-pin-btn"
              onClick={onTogglePin}
              title={isPinned ? "Recolher sidebar" : "Fixar sidebar aberta"}
            >
              {isPinned ? (
                <ChevronsLeft size={15} />
              ) : (
                <ChevronsRight size={15} />
              )}
            </button>
            <button
              className="sb-close-btn"
              onClick={() => setMobileOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="sb-nav">
          {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `sb-link${isActive ? " active" : ""}`
              }
              onClick={() => setMobileOpen(false)}
              title={!isExpanded ? label : undefined}
            >
              <span className="sb-link-icon">
                <Icon size={18} strokeWidth={1.75} />
              </span>
              <span className="sb-link-label">{label}</span>
            </NavLink>
          ))}

          <div className="sb-divider" />

          {/* Cross-app link */}
          <a
            href={mainAppUrl}
            className="sb-link sb-external"
            title={!isExpanded ? "Prop Manager" : undefined}
          >
            <span className="sb-link-icon">
              <BarChart2 size={20} strokeWidth={2} />
            </span>
            <span className="sb-link-label">
              Prop Manager
              <ExternalLink
                size={12}
                style={{ opacity: 0.6, marginLeft: 4 }}
              />
            </span>
          </a>
        </div>

        {/* ── Footer ── */}
        <div className="sb-footer">
          {/* Platform Status */}
          <div
            ref={platformItemRef}
            className={`sb-footer-item${platformOpen ? " active" : ""}`}
            onClick={togglePlatform}
            title={!isExpanded ? "Plataformas" : undefined}
            role="button"
          >
            <div className="sb-footer-icon">
              <Activity size={18} strokeWidth={1.75} />
              <span
                className="sb-footer-dot"
                style={{ background: platformDotColor }}
              />
            </div>
            <div className="sb-footer-content" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Platforms</span>
              {liveCount > 0 && (
                <span className="sb-live-badge">{liveCount} LIVE</span>
              )}
            </div>
          </div>

          {/* Currency */}
          <div
            className="sb-footer-item"
            title={!isExpanded ? `Moeda: ${currency}` : undefined}
          >
            <div className="sb-footer-icon" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {currency}
            </div>
            <div className="sb-footer-content">
              <div className="sb-currency-actions">
                <button
                  className={`sb-currency-btn${currency === "USD" ? " active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); setCurrency("USD"); }}
                >
                  USD
                </button>
                <span className="sb-currency-sep">|</span>
                <button
                  className={`sb-currency-btn${currency === "BRL" ? " active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); setCurrency("BRL"); }}
                >
                  BRL
                </button>
                <span className="sb-currency-rate">= {rate}</span>
              </div>
            </div>
          </div>

          {/* Drive */}
          <div className="sb-footer-item" title={driveTitle}>
            <div className="sb-footer-icon">
              <Cloud size={18} strokeWidth={1.75} />
              <span
                className="sb-footer-dot"
                style={{ background: dotColor }}
              />
            </div>
            <div className="sb-footer-content">
              <div className="sb-drive-actions">
                {logged ? (
                  <>
                    <button
                      className="sb-icon-btn"
                      title="Backup no Drive"
                      onClick={(e) => { e.stopPropagation(); onBackup(); }}
                    >
                      <CloudUpload size={13} />
                      <span className="sb-drive-label">Backup</span>
                    </button>
                    <button
                      className="sb-icon-btn"
                      title="Sair do Google"
                      onClick={(e) => { e.stopPropagation(); logout(); }}
                    >
                      <LogOut size={13} />
                      <span className="sb-drive-label">Sair</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="sb-icon-btn sb-drive-login"
                    title="Entrar com Google"
                    onClick={(e) => { e.stopPropagation(); login(); }}
                  >
                    <LogIn size={13} />
                    <span className="sb-drive-label">Google Login</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Platform dropdown (outside sidebar, to the right) ── */}
      {platformOpen && (
        <div
          ref={platformDropdownRef}
          className="sb-platform-dropdown"
          style={{ top: platformDropdownTop }}
        >
          <div className="sb-platform-dropdown-header">
            <h4>Platforms</h4>
            <button
              className={`sb-sync-btn${isRunning ? " running" : " stopped"}`}
              onClick={isRunning ? stopSync : startSync}
            >
              {isRunning ? "⏸ Stop" : "▶ Start"}
            </button>
          </div>

          {statuses.length === 0 ? (
            <p
              style={{
                color: "#6b7280",
                fontSize: 12,
                textAlign: "center",
                padding: 16,
                margin: 0,
              }}
            >
              Nenhuma plataforma configurada
            </p>
          ) : (
            statuses.map((s) => (
              <div key={s.platformId} className="sb-platform-row">
                <span style={{ flexShrink: 0 }}>
                  {PLATFORM_LOGOS[s.platformId] || "🔗"}
                </span>
                <div className="sb-platform-info">
                  <div className="sb-platform-name">
                    {s.platformId}
                    <span
                      className="sb-platform-dot"
                      style={{
                        background: s.online ? "#22c55e" : "#ef4444",
                      }}
                    />
                  </div>
                  {s.online ? (
                    <div className="sb-platform-detail">
                      {s.connections?.length || 0} conn ·{" "}
                      {s.positionsCount || 0} posições
                    </div>
                  ) : (
                    <div
                      className="sb-platform-detail"
                      style={{ color: "#ef4444" }}
                    >
                      Offline — verifique a conexão
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {lastSync && (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "#4a5568",
                textAlign: "center",
              }}
            >
              Último sync: {timeAgo(lastSync)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
