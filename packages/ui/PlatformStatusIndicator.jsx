/**
 * PlatformStatusIndicator — Navbar component showing connection status.
 * 
 * Shows a colored dot + dropdown with platform details.
 * Green = online, Red = offline, Yellow = syncing
 * Also shows live position count badge.
 */
import React, { useState, useRef, useEffect } from 'react';

// Inline SVG logos for platforms (mini versions)
// Logos mapped to the uploaded images
const PLATFORM_LOGOS = {
  quantower: <img src={`${import.meta.env.BASE_URL || '/'}assets/logos/quantower.png`} style={{ width: 16, height: 16, objectFit: 'contain' }} />,
  ctrader: <img src={`${import.meta.env.BASE_URL || '/'}assets/logos/ctrader.png`} style={{ width: 16, height: 16, objectFit: 'contain' }} />,
  ibkr: <img src={`${import.meta.env.BASE_URL || '/'}assets/logos/ibkr.png`} style={{ width: 16, height: 16, objectFit: 'contain' }} />,
};

function timeAgo(isoString) {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 5000) return 'Just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function PlatformStatusIndicator({ statuses, liveCount, lastSync, isRunning, onToggleSync }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownOpen && ref.current && !ref.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const hasOnline = statuses.some(s => s.online);
  const allOffline = statuses.length > 0 && statuses.every(s => !s.online);
  const dotColor = hasOnline ? '#22c55e' : allOffline ? '#ef4444' : '#9CA3AF';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Status dot + click area */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255, 255, 255, 0.03)', 
          border: '1px solid rgba(148, 163, 184, 0.2)', // cinza/azul leve
          cursor: 'pointer',
          padding: '4px 12px', 
          borderRadius: '999px',
          color: 'var(--text, #e7eaf0)',
          fontSize: 12,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
          e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
          e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
        }}
        title="Platform Connections"
      >
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          backgroundColor: dotColor,
          display: 'inline-block',
          boxShadow: hasOnline ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
          animation: hasOnline ? 'pulse-dot 2s infinite' : 'none',
        }} />
        
        {/* Transfer/Sync Icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8, color: dotColor }}>
          <path d="M17 1l4 4-4 4" />
          <path d="M3 5h18" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 19H3" />
        </svg>
        {liveCount > 0 && (
          <span style={{
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 10,
            animation: 'pulse-badge 1.5s infinite',
          }}>
            {liveCount} LIVE
          </span>
        )}
        {lastSync && (
          <span style={{ color: 'var(--muted, #a1a7b3)', fontSize: 11 }}>
            {timeAgo(lastSync)}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {dropdownOpen && (
        <div className="platform-status-dropdown">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Platforms</span>
            <button
              onClick={onToggleSync}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 6,
                background: isRunning ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                color: isRunning ? '#ef4444' : '#22c55e',
                border: `1px solid ${isRunning ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              {isRunning ? '⏸ Stop Sync' : '▶ Start Sync'}
            </button>
          </div>

          {statuses.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 16 }}>
              No platforms configured
            </p>
          ) : (
            statuses.map(s => (
              <div key={s.platformId} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                {/* Platform logo */}
                <span style={{ flexShrink: 0 }}>
                  {PLATFORM_LOGOS[s.platformId] || '🔗'}
                </span>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                      {s.platformId}
                    </span>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      backgroundColor: s.online ? '#22c55e' : '#ef4444',
                      display: 'inline-block',
                    }} />
                  </div>
                  {s.online ? (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {s.connections?.length || 0} connections · {s.accountsCount || 0} accounts · {s.positionsCount || 0} positions
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#ef4444' }}>
                      Offline — Check connection
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {lastSync && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
              Last sync: {timeAgo(lastSync)}
            </div>
          )}
        </div>
      )}

      {/* CSS animations and layout */}
      <style>{`
        .platform-status-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          width: 280px;
          background: var(--panel, #151a23);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          padding: 12px;
          z-index: 1000;
          color: var(--text, #e7eaf0);
        }
        @media (max-width: 900px) {
          .platform-status-dropdown {
            position: fixed;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100vw;
            margin-top: 0;
            border-radius: 20px 20px 0 0;
            border: none;
            border-top: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
            padding: 20px;
            z-index: 99999;
            background: linear-gradient(180deg, #161b25 0%, #131825 100%);
          }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes pulse-badge {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
