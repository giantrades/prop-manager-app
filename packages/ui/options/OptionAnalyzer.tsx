// OptionAnalyzer (estilo OptionStrat/Quantower). UM workspace só: à esquerda a CADEIA
// (Expiração/Strikes + Calls/Strike/Puts; clicar no preço monta a perna), à direita o
// gráfico grande + gregas + tabela de pernas editável. Parâmetros globais (spot/taxa/
// multiplicador) vêm de fora — aqui só IV padrão, janela e a estratégia que semeia.
// TODA conta vem de `@apps/lib/db` (§ Opções). Multiplicador do contrato nunca assumido.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (sub-aba Analyzer).
import React, { useEffect, useMemo, useState } from 'react';
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
  Legend,
} from 'recharts';
import {
  bsmPrice,
  summarizeOptionStrategy,
  optionTheoreticalCurve,
  optionGreeksCurve,
  optionThetaPerDay,
  optionVegaPerPoint,
  optionRhoPerPoint,
  optionLegTheoreticalValue,
  optionLegRealizedPnl,
  buildOptionLegFromQuote,
  optionQuoteMid,
  nearestStrike,
  optionDaysToExpiry,
  DEFAULT_OPTION_TEMPLATES,
  optionTemplatesByCategory,
} from '@apps/lib/db';
import type { OptionChainQuote, OptionLeg, OptionRight, OptionStrategyGroup, OptionTemplateCategory } from '@apps/lib/db';
import { fmtMoney } from '../currency';
import { ensureOptionStyles } from './optionStyles';
import UnderlyingSearch from './UnderlyingSearch';

ensureOptionStyles();

const CATEGORY_LABEL: Record<OptionTemplateCategory, string> = {
  up: 'Alta',
  down: 'Baixa',
  vol: 'Volatilidade',
  arb: 'Arbitragem',
};

const WI_COLORS = ['var(--blue)', 'var(--yellow)', 'var(--green)', 'var(--red)', 'var(--muted)'];

interface Scenario {
  id: number;
  volPts: number;
  days: number;
}

export interface AnalyzerPreload {
  id: number;
  legs: OptionLeg[];
  underlying: string;
}

interface Props {
  underlyings: string[];
  /** Lista com busca (do bridge) para escolher o subjacente. */
  underlyingOptions?: Array<{ underlying: string; count?: number }>;
  quotes: OptionChainQuote[];
  spots: Record<string, number>;
  rate: number; // decimal
  defaultMultiplier: number | null;
  multipliers?: Record<string, number>;
  paper: OptionLeg[];
  groups: OptionStrategyGroup[];
  preload?: AnalyzerPreload | null;
  onSendToPaper?: (legs: OptionLeg[]) => void;
  onSaveLegs?: (legs: OptionLeg[]) => void;
  onEditChain?: () => void;
}

const num = (e: React.ChangeEvent<HTMLInputElement>): number => (e.target.value === '' ? NaN : Number(e.target.value));
const val = (n: number): number | string => (Number.isFinite(n) ? n : '');
const isoDateIn = (days: number): string => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const mid = (q?: OptionChainQuote): number | null => (q ? optionQuoteMid(q) : null);
const dteOf = (expiry: string): number => Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000));

