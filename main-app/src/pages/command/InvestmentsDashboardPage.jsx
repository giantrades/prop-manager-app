// Dashboard do módulo Investimentos (porta de entrada = visão geral do portfolio).
// KPIs + pies (por classe e por ativo) + evolução do patrimônio + payouts por mês +
// maiores posições. O gerenciamento fica na página Portfolio (abas). Composição pura.
import { fmtMoney as fmtMoneyShared } from '@apps/ui/currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import NetWorth from '@apps/ui/NetWorth';
import AllocationPie from '@apps/ui/AllocationPie';
import WidgetGrid from '@apps/ui/WidgetGrid';
import StatRow from '@apps/ui/StatRow';
import { TrendingUp, CalendarDays, LineChart, Store } from 'lucide-react';
import Portfolio from '@apps/ui/Portfolio';
import { applyBenchmark, getCdiSeries, computeDcaFromTransactions } from '@apps/lib/db';

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

const CLASS_META = {
  equity: { label: 'Renda variável', color: '#7c5cff' },
  fixed: { label: 'Renda fixa', color: '#3498db' },
  crypto: { label: 'Cripto', color: '#f7931a' },
  other: { label: 'Imóveis/Outros', color: '#e1b12c' },
};

export default function InvestmentsDashboardPage() {
  const { loading, data } = useEngineData(async (f) => {
    const [nw, snapshots, portfolio, positions, allocation, accounts, payouts, txs, histRec, cdi] = await Promise.all([
      f.wealth.netWorth(),
      f.wealth.netWorthSeries(),
      f.wealth.portfolio(),
      f.ds.positions.list(),
      f.wealth.allocation(),
      f.ds.accounts.list(),
      f.ds.payouts.list(),
      f.ds.transactions.list(),
      f.ds.meta.getKey('portfolio:history'),
      getCdiSeries(f.ds),
    ]);
    const top = (portfolio.rows ?? []).slice().sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)).slice(0, 5);
    const history = Array.isArray(histRec?.value) ? histRec.value : [];
    return { nw, snapshots, portfolio, positions, top, payouts, allocation, accounts, history, benchmark: applyBenchmark(history, cdi), dca: computeDcaFromTransactions(txs) };
  });

  const pf = data?.portfolio;

  const classData = useMemo(() => {
    const rows = data?.portfolio?.rows ?? [];
    const acctKind = new Map((data?.accounts ?? []).map((a) => [a.id, a.kind]));
    const map = { equity: 0, fixed: 0, crypto: 0, other: 0 };
    for (const r of rows) {
      const kind = acctKind.get(r.accountId);
      if (kind === 'crypto') map.crypto += r.marketValue ?? 0;
      else if (r.assetKind === 'fixed') map.fixed += r.marketValue ?? 0;
      else if (r.assetKind === 'other') map.other += r.marketValue ?? 0;
      else map.equity += r.marketValue ?? 0;
    }
    return Object.entries(map).filter(([, v]) => v > 0)
      .map(([k, v]) => ({ label: CLASS_META[k]?.label ?? k, value: v, color: CLASS_META[k]?.color }));
  }, [data]);

  const symbolData = useMemo(() => (
    (data?.allocation?.bySymbol ?? []).slice(0, 8).map((a) => ({ label: a.label, value: a.value }))
  ), [data]);

  const payoutSeries = useMemo(() => {
    const payouts = data?.payouts ?? [];
    const byMonth = new Map();
    for (const p of payouts) {
      const ym = String(p.date || p.updatedAt || '').slice(0, 7);
      if (!ym) continue;
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + (Number(p.net) || 0));
    }
    const months = [...byMonth.keys()].sort().slice(-12);
    return months.map((ym) => ({ ym: ym.slice(5, 7) + '/' + ym.slice(2, 4), payout: Number((byMonth.get(ym) ?? 0).toFixed(2)) }));
  }, [data]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Investimentos</h1>
      </div>
      <ModuleTabs module="investimentos" />

      {loading || !pf ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando investimentos…</div>
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent3">
              <h3>Patrimônio</h3>
              <div className="stat">{fmtMoney(data.nw.netWorth)}</div>
              <div className="muted">cash {fmtMoney(data.nw.components.cash)}</div>
            </div>
            <div className={`card ${pf.totalPnl >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>Investido</h3>
              <div className="stat">{fmtMoney(pf.totalValue)}</div>
              <div className="muted">custo {fmtMoney(pf.totalCost)}</div>
            </div>
            <div className={`card ${pf.totalPnl >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>PnL</h3>
              <div className="stat">{fmtMoney(pf.totalPnl)}</div>
              <div className="muted">{fmtPct(pf.pnlPercent)}</div>
            </div>
            <div className="card accent4">
              <h3>Posições</h3>
              <div className="stat">{data.positions.length}</div>
              <div className="muted">{pf.staleCount} marca(s) velha(s)</div>
            </div>
          </div>

          <WidgetGrid
            storageKey="investimentos"
            items={[
              { id: 'class', node: (<div className="dash-section"><AllocationPie title="Por classe" data={classData} emptyLabel="Cadastre posições para ver a alocação por classe." /></div>) },
              { id: 'symbol', node: (<div className="dash-section"><AllocationPie title="Por ativo" data={symbolData} emptyLabel="Sem posições." /></div>) },
              {
                id: 'top',
                node: (
                  <div className="dash-section">
                    <div className="dash-title"><span><TrendingUp size={14} /> Maiores posições</span><NavLink className="dash-link" to="/portfolio">gerenciar →</NavLink></div>
                    {data.top.length === 0 ? <div className="muted">Sem posições.</div> : (() => {
                      const max = Math.max(1, ...data.top.map((p) => p.marketValue ?? 0));
                      return data.top.map((p) => (
                        <StatRow
                          key={p.id}
                          icon={<TrendingUp size={14} />}
                          color={(p.pnl ?? 0) >= 0 ? '#2ecc71' : '#e74c3c'}
                          label={p.symbol}
                          sub={`${p.qty} un. · ${fmtPct(p.pnlPercent)}`}
                          barPct={((p.marketValue ?? 0) / max) * 100}
                          value={fmtMoney(p.marketValue)}
                        />
                      ));
                    })()}
                  </div>
                ),
              },
              {
                id: 'payouts',
                node: (
                  <div className="dash-section">
                    <div className="dash-title"><span><CalendarDays size={14} /> Payouts por mês</span><NavLink className="dash-link" to="/payouts">payouts →</NavLink></div>
                    {payoutSeries.length > 1 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={payoutSeries} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                          <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
                          <Bar dataKey="payout" name="Payouts" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className="muted">Sem payouts ainda.</div>}
                  </div>
                ),
              },
              { id: 'valuecost', node: (<div className="dash-section"><Portfolio only={['history', 'dca']} history={data.history ?? []} benchmark={data.benchmark ?? []} dca={data.dca ?? []} loading={false} /></div>) },
              { id: 'evolution', defaultSpan: 2, node: (<div className="dash-section"><div className="dash-title"><span><LineChart size={14} /> Evolução do patrimônio</span></div><NetWorth netWorth={data.nw} snapshots={data.snapshots} loading={false} /></div>) },
            ]}
          />
        </>
      )}
    </div>
  );
}

const INV_CSS = `
.inv-pies { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
.inv-widgets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
.inv-span2 { grid-column: 1 / -1; }
@media (max-width: 900px) { .inv-pies, .inv-widgets { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('inv-styles')) {
  const style = document.createElement('style');
  style.id = 'inv-styles';
  style.textContent = INV_CSS;
  document.head.appendChild(style);
}
