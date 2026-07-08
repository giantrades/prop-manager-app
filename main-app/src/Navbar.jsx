import React, { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { useCurrency } from "@apps/state";
import { useDrive } from "@apps/state/DriveContext";
import { usePlatform } from "@apps/state/usePlatform";
import {
  LayoutDashboard,
  Wallet,
  ArrowDownToLine,
  Target,
  Building2,
  Settings,
  BookOpen,
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
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/payouts", label: "Payouts", icon: ArrowDownToLine },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/firms", label: "Firms", icon: Building2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Navbar({ isPinned, onTogglePin }) {
  const {
    ready: driveReady, logged, login, logout, backup,
    protonReady, protonLogged, protonLogin, protonLogout, backupToProton,
    protonSupported,
  } = useDrive();
  const { currency, setCurrency, rate } = useCurrency();
  const { statuses, liveCount, lastSync, isRunning, startSync, stopSync } =
    usePlatform();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [platformDropdownTop, setPlatformDropdownTop] = useState(240);

  const platformItemRef = useRef(null);
  const platformDropdownRef = useRef(null);

  const journalUrl =
    import.meta.env.DEV
      ? import.meta.env.VITE_JOURNAL_URL || "http://localhost:5175/"
      : "/journal/";

  const dotColor = (logged || protonLogged) ? "#22c55e" : "#ef4444";
  const driveTitle = "Cloud Sync";

  const hasOnline = statuses.some((s) => s.online);
  const allOffline =
    statuses.length > 0 && statuses.every((s) => !s.online);
  const platformDotColor = hasOnline
    ? "#22c55e"
    : allOffline
      ? "#ef4444"
      : "#9CA3AF";

  const isExpanded = isPinned || isHovered || mobileOpen || platformOpen;

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
      const { getFullBackupPayload } = await import("@apps/utils/backupPayload.js");
      const all = await getFullBackupPayload();
      await backup(JSON.stringify(all));
      alert("✅ Backup saved to Google Drive!");
    } catch (err) {
      console.error("Backup error:", err);
      alert("⚠️ Failed to save backup to Google Drive");
    }
  };

  const onProtonBackup = async () => {
    try {
      const { getFullBackupPayload } = await import("@apps/utils/backupPayload.js");
      const all = await getFullBackupPayload();
      await backupToProton(JSON.stringify(all));
      if (protonSupported) {
        alert("✅ Backup saved to Proton Drive local folder!");
      } else {
        alert("⬇️ Backup file downloaded — move it to your Proton Drive folder.");
      }
    } catch (err) {
      console.error("Proton Backup error:", err);
      alert("⚠️ Failed to save backup to Proton Drive");
    }
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="sb-mobile-trigger"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
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
        className={`sidebar${isPinned ? " pinned" : ""}${mobileOpen ? " mobile-open" : ""
          }${platformOpen ? " platform-open" : ""}`}
        onMouseEnter={() => !isPinned && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div className="sb-header">
          <div className="sb-logo">
            <span className="sb-logo-icon">📊</span>
            <span className="sb-logo-text">PropManager</span>
          </div>
          <div className="sb-header-actions">
            <button
              className="sb-pin-btn"
              onClick={onTogglePin}
              title={isPinned ? "Collapse sidebar" : "Pin sidebar open"}
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
            href={journalUrl}
            className="sb-link sb-external"
            title={!isExpanded ? "Trading Journal" : undefined}
          >
            <span className="sb-link-icon">
              <BookOpen size={20} strokeWidth={2} />
            </span>
            <span className="sb-link-label">
              Trading Journal
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
            title={!isExpanded ? "Platforms" : undefined}
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
            title={!isExpanded ? `Currency: ${currency}` : undefined}
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

          {/* Cloud Sync */}
          <div className="sb-footer-item" title={driveTitle} style={{ height: 'auto', padding: '8px 12px', alignItems: 'flex-start' }}>
            <div className="sb-footer-icon" style={{ marginTop: 2 }}>
              <Cloud size={18} strokeWidth={1.75} />
              <span
                className="sb-footer-dot"
                style={{ background: dotColor }}
              />
            </div>
            <div className="sb-footer-content" style={{ flexDirection: 'column', gap: 8, width: '100%' }}>

              {/* Google Drive */}
              <div className="sb-drive-actions" style={{ width: '100%', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>Google</span>
                {logged ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="sb-icon-btn"
                      title="Backup to Google Drive"
                      onClick={(e) => { e.stopPropagation(); onBackup(); }}
                    >
                      <CloudUpload size={13} color="#22c55e" />
                    </button>
                    <button
                      className="sb-icon-btn"
                      title="Logout Google"
                      onClick={(e) => { e.stopPropagation(); logout(); }}
                    >
                      <LogOut size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="sb-icon-btn sb-drive-login"
                    title="Login with Google"
                    onClick={(e) => { e.stopPropagation(); login(); }}
                    style={{ padding: '2px 6px' }}
                  >
                    <LogIn size={13} />
                    <span style={{ fontSize: 10, marginLeft: 4 }}>Login</span>
                  </button>
                )}
              </div>

              {/* Proton Drive */}
              <div className="sb-drive-actions" style={{ width: '100%', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>Proton</span>
                {protonSupported && protonLogged ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="sb-icon-btn"
                      title="Backup to Proton Drive"
                      onClick={(e) => { e.stopPropagation(); onProtonBackup(); }}
                    >
                      <CloudUpload size={13} color="#a855f7" />
                    </button>
                    <button
                      className="sb-icon-btn"
                      title="Logout Proton"
                      onClick={(e) => { e.stopPropagation(); protonLogout(); }}
                    >
                      <LogOut size={13} />
                    </button>
                  </div>
                ) : protonSupported ? (
                  <button
                    className="sb-icon-btn sb-drive-login"
                    title="Connect Proton Folder"
                    onClick={(e) => { e.stopPropagation(); protonLogin(); }}
                    style={{ padding: '2px 6px' }}
                  >
                    <LogIn size={13} />
                    <span style={{ fontSize: 10, marginLeft: 4 }}>Connect</span>
                  </button>
                ) : (
                  <button
                    className="sb-icon-btn"
                    title="Baixar backup (navegador sem suporte a pasta local)"
                    onClick={(e) => { e.stopPropagation(); onProtonBackup(); }}
                    style={{ padding: '2px 6px' }}
                  >
                    <CloudUpload size={13} color="#a855f7" />
                    <span style={{ fontSize: 10, marginLeft: 4 }}>Baixar</span>
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
              No platforms configured
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
                      {s.positionsCount || 0} positions
                    </div>
                  ) : (
                    <div
                      className="sb-platform-detail"
                      style={{ color: "#ef4444" }}
                    >
                      Offline — check connection
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
              Last sync: {timeAgo(lastSync)}
            </div>
          )}
        </div>
      )}
    </>
  );
}