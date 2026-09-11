// Payouts e Withdrawals (engine-driven). Cria Payout e aplica no ledger
// (`applyPayout`). A alocação (Tax→Living→Invest→Cash) é feita AQUI, inline — sem
// aba separada (antes era /payout-center). Ver DOCS/11_PAGE_MAP.md.

import React, { useCallback, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import Payouts from '@apps/ui/Payouts';
import PayoutCenter from '@apps/ui/PayoutCenter';
import { listFirms } from '@apps/lib/db';

export default function PayoutsPage() {
  const finance = useFinance();
  const { loading, data, reload: load } = usePageData('payouts', async (f) => {
    const [p, a, txs, firms] = await Promise.all([
      f.ds.payouts.list(), f.ds.accounts.list(), f.ds.transactions.list(), listFirms(f.ds),
    ]);
    return {
      payouts: p.sort((x, y) => (y.date || y.updatedAt || '').localeCompare(x.date || x.updatedAt || '')),
      accounts: a.filter((x) => x.kind === 'prop'),
      wallets: a.filter((x) => ['wallet', 'bank', 'cash', 'crypto'].includes(x.kind)),
      allocIds: txs.filter((t) => t.ref?.type === 'payoutId' && t.ref?.id).map((t) => t.ref.id),
      firms,
    };
  });
  const payouts = data?.payouts ?? [];
  const accounts = data?.accounts ?? [];
  const wallets = data?.wallets ?? [];
  const allocIds = data?.allocIds ?? [];
  const firms = data?.firms ?? [];
  const [accountFilter, setAccountFilter] = useState('');
  const [allocating, setAllocating] = useState(null);
  const [done, setDone] = useState(null);
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

  const handleAllocate = useCallback(async (plan) => {
    const f = financeRef.current;
    if (!f || !allocating) return;
    try {
      await f.money.applyPayoutAllocation(allocating, plan);
      setDone(`Alocação aplicada ao payout ${allocating.id.slice(0, 12)}.`);
      setAllocating(null);
      load();
      setTimeout(() => setDone(null), 4000);
    } catch (e) {
      setDone(`Falha ao alocar: ${e instanceof Error ? e.message : e}`);
    }
  }, [allocating, load]);

  const visible = accountFilter
    ? payouts.filter((p) => (p.accountIds || []).includes(accountFilter))
    : payouts;
  const pending = visible.filter((p) => !allocIds.includes(p.id));

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
      <ModuleTabs module="investimentos" />
      {done && <div className="cmd-msg" role="status">{done}</div>}

      <Payouts payouts={visible} accounts={accounts} firms={firms} loading={loading} onCreate={handleCreate} onDelete={handleDelete} />

      {/* Alocação inline dos payouts ainda não alocados. */}
      {pending.length > 0 && (
        <div className="dash-section">
          <div className="dash-title"><span>Alocar payout recebido</span></div>
          {pending.map((p) => (
            <div key={p.id} className="dash-row">
              <span className="dash-row-name">{p.net} {p.currency ?? 'USD'}</span>
              <span className="dash-row-sub">{String(p.date ?? '').slice(0, 10)} · {p.status ?? 'pendente'}</span>
              <button className="cmd-refresh" onClick={() => setAllocating(p)}>Alocar</button>
            </div>
          ))}
        </div>
      )}

      {allocating && (
        <div className="ac3-overlay" onClick={() => setAllocating(null)}>
          <div className="ac3-sheet" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-label="Alocar payout" onClick={(e) => e.stopPropagation()}>
            <div className="ac3-sheet-head">
              <span className="ac3-sheet-title">Alocar payout · {allocating.net} {allocating.currency ?? 'USD'}</span>
              <button className="ac3-icon" onClick={() => setAllocating(null)} aria-label="Fechar">✕</button>
            </div>
            <div style={{ padding: '14px 18px 20px' }}>
              <PayoutCenter
                payout={{ ...allocating, currency: allocating.currency ?? 'USD' }}
                wallets={wallets}
                onAllocate={handleAllocate}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
