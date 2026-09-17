// Relatórios — visão simples e objetiva: situação do mês + evolução (patrimônio,
// entradas e gastos) dos últimos meses. Base para "como foi o mês" e para exportar.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import { fmtMoney } from '@apps/ui/currency';
import { Activity, LineChart, CalendarDays } from 'lucide-react';
import { monthlySeries, computeFreeCash, computeFreeCashPeriod, inPeriod } from '@apps/lib/db';
import { usePeriod } from '@apps/state';
import PeriodPicker from '@apps/ui/PeriodPicker';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import {
  ResponsiveContainer, BarChart, Bar, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

export default function ReportsPage() {
  const finance = useFinance();
  const { toast } = useToast();
  const { period, setPeriod } = usePeriod();
  const { loading, data, error, reload: load } = usePageData('reports', async (f) => {
    const [txs, nw, snapshots, trades, payouts] = await Promise.all([
      f.ds.transactions.list(),
      f.wealth.netWorth(),
      f.wealth.netWorthSeries(),
      f.ds.trades.list(),
      f.ds.payouts.list(),
    ]);
    const ym = new Date().toISOString().slice(0, 7);
    const series = monthlySeries(txs, 12, ym);
    const freeCash = computeFreeCash(txs, ym);
    return { series, freeCash, nw, snapshots, ym, txs, trades, payouts };
  });

  // Período selecionado: KPIs + waterfall (fluxo do patrimônio).
  const periodView = useMemo(() => {
    if (!data) return null;
    const txs = (data.txs ?? []).filter((t) => inPeriod(t.date, period, []));
    const trades = (data.trades ?? []).filter((t) => t.exitPrice != null && inPeriod(t.exitDatetime || t.entryDatetime, period, []));
    const payouts = (data.payouts ?? []).filter((p) => inPeriod(p.date || p.updatedAt, period, []));
    const sumKinds = (kinds) => txs.filter((t) => kinds.includes(t.kind)).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const freeCash = computeFreeCashPeriod(data.txs, period);
    const entradas = sumKinds(['income', 'payout_in', 'rebate']);
    const gastos = sumKinds(['expense']);
    const custos = sumKinds(['challenge_cost', 'reset_fee', 'monthly_fee']);
    const tradingPnl = trades.reduce((s, t) => s + (Number(t.resultNet) || 0), 0);
    const payoutNet = payouts.reduce((s, p) => s + (Number(p.net) || 0), 0);
    const r2 = (n) => Number(n.toFixed(2));
    return {
      freeCash,
      waterfall: { entradas: r2(entradas), gastos: r2(gastos), custos: r2(custos), tradingPnl: r2(tradingPnl), payoutNet: r2(payoutNet), variacao: r2(entradas - gastos - custos + tradingPnl) },
    };
  }, [data, period]);

  const financeRef = useRef(finance);
  financeRef.current = finance;
  const [exporting, setExporting] = useState(false);

  const months = data?.series ?? [];

  const handleExportCSV = useCallback(() => {
    if (!data) return;
    setExporting(true);
    try {
      const head = 'mes,entradas,gastos,saldo';
      const lines = months.map((m) => [m.ym, m.income, m.expenses, m.balance].join(','));
      const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-${data.ym}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Relatório exportado.');
    } finally {
      setExporting(false);
    }
  }, [data, months, toast]);

  const nwSeries = useMemo(() => (data?.snapshots ?? []).map((s) => ({ at: String(s.snapshotAt).slice(0, 10), valor: s.netWorth })), [data]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Relatórios</h1>
        <div className="cmd-actions">
          <button className="cmd-refresh" onClick={handleExportCSV} disabled={!data || exporting}>Exportar CSV</button>
          <button className="cmd-refresh no-print" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <ModuleTabs module="relatorios" />
      <PeriodPicker period={period} onChange={setPeriod} />

      {error && data && <ActionableError stale error={error} onRetry={load} label="o Relatório" />}
      {error && !data ? (
        <ActionableError error={error} onRetry={load} label="o Relatório" />
      ) : loading || !data ? (
        <DashSkeleton cards={3} widgets={3} />
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent3">
              <h3>Patrimônio atual</h3>
              <div className="stat">{fmtMoney(data.nw.netWorth, 'BRL')}</div>
              <div className="muted">derivado</div>
            </div>
            <div className="card accent1">
              <h3>Entrou no período</h3>
              <div className="stat">{fmtMoney((periodView?.freeCash ?? data.freeCash).income, 'BRL')}</div>
              <div className="muted">seleção de período</div>
            </div>
            <div className="card accent2">
              <h3>Gastou no período</h3>
              <div className="stat">{fmtMoney((periodView?.freeCash ?? data.freeCash).expenses, 'BRL')}</div>
              <div className="muted">seleção de período</div>
            </div>
            <div className={`card ${(periodView?.freeCash ?? data.freeCash).freeCash >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>Saldo do período</h3>
              <div className="stat">{fmtMoney((periodView?.freeCash ?? data.freeCash).freeCash, 'BRL')}</div>
              <div className="muted">entradas − gastos</div>
            </div>
          </div>

          {periodView && (
            <div className="dash-section">
              <div className="dash-title"><span><Activity size={14} /> Fluxo do patrimônio (período)</span></div>
              {(() => {
                const w = periodView.waterfall;
                const max = Math.max(1, ...[w.entradas, w.gastos, w.custos, Math.abs(w.tradingPnl), Math.abs(w.payoutNet), Math.abs(w.variacao)].map(Math.abs));
                return [
                  { label: 'Entradas', v: w.entradas },
                  { label: '(−) Gastos', v: -w.gastos },
                  { label: '(−) Custos (firm)', v: -w.custos },
                  { label: 'PnL trading', v: w.tradingPnl },
                  { label: 'Payouts (net)', v: w.payoutNet },
                  { label: '= Variação', v: w.variacao },
                ].map((r) => (
                  <div key={r.label} className="ac-wf-row">
                    <span className="ac-wf-label">{r.label}</span>
                    <span className="ac-wf-bar-wrap"><span className={`ac-wf-bar ${r.v < 0 ? 'is-neg' : 'is-pos'}`} style={{ width: `${Math.round((Math.abs(r.v) / max) * 100)}%` }} /></span>
                    <span className={`ac-wf-val ${r.v < 0 ? 'dash-neg' : 'dash-pos'}`}>{fmtMoney(r.v, 'BRL')}</span>
                  </div>
                ));
              })()}
            </div>
          )}

          <div className="rp-widgets">
            <div className="dash-section">
              <div className="dash-title"><span><Activity size={14} /> Entradas × Gastos (12 meses)</span></div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={months} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} tickFormatter={(v) => String(v).slice(5, 7) + '/' + String(v).slice(2, 4)} />
                  <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                  <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'BRL')} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="income" name="Entradas" fill="#2ecc71" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Gastos" fill="#e74c3c" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="balance" name="Saldo" stroke="#7c5cff" strokeWidth={2} dot={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="dash-section">
              <div className="dash-title"><span><LineChart size={14} /> Evolução do patrimônio</span></div>
              {nwSeries.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={nwSeries} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="rp-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#7c5cff" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="at" tick={{ fontSize: 10, fill: '#a1a7b3' }} minTickGap={28} />
                    <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                    <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'BRL')} />
                    <Area type="monotone" dataKey="valor" stroke="#7c5cff" strokeWidth={2} fill="url(#rp-grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="muted">Sem histórico de patrimônio ainda.</div>
              )}
            </div>

            <div className="dash-section rp-months">
              <div className="dash-title"><span><CalendarDays size={14} /> Mês a mês (12 meses)</span></div>
              <div className="rp-months-scroll">
                {months.slice().reverse().map((m) => (
                  <div key={m.ym} className="rp-mrow">
                    <span className="rp-mym">{String(m.ym).slice(5, 7)}/{String(m.ym).slice(2, 4)}</span>
                    <span className="rp-min dash-pos">+{fmtMoney(m.income, 'BRL')}</span>
                    <span className="rp-mout dash-neg">−{fmtMoney(m.expenses, 'BRL')}</span>
                    <span className={`rp-mbal ${m.balance >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtMoney(m.balance, 'BRL')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const RP_CSS = `
.rp-widgets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.rp-months { display: flex; flex-direction: column; min-height: 0; }
.rp-months-scroll { max-height: 280px; overflow-y: auto; }
.rp-mrow { display: grid; grid-template-columns: 52px 1fr 1fr 1fr; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; font-variant-numeric: tabular-nums; }
.rp-mrow:last-child { border-bottom: none; }
.rp-mym { color: var(--muted, #a1a7b3); }
.rp-min, .rp-mout, .rp-mbal { text-align: right; }
.rp-mbal { font-weight: 700; }
.dash-table-wrap { overflow-x: auto; }
.dash-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.dash-table th, .dash-table td { padding: 8px 10px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.05); }
.dash-table th:first-child, .dash-table td:first-child { text-align: left; }
.dash-table thead th { color: var(--muted, #a1a7b3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
@media (max-width: 900px) { .rp-widgets { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('rp-styles')) {
  const style = document.createElement('style');
  style.id = 'rp-styles';
  style.textContent = RP_CSS;
  document.head.appendChild(style);
}
