// P1 — priceService. fetch com mock: roteamento, parsing, cache offline, timeout.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeSymbol,
  routeSymbol,
  getQuote,
  refreshQuotes,
  getCached,
  clearPriceCache,
  clearPriceBackoff,
  getFiredAlerts,
  markAlertFired,
  rearmAlert,
  checkPriceAlerts,
  evalAlertsForPrice,
  PRICE_TIMEOUT_MS,
} from '../priceService';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';

function mockFetch(handler: (url: string) => unknown) {
  return (async (url: string) => ({
    ok: true,
    json: () => Promise.resolve(handler(url)),
  })) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
}

beforeEach(() => {
  clearPriceCache();
  clearPriceBackoff();
});

describe('priceService (P1)', () => {
  it('normaliza símbolo (upper, sem .SA)', () => {
    expect(normalizeSymbol('  petr4.sa ')).toBe('PETR4');
    expect(normalizeSymbol('btc/usdt')).toBe('BTC');
  });

  it('roteia: BTC->coingecko, PETR4->brapi', () => {
    expect(routeSymbol('BTC')).toMatchObject({ source: 'coingecko', query: 'bitcoin' });
    expect(routeSymbol('PETR4')).toMatchObject({ source: 'brapi', query: 'PETR4' });
    expect(routeSymbol('IVVB11')).toMatchObject({ source: 'brapi', query: 'IVVB11' });
  });

  it('parse Brapi: results[0].regularMarketPrice', async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toContain('brapi.dev/api/quote/PETR4');
      return { results: [{ regularMarketPrice: 42.1 }] };
    });
    const q = await getQuote('PETR4', { fetchImpl });
    expect(q).toMatchObject({ symbol: 'PETR4', price: 42.1, source: 'brapi' });
    expect(typeof q.at).toBe('string');
  });

  it('parse CoinGecko: [id].brl', async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toContain('coingecko');
      return { bitcoin: { brl: 350000 } };
    });
    const q = await getQuote('BTC', { fetchImpl });
    expect(q).toMatchObject({ symbol: 'BTC', price: 350000, source: 'coingecko' });
  });

  it('falha sem cache => relança erro', async () => {
    const fetchImpl = mockFetch(() => {
      throw new Error('rede off');
    });
    await expect(getQuote('PETR4', { fetchImpl })).rejects.toThrow();
  });

  it('falha COM cache => serve cache (offline/stale)', async () => {
    const ok = mockFetch(() => ({ results: [{ regularMarketPrice: 10 }] }));
    const first = await getQuote('PETR4', { fetchImpl: ok });
    const bad = mockFetch(() => {
      throw new Error('rede off');
    });
    const second = await getQuote('PETR4', { fetchImpl: bad });
    expect(second.price).toBe(10);
    expect(second.at).toBe(first.at);
    expect(getCached('PETR4')?.price).toBe(10);
  });

  it('timeout: fetch pendurado => aborta e cai no cache/erro', async () => {
    const hanging = (() => new Promise(() => {})) as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    await expect(getQuote('PETR4', { fetchImpl: hanging, timeoutMs: 20 })).rejects.toThrow();
  });

  it('refreshQuotes tolerante: um falha não derruba os outros', async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.includes('brapi')) return { results: [{ regularMarketPrice: 5 }] };
      throw new Error('cg off');
    });
    const r = await refreshQuotes(['PETR4', 'BTC'], { fetchImpl });
    expect(r.quotes.get('PETR4')?.price).toBe(5);
    expect(r.failed).toContain('BTC');
    expect(r.failed).not.toContain('PETR4');
  });

  it('PRICE_TIMEOUT_MS default é 8s', () => {
    expect(PRICE_TIMEOUT_MS).toBe(8000);
  });
});

