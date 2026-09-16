// Filtros globais — conta e estratégia. Lê as opções do motor (contas + estratégias dos trades)
// e escreve no estado global (sincroniza + URL). As páginas aplicam o filtro nos dados.
import React, { useEffect, useState } from 'react';
import { useFinance, usePeriod } from '@apps/state';

export default function GlobalFilters() {
  const finance = useFinance();
  const { filters, setFilters } = usePeriod();
  const [accounts, setAccounts] = useState([]);
  const [strategies, setStrategies] = useState([]);

  useEffect(() => {
    if (!finance) return undefined;
    let alive = true;
    (async () => {
      try {
        const [accs, trades] = await Promise.all([finance.ds.accounts.list(), finance.ds.trades.list()]);
        if (!alive) return;
        setAccounts(accs);
        setStrategies([...new Set(trades.map((t) => t.strategyId).filter(Boolean))].sort());
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [finance]);

  const set = (patch) => setFilters({ ...filters, ...patch });

  return (
    <div className="gf-root" role="group" aria-label="Filtros globais">
      <select className="gf-input" value={filters.accountId} onChange={(e) => set({ accountId: e.target.value })} aria-label="Filtrar por conta">
        <option value="">Todas as contas</option>
        {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
      </select>
      {strategies.length > 0 && (
        <select className="gf-input" value={filters.strategyId} onChange={(e) => set({ strategyId: e.target.value })} aria-label="Filtrar por estratégia">
          <option value="">Todas as estratégias</option>
          {strategies.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      )}
    </div>
  );
}

const GF_CSS = `
.gf-root { display: flex; gap: 8px; flex-wrap: wrap; }
.gf-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: var(--text, #e7eaf0); font-size: 12px; padding: 8px 10px; min-height: 38px; max-width: 200px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('gf-styles')) {
  const style = document.createElement('style');
  style.id = 'gf-styles';
  style.textContent = GF_CSS;
  document.head.appendChild(style);
}
