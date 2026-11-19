// MARKET — hook de dados de mercado (SWR por chave + auto-refresh opcional).
// Fonte única de fetch: `fetchMarketQuotes` (motor). Todos os painéis do módulo
// compartilham a MESMA chave 'market' → 1 fetch (cacheado) para as 3 telas.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMarketQuotes } from '@apps/lib/db';

const cache = new Map();

export function readMarketCache(key) {
  return cache.get(key);
}

export default function useMarketData(key, symbols, opts = {}) {
  const { range = '5d', interval = '1d', autoRefreshMs = 0 } = opts;
  const [state, setState] = useState(() => {
    const hit = cache.get(key);
    if (hit) return { loading: false, error: null, ...hit };
    return { loading: true, quotes: null, failed: [], fromCache: [], at: null, error: null };
  });
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const run = useCallback(async (showLoading) => {
    if (showLoading) setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetchMarketQuotes(symbolsRef.current, { range, interval });
      const noData = res.quotes.size === 0 && res.failed.length > 0;
      const payload = {
        quotes: res.quotes,
        failed: res.failed,
        fromCache: res.fromCache,
        at: res.at,
        error: noData ? 'feed de mercado indisponível (proxy offline ou sem rede)' : null,
      };
      cache.set(key, payload);
      setState({ loading: false, ...payload });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[marketData]', err);
      setState((s) => ({ ...s, loading: false, error: err?.message || 'falha ao buscar mercado' }));
    }
  }, [key, range, interval]);

  useEffect(() => { run(!cache.has(key)); }, [run, key]);

  useEffect(() => {
    if (!autoRefreshMs) return undefined;
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') run(false);
    }, autoRefreshMs);
    return () => clearInterval(id);
  }, [run, autoRefreshMs]);

  const stale = !!(state.fromCache && state.fromCache.length > 0 && (!state.quotes || state.quotes.size <= state.fromCache.length));

  return { ...state, stale, reload: () => run(false) };
}
