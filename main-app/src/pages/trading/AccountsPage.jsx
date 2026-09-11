// STAGE 7 — AccountsPage (engine-driven). Container que liga o editor de contas ao
// `DataService` (único writer). Salva Account + PropExtension. Nada de fórmula nova.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import { accountDashboard, computeAccountBalance, listFirms } from '@apps/lib/db';
import Accounts from '@apps/ui/Accounts';
import AccountDetail from '@apps/ui/AccountDetail';

const NEXT_PHASE = { challenge1: 'challenge2', challenge2: 'funded', funded: 'funded', paused: 'funded', failed: 'challenge1' };

export default function AccountsPage() {
  const finance = useFinance();
  const { loading, data, reload: load } = usePageData('accounts', async (f) => {
    const [a, p, txs, firms] = await Promise.all([
      f.ds.accounts.list(), f.ds.propExtensions.list(), f.ds.transactions.list(), listFirms(f.ds),
    ]);
    const balances = {};
    for (const acc of a) balances[acc.id] = computeAccountBalance(txs, acc.id);
    return {
      accounts: a,
      props: Object.fromEntries(p.map((x) => [x.accountId, x])),
      balances,
      firms,
    };
  });
  const accounts = data?.accounts ?? [];
  const props = data?.props ?? {};
  const balances = data?.balances ?? {};
  const firms = data?.firms ?? [];
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const handleSave = useCallback(async (account, prop) => {
    const f = financeRef.current;
    if (!f) return;
    const rec = { ...account, id: account.id || `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
    await f.ds.accounts.put(rec, { source: 'local' });
    if (rec.kind === 'prop' && prop) {
      const propRec = { ...prop, accountId: rec.id };
      await f.ds.propExtensions.put(propRec, { source: 'local' });
    } else if (rec.kind !== 'prop') {
      // Remove extensão prop órfã se a conta deixou de ser prop.
      const existing = await f.ds.propExtensions.byAccountId(rec.id);
      if (existing) await f.ds.propExtensions.remove(rec.id, { source: 'local' });
    }
    load();
  }, [load]);

  const handleDelete = useCallback(async (accountId) => {
    const f = financeRef.current;
    if (!f) return;
    await f.ds.accounts.remove(accountId);
    const prop = await f.ds.propExtensions.byAccountId(accountId);
    if (prop) await f.ds.propExtensions.remove(accountId);
    if (selectedId === accountId) setSelectedId(null);
    load();
  }, [load, selectedId]);

  // F1 — dashboard da conta selecionada.
  const loadDetail = useCallback(async (accountId) => {
    const f = financeRef.current;
    if (!f || !accountId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const [d, p] = await Promise.all([
        accountDashboard(f.ds, f.chain, accountId),
        f.ds.payouts.list(),
      ]);
      setDetail(d);
      setPayouts(p);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);
  useEffect(() => {
    if (!finance || !selectedId) return;
    const off = finance.ds.bus.on('datastore:change', () => loadDetail(selectedId));
    return off;
  }, [finance, selectedId, loadDetail]);

  // F4 — gerenciar: duplicar / fail / avançar fase / pausar-retomar.
  const handleDuplicate = useCallback(async (accountId) => {
    const f = financeRef.current;
    if (!f) return;
    const src = (await f.ds.accounts.list()).find((a) => a.id === accountId);
    if (!src) return;
    const rec = {
      ...src,
      id: `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${src.name} (cópia)`,
      platformAccountId: undefined,
      lastPlatformSync: undefined,
    };
    await f.ds.accounts.put(rec, { source: 'local' });
    if (src.kind === 'prop') {
      const p = await f.ds.propExtensions.byAccountId(accountId);
      if (p) await f.ds.propExtensions.put({ ...p, accountId: rec.id, phase: 'challenge1' }, { source: 'local' });
    }
    load();
  }, [load]);

  const handleSetPhase = useCallback(async (accountId, phase) => {
    const f = financeRef.current;
    if (!f) return;
    const p = await f.ds.propExtensions.byAccountId(accountId);
    if (!p) return;
    await f.ds.propExtensions.put({ ...p, phase }, { source: 'local' });
    load();
  }, [load]);

  const selected = accounts.find((a) => a.id === selectedId) || null;
  const firmById = Object.fromEntries(firms.map((f) => [f.id, f]));
  const statusById = {};
  for (const a of accounts) {
    const p = props[a.id];
    if (p) statusById[a.id] = p.phase === 'failed' ? 'STOP' : p.phase === 'funded' ? 'SAFE' : 'WARN';
  }

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Contas</h1>
      </div>
      <ModuleTabs module="contas" />

      <Accounts
        accounts={accounts}
        props={props}
        balances={balances}
        statusById={statusById}
        firms={firms}
        loading={loading}
        onSave={handleSave}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onSelect={setSelectedId}
      />

      {selected && (
        <div className="ac3-overlay" onClick={() => setSelectedId(null)}>
          <div
            className="ac3-sheet"
            style={{ maxWidth: 860 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Painel da conta ${selected.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ac3-sheet-head">
              <span className="ac3-sheet-title">
                {selected.name}
                {firmById[selected.firmId] && <span style={{ color: firmById[selected.firmId].color, marginLeft: 8, fontSize: 12 }}>● {firmById[selected.firmId].name}</span>}
              </span>
              <button className="ac3-icon" onClick={() => setSelectedId(null)} aria-label="Fechar">✕</button>
            </div>
            <div style={{ padding: '14px 18px 20px' }}>
              <AccountDetail
                account={selected}
                prop={props[selected.id] ?? null}
                dashboard={detail}
                payouts={payouts}
                loading={detailLoading}
                onBack={() => setSelectedId(null)}
              />
              <div className="ac3-form-actions" role="group" aria-label="Gerenciar conta" style={{ marginTop: 12, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <button className="ac3-btn ac3-btn-sm" onClick={() => handleDuplicate(selected.id)}>Duplicar</button>
                {props[selected.id] && (
                  <>
                    <button className="ac3-btn ac3-btn-sm" onClick={() => handleSetPhase(selected.id, NEXT_PHASE[props[selected.id].phase] ?? 'funded')}>Avançar fase</button>
                    <button className="ac3-btn ac3-btn-sm" onClick={() => handleSetPhase(selected.id, props[selected.id].phase === 'paused' ? 'funded' : 'paused')}>{props[selected.id].phase === 'paused' ? 'Retomar' : 'Pausar'}</button>
                    <button className="ac3-btn ac3-btn-sm ac3-btn-danger" onClick={() => handleSetPhase(selected.id, 'failed')}>Marcar failed</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
