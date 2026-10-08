// OptionIncome — renda de opções (realizado, prêmio aberto e série mensal). Auto-carrega
// as pernas de `option_legs` (via useFinance) e reage a mudanças. Reutilizável como widget
// no Trading Resumo e no Investimentos Resumo.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (integração F4 — renda).
import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { useFinance } from '@apps/state';
import { groupOptionLegs, optionIncomeByMonth, optionCoverage } from '@apps/lib/db';
import type { OptionLeg, Position } from '@apps/lib/db';
import { fmtMoney } from '../currency';

export default function OptionIncome({ height = 180 }: { height?: number }) {
  const finance = useFinance();
  const [legs, setLegs] = useState<OptionLeg[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!finance?.ds) return;
      try {
        const [l, p] = await Promise.all([
          finance.ds.optionLegs.list(),
          finance.ds.positions.list(),
        ]);
        if (alive) { setLegs(l); setPositions(p); }
      } catch {
        /* offline/sem store */
      }
    };
    load();
    const off = finance?.ds?.bus?.on?.('datastore:change', load);
    return () => { alive = false; if (typeof off === 'function') off(); };
  }, [finance]);

  const groups = useMemo(() => groupOptionLegs(legs), [legs]);
  const openGroups = groups.filter((g) => g.open);
  const openPremium = openGroups.reduce((s, g) => s + g.netPremium, 0);
  const realized = groups.reduce((s, g) => s + g.realizedPnl, 0);
  const monthly = useMemo(
    () => optionIncomeByMonth(legs).map((m) => ({ ym: m.month.slice(2), premium: m.premium })),
    [legs],
  );
  const coverage = useMemo(() => optionCoverage(legs, positions), [legs, positions]);
  const covered = coverage.reduce((s, c) => s + c.coveredContracts, 0);
  const shortCalls = coverage.reduce((s, c) => s + c.shortCallContracts, 0);

  if (groups.length === 0) {
    return <div className="muted">Sem posições de opções. Monte no módulo Opções (Trading → Opções).</div>;
  }

  return (
    <div className="oi-root">
      <div className="dash-cards" style={{ marginBottom: 10 }}>
        <div className="card accent16">
          <h3>Realizado</h3>
          <div className="stat" style={{ color: realized >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(realized, 'USD')}</div>
          <div className="muted">{groups.filter((g) => !g.open).length} estratégia(s) fechada(s)</div>
        </div>
        <div className="card accent17">
          <h3>Prêmio aberto</h3>
          <div className="stat">{fmtMoney(openPremium, 'USD')}</div>
          <div className="muted">{openGroups.length} aberta(s)</div>
        </div>
        <div className="card accent1">
          <h3>Estratégias</h3>
          <div className="stat">{groups.length}</div>
          <div className="muted">{legs.length} perna(s)</div>
        </div>
        <div className="card accent3">
          <h3>Cobertura (CC)</h3>
          <div className="stat">{shortCalls > 0 ? `${covered}/${shortCalls}` : '—'}</div>
          <div className="muted">calls cobertas por ações</div>
        </div>
      </div>

      {monthly.length >= 1 && (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
            <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={48} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
            <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
            <Bar dataKey="premium" name="Prêmio realizado">
              {monthly.map((m) => (
                <Cell key={m.ym} fill={m.premium >= 0 ? '#2ecc71' : '#e74c3c'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
