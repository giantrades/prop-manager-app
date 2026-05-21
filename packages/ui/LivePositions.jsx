/**
 * LivePositions — Real-time open positions widget.
 * 
 * Displays positions currently open across all platforms with:
 *   - Symbol, side, quantity, entry price, current price
 *   - Unrealized P&L with real-time color (green/red)
 *   - Total unrealized P&L summary
 *   - Auto-refresh animation
 *   - Platform source badge
 * 
 * Can be used as a standalone widget or embedded in Dashboard.
 */
import React, { useState, useEffect, useRef } from 'react';

// Platform mini-logos
const PLATFORM_LOGOS = {
  quantower: { bg: '#1a8cff', letter: 'Q' },
  ctrader: { bg: '#ff6b35', letter: 'C' },
};

function formatPnl(value) {
  if (value == null) return '$0.00';
  const abs = Math.abs(value);
  const formatted = abs >= 1000
    ? `$${(abs / 1000).toFixed(1)}k`
    : `$${abs.toFixed(2)}`;
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function LivePositions({ positions = [], compact = false }) {
  const [pulse, setPulse] = useState(false);
  const prevTotal = useRef(0);

  // Flash animation when total P&L changes
  const totalPnl = positions.reduce((sum, p) => sum + (p.netPnl ?? p.grossPnl ?? 0), 0);
  useEffect(() => {
    if (Math.abs(totalPnl - prevTotal.current) > 0.01) {
      setPulse(true);
      prevTotal.current = totalPnl;
      const timer = setTimeout(() => setPulse(false), 300);
      return () => clearTimeout(timer);
    }
  }, [totalPnl]);

  if (positions.length === 0) {
    return (
      <div style={{
        padding: compact ? 12 : 20,
        textAlign: 'center',
        color: 'var(--muted, #a1a7b3)',
        fontSize: 13,
      }}>
        <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>📊</div>
        No open positions
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: compact ? 8 : 14,
        padding: compact ? '0' : '0 4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#ef4444',
            display: 'inline-block',
            animation: 'pulse-dot 1.5s infinite',
          }} />
          <span style={{ fontWeight: 700, fontSize: compact ? 13 : 15 }}>
            LIVE POSITIONS
          </span>
          <span style={{
            fontSize: 11, color: 'var(--muted)',
            background: 'rgba(255,255,255,0.06)',
            padding: '2px 8px', borderRadius: 10,
          }}>
            {positions.length}
          </span>
        </div>

        {/* Total P&L */}
        <div style={{
          fontWeight: 700,
          fontSize: compact ? 14 : 18,
          color: totalPnl >= 0 ? '#22c55e' : '#ef4444',
          transition: 'transform 0.15s ease',
          transform: pulse ? 'scale(1.1)' : 'scale(1)',
        }}>
          {formatPnl(totalPnl)}
        </div>
      </div>

      {/* Column Headers (Sticky) */}
      {!compact && positions.length > 0 && (
        <div style={{
          display: 'flex',
          padding: '8px 14px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--muted, #a1a7b3)',
          textTransform: 'uppercase',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          marginBottom: 4
        }}>
          <div style={{ width: 20, flexShrink: 0, marginRight: 12 }}>Src</div>
          <div style={{ flex: '0 0 auto', minWidth: 80 }}>Asset / Side</div>
          <div style={{ flex: 1, display: 'flex', gap: 16 }}>
            <div>Entry</div>
            <div>Current</div>
            <div>Time</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>Unrealized PnL</div>
        </div>
      )}

      {/* Position rows (Scrollable Container) */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: compact ? 4 : 6,
        maxHeight: 280, // Fixed height
        overflowY: 'auto', // Scrollable
        paddingRight: 4, // Space for scrollbar
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.15) transparent'
      }}>
        {positions.map((pos, i) => {
          const pnl = pos.netPnl ?? pos.grossPnl ?? 0;
          const isPositive = pnl >= 0;
          const logo = PLATFORM_LOGOS[pos.platformId] || null;

          return (
            <div key={pos.platformPositionId || i} style={{
              display: 'flex', alignItems: 'center', gap: compact ? 8 : 12,
              padding: compact ? '8px 10px' : '10px 14px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.04)',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
            >
              {/* Platform badge */}
              {logo ? (
                <span style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: logo.bg, color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {logo.letter}
                </span>
              ) : (
                <span style={{ width: 20, flexShrink: 0 }} /> // Spacer if no logo
              )}

              {/* Symbol + Side */}
              <div style={{ flex: '0 0 auto', minWidth: compact ? 60 : 80 }}>
                <div style={{ fontWeight: 600, fontSize: compact ? 13 : 14 }}>
                  {pos.symbol}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 600,
                  color: pos.side === 'Short' || pos.side === 'Sell' ? '#ef4444' : '#22c55e',
                }}>
                  {pos.side === 'Short' || pos.side === 'Sell' ? '↓ SHORT' : '↑ LONG'}
                  {pos.quantity && ` × ${pos.quantity}`}
                </div>
              </div>

              {/* Price info */}
              {!compact && (
                <div style={{ flex: 1, display: 'flex', gap: 16, fontSize: 12 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{pos.openPrice?.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{pos.currentPrice?.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{formatTime(pos.openTime)}</div>
                  </div>
                </div>
              )}

              {/* P&L */}
              <div style={{
                marginLeft: 'auto',
                fontWeight: 700,
                fontSize: compact ? 13 : 15,
                color: isPositive ? '#22c55e' : '#ef4444',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatPnl(pnl)}
              </div>
            </div>
          );
        })}
      </div>

      {/* CSS */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
