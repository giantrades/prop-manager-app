/**
 * QuantowerAdapter — Connects to the QuantowerBridge C# plugin
 * running inside Quantower desktop via HTTP on localhost.
 * 
 * The bridge exposes: /status, /accounts, /trades, /positions, /orders
 * This adapter normalizes all data into the common platform format.
 */

import { BaseAdapter } from './baseAdapter.js';

const DEFAULT_BRIDGE_URL = 'http://localhost:8787';
const FETCH_TIMEOUT_MS = 5000;

export class QuantowerAdapter extends BaseAdapter {
  /**
   * @param {Object} [options]
   * @param {string} [options.bridgeUrl] - Override the bridge URL
   */
  constructor(options = {}) {
    super({
      id: 'quantower',
      name: 'Quantower',
      logoUrl: '/assets/logos/quantower-mini.svg',
    });

    this.bridgeUrl = options.bridgeUrl || DEFAULT_BRIDGE_URL;
  }

  // ── Internal fetch with timeout + error handling ─────

  /**
   * @param {string} endpoint - e.g. '/status'
   * @param {Object} [params] - query params
   * @returns {Promise<Object>}
   */
  async _fetch(endpoint, params = {}) {
    const url = new URL(endpoint, this.bridgeUrl);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, v);
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Bridge returned ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Bridge timeout — is Quantower running?');
      }
      // Network error = bridge is not reachable
      if (err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('Failed')) {
        throw new Error('Bridge offline — start Quantower and run the BridgeStrategy');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Public API (implements BaseAdapter interface) ────

  /** @returns {Promise<import('./baseAdapter.js').PlatformStatus>} */
  async getStatus() {
    try {
      const data = await this._fetch('/status');
      this._markSynced();
      return {
        online: data.online === true,
        version: data.version || '?',
        platform: 'quantower',
        accountsCount: data.accountsCount || 0,
        positionsCount: data.positionsCount || 0,
        tradesCount: data.tradesCount || 0,
        connections: (data.connections || []).map(c => ({
          id: c.id,
          name: c.name,
        })),
      };
    } catch (err) {
      this._markError(err);
      return {
        online: false,
        version: null,
        platform: 'quantower',
        accountsCount: 0,
        positionsCount: 0,
        tradesCount: 0,
        connections: [],
        error: err.message,
      };
    }
  }

  /** @returns {Promise<import('./baseAdapter.js').PlatformAccount[]>} */
  async getAccounts() {
    try {
      const data = await this._fetch('/accounts');
      this._markSynced();
      return (data.accounts || []).map(acc => ({
        platformAccountId: acc.id,
        name: acc.name,
        balance: acc.balance ?? 0,
        currency: acc.currency || 'USD',
        connectionId: acc.connectionId || '',
        connectionName: acc.connectionName || '',
      }));
    } catch (err) {
      this._markError(err);
      throw err;
    }
  }

  /**
   * @param {string} [from] - ISO date
   * @param {string} [to]   - ISO date
   * @returns {Promise<import('./baseAdapter.js').PlatformTrade[]>}
   */
  async getTrades(from, to) {
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const data = await this._fetch('/trades', params);
      this._markSynced();
      return (data.trades || []).map(t => ({
        platformTradeId: `qt_${t.id}`,
        symbol: t.symbol || '',
        side: t.side || '',
        quantity: t.quantity ?? 0,
        price: t.price ?? 0,
        dateTime: t.dateTime || '',
        grossPnl: t.grossPnl ?? 0,
        netPnl: t.netPnl ?? 0,
        fee: t.fee ?? 0,
        orderId: t.orderId || '',
        positionId: t.positionId || '',
        platformAccountId: t.accountId || '',
        accountName: t.accountName || '',
        connectionId: t.connectionId || '',
        connectionName: t.connectionName || '',
      }));
    } catch (err) {
      this._markError(err);
      throw err;
    }
  }

  /**
   * Fetch ALL trades without date filter (for initial backfill)
   * @returns {Promise<import('./baseAdapter.js').PlatformTrade[]>}
   */
  async getAllTrades() {
    return this.getTrades(undefined, undefined);
  }

  /** @returns {Promise<import('./baseAdapter.js').PlatformPosition[]>} */
  async getPositions() {
    try {
      const data = await this._fetch('/positions');
      this._markSynced();
      return (data.positions || []).map(p => ({
        platformPositionId: `qt_pos_${p.id}`,
        symbol: p.symbol || '',
        side: p.side || '',
        quantity: p.quantity ?? 0,
        openPrice: p.openPrice ?? 0,
        currentPrice: p.currentPrice ?? 0,
        openTime: p.openTime || '',
        grossPnl: p.grossPnl ?? 0,
        netPnl: p.netPnl ?? 0,
        fee: p.fee ?? 0,
        platformAccountId: p.accountId || '',
        accountName: p.accountName || '',
        connectionId: p.connectionId || '',
        connectionName: p.connectionName || '',
        isLive: true,
      }));
    } catch (err) {
      this._markError(err);
      throw err;
    }
  }

  /**
   * Configure the bridge URL
   * @param {string} url
   */
  setBridgeUrl(url) {
    this.bridgeUrl = url || DEFAULT_BRIDGE_URL;
  }
}

export default QuantowerAdapter;
