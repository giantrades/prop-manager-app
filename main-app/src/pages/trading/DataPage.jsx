// STAGE 7 — DataPage. Importa os 2 payouts do app antigo para o `app-db v3`
// (importador opcional do PIVOT). Nada de trades/contas/goals antigos.

import React, { useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import { useFinance } from '@apps/state';
import { seedDemoData, clearDemoData, getDemoIds } from '@apps/lib/db';

export default function DataPage() {
  const finance = useFinance();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSeed = async () => {
    if (!finance) return;
    setBusy(true);
    setError(null);
    try {
      const count = await seedDemoData(finance.ds, finance.chain);
      setResult({ type: 'demo', count });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[seed] falha', err);
      setError('Falha ao criar dados demo.');
    } finally {
      setBusy(false);
    }
  };

  // Apaga SÓ os registros criados pelo seed (nunca toca nos seus dados reais).
  const handleClearDemo = async () => {
    if (!finance) return;
    setBusy(true);
    setError(null);
    try {
      const ids = await getDemoIds(finance.ds);
      if (!ids) {
        setResult({ type: 'clear', trades: 0, accounts: 0 });
        return;
      }
      const trades = ids.trades?.length ?? 0;
      const accounts = ids.accounts?.length ?? 0;
      await clearDemoData(finance.ds);
      setResult({ type: 'clear', trades, accounts });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[clear demo] falha', err);
      setError('Falha ao apagar dados demo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Dados Teste</h1></div>
      <ModuleTabs module="system" />
      <div className="dp-card">
        <div className="dp-title">Dados de demonstração</div>
        <p className="dp-desc">Popula o app com contas, trades, payout, goals e posições de exemplo. O demo <b>convive</b> com seus dados reais — apague quando quiser (nunca toca nos seus dados).</p>
        <div className="dp-row">
          <button className="dp-btn" onClick={handleSeed} disabled={busy || !finance}>
            {busy ? '…' : 'Criar dados demo'}
          </button>
          <button className="dp-btn dp-btn-danger" onClick={handleClearDemo} disabled={busy || !finance}>
            Apagar dados demo
          </button>
        </div>

        {result && (
          <div className="dp-result" role="status">
            {result.type === 'demo'
              ? <>Dados demo criados: <b>{result.count} trades</b> + contas/payout/goals/posições.</>
              : result.type === 'clear'
                ? (result.trades || result.accounts)
                  ? <>Dados demo apagados: <b>{result.trades} trades</b> · <b>{result.accounts} contas</b>.</>
                  : <>Não havia dados demo para apagar.</>
                : <>Payouts encontrados: <b>{result.found ?? '—'}</b> · Importados: <b>{result.count}</b> · Pulados: <b>{result.skipped}</b>.</>}
          </div>
        )}
        {error && <div className="dp-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}

const DP_CSS = `
.dp-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.dp-title { font-size: 15px; font-weight: 800; }
.dp-desc { font-size: 13px; color: var(--muted, #a1a7b3); }
.dp-btn { padding: 10px 18px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 42px; align-self: flex-start; }
.dp-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.dp-btn-danger { background: rgba(231,76,60,0.12); border-color: rgba(231,76,60,0.4); color: #ff8a7a; }
.dp-btn-danger:hover { background: rgba(231,76,60,0.2); }
.dp-row { display: flex; gap: 10px; flex-wrap: wrap; }
.dp-result { display: flex; flex-direction: column; gap: 6px; font-size: 13px; padding: 12px; border-radius: 10px; background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.2); }
.dp-sep { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }
.dp-error { padding: 10px 12px; border-radius: 10px; background: rgba(231,76,60,0.12); border: 1px solid rgba(231,76,60,0.3); color: var(--red, #e74c3c); font-size: 13px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('dp-styles')) {
  const style = document.createElement('style');
  style.id = 'dp-styles';
  style.textContent = DP_CSS;
  document.head.appendChild(style);
}
