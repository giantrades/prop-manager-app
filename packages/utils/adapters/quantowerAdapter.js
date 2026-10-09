import { BaseAdapter } from './baseAdapter.js';

// ── Configuração de URL ──────────────────────────────────────────────────────
// 04-BRIDGE_V2_SPEC.md: o default `bridgeUrl` NÃO passava pelo filtro isPageSecure.
// Em produção HTTPS sem `options.bridgeUrl`, a tentativa primária era bloqueada como
// mixed content e a lista de fallback (só http://) ficava vazia — o adapter nunca
// conectava, silenciosamente. Agora o default passa pelo MESMO filtro.
//
// Bridge alcançável de qualquer aparelho (Tailscale Funnel, HTTPS público). Serve de
// fallback seguro: em página HTTPS o navegador bloqueia http (mixed content) e, no
// celular, `http://127.0.0.1` aponta para o PRÓPRIO celular -> "Failed to fetch".
export const BRIDGE_HTTPS_URL = 'https://gian-note.tailbafabd.ts.net';
const FALLBACK_URLS = [
  'http://127.0.0.1:8787',
  'http://100.80.100.89:8787',
  BRIDGE_HTTPS_URL,
];
const isPageSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
// Aplica o filtro à lista toda (default + fallbacks) — nunca deixa http em https.
const SECURE_FALLBACKS = FALLBACK_URLS.filter((u) => u.startsWith('https://'));
const FILTERED_FALLBACKS = isPageSecure ? SECURE_FALLBACKS : FALLBACK_URLS;
const SECURE_DEFAULT = SECURE_FALLBACKS[0] || '';
// IP do Tailscale (http, só na tailnet) -> nome do Funnel (https público) em página segura.
const TAILSCALE_IP = '100.80.100.89';
const FUNNEL_HOST = (() => {
  try { return new URL(BRIDGE_HTTPS_URL).hostname; } catch { return ''; }
})();

/**
 * Normaliza a URL do bridge digitada pelo usuário:
 *  - sem esquema (`gian-note...ts.net`) vira `https://` em página segura (senão `http://`);
 *  - em página segura, o IP do Tailscale (ou o host do Funnel, com/sem porta) vira o
 *    próprio `BRIDGE_HTTPS_URL` (o IP não tem TLS e o Funnel é 443, não 8787);
 *  - loopback continua http (o browser trata como contexto seguro no PC).
 * Não converte `http://` genérico em `https://` (o host pode não ter TLS) — nesse caso
 * o adapter simplesmente ignora e usa o fallback seguro.
 */
export function normalizeBridgeUrl(raw, secure = isPageSecure) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  if (!/^[a-z]+:\/\//i.test(s)) s = `${secure ? 'https' : 'http'}://${s}`;
  let host = '';
  try { host = new URL(s).hostname; } catch { host = ''; }
  if (secure && (host === TAILSCALE_IP || (FUNNEL_HOST && host === FUNNEL_HOST))) return BRIDGE_HTTPS_URL;
  return s.replace(/\/+$/, '');
}

const FETCH_TIMEOUT_MS = 5000;
const RETRY_DELAYS = [5000, 10000, 30000, 60000];

/**
 * Normaliza data vinda do bridge. O bridge serializa `DateTime` com `ToString("O")`;
 * quando o Kind é Unspecified, a string vem SEM offset (ex.: "2026-09-18T01:00:00.000").
 * O JS leria isso como hora LOCAL → o trade "anda" o offset pra frente e pode cair no
 * dia seguinte (era o caso dos "trades de amanhã"). O bridge trabalha em UTC (query
 * From/To usa UtcNow), então sem offset assumimos UTC: acrescenta 'Z'.
 */
function normIso(v) {
  if (typeof v !== 'string' || !v) return null;
  const s = v.trim();
  if (!s || s.startsWith('0001')) return null; // DateTime.MinValue = sem data
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
  return hasTz ? s : `${s}Z`;
}

/**
 * Versão mínima do bridge que este adapter espera (handshake).
 * 04-BRIDGE_V2_SPEC.md: se o bridge reportar versão diferente, mostramos banner
 * "bridge desatualizada" em vez de chamar rotas de contrato desconhecido.
 */
export const EXPECTED_BRIDGE_VERSION = '2.1.0';

/**
 * Compara versões "x.y.z". Aceita a ponte igual OU MAIS NOVA que a esperada — antes o
 * check exigia igualdade exata e uma ponte atualizada (2.1.0) era acusada de
 * "desatualizada" com `vnull` (o erro não carregava a versão). Só é velha se for menor.
 */
