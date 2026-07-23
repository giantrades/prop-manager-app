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

      // 1) FIRST: Persist accounts from sync into dataStore (creates mapping)
      const platformAccounts = data.accounts || [];
      if (platformAccounts.length > 0) {
        for (const acc of platformAccounts) {
          upsertQuantowerAccount(acc, null, acc.connectionId, acc.connectionName);
        }
      }

      // 2) THEN: Import new trades ONLY for accounts that are MAPPED (have firm/internalAccountId)
      const rawTrades = data.newTrades?.length > 0 ? data.newTrades : (data.trades || []);
      if (rawTrades.length > 0) {
        const accountMapping = getAccountMapping(data.platformId);
        
        // Filter: only trades from mapped accounts
        const tradesToImport = rawTrades.filter(trade => {
          const internalAccountId = accountMapping[trade.platformAccountId];
          if (internalAccountId == null) return false;
          // Safety net: skip entry fills (PnL = 0, no real exit data)
          const isEntryFill = trade.netPnl === 0 && (
            !trade.exitDateTime
            || trade.exitDateTime === trade.entryDateTime
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
              result_net: trade.netPnl,
              result_gross: trade.grossPnl,
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

          // Dispatch global event for UI refresh
          window.dispatchEvent(new CustomEvent('datastore:change', {
            detail: { source: 'platform-sync', platformId: data.platformId }
          }));
        }
        
        // Log filtered trades for debugging
        const filteredCount = rawTrades.length - tradesToImport.length;
        if (filteredCount > 0) {
          console.log(`[Quantower Sync] Filtered out ${filteredCount} trades (unmapped accounts + entry fills)`);
        }
      }
    }));

    unsubs.push(pm.on(PLATFORM_EVENTS.POSITION_UPDATED, (data) => {
      let accountMapping = getAccountMapping(data.platformId);

      // Auto-create accounts for any positions that don't have a mapping yet
      for (const p of data.positions) {
        if (!accountMapping[p.platformAccountId] && p.platformAccountId && p.accountName) {
          const connFirmMap = getConnectionFirmMap();
          const firmId = (p.connectionId && connFirmMap[p.connectionId]) || null;
          upsertQuantowerAccount(
            { platformAccountId: p.platformAccountId, name: p.accountName, balance: 0, currency: 'USD' },
            firmId,
            p.connectionId || '',
            p.connectionName || ''
          );
        }
      }

      // Refresh account mapping and store data after any auto-creations
      accountMapping = getAccountMapping(data.platformId);
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
            result_net:     rt.netPnl,
            result_gross:   rt.grossPnl,
            fee:            rt.fee,
            swaps:          rt.swaps,
            source:         data.platformId,
            platformTradeId: rt.platformTradeId,
            positionId:     rt.positionId || '',
            isLive: false,
          });

          // Remove from live positions (closeLivePosition does this inside, but we need to do it here manually for realTrade)
          updateLivePositions(getLivePositions().filter(p => p.platformPositionId !== data.position.platformPositionId));
          setLivePositions(prev => prev.filter(p => p.platformPositionId !== data.position.platformPositionId));
        } else {
          // Pass the already-resolved internalAccountId so closeLivePosition()
          // doesn't fall back to getAccountMapping(pos.platformId) where
          // pos.platformId might be undefined (position from raw poll data).
          closeLivePosition(data.position.platformPositionId, {
            exitPrice: data.position.currentPrice,
            exitTime: new Date().toISOString(),
            netPnl: data.position.netPnl,
            grossPnl: data.position.grossPnl,
            fee: data.position.fee,
            swaps: data.position.swaps,
          }, internalAccountId);
        }

        recalcAccountFunding(internalAccountId);

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

    // Auto-start if any platform has autoSync enabled
    const allData = getAll();
    const platforms = allData.settings?.platforms || {};
    const shouldAutoStart = Object.values(platforms).some(p => p.enabled && p.autoSync);
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
