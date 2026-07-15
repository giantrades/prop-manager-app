/**
 * PlatformConnectionSettings — Settings section for managing platform connections.
 *
 * Bloco 1: Bridge Config (URL + Test + status geral)
 * Bloco 2: Connection Health — conexões do Quantower (sem logo) com Firms abaixo (com logo)
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getPlatformSettings, setPlatformSettings, getAll,
  getConnectionFirmMap, setConnectionFirmEntry,
  getAccountFirmOverride, setAccountFirmEntry,
  getFirms,
  upsertQuantowerAccount,
  updateAccount,
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
function FirmCard({ firm, accounts, connFirmMap, accFirmOverride, allFirms, connectionId, onSetConnFirm, onSetAccFirm, showHidden, onToggleHide }) {
  const [expanded, setExpanded] = useState(false);

  const glowColor = firm.color || '#6366f1';

  // Helper to get account unique key (platformAccountId for bridge, id for internal)
  const getAccountKey = (acc) => acc.platformAccountId || acc.id;

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
              const accountKey = acc.platformAccountId || acc.id;
              const currentFirmId = accFirmOverride[accountKey] || (connectionId ? connFirmMap[connectionId] : null) || acc.firmId;
              const isHidden = acc.hidden === true;
              return (
                <div key={accountKey} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  opacity: isHidden ? 0.4 : 1,
                  textDecoration: isHidden ? 'line-through' : 'none',
                  transition: 'opacity 0.2s, text-decoration 0.2s',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e6e6e9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.name || accountKey?.slice(0, 10)}
                      {isHidden && <span style={{ marginLeft: 6, fontSize: 10, color: '#ef4444', fontWeight: 400 }}>(oculta)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {acc.connectionName || connectionId} · ${(acc.balance || acc.currentFunding || 0).toLocaleString()}
                      {acc.status ? ` · ${acc.status}` : ''}
                      {acc.type ? ` · ${acc.type}` : ''}
                    </div>
                  </div>

                  {/* Botão ocultar/revelar */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleHide?.(acc); }}
                    title={isHidden ? 'Revelar conta' : 'Ocultar conta'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 16, padding: '2px 6px', borderRadius: 4,
                      color: isHidden ? '#ef4444' : '#6b7280',
                      opacity: 0.6, transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                  >
                    {isHidden ? '👁️‍🗨️' : '👁️'}
                  </button>

                  {/* Override por conta */}
                  <select
                    className="select"
                    value={accFirmOverride[accountKey] || ''}
                    onChange={e => onSetAccFirm(accountKey, e.target.value || null)}
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
function ConnectionBlock({ conn, allFirms, bridgeAccounts, connFirmMap, accFirmOverride, onSetConnFirm, onSetAccFirm, onSyncAccounts, syncingConnId, backfillEnabled, setBackfillEnabled, onToggleHide }) {
  const [expanded, setExpanded] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  // Contas desta conexão (bridge accounts)
  const connAccounts = bridgeAccounts.filter(a =>
    a.connectionId === conn.id || a.connectionName === conn.name
  );

  // Internal accounts from dataStore that belong to this connection
  const allData = getAll();
  const internalAccounts = allData.accounts.filter(a => 
    a.platformName === 'quantower' && 
    (a.connectionId === conn.id || a.connectionName === conn.name)
  );

  // Combine bridge + internal accounts for display
  const allAccounts = useMemo(() => {
    const map = new Map();
    // Add bridge accounts first
    connAccounts.forEach(acc => map.set(acc.platformAccountId, { ...acc, _source: 'bridge' }));
    // Add/merge internal accounts
    internalAccounts.forEach(acc => map.set(acc.platformAccountId, { ...acc, _source: 'internal' }));
    return Array.from(map.values());
  }, [connAccounts, internalAccounts, conn.id]);

  // Filter hidden accounts unless showHidden is active
  const hiddenCount = useMemo(() => allAccounts.filter(a => a.hidden === true).length, [allAccounts]);
  const displayAccounts = useMemo(() =>
    showHidden ? allAccounts : allAccounts.filter(a => a.hidden !== true),
    [allAccounts, showHidden]
  );

  // Firms que têm contas nesta conexão (via mapeamento ou firmId)
  const firmsInConn = useMemo(() => {
    const firmIds = new Set();
    displayAccounts.forEach(acc => {
      const fid = accFirmOverride[acc.platformAccountId] || connFirmMap[conn.id] || acc.firmId;
      if (fid) firmIds.add(fid);
    });
    return allFirms.filter(f => firmIds.has(f.id));
  }, [displayAccounts, accFirmOverride, connFirmMap, conn.id, allFirms]);

  // Contas SEM firm atribuída nesta conexão
  const unmappedAccounts = displayAccounts.filter(acc => {
    const fid = accFirmOverride[acc.platformAccountId] || connFirmMap[conn.id] || acc.firmId;
    return !fid;
  });

  const isSyncing = syncingConnId === conn.id;

  // Sync status per firm for this connection
  const firmSyncStatus = useMemo(() => {
    const status = {};
    firmsInConn.forEach(firm => {
      const firmAccounts = displayAccounts.filter(acc => {
        const fid = accFirmOverride[acc.platformAccountId] || connFirmMap[conn.id] || acc.firmId;
        return fid === firm.id;
      });
      const total = firmAccounts.length;
      const synced = firmAccounts.filter(acc => acc._source === 'internal').length;
      if (total === 0) status[firm.id] = 'none';
      else if (synced === total) status[firm.id] = 'synced';
      else if (synced > 0) status[firm.id] = 'partial';
      else status[firm.id] = 'unsynced';
    });
    return status;
  }, [displayAccounts, firmsInConn, accFirmOverride, connFirmMap, conn.id]);

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
          {displayAccounts.length} {displayAccounts.length === 1 ? 'conta' : 'contas'}
          {hiddenCount > 0 && (
            <span style={{ color: '#ef4444', marginLeft: 4 }}>
              ({hiddenCount} oculta{hiddenCount > 1 ? 's' : ''})
            </span>
          )}
        </span>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden(v => !v)}
            title={showHidden ? 'Ocultar contas ocultas' : 'Mostrar contas ocultas'}
            style={{
              background: showHidden ? 'rgba(239,68,68,0.15)' : 'none',
              border: `1px solid ${showHidden ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
              cursor: 'pointer', borderRadius: 6, padding: '3px 8px',
              fontSize: 12, color: showHidden ? '#ef4444' : '#6b7280',
              whiteSpace: 'nowrap', transition: 'all 0.2s',
            }}
          >
            {showHidden ? '🙈 Ocultas' : '👁️ Mostrar ocultas'}
          </button>
        )}
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

          {/* Firm cards with sync status */}
          {firmsInConn.map(firm => {
            const syncState = firmSyncStatus[firm.id] || 'none';
            const syncColor = syncState === 'synced' ? '#22c55e' : syncState === 'partial' ? '#f59e0b' : syncState === 'unsynced' ? '#ef4444' : '#6b7280';
            const syncLabel = syncState === 'synced' ? 'Todas sincronizadas' : syncState === 'partial' ? 'Parcial' : syncState === 'unsynced' ? 'Não sincronizadas' : '—';
            
            return (
               <React.Fragment key={firm.id}>
                <FirmCard
                  firm={firm}
                  accounts={displayAccounts.filter(acc => {
                    const fid = accFirmOverride[acc.platformAccountId] || connFirmMap[conn.id] || acc.firmId;
                    return fid === firm.id;
                  })}
                  connFirmMap={connFirmMap}
                  accFirmOverride={accFirmOverride}
                  allFirms={allFirms}
                  connectionId={conn.id}
                  onSetConnFirm={onSetConnFirm}
                  onSetAccFirm={onSetAccFirm}
                  showHidden={showHidden}
                  onToggleHide={onToggleHide}
                />
                <div style={{ marginTop: 6, padding: '6px 10px', background: syncColor + '15', borderRadius: 6, border: `1px solid ${syncColor}33`, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: syncColor }} />
                  <span style={{ fontSize: 11, color: syncColor, fontWeight: 500 }}>
                    {firm.name}: {syncLabel}
                  </span>
                </div>
              </React.Fragment>
            );
          })}

          {/* Firm sync status indicators */}
          {firmsInConn.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
                Status de sincronização por Firm:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {firmsInConn.map(firm => {
                  const syncState = firmSyncStatus[firm.id] || 'none';
                  const syncColor = syncState === 'synced' ? '#22c55e' : syncState === 'partial' ? '#f59e0b' : syncState === 'unsynced' ? '#ef4444' : '#6b7280';
                  const syncLabel = syncState === 'synced' ? '✅ Sincronizada' : syncState === 'partial' ? '⚠️ Parcial' : syncState === 'unsynced' ? '❌ Não sincronizada' : '—';
                  return (
                    <span key={firm.id} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px', borderRadius: 6,
                      background: syncColor + '22', border: `1px solid ${syncColor}44`,
                      fontSize: 11, color: syncColor,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: syncColor }} />
                      {firm.name}: {syncLabel}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sync Accounts Button - shows when connection has a firm mapped */}
          {connFirmMap[conn.id] && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  onClick={() => onSyncAccounts(conn.id, conn.name)}
                  disabled={isSyncing}
                  style={{ fontSize: 12 }}
                >
                  {isSyncing ? '⏳ Sincronizando...' : '🔄 Sincronizar contas'}
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9ca3af', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={backfillEnabled}
                    onChange={e => setBackfillEnabled(e.target.checked)}
                  />
                  Importar histórico completo
                </label>
              </div>
            </div>
          )}

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
                <div key={acc.platformAccountId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span style={{ flex: 1, fontSize: 12, color: '#9ca3af' }}>
                    {acc.name || acc.platformAccountId?.slice(0, 12)}
                  </span>
                  <select
                    className="select"
                    value={accFirmOverride[acc.platformAccountId] || ''}
                    onChange={e => onSetAccFirm(acc.platformAccountId, e.target.value || null)}
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

          {displayAccounts.length === 0 && (
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

  // Sync accounts state
  const [syncingConnId, setSyncingConnId] = useState(null);
  const [backfillEnabled, setBackfillEnabled] = useState(false);

  // Reload firms on change
  useEffect(() => {
    setAllFirms(getFirms());
    setConnFirmMapState(getConnectionFirmMap());
    setAccFirmOverrideState(getAccountFirmOverride());
  }, [refreshKey]);

  // Auto-test bridge on mount if URL configured and enabled
  useEffect(() => {
    const s = getPlatformSettings('quantower');
    if (s?.bridgeUrl && s?.enabled) {
      handleTest();
    }
  }, []);

  const refresh = () => setRefreshKey(k => k + 1);

  /* --- Sync Accounts for a connection --- */
  const handleSyncAccounts = useCallback(async (connectionId, connectionName) => {
    const firmId = connFirmMap[connectionId];
    if (!firmId) {
      alert('Vincule a conexão a uma Firm antes de sincronizar.');
      return;
    }
    setSyncingConnId(connectionId);
    try {
      const pm = getPlatformManager();
      const adapter = pm.getAdapter('quantower');
      if (!adapter) throw new Error('Quantower adapter not registered');

      // Fetch accounts from bridge
      const accounts = await adapter.getAccounts();
      const connAccounts = accounts.filter(a => 
        a.connectionId === connectionId || a.connectionName === connectionName
      );

      if (connAccounts.length === 0) {
        alert('Nenhuma conta encontrada para esta conexão.');
        return;
      }

      // Pular contas marcadas como ocultas
      const existing = getAll().accounts.filter(a => 
        a.platformName === 'quantower' && a.hidden === true &&
        (a.connectionId === connectionId || a.connectionName === connectionName)
      );
      const hiddenIds = new Set(existing.map(a => a.platformAccountId));
      const toSync = connAccounts.filter(a => !hiddenIds.has(a.platformAccountId));

      // Upsert each account
      let created = 0, updated = 0;
      for (const acc of toSync) {
        const result = await upsertQuantowerAccount(acc, firmId, connectionId, connectionName);
        if (result.isNew) created++; else updated++;
      }

      const skipped = connAccounts.length - toSync.length;

      // Optionally backfill trades
      if (backfillEnabled) {
        // TODO: trigger full backfill sync for these accounts
        console.log('[SyncAccounts] Backfill enabled for', toSync.length, 'accounts');
      }

      alert(`✅ Sincronizado: ${created} criadas, ${updated} atualizadas${skipped > 0 ? `, ${skipped} puladas (ocultas)` : ''}`);
      refresh();
    } catch (err) {
      alert('❌ Erro ao sincronizar: ' + err.message);
    } finally {
      setSyncingConnId(null);
    }
  }, [connFirmMap, backfillEnabled]);

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

  /* --- Toggle hide account --- */
  const handleToggleHide = useCallback((acc) => {
    if (acc.id) {
      updateAccount(acc.id, { hidden: !acc.hidden });
      refresh();
    }
  }, []);

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
  const connections = useMemo(() => {
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
    const fid = accFirmOverride[acc.platformAccountId] || (acc.connectionId ? connFirmMap[acc.connectionId] : null) || acc.firmId;
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
                onSyncAccounts={handleSyncAccounts}
                syncingConnId={syncingConnId}
                backfillEnabled={backfillEnabled}
                setBackfillEnabled={setBackfillEnabled}
                onToggleHide={handleToggleHide}
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