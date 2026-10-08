// Analyzer de opções (estilo Quantower/OptionStrat): builder por template + payoff,
// breakevens, máx lucro/perda, gregas líquidas e prêmio. Funciona OFFLINE (preços
// teóricos via BSM) — nenhuma fórmula aqui: tudo de `@apps/lib/db` (§ Opções).
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (sub-aba Analyzer, fase F2).
import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  bsmPrice,
  summarizeOptionStrategy,
  DEFAULT_OPTION_TEMPLATES,
  optionTemplatesByCategory,
} from '@apps/lib/db';
import type { OptionLeg, OptionTemplateCategory } from '@apps/lib/db';
import { fmtMoney } from '../currency';

const CATEGORY_LABEL: Record<OptionTemplateCategory, string> = {
  up: 'Alta',
  down: 'Baixa',
  vol: 'Volatilidade',
  arb: 'Arbitragem',
};

const MULTIPLIER = 100;

function fmtSigned(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

function buildLegs(params: {
  templateId: string;
  spot: number;
  atmStrike: number;
  strikeStep: number;
  contracts: number;
  iv: number;
  rate: number;
  days: number;
}): OptionLeg[] {
  const { templateId, spot, atmStrike, strikeStep, contracts, iv, rate, days } = params;
  const template = DEFAULT_OPTION_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return [];
  const T = days / 365;
  const expiry = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return template.legs.map((leg, i) => {
    const strike = leg.strikeOffset === 'atm' ? atmStrike : atmStrike + leg.strikeOffset * strikeStep;
    const price = bsmPrice({ S: spot, K: strike, T, r: rate, sigma: iv, right: leg.right, q: 0 }) ?? 0;
    return {
      id: `${templateId}_${i}`,
      accountId: '',
      underlying: 'ANALYZER',
      symbol: `${templateId.toUpperCase()}${i}`,
      right: leg.right,
      strike,
      expiry,
      qty: leg.qty * contracts,
      multiplier: MULTIPLIER,
      entryPrice: price,
      entryDatetime: new Date().toISOString(),
      fees: 0,
      ivEntry: iv,
      source: 'manual',
      updatedAt: new Date().toISOString(),
      deviceId: '',
      version: 0,
    } satisfies OptionLeg;
  });
}

export default function OptionAnalyzer() {
  const [templateId, setTemplateId] = useState('bull-call-spread');
  const [spot, setSpot] = useState(100);
  const [atmStrike, setAtmStrike] = useState(100);
  const [strikeStep, setStrikeStep] = useState(5);
  const [contracts, setContracts] = useState(1);
  const [ivPct, setIvPct] = useState(30);
  const [ratePct, setRatePct] = useState(5);
  const [days, setDays] = useState(45);

  const legs = useMemo(
    () =>
      buildLegs({
        templateId,
        spot,
        atmStrike,
        strikeStep,
        contracts,
        iv: Math.max(0.0001, ivPct / 100),
        rate: ratePct / 100,
        days,
      }),
    [templateId, spot, atmStrike, strikeStep, contracts, ivPct, ratePct, days],
  );

  const summary = useMemo(
    () => summarizeOptionStrategy(legs, { S: spot, r: ratePct / 100, rangePct: 0.5, points: 121 }),
    [legs, spot, ratePct],
  );

  const template = DEFAULT_OPTION_TEMPLATES.find((t) => t.id === templateId);

  return (
    <div className="oa-root">
      <div className="card oa-controls" role="group" aria-label="Parâmetros do Analyzer">
        <label className="oa-field">
          <span>Estratégia</span>
          <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {(Object.keys(CATEGORY_LABEL) as OptionTemplateCategory[]).map((cat) => (
              <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
                {optionTemplatesByCategory(cat).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="oa-field"><span>Subjacente</span><input className="input" type="number" value={spot} onChange={(e) => setSpot(Number(e.target.value))} /></label>
        <label className="oa-field"><span>Strike ATM</span><input className="input" type="number" value={atmStrike} onChange={(e) => setAtmStrike(Number(e.target.value))} /></label>
        <label className="oa-field"><span>Passo do strike</span><input className="input" type="number" value={strikeStep} onChange={(e) => setStrikeStep(Number(e.target.value))} /></label>
        <label className="oa-field"><span>Contratos</span><input className="input" type="number" min={1} value={contracts} onChange={(e) => setContracts(Math.max(1, Number(e.target.value)))} /></label>
        <label className="oa-field"><span>IV (%)</span><input className="input" type="number" value={ivPct} onChange={(e) => setIvPct(Number(e.target.value))} /></label>
        <label className="oa-field"><span>Taxa (%)</span><input className="input" type="number" value={ratePct} onChange={(e) => setRatePct(Number(e.target.value))} /></label>
        <label className="oa-field"><span>Dias</span><input className="input" type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} /></label>
      </div>

      {template && <p className="oa-desc muted">{template.name} — {template.description}</p>}

      <div className="oa-stats">
        <Stat label="Prêmio líquido" value={fmtMoney(summary.netPremium, 'USD')} tone={summary.netPremium >= 0 ? 'pos' : 'neg'} />
        <Stat label="Máx lucro" value={summary.maxProfitUnbounded ? '∞' : fmtMoney(summary.maxProfit, 'USD')} tone="pos" />
        <Stat label="Máx perda" value={summary.maxLossUnbounded ? '∞' : fmtMoney(summary.maxLoss, 'USD')} tone="neg" />
        <Stat label="Breakevens" value={summary.breakevens.length ? summary.breakevens.map((b) => b.toFixed(2)).join(' / ') : '—'} />
        <Stat label="Δ (ações)" value={summary.greeks.delta.toFixed(2)} />
        <Stat label="Δ-notional" value={fmtMoney(summary.deltaNotional, 'USD')} />
        <Stat label="Γ" value={summary.greeks.gamma.toFixed(3)} />
        <Stat label="Θ (ano)" value={summary.greeks.theta.toFixed(1)} tone={summary.greeks.theta >= 0 ? 'pos' : 'neg'} />
        <Stat label="Vega" value={summary.greeks.vega.toFixed(1)} />
        <Stat label="ρ" value={summary.greeks.rho.toFixed(1)} />
      </div>

      <div className="card oa-chart">
        <div className="oa-chart-title">Payoff no vencimento</div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={summary.payoff} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="oaPnl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="S" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 11 }} stroke="#a1a7b3" tickFormatter={(v: number) => v.toFixed(0)} />
            <YAxis tick={{ fontSize: 11 }} stroke="#a1a7b3" tickFormatter={(v: number) => v.toFixed(0)} width={48} />
            <Tooltip
              contentStyle={{ background: '#0f1218', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 12 }}
              formatter={(v: number) => [fmtMoney(v, 'USD'), 'P/L']}
              labelFormatter={(v: number) => `Subjacente ${Number(v).toFixed(2)}`}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
            <ReferenceLine x={spot} stroke="#22d3ee" strokeDasharray="4 4" label={{ value: 'spot', fontSize: 10, fill: '#22d3ee' }} />
            {summary.breakevens.map((b) => (
              <ReferenceLine key={b} x={b} stroke="#e1b12c" strokeDasharray="2 4" />
            ))}
            <Area type="monotone" dataKey="pnl" stroke="#7c5cff" strokeWidth={2} fill="url(#oaPnl)" />
            <Line type="monotone" dataKey="pnl" stroke="#7c5cff" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="muted oa-hint">
          Preços teóricos (Black-Scholes) — sem cotações ao vivo. O Desk/Posições entram na F3 (bridge).
        </p>
      </div>

      <style>{OA_CSS}</style>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="card oa-stat">
      <span className="muted oa-stat-label">{label}</span>
      <b className="oa-stat-value" style={{ color: tone === 'pos' ? 'var(--green)' : tone === 'neg' ? 'var(--red)' : undefined }}>{value}</b>
    </div>
  );
}

const OA_CSS = `
.oa-root { display: flex; flex-direction: column; gap: 12px; }
.oa-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.oa-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.oa-field span { color: var(--muted, #a1a7b3); }
.oa-desc { font-size: 12px; margin: 0; }
.oa-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.oa-stat { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; }
.oa-stat-label { font-size: 11px; }
.oa-stat-value { font-size: 15px; font-variant-numeric: tabular-nums; }
.oa-chart { padding: 12px; }
.oa-chart-title { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
.oa-hint { font-size: 11px; margin: 8px 0 0; }
@media (max-width: 720px) {
  .oa-stats { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
}
`;
