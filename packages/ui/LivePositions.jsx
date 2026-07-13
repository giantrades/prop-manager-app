import React, { useState, useEffect, useRef } from 'react';

function formatPnl(value) {
  if (value == null) return '$0.00';
  const abs = Math.abs(value);
  const formatted = abs >= 1000
    ? `$${(abs / 1000).toFixed(1)}k`
    : `$${abs.toFixed(2)}`;
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatDuration(openTime) {
  if (!openTime) return '';
  try {
    const diff = Date.now() - new Date(openTime).getTime();
    if (diff < 0 || isNaN(diff)) return '';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return '< 1m';
  } catch {
    return '';
  }
}

function calcPnlPct(entryPrice, currentPrice, side) {
  if (!entryPrice || entryPrice === 0) return 0;
  const changePct = ((currentPrice - entryPrice) / entryPrice) * 100;
  return (side === 'Short' || side === 'Sell') ? -changePct : changePct;
}

export default function LivePositions({ positions = [], compact = false, onClosePosition }) {
  const [pulse, setPulse] = useState(false);
  const prevTotal = useRef(0);

  const sorted = [...positions].sort((a, b) => {
    const pnlA = a.netPnl ?? a.grossPnl ?? 0;
    const pnlB = b.netPnl ?? b.grossPnl ?? 0;
    return pnlA - pnlB;
  });

  const totalPnl = sorted.reduce((sum, p) => sum + (p.netPnl ?? p.grossPnl ?? 0), 0);
  const totalNotional = sorted.reduce((sum, p) => sum + ((p.openPrice || 0) * (p.quantity || 0)), 0);
  const totalPnlPct = totalNotional > 0 ? (totalPnl / totalNotional) * 100 : 0;

  useEffect(() => {
    if (Math.abs(totalPnl - prevTotal.current) > 0.01) {
      setPulse(true);
      prevTotal.current = totalPnl;
      const timer = setTimeout(() => setPulse(false), 300);
      return () => clearTimeout(timer);
    }
  }, [totalPnl]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  if (sorted.length === 0) {
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
            background: '#22c55e',
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
            {sorted.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            fontWeight: 700, fontSize: compact ? 14 : 18,
            color: totalPnl >= 0 ? '#22c55e' : '#ef4444',
            transition: 'transform 0.15s ease',
            transform: pulse ? 'scale(1.1)' : 'scale(1)',
          }}>
            {formatPnl(totalPnl)}
          </div>
          <div style={{
            fontSize: compact ? 11 : 13,
            fontWeight: 600,
            color: totalPnl >= 0 ? '#22c55e' : '#ef4444',
            opacity: 0.7,
          }}>
            ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Column Headers */}
      {!compact && sorted.length > 0 && (
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
          <div style={{ width: 20, flexShrink: 0, marginRight: 12 }}>Firm</div>
          <div style={{ flex: '0 0 auto', minWidth: 80 }}>Asset / Side</div>
          <div style={{ flex: 1, display: 'flex', gap: 16 }}>
            <div>Entry</div>
            <div>Current</div>
            <div style={{ minWidth: 60 }}>Duration</div>
          </div>
          <div style={{ textAlign: 'right', width: 80 }}>PnL $</div>
          <div style={{ textAlign: 'right', width: 70, marginLeft: 8 }}>PnL %</div>
          {onClosePosition && <div style={{ width: 24, flexShrink: 0 }} />}
        </div>
      )}

      {/* Position rows */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 4 : 6,
        maxHeight: 280,
        overflowY: 'auto',
        paddingRight: 4,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.15) transparent'
      }}>
        {sorted.map((pos, i) => {
          const pnl = pos.netPnl ?? pos.grossPnl ?? 0;
          const isPositive = pnl >= 0;
          const pnlPct = calcPnlPct(pos.openPrice, pos.currentPrice, pos.side);
          const firmColor = pos.firmColor || '#6366f1';
          const firmInitial = (pos.firmName || '?').charAt(0).toUpperCase();
          const isShort = pos.side === 'Short' || pos.side === 'Sell';

          return (
            <div key={pos.platformPositionId || i} style={{
              display: 'flex', alignItems: 'center', gap: compact ? 8 : 12,
              padding: compact ? '6px 10px' : '8px 14px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.04)',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
            >
              {/* Firm badge */}
              <span style={{
                width: 20, height: 20, borderRadius: 4,
                background: firmColor, color: '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {pos.firmLogo?.[0] || firmInitial}
              </span>

              {/* Symbol + Side + Account */}
              <div style={{ flex: '0 0 auto', minWidth: compact ? 60 : 80 }}>
                <div style={{ fontWeight: 600, fontSize: compact ? 13 : 14 }}>
                  {pos.symbol}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                }}>
                  <span style={{ color: isShort ? '#ef4444' : '#22c55e' }}>
                    {isShort ? '↓ SHORT' : '↑ LONG'}
                    {pos.quantity ? ` × ${pos.quantity}` : ''}
                  </span>
                  {!compact && (
                    <>
                      <span style={{ color: 'var(--muted)', opacity: 0.4 }}>·</span>
                      <span style={{ color: 'var(--muted)' }}>{pos.accountName}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Price + Duration */}
              <div style={{
                flex: 1, display: 'flex', gap: compact ? 6 : 16,
                fontSize: 12, alignItems: 'center',
              }}>
                <div style={{ minWidth: 50 }}>
                  <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {pos.openPrice?.toFixed(pos.openPrice < 1 ? 5 : 2)}
                  </div>
                </div>
                <div style={{ minWidth: 50 }}>
                  <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {pos.currentPrice?.toFixed(pos.currentPrice < 1 ? 5 : 2)}
                  </div>
                </div>
                <div style={{ minWidth: 50 }}>
                  <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {formatDuration(pos.openTime)}
                  </div>
                </div>
              </div>

              {/* PnL $ */}
              <div style={{
                fontWeight: 700,
                fontSize: compact ? 12 : 14,
                color: isPositive ? '#22c55e' : '#ef4444',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                width: compact ? 70 : 80,
              }}>
                {formatPnl(pnl)}
              </div>

              {/* PnL % */}
              <div style={{
                fontWeight: 600,
                fontSize: compact ? 11 : 13,
                color: pnlPct >= 0 ? '#22c55e' : '#ef4444',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                width: compact ? 60 : 70,
                marginLeft: compact ? 4 : 8,
                opacity: 0.85,
              }}>
                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
              </div>

              {/* Close button */}
              {onClosePosition && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClosePosition(pos);
                  }}
                  title="Close position"
                  style={{
                    width: 22, height: 22, flexShrink: 0,
                    border: 'none', borderRadius: 4,
                    background: 'rgba(239,68,68,0.15)',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0,
                    opacity: 0.6,
                    transition: 'opacity 0.2s, background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.background = 'rgba(239,68,68,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.6';
                    e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
