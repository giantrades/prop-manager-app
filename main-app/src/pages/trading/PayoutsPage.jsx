// STAGE 7 — PayoutsPage (engine-driven). Container que liga o editor de payouts ao
// `DataService`/`DataChainEngine`. Cria Payout e o aplica no ledger (`applyPayout`).

import React, { useCallback, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import Payouts from '@apps/ui/Payouts';

export default function PayoutsPage() {
  const finance = useFinance();
  const { loading, data, reload: load } = usePageData('payouts', async (f) => {
    const [p, a] = await Promise.all([f.ds.payouts.list(), f.ds.accounts.list()]);
    return {
      payouts: p.sort((x, y) => (y.date || y.updatedAt || '').localeCompare(x.date || x.updatedAt || '')),
      accounts: a.filter((x) => x.kind === 'prop'),
    };
  });
  const payouts = data?.payouts ?? [];
  const accounts = data?.accounts ?? [];
  const [accountFilter, setAccountFilter] = useState('');
  const financeRef = useRef(finance);
  financeRef.current = finance;

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
        <h1 className="cmd-page-title">Payouts e Withdrawals</h1>
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
      <ModuleTabs module="dinheiro" />
      <Payouts payouts={visible} accounts={accounts} loading={loading} onCreate={handleCreate} onDelete={handleDelete} />
    </div>
  );
}
