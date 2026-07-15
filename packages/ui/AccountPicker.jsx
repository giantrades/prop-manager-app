/**
 * AccountPicker — Componente padronizado de seleção de conta(s)
 * Usado em: Dashboard (main-app), Payouts (main-app), TJ Dashboard, TJ Trades
 *
 * Props:
 *   selectedIds   string[]          IDs selecionados ([] = todas as contas)
 *   onChange      (ids: string[]) => void
 *   accounts      Account[]
 *   firms         Firm[]
 *   placeholder   string?           default: 'Todas as contas'
 *   currency      string?           'USD' | 'BRL'
 *   rate          number?           taxa de câmbio (para BRL)
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { resolveFirmForAccount } from '@apps/lib/dataStore';

/* ─── Type pill colors ─── */
const TYPE_COLORS = {
  Futures: { bg: 'rgba(27,85,173,0.25)', color: '#4d8fe0' },
  Forex:   { bg: 'rgba(21,185,29,0.2)',  color: '#22c55e' },
  Cripto:  { bg: 'rgba(233,130,13,0.2)', color: '#f97316' },
  Personal:{ bg: 'rgba(204,30,82,0.2)',  color: '#ec4899' },
};

/* ─── FirmLogo inline ─── */
function FirmLogoSmall({ firm, size = 20 }) {
  if (!firm) return null;
  if (firm.logo) {
    return (
      <img
        src={firm.logo}
        alt={firm.name}
        style={{ width: size, height: size, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 3, flexShrink: 0,
      background: firm.color || '#6366f1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.5, fontWeight: 700, lineHeight: 1,
    }}>
      {firm.name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ─── Status badge ─── */
function StatusBadge({ status }) {
  const map = {
    live:    { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    funded:  { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
    challenge: { bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
    standby: { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af' },
  };
  const s = status?.toLowerCase() || 'standby';
  const style = map[s] || map.standby;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
      background: style.bg, color: style.color, textTransform: 'uppercase',
      letterSpacing: '0.3px', flexShrink: 0,
    }}>
      {status || 'Standby'}
    </span>
  );
}

/* ─── AccountPicker ─── */
export default function AccountPicker({
  selectedIds = [],
  onChange,
  accounts = [],
  firms = [],
  placeholder = 'Todas as contas',
  currency = 'USD',
  rate = 1,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* Focus search input when opening */
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  /* Format balance */
  const fmtBalance = (v) => {
    if (v == null || v === 0) return '—';
    return currency === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v * rate);
  };

  /* Filtered list — exclude hidden accounts */
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return accounts.filter(a =>
      a.hidden !== true && (
        !q ||
        (a.name || '').toLowerCase().includes(q) ||
        (a.type || '').toLowerCase().includes(q) ||
        (a.status || '').toLowerCase().includes(q)
      )
    );
  }, [accounts, query]);

  /* Selected account objects — exclude hidden */
  const selectedAccounts = useMemo(() =>
    accounts.filter(a => a.hidden !== true && selectedIds.includes(a.id)),
    [accounts, selectedIds]
  );

  const isAllSelected = selectedIds.length === 0;

  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange([]);
    setQuery('');
  };

  const typeStyle = (type) => TYPE_COLORS[type] || { bg: 'rgba(107,114,128,0.2)', color: '#9ca3af' };

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 200 }}>

      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="account-picker-btn"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px',
          background: open ? 'rgba(124,92,255,0.12)' : 'var(--chip-bg, #1b2130)',
          border: `1px solid ${open ? 'rgba(124,92,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 10, cursor: 'pointer',
          color: 'var(--text, #e7eaf0)',
          fontSize: 13, fontWeight: 500,
          transition: 'all 0.2s',
          flexWrap: 'wrap',
        }}
      >
        {isAllSelected ? (
          <span style={{ color: 'var(--muted, #a1a7b3)' }}>{placeholder}</span>
        ) : (
          <>
            {selectedAccounts.slice(0, 3).map(acc => {
              const firm = resolveFirmForAccount(acc, firms);
              return (
                <span key={acc.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, padding: '2px 7px',
                  fontSize: 12, whiteSpace: 'nowrap',
                }}>
                  <FirmLogoSmall firm={firm} size={14} />
                  {acc.name}
                </span>
              );
            })}
            {selectedAccounts.length > 3 && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>+{selectedAccounts.length - 3}</span>
            )}
          </>
        )}

        {/* Clear button */}
        {!isAllSelected && (
          <span
            onClick={clear}
            title="Limpar seleção"
            style={{
              marginLeft: 4, cursor: 'pointer',
              color: 'var(--muted)', fontSize: 14,
              padding: '0 2px',
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            ✕
          </span>
        )}

        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      <style>{`
        .account-picker-btn {
          max-width: 340px;
        }
        .account-picker-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 9999;
          background: linear-gradient(180deg, #161b25 0%, #131825 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.5);
          min-width: 280px;
          max-width: 360px;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .account-picker-btn {
            max-width: none;
            width: 100%;
          }
          .account-picker-dropdown {
            position: fixed;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100vw;
            max-width: 100vw;
            border-radius: 20px 20px 0 0;
            border: none;
            border-top: 1px solid rgba(255,255,255,0.1);
            max-height: 80vh;
          }
        }
      `}</style>
      
      {/* ── Dropdown ── */}
      {open && (
        <div className="account-picker-dropdown">
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="🔍 Buscar conta..."
              style={{
                width: '100%', background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '7px 10px',
                color: 'var(--text, #e7eaf0)', fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* "Todas" option */}
          <div
            onClick={() => { onChange([]); setOpen(false); setQuery(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 14px', cursor: 'pointer',
              background: isAllSelected ? 'rgba(124,92,255,0.1)' : 'transparent',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              transition: 'background 0.15s',
              fontSize: 13, color: isAllSelected ? '#a78bfa' : 'var(--muted)',
              fontWeight: isAllSelected ? 600 : 400,
            }}
          >
            <span style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              border: `2px solid ${isAllSelected ? '#a78bfa' : 'rgba(255,255,255,0.2)'}`,
              background: isAllSelected ? '#a78bfa' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isAllSelected && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
            </span>
            {placeholder}
          </div>

          {/* Account list */}
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                Nenhuma conta encontrada
              </div>
            ) : (
              filtered.map(acc => {
                const firm = resolveFirmForAccount(acc, firms);
                const checked = selectedIds.includes(acc.id);
                const tc = typeStyle(acc.type);
                return (
                  <div
                    key={acc.id}
                    onClick={() => toggle(acc.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', cursor: 'pointer',
                      background: checked ? 'rgba(124,92,255,0.08)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(124,92,255,0.08)' : 'transparent'; }}
                  >
                    {/* Checkbox */}
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${checked ? '#7c5cff' : 'rgba(255,255,255,0.2)'}`,
                      background: checked ? '#7c5cff' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {checked && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                    </span>

                    {/* Firm logo */}
                    <FirmLogoSmall firm={firm} size={22} />

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e6e6e9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {acc.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {fmtBalance(acc.currentFunding)}
                        </span>
                        <StatusBadge status={acc.status} />
                      </div>
                    </div>

                    {/* Type pill */}
                    {acc.type && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                        background: tc.bg, color: tc.color,
                      }}>
                        {acc.type}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {selectedIds.length > 0 && (
            <div style={{
              padding: '8px 14px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {selectedIds.length} selecionada(s)
              </span>
              <button
                className="btn ghost small"
                onClick={clear}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                ✕ Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
