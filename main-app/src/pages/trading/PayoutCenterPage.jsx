// STAGE 7 — PayoutCenterPage. Tela de alocação de payout (Tax→Living→Invest→Cash)
// usando o `PayoutCenter.tsx` + `MoneyService.applyPayoutAllocation`. O payout já foi
// aplicado no ledger (payout_in + fee) na criação; aqui distribui o net.

import React, { useCallback, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import PayoutCenter from '@apps/ui/PayoutCenter';

export default function PayoutCenterPage() {
  const finance = useFinance();
  const { loading, data, reload: load } = usePageData('payout-center', async (f) => {
    const [p, a, txs] = await Promise.all([f.ds.payouts.list(), f.ds.accounts.list(), f.ds.transactions.list()]);
    return {
      payouts: p.sort((x, y) => (y.date || y.updatedAt || '').localeCompare(x.date || x.updatedAt || '')),
      wallets: a.filter((x) => ['wallet', 'bank', 'cash', 'crypto'].includes(x.kind)),
      allocIds: txs.filter((t) => t.ref?.type === 'payoutId' && t.ref?.id).map((t) => t.ref.id),
    };
  });
  const payouts = data?.payouts ?? [];
  const wallets = data?.wallets ?? [];
  const allocIds = data?.allocIds ?? [];
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(null);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const handleAllocate = useCallback(async (plan) => {
    const f = financeRef.current;
    if (!f || !selected) return;
    try {
      await f.money.applyPayoutAllocation(selected, plan);
      setDone(`Alocação aplicada ao payout ${selected.id.slice(0, 12)}.`);
      setTimeout(() => setDone(null), 4000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[payout-center] falha ao alocar', err);
      setDone('Falha ao alocar payout.');
    }
  }, [selected]);

  if (loading) {
    return (
      <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Payout Center</h1></div>
      <ModuleTabs module="contas" />
        <div className="pcc-loading" role="status">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Payout Center</h1></div>
      <ModuleTabs module="contas" />
      {done && <div className="pcc-done" role="status">{done}</div>}

      {payouts.length === 0 ? (
        <div className="pcc-empty" role="status">Nenhum payout. Crie um em Payouts.</div>
      ) : (
        <div className="pcc-list">
          <span className="pcc-select-label" id="pcc-pending-label">Toque num payout pendente para alocar:</span>
          <div className="pcc-cards" role="group" aria-labelledby="pcc-pending-label">
            {payouts.filter((p) => !allocIds.includes(p.id)).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pcc-card${selected?.id === p.id ? ' active' : ''}`}
                onClick={() => setSelected(p)}
                aria-pressed={selected?.id === p.id}
              >
                <span className="pcc-card-net">{p.net} {p.currency ?? 'USD'}</span>
                <span className="pcc-card-meta">{String(p.date ?? '').slice(0, 10)} · {p.status ?? 'pendente'}</span>
              </button>
            ))}
            {payouts.every((p) => allocIds.includes(p.id)) && (
              <div className="pcc-empty" role="status">Todos alocados. Ver em Payouts.</div>
            )}
          </div>

          {selected && (
            <PayoutCenter
              key={selected.id}
              payout={{ ...selected, currency: selected.currency ?? 'USD' }}
              wallets={wallets}
              onAllocate={handleAllocate}
            />
          )}
        </div>
      )}
    </div>
  );
}

const PCC_CSS = `
.pcc-loading { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); }
.pcc-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
.pcc-list { display: flex; flex-direction: column; gap: 12px; }
.pcc-select-label { font-size: 12px; color: var(--muted, #a1a7b3); }
.pcc-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 719px) { .pcc-cards { grid-template-columns: 1fr; } }
.pcc-card { display: grid; gap: 4px; text-align: left; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 14px; padding: 12px; color: var(--text, #e7eaf0); cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.pcc-card.active { border-color: #2a3b6a; background: linear-gradient(180deg, #1e2740 0%, #161b2b 100%); }
.pcc-card-net { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pcc-card-meta { font-size: 11px; color: var(--muted, #a1a7b3); }
.pcc-select { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 42px; }
.pcc-done { padding: 12px; border-radius: 10px; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.25); color: var(--green, #2ecc71); font-size: 13px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('pcc-styles')) {
  const style = document.createElement('style');
  style.id = 'pcc-styles';
  style.textContent = PCC_CSS;
  document.head.appendChild(style);
}
