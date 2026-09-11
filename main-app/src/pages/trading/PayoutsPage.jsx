// STAGE 7 — PayoutsPage (engine-driven). Container que liga o editor de payouts ao
// `DataService`/`DataChainEngine`. Cria Payout e o aplica no ledger (`applyPayout`).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import ModuleTabs from '../../ModuleTabs';
import Payouts from '@apps/ui/Payouts';

export default function PayoutsPage() {
  const finance = useFinance();
  const [payouts, setPayouts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const load = useCallback(async () => {
    if (!finance) return;
    setLoading(true);
    try {
      const [p, a] = await Promise.all([finance.ds.payouts.list(), finance.ds.accounts.list()]);
      setPayouts(p.sort((x, y) => (y.date || y.updatedAt || '').localeCompare(x.date || x.updatedAt || '')));
      setAccounts(a.filter((x) => x.kind === 'prop'));
    } finally {
      setLoading(false);
    }
  }, [finance]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', load);
    return off;
  }, [finance, load]);

  const handleCreate = useCallback(async (payout) => {
    const f = financeRef.current;
    if (!f) return;
    await f.ds.payouts.put(payout, { source: 'local' });
    await f.chain.applyPayout(payout);
    load();
  }, [load]);

  const handleDelete = useCallback(async (payoutId) => {
    const f = financeRef.current;
    if (!f) return;
    await f.ds.payouts.remove(payoutId);
    load();
  }, [load]);

  const visible = accountFilter
    ? payouts.filter((p) => (p.accountIds || []).includes(accountFilter))
    : payouts;

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Payouts</h1>
        <select
          className="cmd-select"
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          aria-label="Filtrar payouts por conta"
        >
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <ModuleTabs module="contas" />
      <Payouts payouts={visible} accounts={accounts} loading={loading} onCreate={handleCreate} onDelete={handleDelete} />
    </div>
  );
}