export default function OptionAnalyzer({
  underlyings,
  underlyingOptions,
  quotes,
  spots,
  rate,
  defaultMultiplier,
  multipliers,
  paper,
  groups,
  preload,
  onSendToPaper,
  onSaveLegs,
  onEditChain,
}: Props) {
  const [templateId, setTemplateId] = useState('custom');
  const [underlying, setUnderlying] = useState<string>(underlyings[0] ?? '');
  const [ivPct, setIvPct] = useState(30);
  const [rangePct, setRangePct] = useState(50);
  const [chainExpiry, setChainExpiry] = useState('');
  const [strikeWindow, setStrikeWindow] = useState(0); // 0 = todos; N = ±N strikes do ATM
  const [addSide, setAddSide] = useState<'long' | 'short'>('long');
  const [legs, setLegs] = useState<OptionLeg[]>([]);
  const [showExpiry, setShowExpiry] = useState(true);
  const [showT0, setShowT0] = useState(true);
  const [greek, setGreek] = useState<'none' | 'delta' | 'gamma' | 'theta' | 'vega' | 'rho'>('none');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  const spot = spots[underlying] ?? NaN;
  const effSpot = spot > 0 ? spot : 100;
  const effMultiplier = (multipliers?.[underlying] ?? defaultMultiplier ?? 1);
  const r = rate;

  // ---- cadeia do subjacente ----
  const chainQuotes = useMemo(() => quotes.filter((q) => q.underlying === underlying), [quotes, underlying]);
  const chainExpiries = useMemo(() => [...new Set(chainQuotes.map((q) => q.expiry))].sort(), [chainQuotes]);
  const activeExpiry = chainExpiries.includes(chainExpiry) ? chainExpiry : (chainExpiries[0] ?? '');
  const expiryQuotes = useMemo(() => chainQuotes.filter((q) => q.expiry === activeExpiry), [chainQuotes, activeExpiry]);
  const strikes = useMemo(() => [...new Set(expiryQuotes.map((q) => q.strike))].sort((a, b) => a - b), [expiryQuotes]);
  const atm = useMemo(() => nearestStrike(expiryQuotes, effSpot), [expiryQuotes, effSpot]);
  const visibleStrikes = useMemo(() => {
    if (!strikeWindow || atm == null) return strikes;
    const i = strikes.indexOf(atm);
    return strikes.slice(Math.max(0, i - strikeWindow), i + strikeWindow + 1);
  }, [strikes, strikeWindow, atm]);
  const quoteAt = (strike: number, right: OptionRight) => expiryQuotes.find((q) => q.strike === strike && q.right === right);

  // Seleciona subjacente inicial.
  useEffect(() => {
    if (!underlying && underlyings.length > 0) setUnderlying(underlyings[0]);
  }, [underlying, underlyings]);

  // "Analisar" vindo de Posições.
  useEffect(() => {
    if (!preload) return;
    setUnderlying(preload.underlying);
    setLegs(preload.legs.map((l) => ({ ...l })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload?.id]);

  // Semeia a estratégia a partir do template escolhido (ATM/passo vêm da cadeia quando há).
  const seed = (id: string) => {
    if (id === 'custom') return;
    const template = DEFAULT_OPTION_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    const step = (() => {
      const diffs = strikes.slice(1).map((s, i) => s - strikes[i]).filter((d) => d > 0);
      return diffs.length ? Math.min(...diffs) : 5;
    })();
    const base = atm ?? Math.round(effSpot);
    const expiry = activeExpiry || isoDateIn(45);
    const T = Math.max(1, optionDaysToExpiry(expiry)) / 365;
    setLegs(template.legs.map((leg, i) => {
      const strike = leg.strikeOffset === 'atm' ? base : base + leg.strikeOffset * step;
      const price = bsmPrice({ S: effSpot, K: strike, T, r, sigma: ivPct / 100, right: leg.right, q: 0 }) ?? 0;
      return {
        id: `${id}_${i}`,
        accountId: '',
        underlying: underlying || 'ANALYZER',
        symbol: `${underlying || 'ANALYZER'}${leg.right[0].toUpperCase()}${strike}`,
        right: leg.right,
        strike,
        expiry,
        qty: leg.qty,
        multiplier: effMultiplier,
        entryPrice: Number(price.toFixed(4)),
        entryDatetime: new Date().toISOString(),
        fees: 0,
        ivEntry: ivPct / 100,
        source: 'manual',
        updatedAt: new Date().toISOString(),
        deviceId: '',
        version: 0,
      } satisfies OptionLeg;
    }));
  };

  // Trocar a estratégia (ou o vencimento) re-semeia; "Personalizada" não mexe nas pernas.
  useEffect(() => {
    if (templateId !== 'custom') seed(templateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, activeExpiry]);

  const addFromChain = (quote: OptionChainQuote | undefined, side: 'long' | 'short') => {
    if (!quote) return;
    const price = mid(quote) ?? quote.last ?? 0;
    const qty = side === 'long' ? 1 : -1;
    setLegs((prev) => {
      const idx = prev.findIndex((l) => l.exitPrice == null && l.underlying === quote.underlying && l.expiry === quote.expiry && l.strike === quote.strike && l.right === quote.right);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty };
        return copy;
      }
      const leg = buildOptionLegFromQuote(quote, { accountId: '', qty, entryPrice: price, source: 'manual', multiplier: quote.multiplier || effMultiplier });
      return [...prev, { ...leg, ivEntry: quote.iv ?? ivPct / 100 }];
    });
  };

  const updateLeg = (i: number, patch: Partial<OptionLeg>) =>
    setLegs((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const removeLeg = (i: number) => setLegs((prev) => prev.filter((_, k) => k !== i));
  const addLeg = () => {
    setLegs((prev) => [
      ...prev,
      {
        id: `manual_${Date.now().toString(36)}_${prev.length}`,
        accountId: '',
        underlying: underlying || 'ANALYZER',
        symbol: `${underlying || 'ANALYZER'}C${atm ?? ''}`,
        right: 'call',
        strike: atm ?? Math.round(effSpot),
        expiry: activeExpiry || isoDateIn(45),
        qty: 1,
        multiplier: effMultiplier,
        entryPrice: 0,
        entryDatetime: new Date().toISOString(),
        fees: 0,
        ivEntry: ivPct / 100,
        source: 'manual',
        updatedAt: new Date().toISOString(),
        deviceId: '',
        version: 0,
      },
    ]);
  };

  const validLegs = useMemo(() => legs.filter((l) => l.strike > 0 && l.qty !== 0 && l.expiry && l.multiplier > 0), [legs]);
  const ready = effSpot > 0 && validLegs.length > 0;

  const analysis = useMemo(() => {
    if (!ready) return null;
    const summary = summarizeOptionStrategy(validLegs, { S: effSpot, r, rangePct: rangePct / 100, points: 121 });
    const min = summary.payoff[0]?.S ?? effSpot * 0.5;
    const max = summary.payoff[summary.payoff.length - 1]?.S ?? effSpot * 1.5;
    const grid = { min, max, points: 121 };
    const asOf = new Date();
    const fallbackIv = ivPct / 100;
    const t0 = optionTheoreticalCurve(validLegs, grid, { r, asOf, fallbackIv });
    const wi = scenarios.map((s) => optionTheoreticalCurve(validLegs, grid, { r, asOf, fallbackIv, volShift: s.volPts / 100, daysForward: s.days }));
    const gc = greek === 'none' ? [] : optionGreeksCurve(validLegs, grid, { r, now: asOf });
    const rows = summary.payoff.map((p, i) => {
      const row: Record<string, number> = { S: p.S, expiry: p.pnl, t0: t0.points[i]?.pnl ?? NaN };
      wi.forEach((c, k) => { row[`wi${k}`] = c.points[i]?.pnl ?? NaN; });
      if (gc[i]) {
        const g = gc[i];
        row.greek = greek === 'theta' ? optionThetaPerDay(g.theta)
          : greek === 'vega' ? optionVegaPerPoint(g.vega)
          : greek === 'rho' ? optionRhoPerPoint(g.rho)
          : g[greek as 'delta' | 'gamma'];
      }
      return row;
    });
    const unpriced = Math.max(t0.unpriced, ...wi.map((c) => c.unpriced), 0);
    return { summary, rows, unpriced };
  }, [ready, validLegs, effSpot, r, rangePct, scenarios, greek, ivPct]);

  const legRows = useMemo(() => {
    const scenario = { r, fallbackIv: ivPct / 100 };
    const now = Date.now();
    return legs.map((leg) => {
      const realized = optionLegRealizedPnl(leg);
      let mark: number | null = null;
      let pnl: number | null = null;
      if (realized != null) { mark = leg.exitPrice ?? 0; pnl = realized; }
      else {
        const v = optionLegTheoreticalValue(leg, effSpot, scenario);
        if (v != null) { mark = v; pnl = leg.qty * (leg.multiplier || 1) * (v - leg.entryPrice) - (leg.fees || 0); }
      }
      const dte = leg.expiry ? Math.max(0, Math.ceil((new Date(leg.expiry).getTime() - now) / 86400000)) : null;
      return { mark, pnl, dte };
    });
  }, [legs, r, ivPct, effSpot]);

  const addScenario = () =>
    setScenarios((prev) => (prev.length >= 5 ? prev : [...prev, { id: Date.now() + prev.length, volPts: 5, days: 15 }]));
  const patchScenario = (id: number, patch: Partial<Scenario>) =>
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const s = analysis?.summary;
  const money = (v: number) => fmtMoney(v, 'USD');

  return (
    <div className="opxa-root">
      {/* Toolbar compacta: subjacente + estratégia + IV + janela (spot/taxa/mult vêm dos globais) */}
      <div className="card opxa-toolbar" role="group" aria-label="Parâmetros do Analyzer">
        <div className="opxa-tf" style={{ minWidth: 160 }}>
          <span>Subjacente</span>
          <UnderlyingSearch
            value={underlying}
            onChange={setUnderlying}
            options={underlyingOptions && underlyingOptions.length ? underlyingOptions : underlyings.map((u) => ({ underlying: u }))}
          />
        </div>
        <label className="opxa-tf" style={{ minWidth: 150 }}><span>Estratégia</span>
          <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="custom">Personalizada (pela cadeia)</option>
            {(Object.keys(CATEGORY_LABEL) as OptionTemplateCategory[]).map((cat) => (
              <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
                {optionTemplatesByCategory(cat).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="opxa-tf"><span>IV %</span><input className="input" type="number" inputMode="decimal" value={val(ivPct)} onChange={(e) => setIvPct(num(e))} /></label>
        <label className="opxa-tf"><span>Janela</span>
          <select className="select" value={rangePct} onChange={(e) => setRangePct(Number(e.target.value))}>
            <option value={25}>±25%</option><option value={50}>±50%</option><option value={100}>±100%</option>
          </select>
        </label>
        <span className="opx-small opx-muted opxa-hint">
          spot {Number.isFinite(spot) ? spot : '—'} · taxa {(rate * 100).toFixed(1)}% · mult {effMultiplier}
        </span>
      </div>

      <div className="opxa-grid">
        {/* Esquerda: cadeia + What-If */}
        <aside className="opxa-side">
          <div className="card opx-panel">
            <div className="opx-row">
              <span className="opx-title opx-grow">Cadeia</span>
              <div className="opxa-seg" role="group" aria-label="Lado ao clicar">
                <button type="button" className="opx-chip" aria-pressed={addSide === 'long'} onClick={() => setAddSide('long')}>Compra</button>
                <button type="button" className="opx-chip" aria-pressed={addSide === 'short'} onClick={() => setAddSide('short')}>Venda</button>
              </div>
            </div>
            <div className="opxa-2col">
              <label className="opxa-tf"><span>Vencimento</span>
                <select className="select" value={activeExpiry} onChange={(e) => setChainExpiry(e.target.value)} disabled={chainExpiries.length === 0}>
                  {chainExpiries.length === 0 && <option value="">—</option>}
                  {chainExpiries.map((x) => <option key={x} value={x}>{x} ({dteOf(x)}d)</option>)}
                </select>
              </label>
              <label className="opxa-tf"><span>Strikes</span>
                <select className="select" value={strikeWindow} onChange={(e) => setStrikeWindow(Number(e.target.value))}>
                  <option value={0}>Todos</option><option value={3}>±3</option><option value={5}>±5</option><option value={8}>±8</option>
                </select>
              </label>
            </div>

            {expiryQuotes.length === 0 ? (
              <div className="opx-empty" role="status">
                <b>Sem cadeia para {underlying || 'este subjacente'}</b>
                <span>Informe as cotações na aba Cotações (manual/CSV) ou conecte o bridge.</span>
                {onEditChain && <button type="button" className="opx-btn small" onClick={onEditChain}>Abrir Cotações</button>}
              </div>
            ) : (
              <div className="opxa-chain">
                <table className="opx-table">
                  <thead>
                    <tr>
                      <th colSpan={2} className="opx-th-call">CALLS</th>
                      <th className="opx-strike-col">Strike</th>
                      <th colSpan={2} className="opx-th-put">PUTS</th>
                    </tr>
                    <tr><th>Δ</th><th>Preço</th><th className="opx-strike-col" /><th>Preço</th><th>Δ</th></tr>
                  </thead>
                  <tbody>
                    {visibleStrikes.map((k) => {
                      const c = quoteAt(k, 'call');
                      const p = quoteAt(k, 'put');
                      const cm = mid(c);
                      const pm = mid(p);
                      return (
                        <tr key={k} className={atm === k ? 'opx-desk-atm' : ''}>
                          <td className="opx-num">{c?.greeks?.delta != null ? c.greeks.delta.toFixed(2) : '—'}</td>
                          <td><button type="button" className="opxa-price call" disabled={cm == null} onClick={() => addFromChain(c, addSide)}>{cm != null ? cm.toFixed(2) : '—'}</button></td>
                          <td className="opx-strike-col">{k}</td>
                          <td><button type="button" className="opxa-price put" disabled={pm == null} onClick={() => addFromChain(p, addSide)}>{pm != null ? pm.toFixed(2) : '—'}</button></td>
                          <td className="opx-num">{p?.greeks?.delta != null ? p.greeks.delta.toFixed(2) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <span className="opx-small opx-muted">Clique no preço para adicionar a perna como <b>{addSide === 'long' ? 'compra' : 'venda'}</b>.</span>
              </div>
            )}
          </div>

          <div className="card opx-panel">
            <div className="opx-row">
              <span className="opx-title opx-grow">What-If ({scenarios.length}/5)</span>
              <button type="button" className="opx-btn small" disabled={scenarios.length >= 5} onClick={addScenario}>+ Cenário</button>
            </div>
            {scenarios.length === 0 && <span className="opx-small opx-muted">Choque de vol (pontos) + dias à frente.</span>}
            {scenarios.map((sc, k) => (
              <div key={sc.id} className="opxa-wi">
                <span className="opxa-wi-dot" style={{ background: WI_COLORS[k] }} aria-hidden="true" />
                <input className="input" type="number" aria-label={`Choque de vol cenário ${k + 1} (pontos)`} value={val(sc.volPts)} onChange={(e) => patchScenario(sc.id, { volPts: num(e) || 0 })} />
                <input className="input" type="number" min={0} aria-label={`Dias à frente cenário ${k + 1}`} value={val(sc.days)} onChange={(e) => patchScenario(sc.id, { days: Math.max(0, num(e) || 0) })} />
                <button type="button" className="opx-btn small" aria-label={`Remover cenário ${k + 1}`} onClick={() => setScenarios((prev) => prev.filter((x) => x.id !== sc.id))}>✕</button>
              </div>
            ))}
          </div>
        </aside>

        {/* Direita: gráfico + gregas + pernas */}
        <main className="opxa-main">
          <div className="card opxa-chart">
            <div className="opx-row">
              <span className="opx-title opx-grow">P/L × preço do subjacente</span>
              <button type="button" className="opx-chip" aria-pressed={showExpiry} onClick={() => setShowExpiry((v) => !v)}>Vencimento</button>
              <button type="button" className="opx-chip" aria-pressed={showT0} onClick={() => setShowT0((v) => !v)}>T+0</button>
              <select className="select" style={{ minHeight: 32, width: 'auto' }} aria-label="Overlay de grega" value={greek} onChange={(e) => setGreek(e.target.value as typeof greek)}>
                <option value="none">Sem overlay</option><option value="delta">Δ Delta</option><option value="gamma">Γ Gamma</option>
                <option value="theta">Θ Theta (dia)</option><option value="vega">V Vega (1 pt)</option><option value="rho">ρ Rho (1 pt)</option>
              </select>
            </div>

            {analysis && s ? (
              <>
                <ResponsiveContainer width="100%" height={380}>
                  <ComposedChart data={analysis.rows} margin={{ top: 8, right: greek === 'none' ? 12 : 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="opxPnl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style={{ stopColor: 'var(--brand)', stopOpacity: 0.4 }} />
                        <stop offset="100%" style={{ stopColor: 'var(--brand)', stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--soft)" />
                    <XAxis dataKey="S" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 11 }} stroke="var(--muted)" tickFormatter={(v: number) => v.toFixed(0)} />
                    <YAxis yAxisId="pnl" tick={{ fontSize: 11 }} stroke="var(--muted)" tickFormatter={(v: number) => v.toFixed(0)} width={52} />
                    {greek !== 'none' && <YAxis yAxisId="g" orientation="right" tick={{ fontSize: 11 }} stroke="var(--yellow)" tickFormatter={(v: number) => v.toFixed(2)} width={48} />}
                    <Tooltip
                      contentStyle={{ background: 'var(--panel)', border: '1px solid var(--soft)', borderRadius: 10, fontSize: 12 }}
                      formatter={(v: number, name: string) => [name.startsWith('Grega') ? Number(v).toFixed(4) : money(Number(v)), name]}
                      labelFormatter={(v: number) => `Subjacente ${Number(v).toFixed(2)}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine yAxisId="pnl" y={0} stroke="var(--muted)" />
                    <ReferenceLine yAxisId="pnl" x={effSpot} stroke="var(--blue)" strokeDasharray="4 4" label={{ value: 'spot', fontSize: 10, fill: 'var(--blue)' }} />
                    {s.breakevens.map((b) => <ReferenceLine key={`be${b}`} yAxisId="pnl" x={b} stroke="var(--yellow)" strokeDasharray="2 4" />)}
                    {[...new Set(validLegs.map((l) => l.strike))].map((k) => <ReferenceLine key={`k${k}`} yAxisId="pnl" x={k} stroke="var(--gray)" strokeDasharray="1 5" />)}
                    {showExpiry && <Area yAxisId="pnl" type="monotone" dataKey="expiry" name="Vencimento" stroke="var(--brand)" strokeWidth={2} fill="url(#opxPnl)" isAnimationActive={false} />}
                    {showT0 && <Line yAxisId="pnl" type="monotone" dataKey="t0" name="T+0" stroke="var(--text)" strokeWidth={2} dot={false} isAnimationActive={false} />}
                    {scenarios.map((sc, k) => (
                      <Line key={sc.id} yAxisId="pnl" type="monotone" dataKey={`wi${k}`} name={`What-If ${k + 1} (${sc.volPts >= 0 ? '+' : ''}${sc.volPts} vol, +${sc.days}d)`} stroke={WI_COLORS[k]} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                    ))}
                    {greek !== 'none' && <Line yAxisId="g" type="monotone" dataKey="greek" name={`Grega: ${greek}`} stroke="var(--yellow)" strokeWidth={1.5} strokeDasharray="2 2" dot={false} isAnimationActive={false} />}
                  </ComposedChart>
                </ResponsiveContainer>

                <div className="opxa-greeks" aria-label="Gregas líquidas da estratégia">
                  <Gk label="Δ" value={s.greeks.delta.toFixed(2)} />
                  <Gk label="Γ" value={s.greeks.gamma.toFixed(3)} />
                  <Gk label="Θ/dia" value={optionThetaPerDay(s.greeks.theta).toFixed(2)} tone={s.greeks.theta >= 0 ? 'pos' : 'neg'} />
                  <Gk label="V/1pt" value={optionVegaPerPoint(s.greeks.vega).toFixed(2)} />
                  <Gk label="ρ/1pt" value={optionRhoPerPoint(s.greeks.rho).toFixed(2)} />
                  <Gk label="Prêmio" value={money(s.netPremium)} tone={s.netPremium >= 0 ? 'pos' : 'neg'} />
                  <Gk label="Máx lucro" value={s.maxProfitUnbounded ? '∞' : money(s.maxProfit)} tone="pos" />
                  <Gk label="Máx perda" value={s.maxLossUnbounded ? '∞' : money(s.maxLoss)} tone="neg" />
                  <Gk label="Breakevens" value={s.breakevens.length ? s.breakevens.map((b) => b.toFixed(2)).join(' / ') : '—'} />
                </div>
                {analysis.unpriced > 0 && (
                  <div className="opx-alert warn" role="alert">
                    <b>{analysis.unpriced} perna(s) sem IV.</b>
                    <span>Foi usada a IV padrão ({ivPct}%) nas curvas T+0/What-If.</span>
                  </div>
                )}
              </>
            ) : (
              <div className="opx-empty" role="status">
                <b>Monte a estratégia</b>
                <span>Escolha uma estratégia acima ou clique nos preços da cadeia para adicionar pernas.</span>
              </div>
            )}
          </div>

          <div className="card opx-panel">
            <div className="opx-row">
              <span className="opx-title opx-grow">Pernas ({legs.length})</span>
              <button type="button" className="opx-btn small" onClick={addLeg}>+ Perna</button>
              {paper.length > 0 && <button type="button" className="opx-btn small" onClick={() => setLegs(paper.map((l) => ({ ...l })))}>Do paper</button>}
              {onSaveLegs && <button type="button" className="opx-btn small primary" disabled={validLegs.length === 0} onClick={() => onSaveLegs(validLegs)}>Salvar estratégia</button>}
              {onSendToPaper && <button type="button" className="opx-btn small" disabled={validLegs.length === 0} onClick={() => onSendToPaper(validLegs)}>→ Paper</button>}
            </div>
            {legs.length === 0 ? (
              <span className="opx-small opx-muted">Nenhuma perna. Escolha uma estratégia ou clique na cadeia.</span>
            ) : (
              <div className="opx-scroll">
                <table className="opx-table" aria-label="Pernas da estratégia">
                  <thead>
                    <tr>
                      <th className="left">Ticker</th><th>Qtd</th><th className="left">Tipo</th><th className="left">Venc.</th><th>Dias</th><th>Strike</th><th>Entrada</th><th>IV%</th><th>Mark</th><th>P/L</th><th aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((l, i) => {
                      const closed = l.exitPrice != null;
                      const row = legRows[i] ?? { mark: null, pnl: null, dte: null };
                      return (
                        <tr key={l.id + i}>
                          <td className="left opx-num">{l.symbol}</td>
                          <td><input className="input" type="number" aria-label={`Quantidade da perna ${i + 1}`} disabled={closed} value={val(l.qty)} onChange={(e) => updateLeg(i, { qty: num(e) })} /></td>
                          <td className="left">
                            <select className="select" aria-label={`Tipo da perna ${i + 1}`} disabled={closed} value={l.right} onChange={(e) => updateLeg(i, { right: e.target.value as OptionRight })}>
                              <option value="call">Call</option><option value="put">Put</option>
                            </select>
                          </td>
                          <td className="left"><input className="input" type="date" aria-label={`Vencimento da perna ${i + 1}`} disabled={closed} value={l.expiry} onChange={(e) => updateLeg(i, { expiry: e.target.value })} /></td>
                          <td className="opx-num">{row.dte ?? '—'}</td>
                          <td><input className="input" type="number" inputMode="decimal" aria-label={`Strike da perna ${i + 1}`} disabled={closed} value={val(l.strike)} onChange={(e) => updateLeg(i, { strike: num(e) })} /></td>
                          <td><input className="input" type="number" inputMode="decimal" aria-label={`Preço de entrada da perna ${i + 1}`} disabled={closed} value={val(l.entryPrice)} onChange={(e) => updateLeg(i, { entryPrice: num(e) })} /></td>
                          <td><input className="input" type="number" inputMode="decimal" aria-label={`IV da perna ${i + 1}`} disabled={closed} value={l.ivEntry != null ? Number((l.ivEntry * 100).toFixed(2)) : ''} onChange={(e) => updateLeg(i, { ivEntry: e.target.value === '' ? undefined : Number(e.target.value) / 100 })} /></td>
                          <td className="opx-num">{row.mark != null ? row.mark.toFixed(2) : '—'}</td>
                          <td className={`opx-num${row.pnl == null ? '' : row.pnl >= 0 ? ' opx-pos' : ' opx-neg'}`}>{row.pnl != null ? money(row.pnl) : '—'}</td>
                          <td><button type="button" className="opx-btn small" aria-label={`Remover perna ${i + 1}`} onClick={() => removeLeg(i)}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Gk({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <span className="opxa-gk">
      <span className="opx-muted">{label}</span>
      <b className={tone === 'pos' ? 'opx-pos' : tone === 'neg' ? 'opx-neg' : ''}>{value}</b>
    </span>
  );
}
