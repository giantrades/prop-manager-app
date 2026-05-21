/**
 * PlatformConnectionSettings — Settings section for managing platform connections.
 *
 * Bloco 1: Bridge Config (URL + Test + status geral)
 * Bloco 2: Connection Health — conexões do Quantower (sem logo) com Firms abaixo (com logo)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPlatformSettings, setPlatformSettings, getAll,
  getConnectionFirmMap, setConnectionFirmEntry,
  getAccountFirmOverride, setAccountFirmEntry,
  getFirms,
} from '@apps/lib/dataStore';
import { getPlatformManager } from '@apps/utils/platformManager';

/* ============================================================
   Helpers
   ============================================================ */
function FirmLogo({ firm, size = 28 }) {
  if (!firm) return null;
  if (firm.logo) {
    return (
      <img
        src={firm.logo}
        alt={firm.name}
        style={{ width: size, height: size, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }}
      />
    );
  }
  // Circle fallback with firm color
  return (
    <div style={{
      width: size, height: size, borderRadius: 5, flexShrink: 0,
      background: firm.color || '#6366f1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.45, fontWeight: 700,
    }}>
      {firm.name.charAt(0).toUpperCase()}
    </div>
  );
}

function StatusDot({ online }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, color: online ? '#22c55e' : '#ef4444',
      fontWeight: 600,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: online ? '#22c55e' : '#ef4444',
        boxShadow: online ? '0 0 6px #22c55e88' : 'none',
        flexShrink: 0,
      }} />
      {online ? 'Connected' : 'Offline'}
    </span>
  );
}

/* ============================================================
   FirmCard — card glassmorphism de uma firma dentro de uma conexão
   ============================================================ */
