// Sincroniza período + filtros globais com a URL.
// Params: ?p=month|range|all&ym=...&from=...&to=...&acct=<id>&strat=<id>
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePeriod } from '@apps/state';

export default function usePeriodUrl() {
  const { period, setPeriod, filters, setFilters } = usePeriod();
  const [params, setParams] = useSearchParams();

  // URL -> estado (apenas no mount; URL tem prioridade).
  useEffect(() => {
    const p = params.get('p');
    if (p) {
      if (p === 'all') setPeriod({ mode: 'all' });
      else if (p === 'month' && params.get('ym')) setPeriod({ mode: 'month', ym: params.get('ym') });
      else if (p === 'range' && params.get('from') && params.get('to')) setPeriod({ mode: 'range', from: params.get('from'), to: params.get('to') });
    }
    const acct = params.get('acct');
    const strat = params.get('strat');
    if (acct || strat) setFilters({ accountId: acct || '', strategyId: strat || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // período -> URL
  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set('p', period.mode);
    next.delete('ym'); next.delete('from'); next.delete('to');
    if (period.mode === 'month' && period.ym) next.set('ym', period.ym);
    if (period.mode === 'range') {
      if (period.from) next.set('from', period.from);
      if (period.to) next.set('to', period.to);
    }
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // filtros -> URL
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (filters.accountId) next.set('acct', filters.accountId); else next.delete('acct');
    if (filters.strategyId) next.set('strat', filters.strategyId); else next.delete('strat');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);
}
