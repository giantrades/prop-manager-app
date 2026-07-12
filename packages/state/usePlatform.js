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
  updateLivePositions,
  closeLivePosition,
  getLivePositions,
  getAccountMapping,
  setAccountMapping as dsSetAccountMapping,
  recalcAccountFunding,
  getAll,
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

      // Import new trades into dataStore - handle both newTrades (auto) and trades (manual)
      const tradesToProcess = data.newTrades?.length > 0 ? data.newTrades : (data.trades || []);
      if (tradesToProcess.length > 0) {
        const accountMapping = getAccountMapping(data.platformId);

        tradesToProcess.forEach(trade => {
          const internalAccountId = accountMapping[trade.platformAccountId] || null;
          upsertTradeFromPlatform({
            entry_datetime: trade.entryDateTime || trade.entry_datetime,
            exit_datetime: trade.exitDateTime || trade.exit_datetime,
            asset: trade.symbol,
            accountId: internalAccountId,
            direction: trade.side === 'Sell' ? 'Short' : 'Long',
            volume: trade.quantity,
            entry_price: trade.entryPrice ?? trade.entry_price,
            exit_price: trade.exitPrice ?? trade.exit_price,
            result_net: trade.netPnl,
            result_gross: trade.grossPnl,
            source: data.platformId,
            platformTradeId: trade.platformTradeId,
            platformName: trade.platformName || data.platformId,
            connectionName: trade.connectionName || '',
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
    }));

    unsubs.push(pm.on(PLATFORM_EVENTS.POSITION_UPDATED, (data) => {
      const accountMapping = getAccountMapping(data.platformId);
      const enriched = data.positions.map(p => ({
        ...p,
        internalAccountId: accountMapping[p.platformAccountId] || null,
      }));
      setLivePositions(prev => {
        // Replace positions for this platform, keep others
        const others = prev.filter(p => p.platformId !== data.platformId);
        return [...others, ...enriched.map(p => ({ ...p, platformId: data.platformId }))];
      });
      // Persist to dataStore
      updateLivePositions(enriched.map(p => ({ ...p, platformId: data.platformId })));
      setLiveCount(c => {
        const newCount = data.positions.length;
        return newCount;
      });
    }));

    unsubs.push(pm.on(PLATFORM_EVENTS.POSITION_CLOSED, (data) => {
      const accountMapping = getAccountMapping(data.platformId);
      const internalAccountId = accountMapping[data.position.platformAccountId] || null;

      closeLivePosition(data.position.platformPositionId, {
        exitPrice: data.position.currentPrice,
        netPnl: data.position.netPnl,
        grossPnl: data.position.grossPnl,
        fee: data.position.fee,
      });

      if (internalAccountId) {
        recalcAccountFunding(internalAccountId);
      }

      window.dispatchEvent(new CustomEvent('datastore:change', {
        detail: { source: 'position-closed', platformId: data.platformId }
      }));
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
    getPlatformManager: () => pmRef.current,
  };
}

export default usePlatform;
