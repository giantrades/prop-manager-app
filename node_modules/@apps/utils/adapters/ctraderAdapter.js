/**
 * cTraderAdapter — Adapter for cTrader Open API.
 * 
 * Architecture:
 *   cTrader uses WebSocket + JSON for real-time data.
 *   Authentication uses OAuth2 flow:
 *     1. User authorizes via cTrader OAuth page
 *     2. We get an access token
 *     3. We connect to WebSocket and authenticate
 *     4. We subscribe to account events
 * 
 * Since the full WebSocket implementation requires a backend proxy
 * (browsers can't directly connect to Protobuf WebSocket endpoints),
 * this adapter provides:
 *   - OAuth2 URL generation + token management
 *   - REST-style polling via a lightweight proxy/bridge
 *   - Same interface as BaseAdapter for seamless integration
 * 
 * For MVP: Uses a local bridge similar to Quantower (ctrader-bridge)
 * that handles the WebSocket ↔ HTTP translation.
 * 
 * Future: Can be upgraded to direct WebSocket once a backend is added.
 */

import { BaseAdapter } from './baseAdapter.js';

const DEFAULT_BRIDGE_URL = 'http://localhost:8788';

export class CTraderAdapter extends BaseAdapter {
  #bridgeUrl;
  #accessToken;
  #clientId;
  #clientSecret;
  #timeout;

  constructor(config = {}) {
    super({
      id: 'ctrader',
      name: 'cTrader',
      logoUrl: '/assets/logos/ctrader-mini.svg',
    });
    this.#bridgeUrl = config.bridgeUrl || DEFAULT_BRIDGE_URL;
    this.#accessToken = config.accessToken || null;
    this.#clientId = config.clientId || '';
    this.#clientSecret = config.clientSecret || '';
    this.#timeout = config.timeout || 5000;
  }

  /**
   * Set bridge URL at runtime.
   */
  setBridgeUrl(url) {
    this.#bridgeUrl = url;
  }

  /**
   * Set OAuth2 credentials.
   */
  setCredentials(clientId, clientSecret) {
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
  }

  /**
   * Set access token (after OAuth2 flow).
   */
  setAccessToken(token) {
    this.#accessToken = token;
  }

