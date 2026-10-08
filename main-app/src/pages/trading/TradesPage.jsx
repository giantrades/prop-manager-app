// Trades — lista/tabela de trades (movida do Journal para virar aba própria do módulo
// Trading, antes de Positions & Orders). Cadastro/edição via `TradeForm`, import/export
// CSV e exclusão em lote. Persiste via `DataChainEngine.syncTrade` (ledger + equity) +
// `ds.trades.put`. NUNCA escreve saldo direto; nada de fórmula nova.
//
// Fonte: DOCS/11_PAGE_MAP.md (módulo Trading).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import { useFinance } from '@apps/state';
import {
  csvToTrades, isDayComplete, listFirms, rememberDeletedTrades, tradeFingerprint,
} from '@apps/lib/db';
import Trades from '@apps/ui/Trades';
import TradeForm from '@apps/ui/TradeForm';
import { useToast } from '@apps/ui/Toast';

export default function TradesPage() {
  const finance = useFinance();
  const { toast } = useToast();
  // Cache SWR por rota: voltar p/ a aba não refaz skeleton.
  const { loading, data, reload: load } = usePageData('trades', async (f) => {
    const [t, a, firms] = await Promise.all([
      f.ds.trades.list(),
      f.ds.accounts.list(),
      listFirms(f.ds),
    ]);
    return {
      trades: t.sort((x, y) => (y.entryDatetime || '').localeCompare(x.entryDatetime || '')),
      accounts: a,
      firms,
    };
  });
  const trades = data?.trades ?? [];
  const accounts = data?.accounts ?? [];
  const firms = data?.firms ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const csvRef = useRef(null);
  const financeRef = useRef(finance);
  financeRef.current = finance;
  const [searchParams, setSearchParams] = useSearchParams();

  // UX foundation: "?new=1" (palette / atalho N) abre o form direto.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const strategies = useMemo(() => {
    const ids = [...new Set(trades.map((t) => t.strategyId).filter((s) => !!s))];
    return ids.map((id) => ({ id, name: id }));
  }, [trades]);

  const handleSubmit = useCallback(
    async (trade) => {
      if (!financeRef.current) return;
      const f = financeRef.current;
      if (!(await isDayComplete(f.ds))) {
        toast('Checklist pré-trade incompleto — complete o checklist do dia para operar.', { type: 'warn' });
        return;
      }
      await f.ds.trades.put(trade, { source: 'local' });
      await f.chain.syncTrade(trade);
      setShowForm(false);
      setEditing(null);
      load();
    },
    [load, toast],
  );

  // Lápide: ao excluir, grava id/impressão digital para o sync NÃO reimportar.
  const tombstone = useCallback(async (f, ids) => {
    const keys = [];
    for (const id of ids) {
      const t = trades.find((x) => x.id === id);
      if (!t) continue;
      if (t.quantowerId) keys.push(t.quantowerId);
      keys.push(tradeFingerprint(t));
    }
    if (keys.length) await rememberDeletedTrades(f.ds, keys);
  }, [trades]);

  const handleDelete = useCallback(
    async (tradeId) => {
      const f = financeRef.current;
      if (!f) return;
      await tombstone(f, [tradeId]);
      await f.chain.deleteTrade(tradeId);
      await f.ds.trades.remove(tradeId);
      load();
    },
    [load, tombstone],
  );

  // Exclusão em lote (seleção múltipla na tabela de trades).
  const handleDeleteMany = useCallback(
    async (tradeIds) => {
      const f = financeRef.current;
      if (!f || !Array.isArray(tradeIds) || tradeIds.length === 0) return;
      await tombstone(f, tradeIds);
      for (const id of tradeIds) {
        try {
          await f.chain.deleteTrade(id);
        } catch {
          /* trade já removido do ledger — segue */
        }
        await f.ds.trades.remove(id);
      }
      load();
    },
    [load, tombstone],
  );

  const handleExport = useCallback(() => {
    const header = ['symbol', 'direction', 'qty', 'entryPrice', 'exitPrice', 'entryDatetime', 'exitDatetime', 'resultNet', 'resultR', 'strategyId'];
    const rows = trades.map((t) => [
      t.symbol, t.direction, t.qty, t.entryPrice, t.exitPrice ?? '', t.entryDatetime, t.exitDatetime ?? '', t.resultNet ?? 0, t.resultR ?? '', t.strategyId ?? '',
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trades]);

  const handleImportCsv = useCallback(async (file) => {
    if (!financeRef.current) return;
    const f = financeRef.current;
    try {
      const text = await file.text();
      const parsed = csvToTrades(text, { defaultAccountId: accounts[0]?.id });
      let imported = 0;
      for (const { trade } of parsed) {
        await f.ds.trades.put(trade, { source: 'local' });
        await f.chain.syncTrade(trade);
        imported += 1;
      }
      toast(`Importados ${imported} trades do CSV.`);
      load();
    } catch (e) {
      toast(`Falha ao importar CSV: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    }
  }, [accounts, load, toast]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Trades</h1>
        <div className="cmd-actions">
          {!showForm && (
            <>
              <button className="cmd-refresh" onClick={() => csvRef.current?.click()}>Importar CSV</button>
              <button className="cmd-refresh" onClick={handleExport}>Exportar CSV</button>
              <button className="cmd-refresh no-print" onClick={() => window.print()}>Imprimir</button>
              <button className="cmd-refresh" onClick={() => setShowForm(true)}>+ Novo trade</button>
            </>
          )}
        </div>
        <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleImportCsv(e.target.files[0])} />
      </div>

      {showForm ? (
        <TradeForm
          trade={editing}
          accounts={accounts}
          strategies={strategies}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      ) : (
        <>
          <div className="tp-topbar">
            <ModuleTabs module="trading" />
          </div>
          <Trades
            trades={trades}
            accounts={accounts}
            firms={firms}
            loading={loading}
            onNew={() => setShowForm(true)}
            onDeleteMany={handleDeleteMany}
            onEdit={(t) => { setEditing(t); setShowForm(true); }}
            onDelete={handleDelete}
          />
        </>
      )}
    </div>
  );
}

const TRADES_PAGE_CSS = `
.tp-topbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tp-topbar .ws-tabs { margin: 0; flex: 0 1 auto; }
`;
if (typeof document !== 'undefined' && !document.getElementById('tp-styles')) {
  const style = document.createElement('style');
  style.id = 'tp-styles';
  style.textContent = TRADES_PAGE_CSS;
  document.head.appendChild(style);
}
