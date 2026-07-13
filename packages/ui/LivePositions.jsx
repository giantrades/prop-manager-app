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
    return '<1m';
  } catch {
    return '';
  }
}

function calcPnlPct(entryPrice, currentPrice, side) {
  if (!entryPrice || entryPrice === 0) return 0;
  const changePct = ((currentPrice - entryPrice) / entryPrice) * 100;
  return (side === 'Short' || side === 'Sell') ? -changePct : changePct;
}

const PLATFORM_LETTERS = {
  quantower: 'Q',
  ctrader: 'C',
};

const FULL_GRID = '32px minmax(80px,1fr) 65px 65px 60px 80px 70px 24px';
const COMPACT_GRID = '24px minmax(60px,1fr) 55px 70px 60px 20px';

export default function LivePositions({ positions = [], compact: initialCompact = false, onClosePosition }) {
  const [compact, setCompact] = useState(initialCompact);
  const [pulse, setPulse] = useState(false);
  const prevTotal = useRef(0);

  const sorted = [...positions].sort((a, b) => {
    const pnlA = a.netPnl ?? a.grossPnl ?? 0;
    const pnlB = b.netPnl ?? b.grossPnl ?? 0;
    return pnlA - pnlB;
  });

  const totalPnl = sorted.reduce((sum, p) => sum + (p.netPnl || p.grossPnl || 0), 0);
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

  if (sorted.length > 50) {
    console.warn(`[LivePositions] ${sorted.length} positions — possible accumulation issue`);
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: compact ? 6 : 10,
        padding: compact ? '0' : '0 4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#22c55e',
            display: 'inline-block',
            animation: 'pulse-dot 1.5s infinite',
          }} />
          <span style={{ fontWeight: 700, fontSize: compact ? 12 : 14 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontWeight: 700, fontSize: compact ? 13 : 16,
              color: totalPnl >= 0 ? '#22c55e' : '#ef4444',
              transition: 'transform 0.15s ease',
              transform: pulse ? 'scale(1.1)' : 'scale(1)',
            }}>
              {formatPnl(totalPnl)}
            </div>
            <div style={{
              fontSize: compact ? 10 : 12,
              fontWeight: 600,
              color: totalPnl >= 0 ? '#22c55e' : '#ef4444',
              opacity: 0.7,
            }}>
              ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%)
            </div>
          </div>
          <button
            onClick={() => setCompact(v => !v)}
            title={compact ? 'Expand view' : 'Compact view'}
            style={{
              border: 'none', background: 'rgba(255,255,255,0.06)',
              color: 'var(--muted, #a1a7b3)', cursor: 'pointer',
              fontSize: 11, padding: '2px 6px', borderRadius: 4,
              lineHeight: 1.4,
            }}
          >
            {compact ? '⤢' : '⤡'}
          </button>
        </div>
      </div>

      {/* Column Headers (non-compact only) */}
      {!compact && sorted.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: FULL_GRID,
          padding: '6px 14px',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--muted, #a1a7b3)',
          textTransform: 'uppercase',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          marginBottom: 4,
          gap: 8,
        }}>
          <div>Firm</div>
          <div>Asset / Side</div>
          <div style={{ textAlign: 'right' }}>Entry</div>
          <div style={{ textAlign: 'right' }}>Current</div>
          <div style={{ textAlign: 'right' }}>Duration</div>
          <div style={{ textAlign: 'right' }}>PnL $</div>
          <div style={{ textAlign: 'right' }}>PnL %</div>
          {onClosePosition && <div />}
        </div>
      )}

      {/* Position rows */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: compact ? 3 : 4,
        maxHeight: compact ? 200 : 280,
        overflowY: 'auto',
        paddingRight: 4,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.15) transparent'
      }}>
        {sorted.map((pos, i) => {
          const pnl = pos.netPnl || pos.grossPnl || 0;
          const isPositive = pnl >= 0;
          const pnlPct = calcPnlPct(pos.openPrice, pos.currentPrice, pos.side);
          const isShort = pos.side === 'Short' || pos.side === 'Sell';

          const badgeBg = pos.firmColor || (pos.platformId ? '#6366f1' : '#888');
          const badgeLetter = pos.firmLogo?.[0]
            || (pos.firmName && pos.firmName.charAt(0).toUpperCase())
            || PLATFORM_LETTERS[pos.platformId]
            || (pos.accountName && pos.accountName.charAt(0).toUpperCase())
            || '?';

          const gridTemplate = compact ? COMPACT_GRID : FULL_GRID;

          return (
            <div key={pos.platformPositionId || i} style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              gap: compact ? 4 : 8,
              alignItems: 'center',
              padding: compact ? '5px 10px' : '7px 14px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.04)',
              transition: 'background 0.2s',
              fontSize: compact ? 11 : 12,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
            >
              {/* Firm badge */}
              <span style={{
                width: compact ? 18 : 20, height: compact ? 18 : 20, borderRadius: 4,
                background: badgeBg, color: '#fff',
                fontSize: compact ? 9 : 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {badgeLetter}
              </span>

              {/* Symbol + Side */}
              <div>
                <div style={{ fontWeight: 600, fontSize: compact ? 12 : 13 }}>
                  {pos.symbol}
                </div>
                <div style={{
                  fontSize: compact ? 9 : 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap',
                }}>
                  <span style={{ color: isShort ? '#ef4444' : '#22c55e' }}>
                    {isShort ? '↓' : '↑'}
                    {pos.quantity ? ` ${pos.quantity}` : ''}
                  </span>
                  {!compact && pos.accountName && (
                    <>
                      <span style={{ color: 'var(--muted)', opacity: 0.4 }}>·</span>
                      <span style={{ color: 'var(--muted)' }}>{pos.accountName}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Entry price (non-compact) */}
              {!compact && (
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {pos.openPrice?.toFixed(pos.openPrice < 1 ? 5 : 2)}
                </div>
              )}

              {/* Current price (non-compact) */}
              {!compact && (
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {pos.currentPrice?.toFixed(pos.currentPrice < 1 ? 5 : 2)}
                </div>
              )}

              {/* Duration (compact+non-compact) */}
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>
                {formatDuration(pos.openTime)}
              </div>

              {/* PnL $ */}
              <div style={{
                textAlign: 'right',
                fontWeight: 700,
                fontSize: compact ? 11 : 13,
                color: isPositive ? '#22c55e' : '#ef4444',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatPnl(pnl)}
                <div style={{
                  height: 2,
                  width: `${Math.min(Math.abs(pnlPct) * 3, 60)}px`,
                  background: pnlPct >= 0 ? '#22c55e' : '#ef4444',
                  borderRadius: 1,
                  marginLeft: 'auto',
                  marginTop: 2,
                  opacity: 0.5,
                }} />
              </div>

              {/* PnL % */}
              <div style={{
                textAlign: 'right',
                fontWeight: 600,
                color: pnlPct >= 0 ? '#22c55e' : '#ef4444',
                fontVariantNumeric: 'tabular-nums',
                opacity: 0.85,
              }}>
                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
              </div>

              {/* Close button */}
              {onClosePosition && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClosePosition(pos); }}
                  title="Close position"
                  style={{
                    width: compact ? 18 : 20, height: compact ? 18 : 20,
                    border: 'none', borderRadius: 3,
                    background: 'rgba(239,68,68,0.15)',
                    color: '#ef4444', cursor: 'pointer',
                    fontSize: compact ? 9 : 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0,
                    opacity: 0.6,
                    transition: 'opacity 0.2s, background 0.2s',
                    justifySelf: 'center',
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
