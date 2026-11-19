// FUNDAMENTOS — hook SWR por chave. O motor já faz cache/tolerância (nunca lança).
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFundamentals } from '@apps/lib/db';

const cache = new Map();

export default function useFundamentals(key, symbols, opts = {}) {
  const { autoRefreshMs = 0 } = opts;
  const [state, setState] = useState(() => {
    const hit = cache.get(key);
    if (hit) return { loading: false, ...hit };
    return { loading: true, result: null };
  });
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const run = useCallback(async (showLoading) => {
    if (showLoading) setState((s) => ({ ...s, loading: true }));
    const result = await fetchFundamentals(symbolsRef.current, opts);
    const payload = { result };
    cache.set(key, payload);
    setState({ loading: false, ...payload });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { run(!cache.has(key)); }, [run, key]);

  useEffect(() => {
    if (!autoRefreshMs) return undefined;
    const id = setInterval(() => run(false), autoRefreshMs);
    return () => clearInterval(id);
  }, [run, autoRefreshMs]);

  return { ...state, reload: () => run(false) };
}