  /**
   * Generate OAuth2 authorization URL.
   * User visits this URL to authorize the app.
   */
  getAuthUrl(redirectUri = 'http://localhost:5174/oauth/ctrader') {
    const base = 'https://openapi.ctrader.com/apps/auth';
    const params = new URLSearchParams({
      client_id: this.#clientId,
      redirect_uri: redirectUri,
      scope: 'trading',
    });
    return `${base}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token.
   * This goes through the bridge since browsers can't make cross-origin token requests.
   */
  async exchangeCode(code, redirectUri = 'http://localhost:5174/oauth/ctrader') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeout);

    try {
      const res = await fetch(`${this.#bridgeUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          clientId: this.#clientId,
          clientSecret: this.#clientSecret,
          redirectUri,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
      const data = await res.json();
      this.#accessToken = data.accessToken;
      return data;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // ─── BaseAdapter Interface ───

  async getStatus() {
    try {
      const data = await this.#fetch('/status');
      return {
        online: data.online ?? true,
        version: data.version || '1.0',
        connections: data.connections || [],
        connectionsCount: data.connectionsCount || 0,
        accountsCount: data.accountsCount || 0,
        positionsCount: data.positionsCount || 0,
      };
    } catch (err) {
      return {
        online: false,
        error: err.name === 'AbortError' ? 'Connection timeout' : err.message,
      };
    }
  }

  async getAccounts() {
    const data = await this.#fetch('/accounts');
    return (data.accounts || []).map(acc => this.normalizeAccount(acc));
  }

  async getTrades(since = null) {
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    const data = await this.#fetch(`/trades${params}`);
    return (data.trades || []).map(t => this.normalizeTrade(t));
  }

  async getPositions() {
    const data = await this.#fetch('/positions');
    return (data.positions || []).map(p => this.normalizePosition(p));
  }

  async getOrders() {
    const data = await this.#fetch('/orders');
    return (data.orders || []).map(o => ({
      platformOrderId: `ct_${o.id || o.orderId}`,
      symbol: o.symbol || o.symbolName || '',
      side: o.tradeSide === 'BUY' ? 'Buy' : 'Sell',
      type: o.orderType || 'Limit',
      quantity: o.volume ? o.volume / 100 : 0, // cTrader volumes are in cents
      price: o.limitPrice || o.stopPrice || 0,
      status: o.status || 'pending',
      dateTime: o.createTimestamp ? new Date(o.createTimestamp).toISOString() : '',
    }));
  }

  // ─── Normalizers ───

  normalizeAccount(raw) {
    return {
      platformAccountId: `ct_${raw.ctidTraderAccountId || raw.accountId || raw.id}`,
      name: raw.brokerName
        ? `${raw.brokerName} #${raw.traderLogin || raw.accountNumber || ''}`
        : `cTrader #${raw.traderLogin || raw.accountNumber || raw.id}`,
      balance: raw.balance ? raw.balance / 100 : 0, // cTrader balances in cents
      equity: raw.equity ? raw.equity / 100 : 0,
      currency: raw.depositCurrency || 'USD',
      connectionName: raw.brokerName || 'cTrader',
      platformName: 'ctrader',
      isDemo: raw.isLive === false,
    };
  }

  normalizeTrade(raw) {
    return {
      platformTradeId: `ct_${raw.dealId || raw.positionId || raw.id}`,
      symbol: raw.symbolName || raw.symbol || '',
      side: raw.tradeSide === 'BUY' ? 'Buy' : 'Sell',
      quantity: raw.filledVolume ? raw.filledVolume / 100 : (raw.volume ? raw.volume / 100 : 0),
      price: raw.executionPrice || raw.entryPrice || 0,
      dateTime: raw.executionTimestamp
        ? new Date(raw.executionTimestamp).toISOString()
        : (raw.createTimestamp ? new Date(raw.createTimestamp).toISOString() : ''),
      netPnl: raw.pnlInPips != null ? raw.pnlInPips : (raw.netProfit || 0),
      grossPnl: raw.grossProfit || raw.pnl || 0,
      fee: raw.commission || raw.swap || 0,
      platformAccountId: `ct_${raw.ctidTraderAccountId || raw.traderAccountId || ''}`,
      platformName: 'ctrader',
      connectionName: raw.brokerName || 'cTrader',
    };
  }

  normalizePosition(raw) {
    return {
      platformPositionId: `ct_${raw.positionId || raw.id}`,
      symbol: raw.symbolName || raw.symbol || '',
      side: raw.tradeSide === 'BUY' ? 'Long' : 'Short',
      quantity: raw.volume ? raw.volume / 100 : 0,
      openPrice: raw.entryPrice || raw.price || 0,
      currentPrice: raw.currentPrice || raw.lastPrice || 0,
      openTime: raw.openTimestamp
        ? new Date(raw.openTimestamp).toISOString()
        : (raw.createTimestamp ? new Date(raw.createTimestamp).toISOString() : ''),
      netPnl: raw.pnlInDeposit ? raw.pnlInDeposit / 100 : (raw.netProfit || 0),
      grossPnl: raw.grossProfit || 0,
      fee: (raw.commission || 0) + (raw.swap || 0),
      platformAccountId: `ct_${raw.ctidTraderAccountId || raw.traderAccountId || ''}`,
      platformName: 'ctrader',
      connectionName: raw.brokerName || 'cTrader',
    };
  }

  // ─── Internal ───

  async #fetch(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeout);

    const headers = { 'Content-Type': 'application/json' };
    if (this.#accessToken) {
      headers['Authorization'] = `Bearer ${this.#accessToken}`;
    }

    try {
      const res = await fetch(`${this.#bridgeUrl}${path}`, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized — token expired or invalid');
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return res.json();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
}
