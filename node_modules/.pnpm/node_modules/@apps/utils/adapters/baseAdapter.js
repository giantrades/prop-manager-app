/**
 * BaseAdapter — Interface that all platform adapters must implement.
 * 
 * To add a new platform:
 *   1. Create a new file in adapters/ (e.g., ctraderAdapter.js)
 *   2. Extend BaseAdapter
 *   3. Implement all methods
 *   4. Register in PlatformManager
 * 
 * Every adapter normalizes platform-specific data into the common format
 * defined in this base class.
 */

// ── Common Data Shapes ─────────────────────────────────
// These are the normalized shapes that every adapter must return.

/**
 * @typedef {Object} PlatformAccount
 * @property {string}  platformAccountId  - Account ID from the platform
 * @property {string}  name               - Account display name
 * @property {number}  balance            - Current balance
 * @property {string}  currency           - Account currency (USD, EUR, etc.)
 * @property {string}  connectionId       - Platform connection ID
 * @property {string}  connectionName     - Connection name (Rithmic, DXFeed, etc.)
 */

/**
 * @typedef {Object} PlatformTrade
 * @property {string}  platformTradeId    - Trade ID from the platform
 * @property {string}  symbol             - Instrument symbol
 * @property {string}  side               - 'Buy' or 'Sell'
 * @property {number}  quantity           - Trade quantity/volume
 * @property {number}  price              - Execution price
 * @property {string}  dateTime           - ISO 8601 timestamp
 * @property {number}  grossPnl           - Gross P&L
 * @property {number}  netPnl             - Net P&L (after fees)
 * @property {number}  fee                - Total fees
 * @property {string}  orderId            - Related order ID
 * @property {string}  positionId         - Related position ID
 * @property {string}  platformAccountId  - Account ID from the platform
 * @property {string}  accountName        - Account display name
 * @property {string}  connectionId       - Platform connection ID
 * @property {string}  connectionName     - Connection name
 */

/**
 * @typedef {Object} PlatformPosition
 * @property {string}  platformPositionId - Position ID from the platform
 * @property {string}  symbol             - Instrument symbol
 * @property {string}  side               - 'Long' or 'Short'
 * @property {number}  quantity           - Position size
 * @property {number}  openPrice          - Entry price
 * @property {number}  currentPrice       - Current market price
 * @property {string}  openTime           - ISO 8601 timestamp
 * @property {number}  grossPnl           - Unrealized gross P&L
 * @property {number}  netPnl             - Unrealized net P&L
 * @property {number}  fee                - Accumulated fees
 * @property {string}  platformAccountId  - Account ID from the platform
 * @property {string}  accountName        - Account display name
 * @property {string}  connectionId       - Platform connection ID
 * @property {string}  connectionName     - Connection name
 * @property {boolean} isLive             - Always true for open positions
 */

/**
 * @typedef {Object} PlatformStatus
 * @property {boolean} online         - Whether the platform is reachable
 * @property {string}  version        - Bridge/API version
 * @property {string}  platform       - Platform identifier
 * @property {number}  accountsCount  - Number of accounts
 * @property {number}  positionsCount - Number of open positions
 * @property {number}  tradesCount    - Number of trades since login
 * @property {Array}   connections    - Active connections [{id, name}]
 */

export class BaseAdapter {
  /**
   * @param {Object} config
   * @param {string} config.id       - Platform identifier (e.g., 'quantower')
   * @param {string} config.name     - Display name (e.g., 'Quantower')
   * @param {string} config.logoUrl  - Path to mini logo image
   */
  constructor(config) {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is abstract — extend it');
    }
    this.id = config.id;
    this.name = config.name;
    this.logoUrl = config.logoUrl || null;
    this._lastError = null;
    this._lastSyncTime = null;
  }

  /** @returns {Promise<PlatformStatus>} */
  async getStatus() {
    throw new Error('getStatus() not implemented');
  }

  /** @returns {Promise<PlatformAccount[]>} */
  async getAccounts() {
    throw new Error('getAccounts() not implemented');
  }

  /**
   * @param {string} [from] - ISO 8601 date string
   * @param {string} [to]   - ISO 8601 date string
   * @returns {Promise<PlatformTrade[]>}
   */
  async getTrades(from, to) {
    throw new Error('getTrades() not implemented');
  }

  /** @returns {Promise<PlatformPosition[]>} */
  async getPositions() {
    throw new Error('getPositions() not implemented');
  }

  /** @returns {string|null} Last error message */
  getLastError() {
    return this._lastError;
  }

  /** @returns {string|null} ISO timestamp of last successful sync */
  getLastSyncTime() {
    return this._lastSyncTime;
  }

  /** Mark a successful sync */
  _markSynced() {
    this._lastSyncTime = new Date().toISOString();
    this._lastError = null;
  }

  /** Mark a failed sync */
  _markError(error) {
    this._lastError = error?.message || String(error);
  }
}

export default BaseAdapter;
