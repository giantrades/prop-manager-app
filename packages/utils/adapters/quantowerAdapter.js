import { BaseAdapter } from './baseAdapter.js';

const FALLBACK_URLS = [
  'http://localhost:8787',
  'http://100.80.100.89:8787',
];
const FETCH_TIMEOUT_MS = 5000;
const RETRY_DELAYS = [5000, 10000, 30000, 60000];

export class QuantowerAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      id: 'quantower',
      name: 'Quantower',
      logoUrl: '/assets/logos/quantower-mini.svg',
    });

    this.bridgeUrl = options.bridgeUrl || FALLBACK_URLS[0];
    this._retryCount = 0;
    this._retryTimer = null;
    this._lastWorkingUrl = null;
  }

  _getUrls(endpoint) {
    const primary = new URL(endpoint, this.bridgeUrl).toString();
    const seen = new Set([primary]);
    const urls = [primary];
    for (const base of FALLBACK_URLS) {
      const u = new URL(endpoint, base).toString();
      if (!seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
    return urls;
  }

  async _fetchSingle(url, controller, fetchOptions = {}) {
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', ...fetchOptions.headers },
        ...fetchOptions,
      });
      if (!res.ok) throw new Error(`Bridge returned ${res.status}: ${res.statusText}`);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async _fetch(endpoint, params = {}) {
    const urls = this._getUrls(endpoint);
    const qs = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    let lastErr;

    for (const url of urls) {
      const fullUrl = qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
      const controller = new AbortController();
      try {
        const data = await this._fetchSingle(fullUrl, controller);
        if (url !== this.bridgeUrl) this._lastWorkingUrl = url;
        this._retryCount = 0;
        this._cancelRetry();
        return data;
      } catch (err) {
        lastErr = err;
        if (err.name === 'AbortError') break;
      }
    }

    this._scheduleRetry();
    throw lastErr || new Error('Bridge offline');
  }

  async _fetchPost(endpoint, body) {
    const urls = this._getUrls(endpoint);
    let lastErr;

    for (const url of urls) {
      const controller = new AbortController();
      try {
        const data = await this._fetchSingle(url, controller, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (url !== this.bridgeUrl) this._lastWorkingUrl = url;
        this._retryCount = 0;
        this._cancelRetry();
        return data;
      } catch (err) {
        lastErr = err;
        if (err.name === 'AbortError') break;
      }
    }

    this._scheduleRetry();
    throw lastErr || new Error('Bridge offline');
  }

  _scheduleRetry() {
    this._cancelRetry();
    const delay = RETRY_DELAYS[Math.min(this._retryCount, RETRY_DELAYS.length - 1)];
    this._retryCount++;
    this._retryTimer = setTimeout(() => {
      this.getStatus().catch(() => {});
    }, delay);
  }

  _cancelRetry() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

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

  async getAccounts() {
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
  }

  async getTrades(from, to) {
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    if (!from && !to) params.from = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const data = await this._fetch('/trades', params);
    this._markSynced();
    return (data.trades || []).map(t => ({
      platformTradeId: `qt_${t.id}`,
      symbol: t.symbol || '',
      side: t.side || '',
      quantity: t.quantity ?? 0,
      entryPrice: t.entryPrice ?? 0,
      exitPrice: t.exitPrice ?? 0,
      entryDateTime: t.entryDateTime || null,
      exitDateTime: t.exitDateTime || null,
      grossPnl: t.grossPnl ?? 0,
      netPnl: t.netPnl ?? 0,
      fee: t.fee ?? 0,
      positionId: t.positionId || '',
      platformAccountId: t.accountId || '',
      accountName: t.accountName || '',
      connectionId: t.connectionId || '',
      connectionName: t.connectionName || '',
    }));
  }

  async getAllTrades() {
    return this.getTrades(undefined, undefined);
  }

  async getPositions() {
    const data = await this._fetch('/positions');
    this._markSynced();
    return (data.positions || []).map(p => {
      const side = ['long', 'buy'].includes((p.side || '').toLowerCase()) ? 'Long' : 'Short';
      return {
        platformPositionId: `qt_pos_${p.id}`,
        symbol: p.symbol || '',
        side,
        quantity: p.quantity ?? 0,
        openPrice: p.openPrice ?? 0,
        currentPrice: p.currentPrice ?? 0,
        openTime: p.openTime && !p.openTime.startsWith('0001') ? p.openTime : new Date().toISOString(),
        entryPrice: p.openPrice ?? 0,
        entryTime: p.openTime && !p.openTime.startsWith('0001') ? p.openTime : new Date().toISOString(),
        grossPnl: p.grossPnl ?? 0,
        netPnl: p.netPnl ?? 0,
        fee: p.fee ?? 0,
        platformAccountId: p.accountId || '',
        accountName: p.accountName || '',
        connectionId: p.connectionId || '',
        connectionName: p.connectionName || '',
        isLive: true,
      };
    });
  }

  async closePosition(position) {
    const rawId = (position.platformPositionId || '').replace(/^qt_pos_/, '');
    if (!rawId) throw new Error('Invalid position: missing platformPositionId');
    const result = await this._fetchPost('/positions/close', { id: rawId });
    if (!result.success) throw new Error(result.error || 'Failed to close position');
    return result;
  }

  setBridgeUrl(url) {
    this.bridgeUrl = url || FALLBACK_URLS[0];
    this._cancelRetry();
    this._retryCount = 0;
    this.getStatus().catch(() => {});
  }
}

export default QuantowerAdapter;
