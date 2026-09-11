// STAGE 7/8 — JournalPage (engine-driven). Aba Dashboard (equity/drawdown/métricas) +
// lista de trades + TradeForm. Persiste via `DataChainEngine.syncTrade` (ledger + equity)
// + `ds.trades.put`. NUNCA escreve saldo direto; nada de fórmula nova.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md + DOCS/08_STAGE7_INTEGRATION/00-plano.md (Fase 8).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import { PlaybookPanel } from './PlaybookPage';
import usePageData from '../../usePageData';
import { useFinance } from '@apps/state';
import { csvToTrades, isDayComplete, calendarPnl, symbolBreakdown, directionSplit, sessionAnalysis, rDistribution, durationStats } from '@apps/lib/db';
import Trades from '@apps/ui/Trades';
import TradeForm from '@apps/ui/TradeForm';
import JournalDashboard from '@apps/ui/JournalDashboard';
import PnLCalendar from '@apps/ui/PnLCalendar';
import HeatmapSection from '@apps/ui/HeatmapSection';
import BreakdownSection from '@apps/ui/BreakdownSection';
import HistogramR from '@apps/ui/HistogramR';
import DurationAnalysis from '@apps/ui/DurationAnalysis';
import WeeklyReview from '@apps/ui/WeeklyReview';
import { useToast } from '@apps/ui/Toast';

