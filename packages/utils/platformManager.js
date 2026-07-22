/**
 * PlatformManager — Orchestrates all platform adapters.
 * 
 * Responsibilities:
 *   - Register/unregister adapters
 *   - Periodic auto-sync (configurable interval, default 2s for live feel)
 *   - Aggregate data from all platforms
 *   - Dispatch global events on sync/connect/disconnect
 *   - Manage account mapping (platform account → internal account)
 *   - Deduplication of trades across syncs
 *   - Live position tracking with auto-close detection
 * 
 * Usage:
 *   import { PlatformManager } from '@apps/utils/platformManager';
 *   import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter';
 * 
 *   const pm = new PlatformManager();
 *   pm.registerAdapter(new QuantowerAdapter());
 *   pm.startAutoSync();
 */

import { QuantowerAdapter } from './adapters/quantowerAdapter.js';
import { CTraderAdapter } from './adapters/ctraderAdapter.js';
import {
  getTradeLedger,
  getTradeLedgerEntry,
  setTradeLedgerEntry,
  isTradeImported,
  markTradeDeleted,
  markTradeIgnored,
} from '@apps/lib/dataStore.js';

// ── Event names ────────────────────────────────────────
export const PLATFORM_EVENTS = {
  CONNECTED: 'platform:connected',
  DISCONNECTED: 'platform:disconnected',
  SYNCED: 'platform:synced',
  ERROR: 'platform:error',
  POSITION_OPENED: 'position:opened',
  POSITION_CLOSED: 'position:closed',
  POSITION_UPDATED: 'position:updated',
  ACCOUNTS_UPDATED: 'platform:accounts-updated',
};

// ── Default configuration ──────────────────────────────
const DEFAULT_CONFIG = {
  syncIntervalMs: 120000,       // 2min consistency sync for trades (reduced from 1h)
  positionPollMs: 1500,         // 1.5s for live positions
  statusCheckMs: 10000,         // 10s for connection status checks
  maxRetries: 3,
  retryDelayMs: 2000,
};

class PlatformManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    /** @type {Map<string, import('./adapters/baseAdapter.js').BaseAdapter>} */
    this.adapters = new Map();
    /** @type {Map<string, boolean>} platform id → was online last check */
    this._wasOnline = new Map();
    /** @type {Map<string, import('./adapters/baseAdapter.js').PlatformPosition[]>} */
    this._lastPositions = new Map();
    /** @type {Map<string, string>} platform id → last successful sync timestamp (ISO) */
    this._lastSyncTime = new Map();
    this._tradeLedgerLoaded = new Map(); // platform id → boolean

    this._syncInterval = null;
    this._positionInterval = null;
    this._statusInterval = null;
    this._visibilityHandler = null;
    this._listeners = new Map(); // event → Set<callback>
    this._isRunning = false;
  }

  // ── Adapter Registration ─────────────────────────────

  /**
   * Register a platform adapter.
   * @param {import('./adapters/baseAdapter.js').BaseAdapter} adapter
   */
  registerAdapter(adapter) {
    this.adapters.set(adapter.id, adapter);
    this._wasOnline.set(adapter.id, false);
    this._lastPositions.set(adapter.id, []);
    // Load trade ledger for this platform
    this._loadTradeLedger(adapter.id);
  }

  async _loadTradeLedger(platformId) {
    if (this._tradeLedgerLoaded.get(platformId)) return;
    try {
      const ledger = await getTradeLedger();
      // The ledger is global, we filter by platform when checking
      this._tradeLedgerLoaded.set(platformId, true);
    } catch (err) {
      console.warn(`[PlatformManager] Failed to load trade ledger for ${platformId}:`, err);
    }
  }

  /**
   * Unregister a platform adapter.
   * @param {string} platformId
   */
  unregisterAdapter(platformId) {
    this.adapters.delete(platformId);
    this._wasOnline.delete(platformId);
    this._lastPositions.delete(platformId);
    this._tradeLedgerLoaded.delete(platformId);
  }

  /**
   * Get a specific adapter.
   * @param {string} platformId
   * @returns {import('./adapters/baseAdapter.js').BaseAdapter|undefined}
   */
  getAdapter(platformId) {
    return this.adapters.get(platformId);
  }

  /** @returns {Array} All registered adapters */
  getAllAdapters() {
    return Array.from(this.adapters.values());
  }

  // ── Auto-Sync Control ────────────────────────────────

  /** Start periodic auto-sync for all adapters */
  startAutoSync() {
    if (this._isRunning) return;
    this._isRunning = true;

    // Status checks (connection online/offline)
    this._statusInterval = setInterval(
      () => this._checkAllStatuses(),
      this.config.statusCheckMs
    );

    // Trade sync — 1h consistency check for any trades that closeLivePosition missed
    this._syncInterval = setInterval(
      () => this._syncAllTrades(),
      this.config.syncIntervalMs
    );

    // Live positions (fast polling)
    this._positionInterval = setInterval(
      () => this._pollAllPositions(),
      this.config.positionPollMs
    );

    // Immediate first checks
    this._checkAllStatuses();
    this._syncAllTrades();
    this._pollAllPositions();
  }

  /** Stop all auto-sync */
  stopAutoSync() {
    this._isRunning = false;
    if (this._statusInterval) clearInterval(this._statusInterval);
    if (this._syncInterval) clearInterval(this._syncInterval);
    if (this._positionInterval) clearInterval(this._positionInterval);
    this._statusInterval = null;
    this._syncInterval = null;
    this._positionInterval = null;
  }

  /** @returns {boolean} Whether auto-sync is running */
  isRunning() {
    return this._isRunning;
  }



  // ── Manual Sync ──────────────────────────────────────

  /**
   * Manually trigger a full sync for a specific platform.
   * @param {string} platformId
   * @returns {Promise<{accounts, trades, positions}>}
   */
  async syncPlatform(platformId) {
    const adapter = this.adapters.get(platformId);
    if (!adapter) throw new Error(`Unknown platform: ${platformId}`);

    const from = this._lastSyncTime.get(platformId);
    const fromParam = from || new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const [accounts, trades, positions] = await Promise.all([
      adapter.getAccounts(),
      adapter.getTrades(fromParam, undefined),
      adapter.getPositions(),
    ]);

    // Safety net: skip entry fills (open positions with fake exit) BEFORE ledger
    const newTrades = [];
    for (const trade of trades) {
      if (trade.platformTradeId) {
        const entry = await getTradeLedgerEntry(trade.platformTradeId);
        if (entry && (entry.status === 'deleted' || entry.status === 'ignored')) continue;
      }
      // Skip trades that look like open-position fills: PnL=0 + no real exit
      const isEntryFill = trade.netPnl === 0 && (
        !trade.exitDateTime
        || trade.exitDateTime === trade.entryDateTime
        || !trade.exitPrice
      );
      if (isEntryFill) {
        console.log(`[syncPlatform] Skipping entry fill (open position): ${trade.platformTradeId}`);
        continue;
      }
      newTrades.push(trade);
    }

    // Only write to ledger for real (non-fake) trades
    for (const trade of newTrades) {
      if (trade.platformTradeId) {
        const existingEntry = await getTradeLedgerEntry(trade.platformTradeId);
        await setTradeLedgerEntry(trade.platformTradeId, {
          status: 'imported',
          platformAccountId: trade.platformAccountId,
          internalAccountId: trade.internalAccountId || null,
          firstSeenAt: existingEntry?.firstSeenAt || new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        });
      }
    }

    this._lastSyncTime.set(platformId, new Date().toISOString());

    this._emit(PLATFORM_EVENTS.SYNCED, {
      platformId,
      accounts,
      trades: newTrades,
      newTrades,   // alias so SYNCED handler picks it up
      positions,
      timestamp: new Date().toISOString(),
    });

    return { accounts, trades: newTrades, positions };
  }

  /**
   * Sync all platforms at once.
   * @returns {Promise<Map<string, {accounts, trades, positions}>>}
   */
  async syncAll() {
    const results = new Map();
    for (const [id, adapter] of this.adapters) {
      try {
        results.set(id, await this.syncPlatform(id));
      } catch (err) {
        this._emit(PLATFORM_EVENTS.ERROR, { platformId: id, error: err.message });
      }
    }
    return results;
  }

  // ── Data Access ──────────────────────────────────────

  /**
   * Get aggregated status of all platforms.
   * @returns {Promise<Object[]>}
   */
  async getAllStatuses() {
    const statuses = [];
    for (const [id, adapter] of this.adapters) {
      const status = await adapter.getStatus();
      statuses.push({ platformId: id, ...status });
    }
    return statuses;
  }

  /**
   * Get live positions from all platforms.
   * @returns {Promise<import('./adapters/baseAdapter.js').PlatformPosition[]>}
   */
  async getAllLivePositions() {
    const all = [];
    for (const [id, adapter] of this.adapters) {
      const positions = await adapter.getPositions();
      all.push(...positions.map(p => ({ ...p, platformId: id })));
    }
    return all;
  }

  /**
   * Get cached live positions (no fetch, instant).
   * @returns {import('./adapters/baseAdapter.js').PlatformPosition[]}
   */
  getCachedPositions() {
    const all = [];
    for (const [id, positions] of this._lastPositions) {
      all.push(...positions.map(p => ({ ...p, platformId: id })));
    }
    return all;
  }

  // ── Event System ─────────────────────────────────────

  /**
   * Subscribe to a platform event.
   * @param {string} event - One of PLATFORM_EVENTS
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // Also dispatch as DOM event for cross-component communication
    return () => this._listeners.get(event)?.delete(callback);
  }

  /** @private */
  _emit(event, data) {
    // Internal listeners
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        try { cb(data); } catch (e) { console.error(`[PlatformManager] listener error:`, e); }
      }
    }

    // DOM event for React components that listen globally
    try {
      window.dispatchEvent(new CustomEvent(event, { detail: data }));
    } catch { }
  }

  // ── Internal Sync Logic ──────────────────────────────

  /** @private Check connection status for all adapters */
  async _checkAllStatuses() {
    // Status check lock - prevent multiple tabs polling status simultaneously
    const lockKey = 'platform:statusLock';
    const now = Date.now();
    const lockTimeout = 3000;
    
    try {
      const existingLock = localStorage.getItem(lockKey);
      if (existingLock) {
        const lockTime = parseInt(existingLock, 10);
        if (now - lockTime < lockTimeout) return;
      }
      localStorage.setItem(lockKey, now.toString());
    } catch (e) {}

    try {
      for (const [id, adapter] of this.adapters) {
        try {
          const status = await adapter.getStatus();
          const wasOnline = this._wasOnline.get(id) || false;

          if (status.online && !wasOnline) {
            this._wasOnline.set(id, true);
            this._emit(PLATFORM_EVENTS.CONNECTED, {
              platformId: id,
              platformName: adapter.name,
              connections: status.connections,
            });
            // Sync trades on reconnect to catch any missed while offline
            this.syncPlatform(id).catch(() => {});
          } else if (!status.online && wasOnline) {
            this._wasOnline.set(id, false);
            this._emit(PLATFORM_EVENTS.DISCONNECTED, {
              platformId: id,
              platformName: adapter.name,
              error: status.error,
            });
          }
        } catch (err) {
          if (this._wasOnline.get(id)) {
            this._wasOnline.set(id, false);
            this._emit(PLATFORM_EVENTS.DISCONNECTED, {
              platformId: id,
              error: err.message,
            });
          }
        }
      }
    } finally {
      try { localStorage.removeItem(lockKey); } catch (e) {}
    }
  }

  /** @private Sync trades for all adapters */
  async _syncAllTrades() {
    const lockKey = 'platform:syncLock';
    const now = Date.now();
    const lockTimeout = 5000;
    
    try {
      const existingLock = localStorage.getItem(lockKey);
      if (existingLock) {
        const lockTime = parseInt(existingLock, 10);
        if (now - lockTime < lockTimeout) {
          return;
        }
      }
      localStorage.setItem(lockKey, now.toString());
    } catch (e) {}

    try {
      for (const [id, adapter] of this.adapters) {
        if (!this._wasOnline.get(id)) continue;

        try {
          const from = this._lastSyncTime.get(id);
          const fromParam = from || new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
          const [accounts, trades] = await Promise.all([
            adapter.getAccounts(),
            adapter.getTrades(fromParam),
          ]);

          const newTrades = [];
          for (const trade of trades) {
            if (trade.platformTradeId) {
              const entry = await getTradeLedgerEntry(trade.platformTradeId);
              // Bug #3 fix: only skip if explicitly deleted/ignored.
              // A stale 'imported' entry from a fake open-position trade should NOT
              // block the real trade from coming through on the next sync.
              if (entry && (entry.status === 'deleted' || entry.status === 'ignored')) continue;
            }
            // Safety net: skip entry fills (PnL = 0, no real exit data)
            const isEntryFill = trade.netPnl === 0 && (
              !trade.exitDateTime
              || trade.exitDateTime === trade.entryDateTime
              || !trade.exitPrice
            );
            if (isEntryFill) continue;
            newTrades.push(trade);
          }

          if (newTrades.length > 0) {
            for (const trade of newTrades) {
              if (trade.platformTradeId) {
                await setTradeLedgerEntry(trade.platformTradeId, {
                  status: 'imported',
                  platformAccountId: trade.platformAccountId,
                  internalAccountId: trade.internalAccountId || null,
                  firstSeenAt: new Date().toISOString(),
                  lastSeenAt: new Date().toISOString(),
                });
              }
            }

            this._emit(PLATFORM_EVENTS.SYNCED, {
              platformId: id,
              accounts,
              newTrades,
              totalTrades: trades.length,
              timestamp: new Date().toISOString(),
            });
          }
          this._lastSyncTime.set(id, new Date().toISOString());
        } catch (err) {
          this._emit(PLATFORM_EVENTS.ERROR, {
            platformId: id,
            error: err.message,
            phase: 'trades',
          });
        }
      }
    } finally {
      try {
        localStorage.removeItem(lockKey);
      } catch (e) {}
    }
  }

  async _fetchClosedTrade(platformId, pos) {
    // Aguarda 3s para o broker registrar o fill
    await new Promise(r => setTimeout(r, 3000));
    try {
      const adapter = this.adapters.get(platformId);
      if (!adapter) return null;
      // Busca trades desde início do dia (UTC) - fallback para pegar trades do dia
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const from = today.toISOString();
      const trades = await adapter.getTrades(from, undefined);
      // Extrai o raw positionId para matching
      const rawPosId = (pos.platformPositionId || '').replace(/^qt_pos_/, '');
      // Procura por platformTradeId correspondente
      const match = trades.find(t => {
        const rawTradeId = (t.platformTradeId || '').replace(/^qt_/, '');
        const isMatch = rawTradeId === rawPosId && t.netPnl !== 0 && t.exitPrice !== 0;
        if (rawTradeId === rawPosId) {
          console.log('[fetchClosedTrade] Found candidate trade:', { t, rawTradeId, rawPosId, isMatch });
        }
        return isMatch;
      });
      console.log('[fetchClosedTrade] Result match:', match);
      return match || null;
    } catch (err) {
      console.warn('[PlatformManager] _fetchClosedTrade failed:', err);
      return null;
    }
  }

  /** @private Poll positions for all adapters — detects opens and closes */
  async _pollAllPositions() {
    // Position poll lock - prevent multiple tabs polling positions simultaneously
    const lockKey = 'platform:positionLock';
    const now = Date.now();
    const lockTimeout = 2000;
    
    try {
      const existingLock = localStorage.getItem(lockKey);
      if (existingLock) {
        const lockTime = parseInt(existingLock, 10);
        if (now - lockTime < lockTimeout) return;
      }
      localStorage.setItem(lockKey, now.toString());
    } catch (e) {}

    try {
      for (const [id, adapter] of this.adapters) {
        if (!this._wasOnline.get(id)) continue;

        try {
          const currentPositions = await adapter.getPositions();
          const previousPositions = this._lastPositions.get(id) || [];

          const prevIds = new Set(previousPositions.map(p => p.platformPositionId));
          const currIds = new Set(currentPositions.map(p => p.platformPositionId));

          // Detect newly opened positions
          for (const pos of currentPositions) {
            if (!prevIds.has(pos.platformPositionId)) {
              this._emit(PLATFORM_EVENTS.POSITION_OPENED, {
                platformId: id,
                position: pos,
              });
            }
          }

          // Detect closed positions
          for (const pos of previousPositions) {
            if (!currIds.has(pos.platformPositionId)) {
              // Tentar buscar trade real antes de emitir POSITION_CLOSED com snapshot
              this._fetchClosedTrade(id, pos).then(realTrade => {
                this._emit(PLATFORM_EVENTS.POSITION_CLOSED, {
                  platformId: id,
                  position: realTrade
                    ? { ...pos, currentPrice: realTrade.exitPrice, netPnl: realTrade.netPnl, grossPnl: realTrade.grossPnl }
                    : pos,
                  realTrade: realTrade || null,
                });
              });
            }
          }

          // Always emit updated positions for live P&L refresh (even empty array to clear UI)
          this._emit(PLATFORM_EVENTS.POSITION_UPDATED, {
            platformId: id,
            positions: currentPositions,
          });

          this._lastPositions.set(id, currentPositions);
        } catch (err) {
          // Silent fail for position polling — don't spam errors
        }
      }
    } finally {
      try { localStorage.removeItem(lockKey); } catch (e) {}
    }
  }

  // ── Cleanup ──────────────────────────────────────────

  /** Dispose of all resources */
  destroy() {
    this.stopAutoSync();
    this.adapters.clear();
    this._listeners.clear();
    this._wasOnline.clear();
    this._lastPositions.clear();
    this._tradeLedgerLoaded.clear();
  }
}

// ── Singleton Factory ──────────────────────────────────
// Creates a pre-configured instance with Quantower adapter

let _instance = null;

/**
 * Get or create the global PlatformManager instance.
 * @param {Object} [config] - Override default config
 * @returns {PlatformManager}
 */
export function getPlatformManager(config) {
  if (!_instance) {
    _instance = new PlatformManager(config);
    // Register adapters by default
    _instance.registerAdapter(new QuantowerAdapter());
    // _instance.registerAdapter(new CTraderAdapter()); // Redundant since cTrader accounts are synced via Quantower
  }
  return _instance;
}

export { PlatformManager };
export default getPlatformManager;
