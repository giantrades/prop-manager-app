// Dashboard do módulo Contas (porta de entrada). Contas NÃO são só prop: inclui
// banco/carteira/investimento/cripto/dinheiro. KPIs + widgets de conta (por tipo,
// saldos e distribuição). Composição pura dos motores — sem P&L de firm aqui.
import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, Wallet, TrendingUp, Landmark, Banknote } from 'lucide-react';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import WidgetGrid from '@apps/ui/WidgetGrid';
import AllocationPie from '@apps/ui/AllocationPie';
import { fmtMoney, convertMoney, fmtDisplay } from '@apps/ui/currency';
import { listFirms, computeAccountBalance, inPeriod, normalizePropPhase } from '@apps/lib/db';
import { usePeriod } from '@apps/state';
import PeriodPicker from '@apps/ui/PeriodPicker';

const KIND_META = {
  prop: { label: 'Prop', icon: Building2, color: '#7c5cff' },
  wallet: { label: 'Cripto/Carteira', icon: Wallet, color: '#2ecc71' },
  investment: { label: 'Investimento', icon: TrendingUp, color: '#e1b12c' },
  bank: { label: 'Banco', icon: Landmark, color: '#3498db' },
  cash: { label: 'Dinheiro', icon: Banknote, color: '#8b94a5' },
  crypto: { label: 'Cripto/Carteira', icon: Wallet, color: '#2ecc71' },
};
const LIQUID = ['bank', 'wallet', 'cash', 'crypto'];

function GlowOrb({ color }) {
  return <div aria-hidden="true" style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: `radial-gradient(circle, ${color} 0%, transparent 70%)`, borderRadius: '50%' }} />;
}
function StatCard({ label, value, sub, color, glow }) {
  return (
    <div className="ad-stat" style={{ borderColor: `${color}33` }}>
      <GlowOrb color={glow} />
      <div className="ad-stat-label">{label}</div>
      <div className="ad-stat-value" style={{ color }}>{value}</div>
      {sub && <div className="ad-stat-sub">{sub}</div>}
    </div>
  );
}