describe('priceService A7 — token e backoff', () => {
  it('token vai na URL do Brapi (?token=)', async () => {
    let seenUrl = '';
    const fetchImpl = mockFetch((url: string) => {
      seenUrl = url;
      return { results: [{ regularMarketPrice: 1 }] };
    });
    await getQuote('PETR4', { fetchImpl, token: 'abc123' });
    expect(seenUrl).toContain('token=abc123');
  });

  it('falha entra em cooldown: 2º refresh imediato não chama a rede', async () => {
    let calls = 0;
    const ok = mockFetch(() => {
      calls += 1;
      return { results: [{ regularMarketPrice: 10 }] };
    });
    await getQuote('PETR4', { fetchImpl: ok });
    expect(calls).toBe(1);
    const bad = mockFetch(() => {
      calls += 1;
      throw new Error('rede off');
    });
    // falha 1: serve cache (não relança), entra em cooldown
    const served = await getQuote('PETR4', { fetchImpl: bad });
    expect(served.price).toBe(10);
    const before = calls;
    // refresh imediato: em cooldown, serve cache sem fetch
    const r = await refreshQuotes(['PETR4'], { fetchImpl: bad });
    expect(calls).toBe(before);
    expect(r.fromCache).toContain('PETR4');
    expect(r.failed).not.toContain('PETR4');
  });

  it('sem cache e em cooldown: conta como failed sem rede', async () => {
    let calls = 0;
    const bad = mockFetch(() => {
      calls += 1;
      throw new Error('rede off');
    });
    await expect(getQuote('VALE3', { fetchImpl: bad })).rejects.toThrow();
    expect(calls).toBe(1);
    const r = await refreshQuotes(['VALE3'], { fetchImpl: bad });
    expect(calls).toBe(1); // sem nova tentativa
    expect(r.failed).toContain('VALE3');
  });
});

describe('priceService A6 — Yahoo via proxy (ações US)', () => {
  it('roteia .US para yahoo (query sem sufixo)', () => {
    expect(routeSymbol('AAPL.US')).toMatchObject({ source: 'yahoo', query: 'AAPL' });
    expect(routeSymbol('aapl.us')).toMatchObject({ source: 'yahoo', query: 'AAPL' });
    expect(routeSymbol('PETR4')).toMatchObject({ source: 'brapi' });
  });

  it('parse do proxy: { price, currency } em USD', async () => {
    let seenUrl = '';
    const fetchImpl = mockFetch((url: string) => {
      seenUrl = url;
      return { symbol: 'AAPL', price: 232.5, currency: 'USD', at: '2026-09-09T12:00:00Z' };
    });
    const q = await getQuote('AAPL.US', { fetchImpl, proxyUrl: 'https://x/fn' });
    expect(seenUrl).toContain('symbol=AAPL');
    expect(q).toMatchObject({ price: 232.5, currency: 'USD', source: 'yahoo' });
  });

  it('proxy com erro => tenta cache, senão relança', async () => {
    const bad = mockFetch(() => ({ error: 'Yahoo HTTP 429' }));
    await expect(getQuote('MSFT.US', { fetchImpl: bad, proxyUrl: 'https://x/fn' })).rejects.toThrow();
  });
});

describe('priceService A2 — alertas de preço', () => {
  it('dispara above/below; ignora ids já disparados; ignora preço inválido', async () => {
    const positions = [
      { id: 'p1', symbol: 'PETR4', alerts: [{ id: 'a1', dir: 'above' as const, price: 40 }, { id: 'a2', dir: 'below' as const, price: 30 }] },
      { id: 'p2', symbol: 'VALE3', alerts: [{ id: 'a3', dir: 'above' as const, price: 100 }] },
    ];
    const quotes = new Map([['PETR4', 42], ['VALE3', 50]]);
    const hits = checkPriceAlerts(positions, quotes, []);
    expect(hits.map((h) => h.alertId)).toEqual(['a1']);
    // a1 já disparado => silêncio (anti-spam)
    expect(checkPriceAlerts(positions, quotes, ['a1'])).toEqual([]);
    // preço inválido nunca dispara
    expect(evalAlertsForPrice(positions[0], 0, [])).toEqual([]);
    expect(evalAlertsForPrice(positions[0], NaN, [])).toEqual([]);
  });

  it('fired persiste em meta; rearm libera de novo', async () => {
    const ds = new DataService({ adapter: new MemoryDbAdapter(createMemoryBackend()), deviceId: 'dev', bus: new EventBus(), channel: null });
    expect(await getFiredAlerts(ds)).toEqual([]);
    const hit = { positionId: 'p1', symbol: 'PETR4', alertId: 'a1', dir: 'above' as const, price: 40, current: 42 };
    await markAlertFired(ds, hit);
    await markAlertFired(ds, hit); // idempotente
    expect((await getFiredAlerts(ds)).map((f) => f.alertId)).toEqual(['a1']);
    await rearmAlert(ds, 'a1');
    expect(await getFiredAlerts(ds)).toEqual([]);
  });
});
