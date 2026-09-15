// Sincroniza o período global com a URL (?p=month|range|all&ym=...&from=...&to=...).
// URL manda no 1º carregamento; depois, mudanças no período reescrevem a URL (replace).
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePeriod } from '@apps/state';

export default function usePeriodUrl() {
  const { period, setPeriod } = usePeriod();
  const [params, setParams] = useSearchParams();

  // URL -> período (apenas no mount; URL tem prioridade sobre o meta local).
  useEffect(() => {
    const p = params.get('p');
    if (!p) return;
    if (p === 'all') setPeriod({ mode: 'all' });
    else if (p === 'month' && params.get('ym')) setPeriod({ mode: 'month', ym: params.get('ym') });
    else if (p === 'range' && params.get('from') && params.get('to')) setPeriod({ mode: 'range', from: params.get('from'), to: params.get('to') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Período -> URL.
  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set('p', period.mode);
    next.delete('ym');
    next.delete('from');
    next.delete('to');
    if (period.mode === 'month' && period.ym) next.set('ym', period.ym);
    if (period.mode === 'range') {
      if (period.from) next.set('from', period.from);
      if (period.to) next.set('to', period.to);
    }
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);
}
