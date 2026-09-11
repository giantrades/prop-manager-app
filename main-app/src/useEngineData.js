// Hook de dados do motor para containers: carrega via loader e re-renderiza em
// qualquer escrita (`datastore:change`). O loader é lido por ref (evita refetch
// por função inline recriada). Usado por EngineViews e pelos dashboards de módulo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFinance } from '@apps/state';

export default function useEngineData(loader) {
  const finance = useFinance();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async () => {
    if (!finance) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loaderRef.current(finance);
      setState({ loading: false, data, error: null });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[engine] falha ao carregar', err);
      setState({ loading: false, data: null, error: err });
    }
  }, [finance]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', load);
    return off;
  }, [finance, load]);

  return { ...state, finance, reload: load };
}
