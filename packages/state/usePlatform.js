/**
 * usePlatform() — React hook for platform integration.
 * 
 * Provides reactive access to:
 *   - Platform connection statuses
 *   - Live positions
 *   - Sync controls (start/stop/manual trigger)
 *   - Account mapping
 * 
 * Usage:
 *   const { statuses, livePositions, isRunning, startSync, stopSync } = usePlatform();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPlatformManager, PLATFORM_EVENTS } from '@apps/utils/platformManager';
import {
  getPlatformSettings,
  setPlatformSettings,
  upsertTradeFromPlatform,
  upsertQuantowerAccount,
  updateAccount,
  updateLivePositions,
  closeLivePosition,
  getLivePositions,
  getAccountMapping,
  getConnectionFirmMap,
  getAccountFirmOverride,
  setAccountMapping as dsSetAccountMapping,
  recalcAccountFunding,
  getAll,
  cleanCorruptedLedgerEntries,
  deduplicateTradesByPosition,
} from '@apps/lib/dataStore';

export function usePlatform() {
  const pmRef = useRef(null);
  const [statuses, setStatuses] = useState([]);
  const [livePositions, setLivePositions] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [liveCount, setLiveCount] = useState(0);

  // Initialize PlatformManager once
  useEffect(() => {
    const pm = getPlatformManager();
    pmRef.current = pm;

    // Self-healing: silently clean up any corrupted ledger entries from previous
    // broken syncs (open-position trades with PnL=0 saved before safety net fixes).
    // This runs once on mount; after the safety net fixes, it should find nothing.
    cleanCorruptedLedgerEntries().then(({ tradesRemoved, ledgerRemoved }) => {
      if (tradesRemoved > 0 || ledgerRemoved > 0) {
        console.log(`[usePlatform] Auto-cleaned ${tradesRemoved} corrupted trade(s) + ${ledgerRemoved} ledger entry(ies) on startup`);
      }
      deduplicateTradesByPosition();
    }).catch(err => {
      console.warn('[usePlatform] Auto-clean failed (non-fatal):', err);
    });

    // Load persisted live positions from dataStore
    const persistedPositions = getLivePositions();
    if (persistedPositions?.length) {
      setLivePositions(persistedPositions);
      setLiveCount(persistedPositions.length);
    }

    // Configure adapters from stored settings
    const qtSettings = getPlatformSettings('quantower');
    if (qtSettings?.bridgeUrl) {
      const qtAdapter = pm.getAdapter('quantower');
      if (qtAdapter) qtAdapter.setBridgeUrl(qtSettings.bridgeUrl);
    }

    // Subscribe to events
    const unsubs = [];

    unsubs.push(pm.on(PLATFORM_EVENTS.CONNECTED, (data) => {
      refreshStatuses();
      console.log(`🟢 ${data.platformName} connected`, data.connections);
    }));

    unsubs.push(pm.on(PLATFORM_EVENTS.DISCONNECTED, (data) => {
      refreshStatuses();
      console.log(`🔴 ${data.platformName} disconnected`);
    }));

    unsubs.push(pm.on(PLATFORM_EVENTS.SYNCED, (data) => {
      setLastSync(data.timestamp);

      // Import new trades ONLY for accounts that are MAPPED (have firm/internalAccountId)
      const rawTrades = data.newTrades?.length > 0 ? data.newTrades : (data.trades || []);

      // Auto-create/map accounts from bridge data if not yet mapped.
      // First tries to find existing internal account by (platformName, connectionId, name)
      // to handle the case where Quantower regenerated account IDs (old mapping stale).
      // Only creates a new account if no match found.
      if (data.accounts?.length > 0) {
        const existingMapping = getAccountMapping(data.platformId);
        const allData = getAll();
        for (const acc of data.accounts) {
          if (existingMapping[acc.platformAccountId]) continue;
          // Try match by connection+name (platformAccountId may have changed)
          const existing = allData.accounts.find(a =>
            a.platformName === data.platformId
            && a.connectionId === (acc.connectionId || '')
            && (a.name === (acc.name || acc.platformAccountId) || a.platformAccountId === acc.platformAccountId)
          );
          if (existing) {
            updateAccount(existing.id, { platformAccountId: acc.platformAccountId });
            dsSetAccountMapping(data.platformId, acc.platformAccountId, existing.id);
            console.log(`[SYNCED] remapped account: platformAccountId=${acc.platformAccountId} → internal=${existing.id}, name=${acc.name}`);
          } else {
            const result = upsertQuantowerAccount(acc, null, acc.connectionId, acc.connectionName);
            if (result?.skipped) {
              console.log(`[SYNCED] skipped deleted account: ${acc.platformAccountId}`);
            } else {
              console.log(`[SYNCED] auto-created account: platformAccountId=${acc.platformAccountId}, name=${acc.name}, isNew=${result?.isNew}`);
            }
          }
        }
      }
      // Also ensure every unique platformAccountId from trades is mapped,
      // even if the bridge /accounts didn't return that account.
      // Creates a minimal account entry so trades aren't silently lost.
      if (rawTrades.length > 0) {
        const mapping = getAccountMapping(data.platformId);

        // Extract connectionName from trades for each platformAccountId
        // so upsertQuantowerAccount can match by connectionName if the ID is new.
        const tradeAccountMeta = {};
        for (const t of rawTrades) {
          if (t.platformAccountId && !tradeAccountMeta[t.platformAccountId]) {
            tradeAccountMeta[t.platformAccountId] = {
              connectionId: t.connectionId || '',
              connectionName: t.connectionName || '',
            };
          }
        }

        const tradeAcctIds = [...new Set(rawTrades.map(t => t.platformAccountId).filter(Boolean))];
        for (const pid of tradeAcctIds) {
          if (mapping[pid]) continue;
          // Try to find existing internal account by platformAccountId
          const allData = getAll();
          const existing = allData.accounts.find(a => a.platformName === data.platformId && a.platformAccountId === pid);
          if (existing) {
            dsSetAccountMapping(data.platformId, pid, existing.id);
            console.log(`[SYNCED] mapped trade-only account: ${pid} → ${existing.id}`);
          } else {
            const meta = tradeAccountMeta[pid] || {};
            const result = upsertQuantowerAccount(
              { platformAccountId: pid, name: pid, connectionId: meta.connectionId, connectionName: meta.connectionName },
              null,
              meta.connectionId,
              meta.connectionName
            );
            if (result?.skipped) {
              console.log(`[SYNCED] skipped deleted account: ${pid}`);
            } else {
              console.log(`[SYNCED] created trade-only account: platformAccountId=${pid}, connectionName=${meta.connectionName || '(none)'}, isNew=${result?.isNew}`);
            }
          }
        }
      }

      if (rawTrades.length > 0) {
        const accountMapping = getAccountMapping(data.platformId);
        
        // Filter: only trades from mapped accounts
        const tradesToImport = rawTrades.filter(trade => {
          const internalAccountId = accountMapping[trade.platformAccountId];
          if (internalAccountId == null) return false;
          // Safety net: skip entry fills (PnL = 0, no real exit data)
          const isEntryFill = Number(trade.netPnl) === 0 && (
            !trade.exitDateTime
            || !trade.exitPrice
          );
          if (isEntryFill) return false;
          return true;
        });

        if (tradesToImport.length > 0) {
          tradesToImport.forEach(trade => {
            const internalAccountId = accountMapping[trade.platformAccountId];
            // Direction: for grouped trades, bridge sends "Long"/"Short" (entry direction)
            // Safety net for ungrouped exit fills: "Sell" → "Long", "Buy" → "Short"
            const isExitFill = trade.side === 'Buy' || trade.side === 'Sell';
            const direction = isExitFill
              ? (trade.side === 'Sell' ? 'Long' : 'Short')
              : trade.side === 'Short' ? 'Short' : 'Long';

            upsertTradeFromPlatform({
              entry_datetime: trade.entryDateTime ?? trade.entry_datetime ?? null,
              exit_datetime: trade.exitDateTime ?? trade.exit_datetime ?? null,
              asset: trade.symbol,
              accountId: internalAccountId,
              direction,
              volume: trade.quantity,
              entry_price: trade.entryPrice ?? trade.entry_price,
              exit_price: trade.exitPrice ?? trade.exit_price,
              result_net: (trade.grossPnl ?? 0) - Math.abs(trade.fee ?? 0),
              result_gross: trade.grossPnl,
              fee: trade.fee,
              source: data.platformId,
              platformTradeId: trade.platformTradeId,
              platformName: trade.platformName || data.platformId,
              connectionName: trade.connectionName || '',
              positionId: trade.positionId || '',
              isLive: false,
            });

            // Recalc funding for affected accounts
            if (internalAccountId) {
              recalcAccountFunding(internalAccountId);
            }
          });

          // Clean up any duplicates that may have been created
          deduplicateTradesByPosition();

          // Dispatch global event for UI refresh
          window.dispatchEvent(new CustomEvent('datastore:change', {
            detail: { source: 'platform-sync', platformId: data.platformId }
          }));
        }
        
        console.log(`[SYNCED] rawTrades=${rawTrades.length}, toImport=${tradesToImport.length}, accountMapping keys=${Object.keys(accountMapping).length}`);
      }
    }));

    unsubs.push(pm.on(PLATFORM_EVENTS.POSITION_UPDATED, (data) => {
      const accountMapping = getAccountMapping(data.platformId);
      const storeData = getAll();

      const enriched = data.positions.map(p => {
        const internalAccountId = accountMapping[p.platformAccountId] || null;
        const account = internalAccountId ? storeData.accounts.find(a => a.id === internalAccountId) : null;

        // Resolve firm: account.firmId → accountFirmOverride → connectionFirmMap
        let firm = account?.firmId ? storeData.firms.find(f => f.id === account.firmId) : null;
        if (!firm && account) {
          const overrideFirmId = getAccountFirmOverride()[account.id];
          if (overrideFirmId) {
            firm = storeData.firms.find(f => f.id === overrideFirmId) || null;
            if (firm) updateAccount(account.id, { firmId: overrideFirmId });
          }
        }
        if (!firm && account && p.connectionId) {
          const connFirmId = getConnectionFirmMap()[p.connectionId];
          if (connFirmId) {
            firm = storeData.firms.find(f => f.id === connFirmId) || null;
            if (firm) updateAccount(account.id, { firmId: connFirmId });
          }
        }

        return {
          ...p,
          internalAccountId,
          firmName: firm?.name || '',
          firmColor: firm?.color || '#6366f1',
          firmLogo: firm?.logo || null,
          accountName: account?.name || p.accountName || '',
        };
      });
      const mappedPositions = enriched.filter(p => p.internalAccountId != null);
      setLivePositions(prev => {
        const others = prev.filter(p => p.platformId !== data.platformId);
        return [...others, ...mappedPositions.map(p => ({ ...p, platformId: data.platformId }))];
      });
      updateLivePositions(mappedPositions.map(p => ({ ...p, platformId: data.platformId })));
      setLiveCount(mappedPositions.length);
    }));

    unsubs.push(pm.on(PLATFORM_EVENTS.POSITION_CLOSED, (data) => {
      const accountMapping = getAccountMapping(data.platformId);
      const internalAccountId = accountMapping[data.position.platformAccountId] || null;

      // Only create trade if account is mapped (in the app with a firm)
      if (internalAccountId) {
        if (data.realTrade) {
          const rt = data.realTrade;
          upsertTradeFromPlatform({
            entry_datetime: rt.entryDateTime,
            exit_datetime:  rt.exitDateTime,
            asset:          rt.symbol,
            accountId:      internalAccountId,
            direction:      rt.side === 'Short' ? 'Short' : 'Long',
            volume:         rt.quantity,
            entry_price:    rt.entryPrice,
            exit_price:     rt.exitPrice,
            result_net:     (rt.grossPnl ?? 0) - Math.abs(rt.fee ?? 0) - Math.abs(rt.swaps ?? 0),
            result_gross:   rt.grossPnl,
            fee:            rt.fee,
            swaps:          rt.swaps,
            source:         data.platformId,
            platformTradeId: rt.platformTradeId,
            positionId:     rt.positionId || '',
            isLive: false,
          });
          console.log(`[POSITION_CLOSED] realTrade: platformTradeId=${rt.platformTradeId}, gross=${rt.grossPnl}, fee=${rt.fee}, swaps=${rt.swaps}, net=${(rt.grossPnl ?? 0) - Math.abs(rt.fee ?? 0) - Math.abs(rt.swaps ?? 0)}`);

          // Remove from live positions (closeLivePosition does this inside, but we need to do it here manually for realTrade)
          updateLivePositions(getLivePositions().filter(p => p.platformPositionId !== data.position.platformPositionId));
          setLivePositions(prev => prev.filter(p => p.platformPositionId !== data.position.platformPositionId));
        } else {
          // data.realTrade is null (bridge didn't have the fill yet within 3s).
          // Construct the trade directly from the position snapshot to avoid a
          // race condition: POSITION_UPDATED (emitted synchronously before this)
          // already removed the position from data.livePositions, so
          // closeLivePosition() would fail to find it and silently drop the trade.
          const pos = data.position;
          const rawPosId = (pos.platformPositionId || '').replace(/^qt_pos_/, '');
          const platformTradeId = rawPosId ? `qt_${rawPosId}` : pos.platformPositionId;
          const grossPnl = pos.grossPnl ?? 0;
          const feeVal = pos.fee ?? 0;
          const swapsVal = pos.swaps ?? 0;

          upsertTradeFromPlatform({
            entry_datetime: pos.openTime || pos.entryTime || new Date().toISOString(),
            exit_datetime:  new Date().toISOString(),
            asset:          pos.symbol || '',
            accountId:      internalAccountId,
            direction:      pos.side === 'Short' ? 'Short' : 'Long',
            volume:         pos.quantity || 0,
            entry_price:    pos.openPrice ?? pos.entryPrice ?? 0,
            exit_price:     pos.currentPrice || 0,
            result_net:     grossPnl - Math.abs(feeVal) - Math.abs(swapsVal),
            result_gross:   grossPnl,
            fee:            feeVal,
            swaps:          swapsVal,
            source:         data.platformId,
            platformTradeId,
            positionId:     rawPosId,
            platformName:   pos.platformName || data.platformId,
            connectionName: pos.connectionName || '',
            isLive:         false,
          });
          console.log(`[POSITION_CLOSED] position-snapshot: platformTradeId=${platformTradeId}, gross=${grossPnl}, fee=${feeVal}, swaps=${swapsVal}, net=${grossPnl - Math.abs(feeVal) - Math.abs(swapsVal)}`);

          // Defensive cleanup: position was already removed by POSITION_UPDATED,
          // but ensure it's gone (no-op if already removed).
          updateLivePositions(getLivePositions().filter(p => p.platformPositionId !== pos.platformPositionId));
          setLivePositions(prev => prev.filter(p => p.platformPositionId !== data.position.platformPositionId));
        }

        recalcAccountFunding(internalAccountId);

        deduplicateTradesByPosition();

        window.dispatchEvent(new CustomEvent('datastore:change', {
          detail: { source: 'position-closed', platformId: data.platformId }
        }));
      } else {
        console.log(`[Quantower Sync] Ignored position close for unmapped account: ${data.position.platformAccountId}`);
      }
    }));

    unsubs.push(pm.on(PLATFORM_EVENTS.POSITION_OPENED, (data) => {
      console.log(`📈 New position: ${data.position.symbol} ${data.position.side}`);
    }));

    // Auto-start if any platform is enabled
    const allData = getAll();
    const platforms = allData.settings?.platforms || {};
    const shouldAutoStart = Object.values(platforms).some(p => p.enabled);
    console.log(`[usePlatform] shouldAutoStart=${shouldAutoStart}`, Object.entries(platforms).map(([k,v]) => `${k}: enabled=${v.enabled}`));
    if (shouldAutoStart) {
      pm.startAutoSync();
      setIsRunning(true);
    }

    refreshStatuses();

    return () => {
      unsubs.forEach(fn => fn());
    };
  }, []);

  const refreshStatuses = useCallback(async () => {
    const pm = pmRef.current;
    if (!pm) return;
    const s = await pm.getAllStatuses();
    setStatuses(s);
  }, []);

  const startSync = useCallback(() => {
    const pm = pmRef.current;
    if (!pm) return;
    pm.startAutoSync();
    setIsRunning(true);
  }, []);

  const stopSync = useCallback(() => {
    const pm = pmRef.current;
    if (!pm) return;
    pm.stopAutoSync();
    setIsRunning(false);
  }, []);

  const manualSync = useCallback(async (platformId) => {
    const pm = pmRef.current;
    if (!pm) return;
    await pm.syncPlatform(platformId);
    refreshStatuses();
  }, [refreshStatuses]);

  const testConnection = useCallback(async (platformId) => {
    const pm = pmRef.current;
    if (!pm) return null;
    const adapter = pm.getAdapter(platformId);
    if (!adapter) return null;
    return adapter.getStatus();
  }, []);

  const updateAccountMapping = useCallback((platformId, platformAccountId, internalAccountId) => {
    dsSetAccountMapping(platformId, platformAccountId, internalAccountId);
  }, []);

  const closePosition = useCallback(async (position) => {
    if (!position || !position.internalAccountId) return;

    // Try to close on the platform bridge first
    if (position.platformId) {
      try {
        const pm = getPlatformManager();
        const adapter = pm.getAdapter(position.platformId);
        if (adapter && typeof adapter.closePosition === 'function') {
          await adapter.closePosition(position);
        }
      } catch (err) {
        console.warn('[ClosePosition] Bridge close failed, doing local-only cleanup:', err);
      }
    }

    closeLivePosition(position.platformPositionId, {
      exitPrice: position.currentPrice,
      exitTime: new Date().toISOString(),
      netPnl: position.netPnl,
      grossPnl: position.grossPnl,
      fee: position.fee,
    });
    recalcAccountFunding(position.internalAccountId);
    window.dispatchEvent(new CustomEvent('datastore:change', {
      detail: { source: 'manual-close', platformId: position.platformId }
    }));
    setLivePositions(prev => prev.filter(p => p.platformPositionId !== position.platformPositionId));
  }, []);

  // Count live positions across all platforms
  useEffect(() => {
    const total = livePositions.length;
    setLiveCount(total);
  }, [livePositions]);

  return {
    statuses,
    livePositions,
    liveCount,
    isRunning,
    lastSync,
    startSync,
    stopSync,
    manualSync,
    testConnection,
    refreshStatuses,
    updateAccountMapping,
    closePosition,
    getPlatformManager: () => pmRef.current,
  };
}

export default usePlatform;