export function versionAtLeast(actual, min) {
  const a = String(actual || '').split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(min || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export class QuantowerAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      id: 'quantower',
      name: 'Quantower',
      logoUrl: '/assets/logos/quantower-mini.svg',
    });

    // default passa pelo filtro (fix 04-BRIDGE_V2_SPEC.md) e é normalizado (esquema).
    const configured = normalizeBridgeUrl(options.bridgeUrl, isPageSecure);
    const defaultUrl = isPageSecure
      ? (configured.startsWith('https://') ? configured : '')
      : (configured || FALLBACK_URLS[0]);
    this.bridgeUrl = defaultUrl || (isPageSecure ? SECURE_DEFAULT : FALLBACK_URLS[0]);
    this.bridgeToken = options.bridgeToken || '';
    this._retryCount = 0;
    this._retryTimer = null;
    this._lastWorkingUrl = null;
    this._versionChecked = false;
  }

  _authHeaders() {
    const headers = { Accept: 'application/json' };
    if (this.bridgeToken) headers['X-Bridge-Token'] = this.bridgeToken;
    return headers;
  }

  _getUrls(endpoint) {
    const primary = new URL(endpoint, this.bridgeUrl).toString();
    const seen = new Set([primary]);
    const urls = [primary];
    for (const base of FILTERED_FALLBACKS) {
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
        ...fetchOptions,
        signal: controller.signal,
        // headers SEMPRE por último: o spread de fetchOptions (POST) traz
        // `Content-Type` e não pode sobrescrever o X-Bridge-Token.
        headers: { ...this._authHeaders(), ...fetchOptions.headers },
      });
      // 401 = token inválido/ausente — erro específico, não só "bridge offline".
      if (res.status === 401) {
        throw new BridgeAuthError('Token de bridge inválido ou ausente', 401);
      }
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
        if (err instanceof BridgeAuthError) break; // não adianta tentar outro URL
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
        if (err instanceof BridgeAuthError) break;
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

  /** Handshake de versão: a ponte pode ser IGUAL ou MAIS NOVA que a esperada. */
  _assertVersion(version) {
    if (this._versionChecked) return;
    this._versionChecked = true;
    if (version && !versionAtLeast(version, EXPECTED_BRIDGE_VERSION)) {
      const err = new BridgeVersionError(version);
      this._markError(err);
      throw err;
    }
  }

  async getStatus() {
    try {
      const data = await this._fetch('/status');
      this._assertVersion(data.version);
      this._markSynced();
      return {
        online: data.online === true,
        version: data.version || '?',
        build: data.build || null,
        platform: 'quantower',
        accountsCount: data.accountsCount || 0,
        positionsCount: data.positionsCount || 0,
        tradesCount: data.tradesCount || 0,
        connections: (data.connections || []).map((c) => ({
          id: c.id,
          name: c.name,
        })),
      };
    } catch (err) {
      this._markError(err);
      return {
        online: false,
        // Mostra a versão REAL quando o erro é de versão (antes vinha null → "vnull").
        version: err instanceof BridgeVersionError ? err.bridgeVersion : null,
        platform: 'quantower',
        accountsCount: 0,
        positionsCount: 0,
        tradesCount: 0,
        connections: [],
        error: err.message,
        code: err instanceof BridgeVersionError ? 'bridge_stale_version'
          : err instanceof BridgeAuthError ? 'auth_failed'
          : 'bridge_offline',
      };
    }
  }

  async getAccounts() {
    const data = await this._fetch('/accounts');
    this._markSynced();
    return (data.accounts || []).map((acc) => ({
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
    return (data.trades || []).map((t) => ({
      platformTradeId: t.platformTradeId || `qt_${t.id}`,
      symbol: t.symbol || '',
      side: ['short', 'sell'].includes((t.side || '').toLowerCase()) ? 'Short' : 'Long',
      quantity: t.quantity ?? 0,
      entryPrice: t.entryPrice ?? 0,
      exitPrice: t.exitPrice ?? 0,
      entryDateTime: normIso(t.entryDateTime),
      exitDateTime: normIso(t.exitDateTime),
      stopPrice: t.stopPrice ?? t.stopLoss ?? null,
      takePrice: t.takePrice ?? t.takeProfit ?? null,
      mae: t.mae ?? null,
      mfe: t.mfe ?? null,
      multiplier: t.multiplier ?? null,
      // Valor do ponto (contract size) inferido pelo bridge (dinheiro/pontos) — se vier,
      // é preferido na hora de calcular o R.
      contractSize: t.contractSize ?? null,
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
    return (data.positions || []).map((p) => {
      const side = ['long', 'buy'].includes((p.side || '').toLowerCase()) ? 'Long' : 'Short';
      return {
        platformPositionId: `qt_pos_${p.id}`,
        symbol: p.symbol || '',
        side,
        quantity: p.quantity ?? 0,
        openPrice: p.openPrice ?? 0,
        currentPrice: p.currentPrice ?? 0,
        // Se a plataforma não informa a abertura (vazio/`0001`), deixa VAZIO — a UI usa o
        // "primeiro visto" como fallback. Substituir por "agora" aqui fazia entrada e "agora"
        // colapsarem no mesmo ponto no mapa (a linha some e só fica a bolinha).
        openTime: p.openTime && !p.openTime.startsWith('0001') ? p.openTime : '',
        entryPrice: p.openPrice ?? 0,
        entryTime: p.openTime && !p.openTime.startsWith('0001') ? p.openTime : '',
        grossPnl: p.grossPnl ?? 0,
        netPnl: p.netPnl ?? 0,
        fee: p.fee ?? 0,
        sl: p.sl ?? p.stopLoss ?? null,
        tp: p.tp ?? p.takeProfit ?? null,
        // id bruto da posição na plataforma (usado para casar com ordens por positionId).
        positionId: p.id || '',
        platformAccountId: p.accountId || '',
        accountName: p.accountName || '',
        connectionId: p.connectionId || '',
        connectionName: p.connectionName || '',
        isLive: true,
      };
    });
  }

  /**
   * Normaliza uma ordem do bridge para o shape do app. Aceita tanto o payload CRU do
   * `/orders` (e do SSE) quanto um já normalizado (idempotente). É estático para o SSE
   * (que recebe o payload cru) usar a MESMA normalização do polling.
   */
  static normalizeOrder(o) {
    if (!o) return o;
    if (o.platformOrderId) return o; // já normalizado
    return {
      platformOrderId: `qt_ord_${o.id}`,
      symbol: o.symbol || '',
      side: ['short', 'sell'].includes(String(o.side || '').toLowerCase()) ? 'Short' : 'Long',
      quantity: o.quantity ?? 0,
      filledQuantity: o.filledQuantity ?? 0,
      remainingQuantity: o.remainingQuantity ?? 0,
      price: o.price ?? 0,
      type: o.orderTypeId || o.type || '',
      status: o.status || '',
      // Ordem pendente ligada a uma posição (SL/TP costumam vir assim na plataforma).
      positionId: o.positionId || '',
      platformAccountId: o.accountId || o.platformAccountId || '',
      accountName: o.accountName || '',
      connectionId: o.connectionId || '',
      connectionName: o.connectionName || '',
    };
  }

  async getOrders() {
    const data = await this._fetch('/orders');
    this._markSynced();
    return (data.orders || []).map((o) => QuantowerAdapter.normalizeOrder(o));
  }

  // ── Opções (F3) — DOCS/04_STAGE3_TRADING_OS/06-OPTIONS_BRIDGE_SPEC.md ──────

  /** Vencimentos disponíveis para um subjacente. */
  async getOptionExpiries(underlying) {
    const data = await this._fetch('/options/expiries', { underlying });
    return data.expiries || [];
  }

  /** Subjacentes que têm opções na plataforma (roots), com a contagem de contratos. */
  async getOptionUnderlyings() {
    const data = await this._fetch('/options/underlyings');
    return data.underlyings || [];
  }

  /** Cadeia de um vencimento (quotes + gregas + IV). Retorna o payload cru p/ normalizar. */
  async getOptionChain(underlying, expiry, depth = 15) {
    const data = await this._fetch('/options/chain', { underlying, expiry, depth });
    return data;
  }

  /** Posições de opções (pernas) abertas na plataforma. */
  async getOptionPositions() {
    const data = await this._fetch('/options/positions');
    return data.positions || [];
  }

  // ── v2: escrita com clientOrderId idempotente ─────────────────────────────

  /** Gera um clientOrderId (UUID) para idempotência. */
  static newClientOrderId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `coid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Abre posição. `clientOrderId` (UUID) garante idempotência: reenvio do mesmo
   * clientOrderId retorna a mesma resposta sem segunda ordem no Quantower.
   */
  async openPosition({ accountId, symbol, side, qty, sl, tp, note, clientOrderId }) {
    const body = {
      accountId,
      symbol,
      side: side === 'short' || side === 'sell' ? 'sell' : 'buy',
      qty,
      sl: sl ?? null,
      tp: tp ?? null,
      note: note ?? null,
      clientOrderId: clientOrderId || QuantowerAdapter.newClientOrderId(),
    };
    const result = await this._fetchPost('/positions/open', body);
    this._assertNotQueued(result);
    if (!result.success) throw new BridgeApiError(result.error, result);
    this._markSynced();
    return result;
  }

  /** Edita SL/TP de posição aberta. `platformPositionId` (sem prefixo `qt_pos_`). */
  async modifyPosition({ platformPositionId, sl, tp, clientOrderId }) {
    const rawId = (platformPositionId || '').replace(/^qt_pos_/, '');
    if (!rawId) throw new Error('Invalid position: missing platformPositionId');
    const body = {
      platformPositionId: rawId,
      sl: sl ?? null,
      tp: tp ?? null,
      clientOrderId: clientOrderId || QuantowerAdapter.newClientOrderId(),
    };
    const result = await this._fetchPost('/positions/modify', body);
    this._assertNotQueued(result);
    if (!result.success) throw new BridgeApiError(result.error, result);
    this._markSynced();
    return result;
  }

  /** Coloca ordem (limit/stop). `type` = 'limit' | 'stop'. */
  async placeOrder({ accountId, symbol, side, qty, type, price, sl, tp, clientOrderId }) {
    const body = {
      accountId,
      symbol,
      side: side === 'short' || side === 'sell' ? 'sell' : 'buy',
      qty,
      type,
      price,
      sl: sl ?? null,
      tp: tp ?? null,
      clientOrderId: clientOrderId || QuantowerAdapter.newClientOrderId(),
    };
    const result = await this._fetchPost('/orders/place', body);
    this._assertNotQueued(result);
    if (!result.success) throw new BridgeApiError(result.error, result);
    this._markSynced();
    return result;
  }

  /** Cancela ordem pendente. */
  async cancelOrder({ platformOrderId, clientOrderId }) {
    const rawId = (platformOrderId || '').replace(/^qt_ord_/, '');
    if (!rawId) throw new Error('Invalid order: missing platformOrderId');
    const body = {
      platformOrderId: rawId,
      clientOrderId: clientOrderId || QuantowerAdapter.newClientOrderId(),
    };
    const result = await this._fetchPost('/orders/cancel', body);
    this._assertNotQueued(result);
    if (!result.success) throw new BridgeApiError(result.error, result);
    this._markSynced();
    return result;
  }

  async closePosition(position, clientOrderId) {
    const rawId = (position.platformPositionId || '').replace(/^qt_pos_/, '');
    if (!rawId) throw new Error('Invalid position: missing platformPositionId');
    const result = await this._fetchPost('/positions/close', {
      id: rawId,
      // clientOrderId estável permite replay idempotente da fila offline (app layer).
      clientOrderId: clientOrderId || QuantowerAdapter.newClientOrderId(),
    });
    this._assertNotQueued(result);
    if (!result.success) throw new BridgeApiError(result.error, result);
    this._markSynced();
    return result;
  }

  /** Se o SW colocou a escrita na fila (offline), lança erro honesto (não sucesso). */
  _assertNotQueued(result) {
    if (result && result.queued === true) {
      throw new BridgeQueuedError(result.error?.message || 'Operação na fila (bridge offline)');
    }
  }

  /** URL base que está funcionando (fallback) ou a configurada — p/ SSE e diagnósticos. */
  getBridgeBase() {
    return this._lastWorkingUrl || this.bridgeUrl;
  }

  setBridgeUrl(url) {
    // normaliza + aplica o mesmo filtro de segurança ao setar manualmente
    const norm = normalizeBridgeUrl(url, isPageSecure);
    this.bridgeUrl = norm || (isPageSecure ? SECURE_DEFAULT : FALLBACK_URLS[0]);
    this._cancelRetry();
    this._retryCount = 0;
    this._versionChecked = false;
    this.getStatus().catch(() => {});
  }

  setBridgeToken(token) {
    this.bridgeToken = token || '';
    this._versionChecked = false;
    this.getStatus().catch(() => {});
  }
}

// ── Erros tipados (contrato de erro do bridge) ──────────────────────────────
export class BridgeAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'BridgeAuthError';
    this.code = 'auth_failed';
    this.status = status;
  }
}

export class BridgeVersionError extends Error {
  constructor(version) {
    super(`Bridge desatualizada: versão ${version} (esperado ${EXPECTED_BRIDGE_VERSION})`);
    this.name = 'BridgeVersionError';
    this.code = 'bridge_stale_version';
    this.bridgeVersion = version;
  }
}

export class BridgeApiError extends Error {
  constructor(errorPayload, response) {
    const payload = errorPayload?.error || errorPayload;
    super(payload?.message || (typeof payload === 'string' ? payload : 'Erro do bridge'));
    this.name = 'BridgeApiError';
    this.code = payload?.code || (typeof payload === 'string' ? 'unknown' : payload?.code || 'unknown');
    this.retryable = payload?.retryable ?? false;
    this.response = response;
  }
}

export class BridgeQueuedError extends Error {
  constructor(message = 'Operação na fila (bridge offline)') {
    super(message);
    this.name = 'BridgeQueuedError';
    this.code = 'bridge_offline';
    this.retryable = true;
    this.queued = true;
  }
}

export default QuantowerAdapter;
