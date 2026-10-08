// STAGE 7/8 — JournalPage (engine-driven). Modos internos Review (heatmaps/breakdowns/
// distribuição de R/duração/review semanal) + Playbook. A lista/tabela de trades agora
// vive na aba própria `Trades` (`/trades`), antes de Positions & Orders.
// Só leitura/analytics aqui; NUNCA escreve saldo direto; nada de fórmula nova.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md + DOCS/08_STAGE7_INTEGRATION/00-plano.md (Fase 8).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import AccountPicker from '../../AccountPicker';
import PeriodPicker from '@apps/ui/PeriodPicker';
import { PlaybookPanel } from './PlaybookPage';
import usePageData from '../../usePageData';
import { useFinance } from '@apps/state';
import {
  calendarPnl, symbolBreakdown, directionSplit, sessionAnalysis,
  rDistribution, durationStats,
  fetchEconomicEvents, monthRange,
} from '@apps/lib/db';
import HeatmapSection from '@apps/ui/HeatmapSection';
import BreakdownSection from '@apps/ui/BreakdownSection';
import HistogramR from '@apps/ui/HistogramR';
import DurationAnalysis from '@apps/ui/DurationAnalysis';
import WeeklyReview from '@apps/ui/WeeklyReview';

export default function JournalPage() {
  const finance = useFinance();
  // Cache SWR por rota: voltar p/ a aba não refaz skeleton.
  const { loading, data } = usePageData('journal', async (f) => {
    const t = await f.ds.trades.list();
    return { trades: t.sort((x, y) => (y.entryDatetime || '').localeCompare(x.entryDatetime || '')) };
  });
  const trades = data?.trades ?? [];
  const [view, setView] = useState('review');
  // A7 — bucket do histograma com persistência.
  const [histBucket, setHistBucket] = useState(() => {
    const v = Number(localStorage.getItem('journalHistogramBucket'));
    return [0.25, 0.5, 1.0].includes(v) ? v : 0.5;
  });
  // A5 — filtros do dashboard: período (PeriodPicker) + contas (AccountPicker, multi),
  // com persistência. Layout igual ao Resumo do Trading.
  const [periodFilter, setPeriodFilter] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('journalDashboardFilters') || '{}');
      if (raw.period && typeof raw.period === 'object') return raw.period;
    } catch {
      /* noop */
    }
    return { mode: 'all' };
  });
  const [acctFilter, setAcctFilter] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('journalDashboardFilters') || '{}');
      if (Array.isArray(raw.accountIds)) return raw.accountIds;
      if (typeof raw.accountId === 'string' && raw.accountId) return [raw.accountId];
    } catch {
      /* noop */
    }
    return [];
  });
  useEffect(() => {
    try {
      localStorage.setItem('journalDashboardFilters', JSON.stringify({ period: periodFilter, accountIds: acctFilter }));
    } catch {
      /* noop */
    }
  }, [periodFilter, acctFilter]);
  // A3 — sessões custom do heatmap. Fonte da verdade: `meta` (`journal:sessions`, sincroniza
  // entre aparelhos); localStorage é só cache do 1º paint. Default = sessões de mercado.
  const [sessionDefs, setSessionDefs] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('journalSessions') || 'null');
      if (Array.isArray(raw) && raw.length > 0) return raw;
    } catch {
      /* noop */
    }
    return null;
  });
  useEffect(() => {
    if (!finance?.ds) return undefined;
    let alive = true;
    (async () => {
      try {
        const rec = await finance.ds.meta.getKey('journal:sessions');
        const v = rec?.value;
        if (alive && Array.isArray(v) && v.length > 0) {
          setSessionDefs(v);
          try { localStorage.setItem('journalSessions', JSON.stringify(v)); } catch { /* noop */ }
        }
      } catch {
        /* sem meta ainda = usa cache local */
      }
    })();
    return () => { alive = false; };
  }, [finance]);
  const handleSessions = (defs) => {
    // `null` = limpar custom → volta às sessões reais de mercado (DST-exato).
    const clean = defs && defs.length > 0 ? defs : null;
    setSessionDefs(clean);
    try {
      if (clean) localStorage.setItem('journalSessions', JSON.stringify(clean));
      else localStorage.removeItem('journalSessions');
    } catch {
      /* noop */
    }
    try {
      finance?.ds?.meta?.setKey('journal:sessions', clean ?? []);
    } catch {
      /* noop: próximo sync sobe */
    }
  };
  // Dia exibido nos mapas (null = hoje). Sobe pro container: as notícias do mês exibido são
  // buscadas aqui (cache offline no economicCalendar) e o WorldSessionMap só desenha.
  const [mapDay, setMapDay] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  useEffect(() => {
    let alive = true;
    const dayKey = mapDay ?? new Date().toLocaleDateString('en-CA');
    const { from, to } = monthRange(dayKey.slice(0, 7));
    setEventsLoading(true);
    fetchEconomicEvents(from, to)
      .then((list) => { if (alive) { setEvents(list); setEventsError(false); } })
      .catch(() => { if (alive) setEventsError(true); })
      .finally(() => { if (alive) setEventsLoading(false); });
    return () => { alive = false; };
  }, [mapDay]);

  const dashTrades = useMemo(() => {
    // Período do PeriodPicker (mês | intervalo from→to | tudo).
    const mode = periodFilter?.mode ?? 'all';
    let fromMs = 0;
    let toMs = 0;
    if (mode === 'month' && periodFilter.ym) {
      fromMs = Date.parse(`${periodFilter.ym}-01T00:00:00Z`);
      const [y, m] = periodFilter.ym.split('-').map(Number);
      toMs = Date.UTC(y, m, 1); // 1º dia do mês seguinte
    } else if (mode === 'range') {
      if (periodFilter.from) fromMs = Date.parse(`${periodFilter.from}-01T00:00:00Z`);
      if (periodFilter.to) {
        const [y, m] = periodFilter.to.split('-').map(Number);
        toMs = Date.UTC(y, m, 1);
      }
    }
    const acctSet = acctFilter.length ? new Set(acctFilter) : null;
    return trades.filter((t) => {
      if (acctSet) {
        const inAcct = acctSet.has(t.accountId) || (t.accounts || []).some((a) => acctSet.has(a.accountId));
        if (!inAcct) return false;
      }
      if (fromMs || toMs) {
        const stamp = t.exitDatetime || t.entryDatetime;
        const ts = stamp ? new Date(stamp).getTime() : 0;
        if (!ts) return false;
        if (fromMs && ts < fromMs) return false;
        if (toMs && ts >= toMs) return false;
      }
      return true;
    });
  }, [trades, periodFilter, acctFilter]);
  const handleHistBucket = (b) => {
    setHistBucket(b);
    try {
      localStorage.setItem('journalHistogramBucket', String(b));
    } catch {
      /* noop */
    }
  };

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

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Trading Journal</h1>
        <div className="cmd-actions">
          <button className="cmd-refresh" onClick={handleExportAnalysis}>Exportar análise</button>
          <button className="cmd-refresh no-print" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      <div className="jd-topbar">
        <ModuleTabs module="trading" />
        <div className="jd-tabs" role="tablist" aria-label="Visão do Journal">
          <button className={`jd-tab${view === 'review' ? ' active' : ''}`} role="tab" aria-selected={view === 'review'} onClick={() => setView('review')}>Review</button>
          <button className={`jd-tab${view === 'playbook' ? ' active' : ''}`} role="tab" aria-selected={view === 'playbook'} onClick={() => setView('playbook')}>Playbook</button>
        </div>
        {view === 'review' && (
          <div className="jd-filters" role="group" aria-label="Filtros do review">
            <PeriodPicker period={periodFilter} onChange={setPeriodFilter} compact />
            <AccountPicker selected={acctFilter} onChange={setAcctFilter} />
            {(periodFilter?.mode !== 'all' || acctFilter.length > 0) && (
              <span className="jd-filter-count" aria-live="polite">{dashTrades.length} trades</span>
            )}
          </div>
        )}
      </div>
      {view === 'review' ? (
        <>
          <HeatmapSection
            trades={dashTrades}
            currency="USD"
            sessionDefs={sessionDefs}
            onSessions={handleSessions}
            loading={loading}
            day={mapDay}
            onDayChange={setMapDay}
            events={events}
            eventsLoading={eventsLoading}
            eventsError={eventsError}
          />
          <BreakdownSection trades={dashTrades} currency="USD" loading={loading} />
          <HistogramR trades={dashTrades} bucketSize={histBucket} onBucketSize={handleHistBucket} loading={loading} />
          <DurationAnalysis trades={dashTrades} loading={loading} />
          <WeeklyReview trades={dashTrades} currency="USD" loading={loading} />
        </>
      ) : (
        <PlaybookPanel />
      )}
    </div>
  );
}

const JD_TABS_CSS = `
.jd-topbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.jd-topbar .ws-tabs { margin: 0; flex: 0 1 auto; }
.jd-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.jd-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-left: auto; }
@media (max-width: 720px) {
  .jd-topbar { gap: 8px; }
  .jd-tabs { order: 3; width: 100%; }
  .jd-filters { margin-left: 0; }
}
.jd-filter-count { font-size: 12px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.jd-tab { padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); font-size: 13px; cursor: pointer; font-weight: 600; }
.jd-tab.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); }
`;
if (typeof document !== 'undefined' && !document.getElementById('jd-tabs-styles')) {
  const style = document.createElement('style');
  style.id = 'jd-tabs-styles';
  style.textContent = JD_TABS_CSS;
  document.head.appendChild(style);
}
