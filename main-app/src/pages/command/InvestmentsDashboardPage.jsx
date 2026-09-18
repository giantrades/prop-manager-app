// Dashboard do módulo Investimentos (porta de entrada = visão geral do portfolio).
// KPIs + pies (por classe e por ativo) + evolução do patrimônio + payouts por mês +
// maiores posições. O gerenciamento fica na página Portfolio (abas). Composição pura.
import { fmtMoney as fmtMoneyShared } from '@apps/ui/currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, LineChart as RLineChart, Line, Legend, Treemap, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import NetWorth from '@apps/ui/NetWorth';
import AllocationPie from '@apps/ui/AllocationPie';
import WidgetGrid from '@apps/ui/WidgetGrid';
import StatRow from '@apps/ui/StatRow';
import { TrendingUp, CalendarDays, LineChart, Store, Coins } from 'lucide-react';
import Portfolio from '@apps/ui/Portfolio';
import {
  applyBenchmark, getCdiSeries, computeDcaFromTransactions, inPeriod, relativeSeries,
  dividendHistory, dividendIncomeByMonth, dividendByAsset, getAnnouncedDividends, upcomingDividends,
  tradeNetPnl,
} from '@apps/lib/db';
import { usePeriod } from '@apps/state';
import PeriodPicker from '@apps/ui/PeriodPicker';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { useEntityDrawer } from '@apps/ui/EntityDrawer';

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
  const { period, setPeriod } = usePeriod();
  const drawer = useEntityDrawer();
  const { loading, data, error, reload } = useEngineData(async (f) => {
    const [nw, snapshots, portfolio, positions, allocation, accounts, payouts, txs, trades, histRec, cdi] = await Promise.all([
      f.wealth.netWorth(),
      f.wealth.netWorthSeries(),
      f.wealth.portfolio(),
      f.ds.positions.list(),
      f.wealth.allocation(),
      f.ds.accounts.list(),
      f.ds.payouts.list(),
      f.ds.transactions.list(),
      f.ds.trades.list(),
      f.ds.meta.getKey('portfolio:history'),
      getCdiSeries(f.ds),
    ]);
    const top = (portfolio.rows ?? []).slice().sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)).slice(0, 5);
    const history = Array.isArray(histRec?.value) ? histRec.value : [];
    const announced = upcomingDividends(await getAnnouncedDividends(f.ds));
    return { nw, snapshots, portfolio, positions, top, payouts, allocation, accounts, history, benchmark: applyBenchmark(history, cdi), relative: relativeSeries(history, cdi), dca: computeDcaFromTransactions(txs), txs, trades, dividends: dividendHistory(txs), announced };
  });

  const pf = data?.portfolio;

  const waterfall = useMemo(() => {
    const txs = (data?.txs ?? []).filter((t) => inPeriod(t.date, period, []));
    const trades = (data?.trades ?? []).filter((t) => t.exitPrice != null && inPeriod(t.exitDatetime || t.entryDatetime, period, []));
    const sum = (kinds) => txs.filter((t) => kinds.includes(t.kind)).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const entradas = sum(['income', 'payout_in', 'rebate']);
    const gastos = sum(['expense']);
    const custos = sum(['challenge_cost', 'reset_fee', 'monthly_fee']);
    const tradingPnl = trades.reduce((s, t) => s + tradeNetPnl(t), 0);
    const r2 = (n) => Number(n.toFixed(2));
    // O ledger (entradas/gastos/custos) é BRL; o PnL dos trades é USD. Converter o
    // trading PnL para BRL (fx do portfolio) antes de somar — antes somava moedas
    // diferentes e a "Variação" saía errada.
    const fx = data?.portfolio?.fxUSD ?? 1;
    const tradingPnlBrl = r2(tradingPnl * fx);
    return { entradas: r2(entradas), gastos: r2(gastos), custos: r2(custos), tradingPnl: tradingPnlBrl, variacao: r2(entradas - gastos - custos + tradingPnlBrl) };
  }, [data, period]);

  // Os pies são em BRL (convenção dos totais). Cada linha é convertida pela sua própria
  // moeda via fxUSD; linhas sem câmbio (`converted === false`) ficam de fora, igual ao total.
  const fxOfRow = (r) => (String(r.currency ?? '').toUpperCase().includes('USD') ? (data?.portfolio?.fxUSD ?? null) : 1);
  const brlValue = (r) => {
    const fx = fxOfRow(r);
    return fx == null ? null : (r.marketValue ?? 0) * fx;
  };

  const classData = useMemo(() => {
    const rows = (data?.portfolio?.rows ?? []).filter((r) => r.converted !== false);
    const acctKind = new Map((data?.accounts ?? []).map((a) => [a.id, a.kind]));
    const map = { equity: 0, fixed: 0, crypto: 0, other: 0 };
    for (const r of rows) {
      const v = brlValue(r);
      if (v == null) continue;
      const kind = acctKind.get(r.accountId);
      if (kind === 'crypto') map.crypto += v;
      else if (r.assetKind === 'fixed') map.fixed += v;
      else if (r.assetKind === 'other') map.other += v;
      else map.equity += v;
    }
    return Object.entries(map).filter(([, v]) => v > 0)
      .map(([k, v]) => ({ label: CLASS_META[k]?.label ?? k, value: v, color: CLASS_META[k]?.color }));
  }, [data]);

  const symbolData = useMemo(() => {
    const by = new Map();
    for (const r of (data?.portfolio?.rows ?? [])) {
      if (r.converted === false) continue;
      const v = brlValue(r);
      if (v == null || v <= 0) continue;
      by.set(r.symbol, (by.get(r.symbol) ?? 0) + v);
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [data]);

  const payoutSeries = useMemo(() => {
    const payouts = (data?.payouts ?? []).filter((p) => inPeriod(p.date || p.updatedAt, period, []));
    const byMonth = new Map();
    for (const p of payouts) {
      const ym = String(p.date || p.updatedAt || '').slice(0, 7);
      if (!ym) continue;
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + (Number(p.net) || 0));
    }
    const months = [...byMonth.keys()].sort();
    return months.map((ym) => ({ ym: ym.slice(5, 7) + '/' + ym.slice(2, 4), payout: Number((byMonth.get(ym) ?? 0).toFixed(2)) }));
  }, [data, period]);

  // #4 — proventos do período: total, por mês (barras) e por ativo.
  const dividend = useMemo(() => {
    const rows = data?.dividends ?? [];
    const symbolById = Object.fromEntries((data?.positions ?? []).map((p) => [p.id, p.symbol]));
    const inP = rows.filter((d) => inPeriod(d.date, period, []));
    const total = inP.reduce((s, d) => s + (d.amount || 0), 0);
    const monthly = dividendIncomeByMonth(inP).slice(-12).map((m) => ({ ym: m.ym.slice(5, 7) + '/' + m.ym.slice(2, 4), amount: m.amount }));
    const byAsset = dividendByAsset(inP, symbolById);
    return { total, monthly, byAsset, count: inP.length, avgMonth: monthly.length ? total / monthly.length : 0 };
  }, [data, period]);

  // B6/B7 — abrir ativo (posição) sem navegar, a partir da lista ou do treemap.
  const openPosition = (p) => drawer.open({
    title: `Ativo — ${p.symbol}`,
    subtitle: 'Posição',
    href: '/portfolio',
    rows: [
      { k: 'Quantidade', v: String(p.qty ?? '—') },
      { k: 'Valor de mercado', v: fmtMoney(p.marketValue ?? 0) },
      { k: 'PnL', v: fmtMoney(p.pnl ?? 0), color: (p.pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' },
      { k: 'PnL %', v: p.pnlPercent != null ? fmtPct(p.pnlPercent) : '—', color: (p.pnlPercent ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' },
    ],
  });
  const openAssetByName = (symbol) => {
    const row = (data?.portfolio?.rows ?? []).find((r) => r.symbol === symbol);
    if (row) openPosition(row);
  };
  const openPayoutMonth = (label) => {
    const m = (payoutSeries ?? []).find((x) => x.ym === label);
    if (!m) return;
    const list = (data?.payouts ?? []).filter((p) => String(p.date || p.updatedAt || '').slice(5, 7) + '/' + String(p.date || p.updatedAt || '').slice(2, 4) === label);
    drawer.open({
      title: `Payouts — ${label}`,
      subtitle: `Drill-down · ${list.length} payout(s)`,
      href: '/payouts',
      rows: [
        { k: 'Total líquido', v: fmtMoney(m.payout, 'USD'), color: 'var(--green)' },
        { k: 'Payouts', v: String(list.length) },
      ],
    });
  };

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Investimentos</h1>
      </div>
      <ModuleTabs module="investimentos" />
      <PeriodPicker period={period} onChange={setPeriod} />

      {error && pf && <ActionableError stale error={error} onRetry={reload} label="os Investimentos" />}
      {error && !pf ? (
        <ActionableError error={error} onRetry={reload} label="os Investimentos" />
      ) : loading || !pf ? (
        <DashSkeleton cards={3} widgets={4} />
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent3">
              <h3>Patrimônio</h3>
              {/* netWorth/components vêm em BRL (convenção do motor) — declarar a moeda
                  faz o fmtMoney converter para a moeda de EXIBIÇÃO, não tratar como USD. */}
              <div className="stat">{fmtMoney(data.nw.netWorth, 'USD')}</div>
              <div className="muted">cash {fmtMoney(data.nw.components.cash, 'USD')}</div>
            </div>
            <div className={`card ${pf.totalPnl >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>Investido</h3>
              <div className="stat">{fmtMoney(pf.totalValue, 'USD')}</div>
              <div className="muted">custo {fmtMoney(pf.totalCost, 'USD')}</div>
            </div>
            <div className={`card ${pf.totalPnl >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>PnL</h3>
              <div className="stat">{fmtMoney(pf.totalPnl, 'USD')}</div>
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
              { id: 'class', node: (<div className="dash-section"><AllocationPie title="Por classe" data={classData} currency="BRL" emptyLabel="Cadastre posições para ver a alocação por classe." /></div>) },
              { id: 'symbol', node: (<div className="dash-section"><AllocationPie title="Por ativo" data={symbolData} currency="BRL" emptyLabel="Sem posições." /></div>) },
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
                          // marketValue está na moeda do ativo; formatar com a dela (era 'BRL'
                          // fixo e um ativo USD saía convertido errado).
                          value={fmtMoney(p.marketValue, 'USD')}
                          onClick={() => openPosition(p)}
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
                        <BarChart data={payoutSeries} margin={{ top: 10, right: 12, left: 4, bottom: 4 }} onClick={(st) => { if (st?.activeLabel) openPayoutMonth(st.activeLabel); }}>
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
              { id: 'dividends', node: (
                <div className="dash-section">
                  <div className="dash-title"><span><Coins size={14} /> Proventos</span><NavLink className="dash-link" to="/portfolio">abrir →</NavLink></div>
                  <div className="dash-cards" style={{ marginBottom: 10 }}>
                    <div className="card accent1"><h3>Recebido</h3><div className="stat">{fmtMoney(dividend.total, 'USD')}</div><div className="muted">{dividend.count} provento(s)</div></div>
                    <div className="card accent3"><h3>Média/mês</h3><div className="stat">{fmtMoney(dividend.avgMonth, 'USD')}</div><div className="muted">{dividend.byAsset.length} ativo(s)</div></div>
                    <div className="card accent4"><h3>Próximos</h3><div className="stat">{data.announced?.length ?? 0}</div><div className="muted">anunciados</div></div>
                  </div>
                  {dividend.monthly.length > 1 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={dividend.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={48} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                        <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
                        <Bar dataKey="amount" name="Proventos" fill="#2ecc71" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="muted">Sem histórico suficiente de proventos.</div>}
                  {dividend.byAsset.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {dividend.byAsset.slice(0, 4).map((a) => (
                        <StatRow key={a.positionId} icon={<Coins size={14} />} color="#2ecc71" label={a.symbol} sub={`${a.count} provento(s)`} barPct={dividend.total > 0 ? (a.amount / dividend.total) * 100 : 0} value={fmtMoney(a.amount, 'USD')} />
                      ))}
                    </div>
                  )}
                </div>
              ) },
              { id: 'relative', node: (
                <div className="dash-section">
                  <div className="dash-title"><span><LineChart size={14} /> Performance relativa (base 100)</span></div>
                  {(data.relative ?? []).length < 2 ? <div className="muted">Histórico insuficiente (precisa de snapshots + CDI).</div> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <RLineChart data={data.relative} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="at" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={44} />
                        <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => Number(v).toFixed(1)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="portfolio" name="Portfólio" stroke="#7c5cff" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="cdi" name="CDI" stroke="#3498db" dot={false} strokeWidth={2} />
                      </RLineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ) },
              { id: 'treemap', node: (
                <div className="dash-section">
                  <div className="dash-title"><span><TrendingUp size={14} /> Treemap do portfólio</span></div>
                  {symbolData.length === 0 ? <div className="muted">Sem posições.</div> : (
                    <ResponsiveContainer width="100%" height={240}>
                      <Treemap data={symbolData.map((d) => ({ name: d.label, value: d.value }))} dataKey="value" nameKey="name" stroke="#131825" fill="#7c5cff" isAnimationActive={false} onClick={(node) => { if (node?.name) openAssetByName(node.name); }}>
                        {symbolData.map((d, i) => <Cell key={d.label} fill={['#7c5cff', '#2ecc71', '#3498db', '#e1b12c', '#e74c3c', '#a855f7', '#22d3ee', '#f59e0b'][i % 8]} />)}
                      </Treemap>
                    </ResponsiveContainer>
                  )}
                </div>
              ) },
              { id: 'waterfall', node: (
                <div className="dash-section">
                  <div className="dash-title"><span><TrendingUp size={14} /> Fluxo do patrimônio (período)</span></div>
                  {(() => {
                    const w = waterfall;
                    const max = Math.max(1, ...[w.entradas, w.gastos, w.custos, Math.abs(w.tradingPnl), Math.abs(w.variacao)].map(Math.abs));
                    const rows = [
                      { label: 'Entradas', v: w.entradas, pos: true },
                      { label: '(−) Gastos', v: -w.gastos, pos: false },
                      { label: '(−) Custos (firm)', v: -w.custos, pos: false },
                      { label: 'PnL trading', v: w.tradingPnl, pos: w.tradingPnl >= 0 },
                      { label: '= Variação', v: w.variacao, pos: w.variacao >= 0 },
                    ];
                    return rows.map((r) => (
                      <div key={r.label} className="ac-wf-row">
                        <span className="ac-wf-label">{r.label}</span>
                        <span className="ac-wf-bar-wrap"><span className={`ac-wf-bar ${r.v < 0 ? 'is-neg' : 'is-pos'}`} style={{ width: `${Math.round((Math.abs(r.v) / max) * 100)}%` }} /></span>
                        <span className={`ac-wf-val ${r.v < 0 ? 'dash-neg' : 'dash-pos'}`}>{fmtMoney(r.v, 'USD')}</span>
                      </div>
                    ));
                  })()}
                </div>
              ) },
              { id: 'valuecost', node: (<div className="dash-section"><Portfolio only={['history', 'dca']} history={data.history ?? []} benchmark={data.benchmark ?? []} dca={data.dca ?? []} loading={false} /></div>) },
              { id: 'evolution', defaultSpan: 2, node: (<div className="dash-section"><div className="dash-title"><span><LineChart size={14} /> Evolução do patrimônio</span></div><NetWorth netWorth={data.nw} snapshots={data.snapshots} loading={false} /></div>) },
            ]}
          />
        </>
      )}
      {drawer.node}
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
