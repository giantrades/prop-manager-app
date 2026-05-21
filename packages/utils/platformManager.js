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
  syncIntervalMs: 2000,         // 2 seconds for near-live experience
  positionPollMs: 1500,         // 1.5s for live positions (even faster)
  statusCheckMs: 5000,          // 5s for connection status checks
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
    /** @type {Map<string, Set<string>>} platform id → set of known trade IDs */
    this._knownTradeIds = new Map();

    this._syncInterval = null;
    this._positionInterval = null;
    this._statusInterval = null;
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
    this._knownTradeIds.set(adapter.id, new Set());
  }

  /**
   * Unregister a platform adapter.
   * @param {string} platformId
   */
  unregisterAdapter(platformId) {
    this.adapters.delete(platformId);
    this._wasOnline.delete(platformId);
    this._lastPositions.delete(platformId);
    this._knownTradeIds.delete(platformId);
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

    // Trade sync (fetch new trades)
    this._syncInterval = setInterval(
      () => this._syncAllTrades(),
      this.config.syncIntervalMs
    );

    // Live positions (fast polling)
    this._positionInterval = setInterval(
      () => this._pollAllPositions(),
      this.config.positionPollMs
    );

    // Immediate first check
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

    const [accounts, trades, positions] = await Promise.all([
      adapter.getAccounts(),
      adapter.getTrades(),
      adapter.getPositions(),
    ]);

    this._emit(PLATFORM_EVENTS.SYNCED, {
      platformId,
      accounts,
      trades,
      positions,
      timestamp: new Date().toISOString(),
    });

    return { accounts, trades, positions };
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
  }

  /** @private Sync trades for all adapters */
  async _syncAllTrades() {
    for (const [id, adapter] of this.adapters) {
      if (!this._wasOnline.get(id)) continue;

      try {
        const trades = await adapter.getTrades();
        const knownIds = this._knownTradeIds.get(id);
        const newTrades = trades.filter(t => !knownIds.has(t.platformTradeId));

        if (newTrades.length > 0) {
          newTrades.forEach(t => knownIds.add(t.platformTradeId));

          this._emit(PLATFORM_EVENTS.SYNCED, {
            platformId: id,
            newTrades,
            totalTrades: trades.length,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        this._emit(PLATFORM_EVENTS.ERROR, {
          platformId: id,
          error: err.message,
          phase: 'trades',
        });
      }
    }
  }

  /** @private Poll positions for all adapters — detects opens and closes */
  async _pollAllPositions() {
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
            this._emit(PLATFORM_EVENTS.POSITION_CLOSED, {
              platformId: id,
              position: pos,
            });
          }
        }

        // Always emit updated positions for live P&L refresh
        if (currentPositions.length > 0) {
          this._emit(PLATFORM_EVENTS.POSITION_UPDATED, {
            platformId: id,
            positions: currentPositions,
          });
        }

        this._lastPositions.set(id, currentPositions);
      } catch (err) {
        // Silent fail for position polling — don't spam errors
      }
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
    this._knownTradeIds.clear();
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
