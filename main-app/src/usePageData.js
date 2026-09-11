// Cache stale-while-revalidate por chave de página. Ao voltar a uma aba/módulo,
// mostra o último dado imediatamente (sem skeleton) e revalida em background.
// A chave deve ser única por página (ex.: 'expenses', 'dash-contas').
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFinance } from '@apps/state';

const cache = new Map();

/** Lê o cache sem hook (útil p/ semear estado em containers manuais). */
export function readCache(key) {
  return cache.get(key);
}
export function writeCache(key, value) {
  cache.set(key, value);
}

export default function usePageData(key, loader) {
  const finance = useFinance();
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [state, setState] = useState(() => (cache.has(key)
    ? { loading: false, data: cache.get(key), error: null }
    : { loading: true, data: null, error: null }));

  const run = useCallback(async (showLoading) => {
    if (!finance) return;
    if (showLoading) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loaderRef.current(finance);
      cache.set(key, data);
      setState({ loading: false, data, error: null });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[pageData] ${key}`, err);
      setState((s) => ({ loading: false, data: s.data, error: err }));
    }
  }, [finance, key]);

  useEffect(() => { run(!cache.has(key)); }, [run, key]);

  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', () => run(false));
    return off;
  }, [finance, run]);

  return { ...state, finance, reload: () => run(false) };
}
