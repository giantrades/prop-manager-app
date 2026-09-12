// Relatórios — visão simples e objetiva: situação do mês + evolução (patrimônio,
// entradas e gastos) dos últimos meses. Base para "como foi o mês" e para exportar.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import { fmtMoney } from '@apps/ui/currency';
import StatRow from '@apps/ui/StatRow';
import { Activity, LineChart, CalendarDays } from 'lucide-react';
import { monthlySeries, computeFreeCash } from '@apps/lib/db';
import {
  ResponsiveContainer, BarChart, Bar, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

export default function ReportsPage() {
  const finance = useFinance();
  const { toast } = useToast();
  const { loading, data, reload: load } = usePageData('reports', async (f) => {
    const [txs, nw, snapshots] = await Promise.all([
      f.ds.transactions.list(),
      f.wealth.netWorth(),
      f.wealth.netWorthSeries(),
    ]);
    const ym = new Date().toISOString().slice(0, 7);
    const series = monthlySeries(txs, 12, ym);
    const freeCash = computeFreeCash(txs, ym);
    return { series, freeCash, nw, snapshots, ym };
  });

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

      {loading || !data ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando relatório…</div>
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent3">
              <h3>Patrimônio atual</h3>
              <div className="stat">{fmtMoney(data.nw.netWorth, 'BRL')}</div>
              <div className="muted">derivado</div>
            </div>
            <div className="card accent1">
              <h3>Entrou no mês</h3>
              <div className="stat">{fmtMoney(data.freeCash.income, 'BRL')}</div>
              <div className="muted">{data.ym}</div>
            </div>
            <div className="card accent2">
              <h3>Gastou no mês</h3>
              <div className="stat">{fmtMoney(data.freeCash.expenses, 'BRL')}</div>
              <div className="muted">{data.ym}</div>
            </div>
            <div className={`card ${data.freeCash.freeCash >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>Saldo do mês</h3>
              <div className="stat">{fmtMoney(data.freeCash.freeCash, 'BRL')}</div>
              <div className="muted">entradas − gastos</div>
            </div>
          </div>

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
          </div>

          <div className="dash-section">
            <div className="dash-title"><span><CalendarDays size={14} /> Mês a mês (12 meses)</span></div>
            {(() => {
              const max = Math.max(1, ...months.map((m) => Math.abs(m.balance)));
              return months.slice().reverse().map((m) => (
                <StatRow
                  key={m.ym}
                  icon={<CalendarDays size={14} />}
                  color={m.balance >= 0 ? '#2ecc71' : '#e74c3c'}
                  label={`${String(m.ym).slice(5, 7)}/${String(m.ym).slice(2, 4)}`}
                  sub={`entrou ${fmtMoney(m.income, 'BRL')} · gastou ${fmtMoney(m.expenses, 'BRL')}`}
                  barPct={(Math.abs(m.balance) / max) * 100}
                  value={fmtMoney(m.balance, 'BRL')}
                  valueClass={m.balance >= 0 ? 'dash-pos' : 'dash-neg'}
                />
              ));
            })()}
          </div>
        </>
      )}
    </div>
  );
}

const RP_CSS = `
.rp-widgets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
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
