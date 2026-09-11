// STAGE 7 — PayoutCenterPage. Tela de alocação de payout (Tax→Living→Invest→Cash)
// usando o `PayoutCenter.tsx` + `MoneyService.applyPayoutAllocation`. O payout já foi
// aplicado no ledger (payout_in + fee) na criação; aqui distribui o net.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import PayoutCenter from '@apps/ui/PayoutCenter';

export default function PayoutCenterPage() {
  const finance = useFinance();
  const [payouts, setPayouts] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(null);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const load = useCallback(async () => {
    if (!finance) return;
    setLoading(true);
    try {
      const [p, a] = await Promise.all([finance.ds.payouts.list(), finance.ds.accounts.list()]);
      setPayouts(p.sort((x, y) => (y.date || y.updatedAt || '').localeCompare(x.date || x.updatedAt || '')));
      setWallets(a.filter((x) => ['wallet', 'bank', 'cash', 'crypto'].includes(x.kind)));
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
        <div className="pcc-loading" role="status">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Payout Center</h1></div>
      {done && <div className="pcc-done" role="status">{done}</div>}

      {payouts.length === 0 ? (
        <div className="pcc-empty" role="status">Nenhum payout. Crie um em Payouts.</div>
      ) : (
        <div className="pcc-list">
          <label className="pcc-select-label">Selecione um payout para alocar:</label>
          <select className="pcc-select" value={selected?.id ?? ''} onChange={(e) => setSelected(payouts.find((p) => p.id === e.target.value) || null)}>
            <option value="">—</option>
            {payouts.map((p) => (
              <option key={p.id} value={p.id}>Payout {p.id.slice(0, 12)} · net {p.net} ({p.status})</option>
            ))}
          </select>

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
.pcc-select { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 42px; }
.pcc-done { padding: 12px; border-radius: 10px; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.25); color: var(--green, #2ecc71); font-size: 13px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('pcc-styles')) {
  const style = document.createElement('style');
  style.id = 'pcc-styles';
  style.textContent = PCC_CSS;
  document.head.appendChild(style);
}