function FirmCard({ firm, accounts, connFirmMap, accFirmOverride, allFirms, connectionId, onSetConnFirm, onSetAccFirm }) {
  const [expanded, setExpanded] = useState(false);

  const glowColor = firm.color || '#6366f1';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: `1px solid ${expanded ? glowColor + '44' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 10,
      marginTop: 8,
      overflow: 'hidden',
      boxShadow: expanded ? `0 0 18px ${glowColor}22` : 'none',
      transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
    }}>
      {/* Firm header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <FirmLogo firm={firm} size={26} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#e6e6e9' }}>
          {firm.name}
        </span>
        <span style={{ fontSize: 12, color: '#6b7280', marginRight: 8 }}>
          {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
        </span>
        <span style={{ color: '#6b7280', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Accounts list */}
      {expanded && (
        <div style={{ padding: '0 14px 12px' }}>
          {accounts.length === 0 ? (
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
              Nenhuma conta vinculada.
            </p>
          ) : (
            accounts.map(acc => {
              const currentFirmId = accFirmOverride[acc.id] || (connectionId ? connFirmMap[connectionId] : null) || acc.firmId;
              return (
                <div key={acc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e6e6e9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.name || acc.id?.slice(0, 10)}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {acc.connectionName || connectionId} · ${(acc.balance || acc.currentFunding || 0).toLocaleString()}
                      {acc.status ? ` · ${acc.status}` : ''}
                    </div>
                  </div>

                  {/* Override por conta */}
                  <select
                    className="select"
                    value={accFirmOverride[acc.id] || ''}
                    onChange={e => onSetAccFirm(acc.id, e.target.value || null)}
                    title="Override: vincular conta a uma Firm específica"
                    style={{ fontSize: 11, width: 150, padding: '3px 6px' }}
                  >
                    <option value="">↔ Herdada da conexão</option>
                    {allFirms.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ConnectionBlock — bloco de uma conexão (sem logo)
   ============================================================ */
function ConnectionBlock({ conn, allFirms, bridgeAccounts, connFirmMap, accFirmOverride, onSetConnFirm, onSetAccFirm }) {
  const [expanded, setExpanded] = useState(true);

  // Contas desta conexão
  const connAccounts = bridgeAccounts.filter(a =>
    a.connectionId === conn.id || a.connectionName === conn.name
  );

  // Firms que têm contas nesta conexão (via mapeamento ou firmId)
  const firmsInConn = React.useMemo(() => {
    const firmIds = new Set();
    connAccounts.forEach(acc => {
      const fid = accFirmOverride[acc.id] || connFirmMap[conn.id] || acc.firmId;
      if (fid) firmIds.add(fid);
    });
    return allFirms.filter(f => firmIds.has(f.id));
  }, [connAccounts, accFirmOverride, connFirmMap, conn.id, allFirms]);

  // Contas SEM firm atribuída nesta conexão
  const unmappedAccounts = connAccounts.filter(acc => {
    const fid = accFirmOverride[acc.id] || connFirmMap[conn.id] || acc.firmId;
    return !fid;
  });

  return (
    <div style={{
      background: 'rgba(0,0,0,0.25)',
      borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.06)',
      padding: '12px 14px',
    }}>
      {/* Connection header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: 0 }}
        >
          {expanded ? '▼' : '►'}
        </button>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e6e6e9' }}>{conn.name}</span>
        </div>
        <StatusDot online={conn.online} />
        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
          {connAccounts.length} {connAccounts.length === 1 ? 'conta' : 'contas'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {/* Link toda a conexão a uma Firm */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
              Vincular toda a conexão →
            </span>
            <select
              className="select"
              value={connFirmMap[conn.id] || ''}
              onChange={e => onSetConnFirm(conn.id, e.target.value || null)}
              style={{ fontSize: 12, flex: 1, maxWidth: 200 }}
            >
              <option value="">— Não mapeada —</option>
              {allFirms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Firm cards */}
          {firmsInConn.map(firm => (
            <FirmCard
              key={firm.id}
              firm={firm}
              accounts={connAccounts.filter(acc => {
                const fid = accFirmOverride[acc.id] || connFirmMap[conn.id] || acc.firmId;
                return fid === firm.id;
              })}
              connFirmMap={connFirmMap}
              accFirmOverride={accFirmOverride}
              allFirms={allFirms}
              connectionId={conn.id}
              onSetConnFirm={onSetConnFirm}
              onSetAccFirm={onSetAccFirm}
            />
          ))}

          {/* Unmapped accounts */}
          {unmappedAccounts.length > 0 && (
            <div style={{
              marginTop: 8, padding: '8px 12px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8, border: '1px dashed rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                ⚠️ {unmappedAccounts.length} conta(s) sem Firm vinculada:
              </div>
              {unmappedAccounts.map(acc => (
                <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span style={{ flex: 1, fontSize: 12, color: '#9ca3af' }}>
                    {acc.name || acc.id?.slice(0, 12)}
                  </span>
                  <select
                    className="select"
                    value={accFirmOverride[acc.id] || ''}
                    onChange={e => onSetAccFirm(acc.id, e.target.value || null)}
                    style={{ fontSize: 11, width: 160, padding: '3px 6px' }}
                  >
                    <option value="">— Vincular à Firm —</option>
                    {allFirms.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {connAccounts.length === 0 && (
            <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 0' }}>
              {conn.online ? 'Nenhuma conta nesta conexão.' : 'Conexão offline — sem dados disponíveis.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function PlatformConnectionSettings() {
  // Bridge config state
  const [config, setConfig] = useState(() => {
    const s = getPlatformSettings('quantower');
    return { bridgeUrl: s.bridgeUrl || 'http://localhost:8787', enabled: s.enabled || false };
  });
  const [testing, setTesting] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState(null); // { online, connections[], accounts[] }

  // Mapping state
  const [connFirmMap, setConnFirmMapState] = useState(() => getConnectionFirmMap());
  const [accFirmOverride, setAccFirmOverrideState] = useState(() => getAccountFirmOverride());
  const [allFirms, setAllFirms] = useState(() => getFirms());
  const [refreshKey, setRefreshKey] = useState(0);

  // Reload firms on change
  useEffect(() => {
    setAllFirms(getFirms());
    setConnFirmMapState(getConnectionFirmMap());
    setAccFirmOverrideState(getAccountFirmOverride());
  }, [refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  /* --- Bridge Test --- */
  const handleTest = useCallback(async () => {
    setTesting(true);
    setBridgeStatus(null);
    try {
      const pm = getPlatformManager();
      const adapter = pm.getAdapter('quantower');
      if (!adapter) throw new Error('Quantower adapter not registered');

      const status = await adapter.getStatus();
      // Try to also fetch accounts to populate connection health
      let accounts = [];
      if (status.online) {
        try { accounts = await adapter.getAccounts(); } catch (_) {}
      }
      setBridgeStatus({ ...status, bridgeAccounts: accounts });
    } catch (err) {
      setBridgeStatus({ online: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }, []);

  const handleBridgeUrl = (url) => {
    setConfig(c => ({ ...c, bridgeUrl: url }));
    setPlatformSettings('quantower', { bridgeUrl: url });
    const pm = getPlatformManager();
    const adapter = pm.getAdapter('quantower');
    if (adapter?.setBridgeUrl) adapter.setBridgeUrl(url);
  };

  /* --- Mapping handlers --- */
  const handleSetConnFirm = (connectionId, firmId) => {
    setConnectionFirmEntry(connectionId, firmId);
    setConnFirmMapState(getConnectionFirmMap());
  };

  const handleSetAccFirm = (accountId, firmId) => {
    setAccountFirmEntry(accountId, firmId);
    setAccFirmOverrideState(getAccountFirmOverride());
  };

  /* --- Derive connections list --- */
  // From bridge status or fallback to known connections from mapping
  const connections = React.useMemo(() => {
    if (bridgeStatus?.connections?.length) {
      return bridgeStatus.connections.map(c => ({ ...c, online: true }));
    }
    // Fallback: show connections we already have mapped (offline)
    const knownIds = Object.keys(connFirmMap);
    return knownIds.map(id => ({ id, name: id, online: false }));
  }, [bridgeStatus, connFirmMap]);

  const bridgeAccounts = bridgeStatus?.bridgeAccounts || [];

  /* --- Firms with NO accounts in any connection --- */
  const firmsWithAccounts = new Set();
  bridgeAccounts.forEach(acc => {
    const fid = accFirmOverride[acc.id] || (acc.connectionId ? connFirmMap[acc.connectionId] : null) || acc.firmId;
    if (fid) firmsWithAccounts.add(fid);
  });
  // Also count from connection-level mapping
  Object.values(connFirmMap).forEach(fid => { if (fid) firmsWithAccounts.add(fid); });
  const disconnectedFirms = allFirms.filter(f => !firmsWithAccounts.has(f.id));

  const isOnline = bridgeStatus?.online;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ===================== BLOCO 1: Bridge Config ===================== */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <img
            src={`${import.meta.env?.BASE_URL || '/'}assets/logos/quantower.png`}
            alt="Quantower"
            style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 5 }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <h3 style={{ margin: 0, fontSize: 16 }}>Quantower Bridge</h3>
          {bridgeStatus && (
            <span style={{ marginLeft: 'auto' }}>
              <StatusDot online={bridgeStatus.online} />
            </span>
          )}
        </div>

        <div className="field">
          <label style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>Bridge URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="input"
              value={config.bridgeUrl}
              onChange={e => handleBridgeUrl(e.target.value)}
              placeholder="http://localhost:8787"
              style={{ flex: 1 }}
            />
            <button
              className={`btn ${testing ? 'ghost' : ''}`}
              onClick={handleTest}
              disabled={testing}
              style={{ whiteSpace: 'nowrap' }}
            >
              {testing ? '⏳ Testando...' : '🔍 Conectar'}
            </button>
          </div>
        </div>

        {bridgeStatus && (
          <p style={{
            fontSize: 12, marginTop: 8, marginBottom: 0,
            color: bridgeStatus.online ? '#22c55e' : '#ef4444',
          }}>
            {bridgeStatus.online
              ? `✅ Conectado — ${bridgeStatus.accountsCount ?? bridgeAccounts.length} contas · ${connections.length} conexões`
              : `❌ Offline — ${bridgeStatus.error || 'Verifique se a Bridge está rodando no Quantower'}`
            }
          </p>
        )}
      </div>

      {/* ===================== BLOCO 2: Connection Health ===================== */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>🔗 Quantower Connections</h3>
          <button
            className="btn ghost small"
            onClick={handleTest}
            disabled={testing}
            style={{ marginLeft: 'auto', fontSize: 12 }}
          >
            {testing ? '⏳' : '↺ Refresh'}
          </button>
        </div>

        {/* Active connections */}
        {connections.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {connections.map(conn => (
              <ConnectionBlock
                key={conn.id || conn.name}
                conn={conn}
                allFirms={allFirms}
                bridgeAccounts={bridgeAccounts}
                connFirmMap={connFirmMap}
                accFirmOverride={accFirmOverride}
                onSetConnFirm={handleSetConnFirm}
                onSetAccFirm={handleSetAccFirm}
              />
            ))}
          </div>
        ) : (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: '#6b7280',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 10,
            border: '1px dashed rgba(255,255,255,0.06)',
            fontSize: 13,
          }}>
            {isOnline === false
              ? '🔴 Bridge offline — clique em "Conectar" para carregar as conexões'
              : '💡 Clique em "Conectar" para carregar as conexões do Quantower'}
          </div>
        )}

        {/* Firms sem conexão — sempre visíveis */}
        {allFirms.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 600 }}>
              📋 Firms cadastradas{disconnectedFirms.length > 0 ? ` — ${disconnectedFirms.length} sem conexão` : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allFirms.map(firm => {
                const hasConn = firmsWithAccounts.has(firm.id);
                if (hasConn) return null; // já aparece acima na conexão
                return (
                  <div key={firm.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10,
                  }}>
                    <FirmLogo firm={firm} size={24} />
                    <span style={{ flex: 1, fontSize: 13, color: '#9ca3af' }}>{firm.name}</span>
                    <span style={{ fontSize: 11, color: '#4b5563' }}>0 contas · sem conexão</span>
                  </div>
                );
              })}
              {disconnectedFirms.length === 0 && allFirms.length > 0 && (
                <p style={{ fontSize: 12, color: '#22c55e', margin: 0 }}>
                  ✅ Todas as firms têm contas vinculadas
                </p>
              )}
            </div>
          </div>
        )}

        {allFirms.length === 0 && (
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>
            💡 Crie empresas na página <strong>Firms</strong> para começar a vincular às conexões.
          </p>
        )}
      </div>
    </div>
  );
}