// A4 — detalhe inline dos trades de um dia (drill-down do calendário).
function DayTrades({ dateKey, trades, onClose, onEdit }) {
  const dayPnl = trades.reduce((s, t) => s + (t.resultNet ?? 0), 0);
  return (
    <div className="jd-day" role="region" aria-label={`Trades do dia ${dateKey}`}>
      <div className="jd-day-head">
        <span className="jd-day-title">
          {dateKey.slice(8, 10)}/{dateKey.slice(5, 7)} · {trades.length} trades ·{' '}
          <b style={{ color: dayPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {dayPnl >= 0 ? '+' : ''}{dayPnl.toFixed(2)}
          </b>
        </span>
        <button className="jd-tab" onClick={onClose} aria-label="Fechar detalhe do dia">Fechar ✕ (Esc)</button>
      </div>
      {trades.map((t) => (
        <div key={t.id} className="jd-day-row">
          <span className="jd-day-sym">{t.symbol} <span className={`tr-dir tr-${t.direction}`}>{t.direction}</span></span>
          <span className="jd-day-num" style={{ color: (t.resultNet ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {(t.resultNet ?? 0).toFixed(2)}
          </span>
          <span className="jd-day-num">{t.resultR != null ? `${Number(t.resultR).toFixed(2)}R` : '—'}</span>
          <button className="jd-tab" onClick={() => onEdit(t)}>Editar</button>
        </div>
      ))}
    </div>
  );
}

export default function JournalPage() {
  const finance = useFinance();
  const { toast } = useToast();
  // Cache SWR por rota: voltar p/ a aba não refaz skeleton.
  const { loading, data, reload: load } = usePageData('journal', async (f) => {
    const [t, a, ok, p] = await Promise.all([
      f.ds.trades.list(),
      f.ds.accounts.list(),
      isDayComplete(f.ds),
      f.ds.payouts.list(),
    ]);
    return {
      trades: t.sort((x, y) => (y.entryDatetime || '').localeCompare(x.entryDatetime || '')),
      accounts: a,
      checklistOk: ok,
      payouts: p,
    };
  });
  const trades = data?.trades ?? [];
  const accounts = data?.accounts ?? [];
  const payouts = data?.payouts ?? [];
  const [checklistBlocked, setChecklistBlocked] = useState(false);
  const checklistOk = checklistBlocked ? false : (data?.checklistOk ?? null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('review');
  // A7 — bucket do histograma com persistência.
  const [histBucket, setHistBucket] = useState(() => {
    const v = Number(localStorage.getItem('journalHistogramBucket'));
    return [0.25, 0.5, 1.0].includes(v) ? v : 0.5;
  });
  // A5 — filtros do dashboard (período + conta), com persistência.
  const [dashFilters, setDashFilters] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('journalDashboardFilters') || '{}');
      return {
        period: ['all', '7', '30', '90'].includes(raw.period) ? raw.period : 'all',
        accountId: typeof raw.accountId === 'string' ? raw.accountId : '',
      };
    } catch {
      return { period: 'all', accountId: '' };
    }
  });
  const setDashFilter = (k, v) => {
    setDashFilters((prev) => {
      const next = { ...prev, [k]: v };
      try {
        localStorage.setItem('journalDashboardFilters', JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };
  // A3 — sessões custom do heatmap (persistidas; default = padrão do motor).
  const [sessionDefs, setSessionDefs] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('journalSessions') || 'null');
      if (Array.isArray(raw) && raw.length > 0) return raw;
    } catch {
      /* noop */
    }
    return null;
  });
  const handleSessions = (defs) => {
    setSessionDefs(defs);
    try {
      localStorage.setItem('journalSessions', JSON.stringify(defs));
    } catch {
      /* noop */
    }
  };
  // A4 — drill-down do dia do calendário.
  const [selectedDay, setSelectedDay] = useState(null);
  const dayKeyOf = (t) => {
    const stamp = t.exitDatetime || t.entryDatetime;
    if (!stamp) return '';
    const d = new Date(stamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  useEffect(() => {
    if (!selectedDay) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedDay(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedDay]);

  const dashTrades = useMemo(() => {
    const days = dashFilters.period === 'all' ? 0 : Number(dashFilters.period);
    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
    return trades.filter((t) => {
      if (dashFilters.accountId) {
        const inAcct = t.accountId === dashFilters.accountId ||
          (t.accounts || []).some((a) => a.accountId === dashFilters.accountId);
        if (!inAcct) return false;
      }
      if (cutoff > 0) {
        const stamp = t.exitDatetime || t.entryDatetime;
        const ts = stamp ? new Date(stamp).getTime() : 0;
        if (!ts || ts < cutoff) return false;
      }
      return true;
    });
  }, [trades, dashFilters]);
  const handleHistBucket = (b) => {
    setHistBucket(b);
    try {
      localStorage.setItem('journalHistogramBucket', String(b));
    } catch {
      /* noop */
    }
  };
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
        setChecklistBlocked(true);
        toast('Checklist pré-trade incompleto — complete o checklist do dia para operar.', { type: 'warn' });
        return;
      }
      await f.ds.trades.put(trade, { source: 'local' });
      await f.chain.syncTrade(trade);
      setShowForm(false);
      setEditing(null);
      load();
    },
    [load],
  );

  const handleDelete = useCallback(
    async (tradeId) => {
      if (!financeRef.current) return;
      const f = financeRef.current;
      await f.chain.deleteTrade(tradeId);
      await f.ds.trades.remove(tradeId);
      load();
    },
    [load],
  );

  // J8 — Exportar análise (resumo do mês + breakdowns). Só formata; números vêm do motor.
  const handleExportAnalysis = useCallback(() => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const now = new Date();
    const cal = calendarPnl(trades, now.getFullYear(), now.getMonth() + 1);
    const syms = symbolBreakdown(trades);
    const dirs = directionSplit(trades);
    const sess = sessionAnalysis(trades);
    const rd = rDistribution(trades);
    const du = durationStats(trades);
    const L = [];
    L.push('# Resumo do mes');
    L.push(['mes', 'pnl', 'trades', 'wins', 'losses', 'melhorDia', 'piorDia'].join(','));
    L.push([[`${cal.year}-${String(cal.month).padStart(2, '0')}`, cal.monthPnl, cal.monthTrades, cal.monthWins, cal.monthLosses, cal.bestDay?.date ?? '', cal.worstDay?.date ?? ''].map(esc).join(',')].join('\n'));
    L.push('# Por simbolo');
    L.push(['symbol', 'trades', 'wins', 'losses', 'pnl', 'avgR', 'winrate', 'profitFactor', 'expectancy'].join(','));
    for (const r of syms) L.push([r.symbol, r.trades, r.wins, r.losses, r.pnl, r.avgR ?? '', r.winrate, r.profitFactor, r.expectancy].map(esc).join(','));
    L.push('# Long vs Short');
    L.push(['direcao', 'trades', 'wins', 'losses', 'pnl', 'avgR', 'winrate', 'profitFactor', 'expectancy'].join(','));
    for (const [k, s] of [['long', dirs.long], ['short', dirs.short]]) L.push([[k, s.trades, s.wins, s.losses, s.pnl, s.avgR ?? '', s.winrate, s.profitFactor, s.expectancy].map(esc).join(',')].join('\n'));
    L.push('# Por sessao (UTC)');
    L.push(['sessao', 'trades', 'wins', 'losses', 'pnl', 'winrate'].join(','));
    for (const s of sess) L.push([[s.label, s.trades, s.wins, s.losses, s.pnl, s.winrate].map(esc).join(',')].join('\n'));
    L.push('# Distribuicao R');
    L.push(['bucket', 'count'].join(','));
    for (const b of rd.buckets) L.push([[b.label, b.count].map(esc).join(',')].join('\n'));
    L.push(['# R stats', `n=${rd.count}`, `avg=${rd.avg ?? ''}`, `median=${rd.median ?? ''}`, `std=${rd.std ?? ''}`].join(','));
    L.push('# Duracao (min)');
    L.push([`n=${du.count}`, `media=${du.avgMin ?? ''}`, `mediana=${du.medianMin ?? ''}`, `min=${du.minMin ?? ''}`, `max=${du.maxMin ?? ''}`].join(','));
    const csv = `\uFEFF${L.join('\n')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analise-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trades]);

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
        <h1 className="cmd-page-title">Trading Journal</h1>
        <div className="cmd-actions">
          {!showForm && (
            <>
              <button className="cmd-refresh" onClick={() => csvRef.current?.click()}>Importar CSV</button>
              <button className="cmd-refresh" onClick={handleExport}>Exportar CSV</button>
              <button className="cmd-refresh" onClick={handleExportAnalysis}>Exportar análise</button>
              <button className="cmd-refresh no-print" onClick={() => window.print()}>Imprimir</button>
              <button className="cmd-refresh" onClick={() => setShowForm(true)}>+ Novo trade</button>
            </>
          )}
        </div>
        <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleImportCsv(e.target.files[0])} />
      </div>

      {checklistOk === false && !showForm && (
        <div className="cmd-warn" role="note">
          ⚠️ Checklist pré-trade incompleto — <Link to="/playbook">complete o checklist do dia</Link> para liberar novos trades.
        </div>
      )}

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
          <ModuleTabs module="trading" />
          <div className="jd-tabs" role="tablist" aria-label="Visão do Journal">
            <button className={`jd-tab${view === 'review' ? ' active' : ''}`} role="tab" aria-selected={view === 'review'} onClick={() => setView('review')}>Review</button>
            <button className={`jd-tab${view === 'trades' ? ' active' : ''}`} role="tab" aria-selected={view === 'trades'} onClick={() => setView('trades')}>Trades</button>
            <button className={`jd-tab${view === 'playbook' ? ' active' : ''}`} role="tab" aria-selected={view === 'playbook'} onClick={() => setView('playbook')}>Playbook</button>
          </div>
          {view === 'review' ? (
            <>
              <div className="jd-filters" role="group" aria-label="Filtros do review">
                <select className="jd-filter" value={dashFilters.period} onChange={(e) => setDashFilter('period', e.target.value)} aria-label="Período">
                  <option value="all">Todo o período</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="90">Últimos 90 dias</option>
                </select>
                <select className="jd-filter" value={dashFilters.accountId} onChange={(e) => setDashFilter('accountId', e.target.value)} aria-label="Conta">
                  <option value="">Todas as contas</option>
                  {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                </select>
                {(dashFilters.period !== 'all' || dashFilters.accountId) && (
                  <span className="jd-filter-count" aria-live="polite">{dashTrades.length} trades</span>
                )}
              </div>
              <HeatmapSection trades={dashTrades} sessionDefs={sessionDefs} onSessions={handleSessions} loading={loading} />
              <BreakdownSection trades={dashTrades} loading={loading} />
              <HistogramR trades={dashTrades} bucketSize={histBucket} onBucketSize={handleHistBucket} loading={loading} />
              <DurationAnalysis trades={dashTrades} loading={loading} />
              <WeeklyReview trades={dashTrades} loading={loading} />
            </>
          ) : view === 'trades' ? (
            <Trades
              trades={trades}
              accounts={accounts}
              loading={loading}
              onNew={() => setShowForm(true)}
              onEdit={(t) => { setEditing(t); setShowForm(true); }}
              onDelete={handleDelete}
            />
          ) : (
            <PlaybookPanel />
          )}
        </>
      )}
    </div>
  );
}

const JD_TABS_CSS = `
.jd-tabs { display: flex; gap: 6px; }
.jd-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.jd-filter { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 8px 10px; border-radius: 10px; font-size: 13px; min-height: 42px; }
.jd-filter-count { font-size: 12px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.jd-day { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.jd-day-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.jd-day-title { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.jd-day-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 10px; align-items: center; font-size: 12px; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; }
.jd-day-sym { font-weight: 700; }
.jd-day-num { font-variant-numeric: tabular-nums; font-weight: 600; }
.jd-tab { padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); font-size: 13px; cursor: pointer; font-weight: 600; }
.jd-tab.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); }
`;
if (typeof document !== 'undefined' && !document.getElementById('jd-tabs-styles')) {
  const style = document.createElement('style');
  style.id = 'jd-tabs-styles';
  style.textContent = JD_TABS_CSS;
  document.head.appendChild(style);
}
