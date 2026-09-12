// Dashboard do módulo Contas (porta de entrada). Reaproveita a ideia da dashboard
// antiga (cards de Total payouts / Capital / ROI / Contas) — entendendo que as contas
// NÃO são só prop: inclui banco/carteira/investimento/cripto/dinheiro. Composição pura.
import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import FirmPnl from '@apps/ui/FirmPnl';
import WidgetGrid from '@apps/ui/WidgetGrid';
import { fmtMoney } from '@apps/ui/currency';
import { firmPnlByFirm, firmPnlHistory, listFirms, computeAccountBalance } from '@apps/lib/db';

const KIND_LABEL = {
  prop: 'Prop', wallet: 'Cripto/Carteira', investment: 'Investimento', bank: 'Banco', cash: 'Dinheiro', crypto: 'Cripto/Carteira',
};

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
  const { loading, data } = useEngineData(async (f) => {
    const [accounts, propExts, payouts, txs, firms] = await Promise.all([
      f.ds.accounts.list(),
      f.ds.propExtensions.list(),
      f.ds.payouts.list(),
      f.ds.transactions.list(),
      listFirms(f.ds),
    ]);
    const balances = {};
    for (const a of accounts) balances[a.id] = computeAccountBalance(txs, a.id);
    return { accounts, propExts, payouts, txs, firms, balances, firmsPnl: firmPnlByFirm(txs), history: firmPnlHistory(txs, 6) };
  });

  const stats = useMemo(() => {
    const accounts = data?.accounts ?? [];
    const propExts = data?.propExts ?? [];
    const payouts = data?.payouts ?? [];
    const balances = data?.balances ?? {};
    const capital = propExts.reduce((s, p) => s + (p.nominalSize || 0), 0);
    const netPayouts = payouts.reduce((s, p) => s + (Number(p.net) || 0), 0);
    const roi = capital > 0 ? netPayouts / capital : 0;
    const liquidByCurrency = {};
    const byKind = {};
    for (const a of accounts) {
      byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
      if (!['bank', 'wallet', 'cash', 'crypto'].includes(a.kind)) continue;
      liquidByCurrency[a.currency] = (liquidByCurrency[a.currency] ?? 0) + (balances[a.id] ?? 0);
    }
    return { total: accounts.length, capital, netPayouts, roi, liquidByCurrency, byKind, propCount: byKind.prop ?? 0, payoutsCount: payouts.length };
  }, [data]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Contas</h1></div>
      <ModuleTabs module="contas" />

      {loading || !data ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando contas…</div>
      ) : (
        <>
          <div className="ad-cards">
            <StatCard
              label="Líquido (por moeda)"
              value={Object.keys(stats.liquidByCurrency).length === 0 ? '—' : Object.entries(stats.liquidByCurrency).map(([cur, v]) => fmtMoney(v, cur)).join(' · ')}
              sub="banco · carteira · cripto · dinheiro"
              color="#3b82f6" glow="rgba(59,130,246,0.15)"
            />
            <StatCard label="Capital gerido" value={fmtMoney(stats.capital, 'USD')} sub={`${stats.propCount} conta(s) prop`} color="#7c5cff" glow="rgba(124,92,255,0.15)" />
            <StatCard label="Total payouts" value={fmtMoney(stats.netPayouts, 'USD')} sub={`${stats.payoutsCount} payout(s)`} color="#10b981" glow="rgba(16,185,129,0.15)" />
            <StatCard label="ROI" value={`${(stats.roi * 100).toFixed(2)}%`} sub="lucro / capital" color={stats.roi >= 0 ? '#7c5cff' : '#ef4444'} glow="rgba(124,92,255,0.15)" />
            <StatCard label="Contas" value={String(stats.total)} sub="todas as contas" color="#f59e0b" glow="rgba(245,158,11,0.15)" />
            <StatCard label="Firms" value={String((data.firms ?? []).length)} sub="empresas cadastradas" color="#22d3ee" glow="rgba(34,211,238,0.15)" />
          </div>

          <WidgetGrid storageKey="contas">
            <div className="dash-section" key="bykind">
              <div className="dash-title">
                <span>Contas por tipo</span>
                <NavLink className="dash-link" to="/accounts">gerenciar →</NavLink>
              </div>
              {Object.keys(stats.byKind).length === 0 ? (
                <div className="muted">Nenhuma conta ainda.</div>
              ) : Object.entries(stats.byKind).map(([kind, n]) => (
                <div key={kind} className="dash-row">
                  <span className="dash-row-name">{KIND_LABEL[kind] ?? kind}</span>
                  <span className="dash-row-val">{n}</span>
                </div>
              ))}
            </div>

            {data.firmsPnl.length > 0 && (
              <div className="dash-section" key="firms">
                <div className="dash-title">
                  <span>P&L por firm</span>
                  <NavLink className="dash-link" to="/firms">firms →</NavLink>
                </div>
                <FirmPnl rows={data.firmsPnl} history={data.history} colorById={Object.fromEntries((data.firms ?? []).map((f) => [f.id, f.color]))} loading={false} />
              </div>
            )}
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
.ad-widgets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
@media (max-width: 1000px) { .ad-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ad-widgets { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .ad-cards { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ad-styles')) {
  const style = document.createElement('style');
  style.id = 'ad-styles';
  style.textContent = AD_CSS;
  document.head.appendChild(style);
}