export default function AccountsDashboardPage() {
  const { period, setPeriod } = usePeriod();
  const { loading, data } = useEngineData(async (f) => {
    const [accounts, propExts, payouts, txs, firms, trades, riskSnap] = await Promise.all([
      f.ds.accounts.list(),
      f.ds.propExtensions.list(),
      f.ds.payouts.list(),
      f.ds.transactions.list(),
      listFirms(f.ds),
      f.ds.trades.list(),
      f.risk.snapshot(),
    ]);
    return { accounts, propExts, payouts, txs, firms, trades, riskSnap };
  });

  const stats = useMemo(() => {
    const accounts = data?.accounts ?? [];
    const propExts = data?.propExts ?? [];
    const txs = data?.txs ?? [];
    const payouts = (data?.payouts ?? []).filter((p) => inPeriod(p.date || p.updatedAt, period, []));
    // Saldos escopados ao período (fluxo do período; 'all' = saldo acumulado total).
    const periodTxs = txs.filter((t) => inPeriod(t.date, period, txs));
    const balances = {};
    for (const a of accounts) balances[a.id] = computeAccountBalance(periodTxs, a.id);
    const nominalByAccount = new Map(propExts.map((p) => [p.accountId, p.nominalSize || 0]));
    const capital = propExts.reduce((s, p) => s + (p.nominalSize || 0), 0);
    const netPayouts = payouts.reduce((s, p) => s + (Number(p.net) || 0), 0);
    const grossPayouts = payouts.reduce((s, p) => s + (Number(p.gross) || 0), 0);
    const feesPayouts = payouts.reduce((s, p) => s + (Number(p.fee) || 0), 0);
    const payoutYield = capital > 0 ? netPayouts / capital : 0;

    const perKind = {};
    let liquidTotal = 0;
    const rows = [];
    for (const a of accounts) {
      const total = a.kind === 'prop' ? (nominalByAccount.get(a.id) ?? 0) : convertMoney(balances[a.id] ?? 0, a.currency);
      const e = perKind[a.kind] ?? { count: 0, total: 0 };
      e.count += 1; e.total += total; perKind[a.kind] = e;
      if (LIQUID.includes(a.kind)) liquidTotal += convertMoney(balances[a.id] ?? 0, a.currency);
      rows.push({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, balance: balances[a.id] ?? 0, liquid: LIQUID.includes(a.kind) });
    }
    const topBalances = rows.filter((r) => r.liquid).sort((a, b) => b.balance - a.balance).slice(0, 6);
    const pieData = Object.entries(perKind).filter(([, v]) => v.total > 0).map(([k, v]) => ({ label: KIND_META[k]?.label ?? k, value: v.total, color: KIND_META[k]?.color }));

    // Account Matrix — comparável por status, equity/saldo, DD, payouts, trades e sync.
    const riskById = new Map((data?.riskSnap?.rows ?? []).map((r) => [r.account.id, r]));
    const tradesByAccount = new Map();
    for (const t of (data?.trades ?? [])) {
      if (t.exitPrice == null) continue;
      if (!inPeriod(t.exitDatetime || t.entryDatetime, period, [])) continue;
      tradesByAccount.set(t.accountId, (tradesByAccount.get(t.accountId) ?? 0) + 1);
    }
    const payoutsByAccount = new Map();
    for (const p of payouts) {
      for (const id of (p.accountIds ?? [])) {
        payoutsByAccount.set(id, (payoutsByAccount.get(id) ?? 0) + (Number(p.splitByAccount?.[id]?.net) || 0));
      }
    }
    const matrix = accounts.map((a) => {
      const prop = propExts.find((p) => p.accountId === a.id);
      const rk = riskById.get(a.id);
      const phase = normalizePropPhase(prop?.phase);
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        currency: a.currency,
        status: a.kind === 'prop' ? (phase ? phase.toUpperCase() : '—') : '—',
        level: rk?.status?.status ?? null,
        value: a.kind === 'prop' ? (rk?.metrics?.equity ?? prop?.nominalSize ?? 0) : convertMoney(balances[a.id] ?? 0, a.currency),
        ddPct: rk?.metrics?.maxDDUsed != null ? Math.round(rk.metrics.maxDDUsed * 100) : null,
        payouts: payoutsByAccount.get(a.id) ?? 0,
        trades: tradesByAccount.get(a.id) ?? 0,
        sync: a.lastPlatformSync ?? null,
      };
    }).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    return { total: accounts.length, capital, netPayouts, payoutYield, perKind, liquidTotal, topBalances, pieData, propCount: perKind.prop?.count ?? 0, payoutsCount: payouts.length, matrix, waterfall: { gross: grossPayouts, fees: feesPayouts, net: netPayouts } };
  }, [data, period]);

  const maxKind = Math.max(1, ...Object.values(stats.perKind).map((v) => v.total));

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Contas</h1></div>
      <ModuleTabs module="contas" />
      <PeriodPicker period={period} onChange={setPeriod} />

      {loading || !data ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando contas…</div>
      ) : (
        <>
          <div className="ad-cards">
            <StatCard label="Líquido" value={fmtDisplay(stats.liquidTotal)} sub="banco · carteira · cripto · dinheiro" color="#3b82f6" glow="rgba(59,130,246,0.15)" />
            <StatCard label="Capital gerido" value={fmtMoney(stats.capital, 'USD')} sub={`${stats.propCount} conta(s) prop`} color="#7c5cff" glow="rgba(124,92,255,0.15)" />
            <StatCard label="Total payouts" value={fmtMoney(stats.netPayouts, 'USD')} sub={`${stats.payoutsCount} payout(s)`} color="#10b981" glow="rgba(16,185,129,0.15)" />
            <StatCard label="Payout Yield" value={`${(stats.payoutYield * 100).toFixed(2)}%`} sub="payouts / capital nominal" color={stats.payoutYield >= 0 ? '#7c5cff' : '#ef4444'} glow="rgba(124,92,255,0.15)" />
            <StatCard label="Contas" value={String(stats.total)} sub="todas as contas" color="#f59e0b" glow="rgba(245,158,11,0.15)" />
            <StatCard label="Firms" value={String((data.firms ?? []).length)} sub="empresas cadastradas" color="#22d3ee" glow="rgba(34,211,238,0.15)" />
          </div>

          <WidgetGrid storageKey="contas">
            <div className="dash-section" key="matrix" style={{ gridColumn: '1 / -1' }}>
              <div className="dash-title">
                <span>Account Matrix</span>
                <NavLink className="dash-link" to="/accounts">gerenciar →</NavLink>
              </div>
              {stats.matrix.length === 0 ? (
                <div className="muted">Sem contas.</div>
              ) : (
                <div className="ac-matrix">
                  <div className="ac-matrix-head">
                    <span>Conta</span><span>Tipo</span><span>Status</span><span>Equity/Saldo</span><span>DD</span><span>Payouts</span><span>Trades</span><span>Sync</span>
                  </div>
                  {stats.matrix.map((r) => (
                    <div key={r.id} className="ac-matrix-row">
                      <span className="ac-matrix-name">{r.name}</span>
                      <span className="ac-matrix-kind">{KIND_META[r.kind]?.label ?? r.kind}</span>
                      <span className={`ac-matrix-status ${r.level === 'STOP' ? 'is-stop' : r.level === 'WARN' ? 'is-warn' : r.status !== '—' ? 'is-ok' : ''}`}>{r.status}</span>
                      <span className="ac-matrix-num">{fmtMoney(r.value, r.currency === 'USD' ? '$' : 'R$')}</span>
                      <span className="ac-matrix-num">{r.ddPct != null ? `${r.ddPct}%` : '—'}</span>
                      <span className="ac-matrix-num">{fmtMoney(r.payouts, 'USD')}</span>
                      <span className="ac-matrix-num">{r.trades}</span>
                      <span className="ac-matrix-sync">{r.sync ? String(r.sync).slice(0, 10) : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dash-section" key="waterfall">
              <div className="dash-title">
                <span>Payout Waterfall</span>
                <NavLink className="dash-link" to="/payouts">payouts →</NavLink>
              </div>
              {(() => {
                const { gross, fees, net } = stats.waterfall;
                if (gross === 0 && net === 0) return <div className="muted">Sem payouts no período.</div>;
                const max = Math.max(1, Math.abs(gross), Math.abs(net));
                const rows = [
                  { label: 'Gross (bruto)', v: gross, cls: '' },
                  { label: '(−) Fees', v: -fees, cls: 'dash-neg' },
                  { label: 'Net (líquido)', v: net, cls: 'dash-pos' },
                ];
                return rows.map((r) => (
                  <div key={r.label} className="ac-wf-row">
                    <span className="ac-wf-label">{r.label}</span>
                    <span className="ac-wf-bar-wrap">
                      <span className={`ac-wf-bar ${r.v < 0 ? 'is-neg' : 'is-pos'}`} style={{ width: `${Math.round((Math.abs(r.v) / max) * 100)}%` }} />
                    </span>
                    <span className={`ac-wf-val ${r.cls}`}>{fmtMoney(r.v, 'USD')}</span>
                  </div>
                ));
              })()}
            </div>

            <div className="dash-section" key="pie">
              <AllocationPie title="Distribuição por tipo" data={stats.pieData} emptyLabel="Sem contas com saldo." />
            </div>

            <div className="dash-section" key="bykind">
              <div className="dash-title">
                <span>Contas por tipo</span>
                <NavLink className="dash-link" to="/accounts">gerenciar →</NavLink>
              </div>
              {Object.keys(stats.perKind).length === 0 ? (
                <div className="muted">Nenhuma conta ainda.</div>
              ) : Object.entries(stats.perKind).map(([kind, v]) => {
                const meta = KIND_META[kind] ?? KIND_META.cash;
                const Icon = meta.icon;
                return (
                  <div key={kind} className="ad-kind-row">
                    <span className="ad-kind-ico" style={{ color: meta.color, borderColor: meta.color }}><Icon size={15} /></span>
                    <span className="ad-kind-name">{meta.label}</span>
                    <span className="ad-kind-count">{v.count}</span>
                    <span className="ad-kind-bar-wrap"><span className="ad-kind-bar" style={{ width: `${Math.round((v.total / maxKind) * 100)}%`, background: meta.color }} /></span>
                    <span className="ad-kind-total">{fmtDisplay(v.total)}</span>
                  </div>
                );
              })}
            </div>

            <div className="dash-section" key="balances">
              <div className="dash-title">
                <span>Maiores saldos</span>
                <NavLink className="dash-link" to="/accounts">ver contas →</NavLink>
              </div>
              {stats.topBalances.length === 0 ? (
                <div className="muted">Sem contas líquidas.</div>
              ) : stats.topBalances.map((r) => {
                const meta = KIND_META[r.kind] ?? KIND_META.cash;
                const Icon = meta.icon;
                return (
                  <div key={r.id} className="dash-row">
                    <span className="ad-kind-ico" style={{ color: meta.color, borderColor: meta.color }}><Icon size={14} /></span>
                    <span className="dash-row-name">{r.name}</span>
                    <span className="dash-row-sub">{r.currency}</span>
                    <span className={`dash-row-val ${r.balance >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtMoney(r.balance, r.currency === 'USD' ? '$' : 'R$')}</span>
                  </div>
                );
              })}
            </div>
          </WidgetGrid>
        </>
      )}
    </div>
  );
}

const AD_CSS = `
.ad-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ad-stat { position: relative; overflow: hidden; background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 20px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.ad-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px; font-weight: 600; color: var(--muted, #a1a7b3); margin-bottom: 8px; }
.ad-stat-value { font-size: 1.7rem; font-weight: 800; line-height: 1.1; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.ad-stat-sub { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 6px; }

.ad-kind-row { display: grid; grid-template-columns: 26px 1fr auto 90px auto; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
.ad-kind-row:last-child { border-bottom: none; }
.ad-kind-ico { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid; background: rgba(255,255,255,0.03); }
.ad-kind-name { font-weight: 600; }
.ad-kind-count { font-size: 11px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.ad-kind-bar-wrap { height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.ad-kind-bar { display: block; height: 100%; border-radius: 999px; }
.ad-kind-total { font-variant-numeric: tabular-nums; font-weight: 700; text-align: right; }

.ac-matrix { display: flex; flex-direction: column; font-size: 12px; }
.ac-matrix-head, .ac-matrix-row { display: grid; grid-template-columns: 1.4fr 1fr 0.8fr 1fr 0.6fr 0.9fr 0.6fr 0.9fr; gap: 8px; align-items: center; padding: 7px 4px; }
.ac-matrix-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); border-bottom: 1px solid rgba(255,255,255,0.08); }
.ac-matrix-row { border-bottom: 1px solid rgba(255,255,255,0.04); }
.ac-matrix-row:last-child { border-bottom: none; }
.ac-matrix-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-matrix-kind, .ac-matrix-sync { color: var(--muted, #a1a7b3); }
.ac-matrix-num { font-variant-numeric: tabular-nums; text-align: right; }
.ac-matrix-status { font-size: 10px; font-weight: 800; text-transform: uppercase; }
.ac-matrix-status.is-ok { color: var(--green, #2ecc71); }
.ac-matrix-status.is-warn { color: var(--yellow, #e1b12c); }
.ac-matrix-status.is-stop { color: var(--red, #e74c3c); }
@media (max-width: 900px) {
  .ac-matrix-head { display: none; }
  .ac-matrix-row { grid-template-columns: 1fr auto; }
  .ac-matrix-kind, .ac-matrix-sync { display: none; }
}
.ac-wf-row { display: grid; grid-template-columns: 1fr 110px auto; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
.ac-wf-row:last-child { border-bottom: none; }
.ac-wf-label { font-weight: 600; }
.ac-wf-bar-wrap { height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.ac-wf-bar { display: block; height: 100%; border-radius: 999px; }
.ac-wf-bar.is-pos { background: linear-gradient(90deg, #2ecc71, #7bed9f); }
.ac-wf-bar.is-neg { background: linear-gradient(90deg, #e74c3c, #ff7b6b); }
.ac-wf-val { font-variant-numeric: tabular-nums; font-weight: 700; text-align: right; }
@media (max-width: 1000px) { .ad-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .ad-cards { grid-template-columns: 1fr; } .ad-kind-row { grid-template-columns: 26px 1fr auto auto; } .ad-kind-bar-wrap { display: none; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ad-styles')) {
  const style = document.createElement('style');
  style.id = 'ad-styles';
  style.textContent = AD_CSS;
  document.head.appendChild(style);
}
