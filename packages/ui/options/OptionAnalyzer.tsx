// OptionAnalyzer (estilo Quantower/OptionStrat). Origem das pernas: template (37), paper do
// Desk ou posição salva — e as pernas são EDITÁVEIS (strike, qty, tipo, vencimento, entrada,
// IV). Gráfico: payoff no vencimento, curva T+0 (valor teórico hoje), até 5 curvas What-If
// tracejadas (choque de vol + decaimento de tempo) e overlay de gregas (Δ Γ Θ V ρ) em eixo
// secundário. TODA conta vem de `@apps/lib/db` (§ Opções) — aqui só composição e formatação.
// O multiplicador do contrato é informado pelo usuário/contrato: nunca assumido.
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
  DEFAULT_OPTION_TEMPLATES,
  optionTemplatesByCategory,
} from '@apps/lib/db';
import type { OptionLeg, OptionRight, OptionStrategyGroup, OptionTemplateCategory } from '@apps/lib/db';
import { fmtMoney } from '../currency';
import { ensureOptionStyles } from './optionStyles';

ensureOptionStyles();

const CATEGORY_LABEL: Record<OptionTemplateCategory, string> = {
  up: 'Alta',
  down: 'Baixa',
  vol: 'Volatilidade',
  arb: 'Arbitragem',
};

const WI_COLORS = ['var(--blue)', 'var(--yellow)', 'var(--green)', 'var(--red)', 'var(--muted)'];
const MULTIPLIER_PRESETS = [100, 10, 1];

type Source = 'template' | 'paper' | 'position';
type GreekKey = 'none' | 'delta' | 'gamma' | 'theta' | 'vega' | 'rho';
const GREEK_LABEL: Record<GreekKey, string> = {
  none: 'Sem overlay',
  delta: 'Δ Delta',
  gamma: 'Γ Gamma',
  theta: 'Θ Theta (dia)',
  vega: 'V Vega (1 pt)',
  rho: 'ρ Rho (1 pt)',
};

interface Scenario {
  id: number;
  volPts: number; // pontos de IV (ex.: +5)
  days: number; // dias à frente
}

export interface AnalyzerPreload {
  id: number;
  legs: OptionLeg[];
  underlying: string;
  /** Origem a exibir ('paper' mantém as pernas sincronizadas com o paper). Default: 'position'. */
  source?: Source;
}

interface Props {
  underlyings: string[];
  spots: Record<string, number>;
  rate: number; // decimal
  defaultMultiplier: number | null;
  multipliers?: Record<string, number>;
  paper: OptionLeg[];
  groups: OptionStrategyGroup[];
  preload?: AnalyzerPreload | null;
  onSendToPaper?: (legs: OptionLeg[]) => void;
}

const num = (e: React.ChangeEvent<HTMLInputElement>): number => (e.target.value === '' ? NaN : Number(e.target.value));
const val = (n: number): number | string => (Number.isFinite(n) ? n : '');

function isoDateIn(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function buildTemplateLegs(p: {
  templateId: string;
  underlying: string;
  spot: number;
  atmStrike: number;
  strikeStep: number;
  contracts: number;
  iv: number;
  rate: number;
  days: number;
  multiplier: number;
}): OptionLeg[] {
  const template = DEFAULT_OPTION_TEMPLATES.find((t) => t.id === p.templateId);
  if (!template) return [];
  const T = p.days / 365;
  const expiry = isoDateIn(p.days);
  return template.legs.map((leg, i) => {
    const strike = leg.strikeOffset === 'atm' ? p.atmStrike : p.atmStrike + leg.strikeOffset * p.strikeStep;
    const price = bsmPrice({ S: p.spot, K: strike, T, r: p.rate, sigma: p.iv, right: leg.right, q: 0 }) ?? 0;
    return {
      id: `${p.templateId}_${i}`,
      accountId: '',
      underlying: p.underlying || 'ANALYZER',
      symbol: `${p.underlying || 'ANALYZER'}${leg.right[0].toUpperCase()}${strike}`,
      right: leg.right,
      strike,
      expiry,
      qty: leg.qty * p.contracts,
      multiplier: p.multiplier,
      entryPrice: Number(price.toFixed(4)),
      entryDatetime: new Date().toISOString(),
      fees: 0,
      ivEntry: p.iv,
      source: 'manual',
      updatedAt: new Date().toISOString(),
      deviceId: '',
      version: 0,
    } satisfies OptionLeg;
  });
}

export default function OptionAnalyzer({
  underlyings,
  spots,
  rate,
  defaultMultiplier,
  multipliers,
  paper,
  groups,
  preload,
  onSendToPaper,
}: Props) {
  const [source, setSource] = useState<Source>('template');
  const [templateId, setTemplateId] = useState('bull-call-spread');
  const [underlying, setUnderlying] = useState<string>(underlyings[0] ?? '');
  const [spot, setSpot] = useState<number>(spots[underlyings[0] ?? ''] ?? NaN);
  const [atmStrike, setAtmStrike] = useState<number>(Number.isFinite(spots[underlyings[0] ?? '']) ? Math.round(spots[underlyings[0] ?? '']) : NaN);
  const [strikeStep, setStrikeStep] = useState(5);
  const [contracts, setContracts] = useState(1);
  const [ivPct, setIvPct] = useState(30);
  const [ratePct, setRatePct] = useState(Number((rate * 100).toFixed(2)));
  const [days, setDays] = useState(45);
  const [multiplier, setMultiplier] = useState<number | null>(defaultMultiplier);
  const [rangePct, setRangePct] = useState(50);
  const [legs, setLegs] = useState<OptionLeg[]>([]);
  const [groupId, setGroupId] = useState('');
  const [showExpiry, setShowExpiry] = useState(true);
  const [showT0, setShowT0] = useState(true);
  const [greek, setGreek] = useState<GreekKey>('none');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  // Ao trocar de subjacente: puxa spot e multiplicador conhecidos (cadeia/posições/config).
  useEffect(() => {
    const s = spots[underlying];
    if (s && s > 0) {
      setSpot(s);
      setAtmStrike(Math.round(s));
    }
    const m = multipliers?.[underlying] ?? defaultMultiplier;
    if (m && m > 0) setMultiplier(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying]);

  // Parâmetros chegam de forma assíncrona (meta/cadeia): completa o que ainda estiver vazio.
  useEffect(() => {
    if (!underlying && underlyings.length > 0) setUnderlying(underlyings[0]);
  }, [underlying, underlyings]);
  useEffect(() => {
    const s = spots[underlying];
    if (s && s > 0 && !(spot > 0)) {
      setSpot(s);
      setAtmStrike(Math.round(s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, underlying]);
  useEffect(() => {
    const m = multipliers?.[underlying] ?? defaultMultiplier;
    if (!multiplier && m && m > 0) setMultiplier(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multipliers, defaultMultiplier, underlying]);

  // "Analisar" vindo de Posições.
  useEffect(() => {
    if (!preload) return;
    setSource(preload.source ?? 'position');
    setUnderlying(preload.underlying);
    setLegs(preload.legs.map((l) => ({ ...l })));
    const s = spots[preload.underlying];
    if (s && s > 0) setSpot(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload?.id]);

  const canGenerate = Boolean(multiplier && multiplier > 0 && spot > 0 && atmStrike > 0 && strikeStep > 0 && days > 0 && ivPct > 0);

  const generate = () => {
    if (!canGenerate || !multiplier) return;
    setLegs(
      buildTemplateLegs({
        templateId, underlying, spot, atmStrike, strikeStep, contracts, iv: ivPct / 100,
        rate: ratePct / 100, days, multiplier,
      }),
    );
  };

  // Template: gera ao entrar/trocar de template (se já há dados mínimos).
  useEffect(() => {
    if (source === 'template') generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, templateId, multiplier, canGenerate]);

  useEffect(() => {
    if (source === 'paper') setLegs(paper.map((l) => ({ ...l })));
  }, [source, paper]);

  useEffect(() => {
    if (source !== 'position') return;
    const g = groups.find((x) => x.id === groupId);
    if (g) {
      setLegs(g.legs.map((l) => ({ ...l })));
      setUnderlying(g.underlying);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, groupId]);

  const updateLeg = (i: number, patch: Partial<OptionLeg>) =>
    setLegs((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const removeLeg = (i: number) => setLegs((prev) => prev.filter((_, k) => k !== i));
  const addLeg = () => {
    if (!multiplier) return;
    setLegs((prev) => [
      ...prev,
      {
        id: `manual_${Date.now().toString(36)}_${prev.length}`,
        accountId: '',
        underlying: underlying || 'ANALYZER',
        symbol: `${underlying || 'ANALYZER'}C${atmStrike || ''}`,
        right: 'call',
        strike: Number.isFinite(atmStrike) ? atmStrike : 0,
        expiry: isoDateIn(days),
        qty: 1,
        multiplier,
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
  const ready = spot > 0 && validLegs.length > 0;
  const r = ratePct / 100;

  const analysis = useMemo(() => {
    if (!ready) return null;
    const summary = summarizeOptionStrategy(validLegs, { S: spot, r, rangePct: rangePct / 100, points: 121 });
    const min = summary.payoff[0]?.S ?? spot * 0.5;
    const max = summary.payoff[summary.payoff.length - 1]?.S ?? spot * 1.5;
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
  }, [ready, validLegs, spot, r, rangePct, scenarios, greek, ivPct]);

  const addScenario = () =>
    setScenarios((prev) => (prev.length >= 5 ? prev : [...prev, { id: Date.now() + prev.length, volPts: 5, days: Math.min(15, Math.max(1, days - 1)) }]));
  const patchScenario = (id: number, patch: Partial<Scenario>) =>
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const template = DEFAULT_OPTION_TEMPLATES.find((t) => t.id === templateId);
  const openGroups = groups.filter((g) => g.open);
  const s = analysis?.summary;
  const money = (v: number) => fmtMoney(v, 'USD');

  return (
    <div className="opx-stack">
      <div className="card opx-panel" role="group" aria-label="Origem e parâmetros do Analyzer">
        <div className="opx-row" role="tablist" aria-label="Origem das pernas">
          {([['template', 'Template'], ['paper', `Paper (${paper.length})`], ['position', 'Posição salva']] as Array<[Source, string]>).map(([id, label]) => (
            <button key={id} type="button" role="tab" className="opx-chip" aria-selected={source === id} aria-pressed={source === id} onClick={() => setSource(id)}>{label}</button>
          ))}
        </div>

        <div className="opx-fields">
          <label className="opx-field"><span>Subjacente</span>
            <input className="input" list="opx-underlyings" value={underlying} onChange={(e) => setUnderlying(e.target.value.toUpperCase())} placeholder="ex.: AAPL" />
            <datalist id="opx-underlyings">{underlyings.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
          <label className="opx-field"><span>Spot</span><input className="input" type="number" inputMode="decimal" value={val(spot)} onChange={(e) => setSpot(num(e))} /></label>
          <label className="opx-field"><span>Taxa (% a.a.)</span><input className="input" type="number" inputMode="decimal" value={val(ratePct)} onChange={(e) => setRatePct(num(e))} /></label>
          <label className="opx-field"><span>IV padrão (%)</span><input className="input" type="number" inputMode="decimal" value={val(ivPct)} onChange={(e) => setIvPct(num(e))} /></label>
          <label className="opx-field"><span>Janela do gráfico</span>
            <select className="select" value={rangePct} onChange={(e) => setRangePct(Number(e.target.value))}>
              <option value={25}>±25%</option><option value={50}>±50%</option><option value={100}>±100%</option>
            </select>
          </label>
        </div>

        <div className="opx-row" aria-label="Multiplicador do contrato">
          <span className="opx-small opx-muted">Multiplicador do contrato:</span>
          {MULTIPLIER_PRESETS.map((m) => (
            <button key={m} type="button" className="opx-chip" aria-pressed={multiplier === m} onClick={() => setMultiplier(m)}>{m}</button>
          ))}
          <input className="input" style={{ width: 90, margin: 0, minHeight: 40 }} type="number" inputMode="decimal" aria-label="Multiplicador personalizado" placeholder="outro" value={multiplier != null && !MULTIPLIER_PRESETS.includes(multiplier) ? multiplier : ''} onChange={(e) => setMultiplier(e.target.value === '' ? null : Number(e.target.value))} />
        </div>
        {!multiplier && <div className="opx-alert warn" role="alert"><b>Informe o multiplicador do contrato.</b><span>Equity US costuma ser 100; B3 e outros mercados variam. O app não assume valor.</span></div>}

        {source === 'template' && (
          <>
            <div className="opx-fields">
              <label className="opx-field"><span>Estratégia</span>
                <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {(Object.keys(CATEGORY_LABEL) as OptionTemplateCategory[]).map((cat) => (
                    <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
                      {optionTemplatesByCategory(cat).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="opx-field"><span>Strike ATM</span><input className="input" type="number" inputMode="decimal" value={val(atmStrike)} onChange={(e) => setAtmStrike(num(e))} /></label>
              <label className="opx-field"><span>Passo do strike</span><input className="input" type="number" inputMode="decimal" value={val(strikeStep)} onChange={(e) => setStrikeStep(num(e))} /></label>
              <label className="opx-field"><span>Contratos</span><input className="input" type="number" min={1} value={val(contracts)} onChange={(e) => setContracts(Math.max(1, num(e) || 1))} /></label>
              <label className="opx-field"><span>Dias até o venc.</span><input className="input" type="number" min={1} value={val(days)} onChange={(e) => setDays(Math.max(1, num(e) || 1))} /></label>
            </div>
            <div className="opx-row">
              <button type="button" className="opx-btn" disabled={!canGenerate} onClick={generate}>Gerar pernas com estes parâmetros</button>
              {template && <span className="opx-small opx-muted">{template.name} — {template.description}</span>}
            </div>
          </>
        )}

        {source === 'position' && (
          <label className="opx-field"><span>Posição</span>
            <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Selecione…</option>
              {openGroups.map((g) => <option key={g.id} value={g.id}>{g.underlying} · {g.kind} · {g.legs[0]?.expiry}</option>)}
            </select>
          </label>
        )}
        {source === 'paper' && paper.length === 0 && <span className="opx-small opx-muted">O paper está vazio. Monte pernas no Desk (Bid/Ask) e volte aqui.</span>}
      </div>

      <div className="card opx-panel">
        <div className="opx-row">
          <span className="opx-title opx-grow">Pernas ({legs.length})</span>
          <button type="button" className="opx-btn small" onClick={addLeg} disabled={!multiplier}>+ Perna</button>
          {onSendToPaper && <button type="button" className="opx-btn small" disabled={validLegs.length === 0} onClick={() => onSendToPaper(validLegs)}>Enviar ao paper</button>}
        </div>
        {legs.length === 0 ? (
          <span className="opx-small opx-muted">Nenhuma perna. Gere a partir de um template, use o paper/posição ou adicione manualmente.</span>
        ) : (
          <div className="opx-scroll">
            <table className="opx-table" aria-label="Pernas da estratégia">
              <thead><tr><th className="left">Tipo</th><th>Qtd (+C / −V)</th><th>Strike</th><th>Vencimento</th><th>Entrada</th><th>IV %</th><th aria-hidden="true" /></tr></thead>
              <tbody>
                {legs.map((l, i) => {
                  const closed = l.exitPrice != null;
                  return (
                    <tr key={l.id + i}>
                      <td className="left">
                        <select className="select" aria-label={`Tipo da perna ${i + 1}`} disabled={closed} value={l.right} onChange={(e) => updateLeg(i, { right: e.target.value as OptionRight })}>
                          <option value="call">Call</option><option value="put">Put</option>
                        </select>
                      </td>
                      <td><input className="input" type="number" aria-label={`Quantidade da perna ${i + 1}`} disabled={closed} value={val(l.qty)} onChange={(e) => updateLeg(i, { qty: num(e) })} /></td>
                      <td><input className="input" type="number" inputMode="decimal" aria-label={`Strike da perna ${i + 1}`} disabled={closed} value={val(l.strike)} onChange={(e) => updateLeg(i, { strike: num(e) })} /></td>
                      <td><input className="input" type="date" aria-label={`Vencimento da perna ${i + 1}`} disabled={closed} value={l.expiry} onChange={(e) => updateLeg(i, { expiry: e.target.value })} /></td>
                      <td><input className="input" type="number" inputMode="decimal" aria-label={`Preço de entrada da perna ${i + 1}`} disabled={closed} value={val(l.entryPrice)} onChange={(e) => updateLeg(i, { entryPrice: num(e) })} /></td>
                      <td><input className="input" type="number" inputMode="decimal" aria-label={`IV da perna ${i + 1}`} disabled={closed} value={l.ivEntry != null ? Number((l.ivEntry * 100).toFixed(2)) : ''} onChange={(e) => updateLeg(i, { ivEntry: e.target.value === '' ? undefined : Number(e.target.value) / 100 })} /></td>
                      <td><button type="button" className="opx-btn small" aria-label={`Remover perna ${i + 1}`} onClick={() => removeLeg(i)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!ready && (
        <div className="card opx-empty" role="status">
          <b>Preencha o spot e ao menos uma perna válida</b>
          <span>Strike, quantidade, vencimento e multiplicador são necessários para calcular.</span>
        </div>
      )}

      {analysis && s && (
        <>
          <div className="opx-stats" aria-label="Resumo da estratégia">
            <Stat label="Prêmio líquido" value={money(s.netPremium)} tone={s.netPremium >= 0 ? 'pos' : 'neg'} />
            <Stat label="Máx lucro" value={s.maxProfitUnbounded ? '∞' : money(s.maxProfit)} tone="pos" />
            <Stat label="Máx perda" value={s.maxLossUnbounded ? '∞ (descoberta)' : money(s.maxLoss)} tone="neg" />
            <Stat label="Breakevens" value={s.breakevens.length ? s.breakevens.map((b) => b.toFixed(2)).join(' / ') : '—'} />
            <Stat label="Δ (ações)" value={s.greeks.delta.toFixed(2)} />
            <Stat label="Δ-notional" value={money(s.deltaNotional)} />
            <Stat label="Γ" value={s.greeks.gamma.toFixed(3)} />
            <Stat label="Θ / dia" value={optionThetaPerDay(s.greeks.theta).toFixed(2)} tone={s.greeks.theta >= 0 ? 'pos' : 'neg'} />
            <Stat label="Vega (1 pt)" value={optionVegaPerPoint(s.greeks.vega).toFixed(2)} />
            <Stat label="ρ (1 pt)" value={optionRhoPerPoint(s.greeks.rho).toFixed(2)} />
          </div>

          <div className="card opx-panel">
            <div className="opx-row">
              <span className="opx-title opx-grow">P/L × preço do subjacente</span>
              <button type="button" className="opx-chip" aria-pressed={showExpiry} onClick={() => setShowExpiry((v) => !v)}>Vencimento</button>
              <button type="button" className="opx-chip" aria-pressed={showT0} onClick={() => setShowT0((v) => !v)}>T+0</button>
              <label className="opx-field" style={{ minWidth: 150 }}><span className="opx-small">Overlay de grega</span>
                <select className="select" value={greek} onChange={(e) => setGreek(e.target.value as GreekKey)}>
                  {(Object.keys(GREEK_LABEL) as GreekKey[]).map((k) => <option key={k} value={k}>{GREEK_LABEL[k]}</option>)}
                </select>
              </label>
            </div>

            <ResponsiveContainer width="100%" height={320}>
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
                <ReferenceLine yAxisId="pnl" x={spot} stroke="var(--blue)" strokeDasharray="4 4" label={{ value: 'spot', fontSize: 10, fill: 'var(--blue)' }} />
                {s.breakevens.map((b) => <ReferenceLine key={`be${b}`} yAxisId="pnl" x={b} stroke="var(--yellow)" strokeDasharray="2 4" />)}
                {[...new Set(validLegs.map((l) => l.strike))].map((k) => <ReferenceLine key={`k${k}`} yAxisId="pnl" x={k} stroke="var(--gray)" strokeDasharray="1 5" />)}
                {showExpiry && <Area yAxisId="pnl" type="monotone" dataKey="expiry" name="Vencimento" stroke="var(--brand)" strokeWidth={2} fill="url(#opxPnl)" isAnimationActive={false} />}
                {showT0 && <Line yAxisId="pnl" type="monotone" dataKey="t0" name="T+0" stroke="var(--text)" strokeWidth={2} dot={false} isAnimationActive={false} />}
                {scenarios.map((sc, k) => (
                  <Line key={sc.id} yAxisId="pnl" type="monotone" dataKey={`wi${k}`} name={`What-If ${k + 1} (${sc.volPts >= 0 ? '+' : ''}${sc.volPts} vol, +${sc.days}d)`} stroke={WI_COLORS[k]} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                ))}
                {greek !== 'none' && <Line yAxisId="g" type="monotone" dataKey="greek" name={`Grega: ${GREEK_LABEL[greek]}`} stroke="var(--yellow)" strokeWidth={1.5} strokeDasharray="2 2" dot={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>

            {analysis.unpriced > 0 && (
              <div className="opx-alert warn" role="alert">
                <b>{analysis.unpriced} perna(s) sem IV.</b>
                <span>Foi usada a IV padrão ({ivPct}%) nas curvas T+0/What-If. Informe a IV da perna para um número fiel.</span>
              </div>
            )}
            <span className="opx-small opx-muted">Preços teóricos (Black-Scholes) a partir da IV informada. T+0 = valor hoje; What-If = choque de vol (pontos de IV) e decaimento de tempo.</span>
          </div>

          <div className="card opx-panel">
            <div className="opx-row">
              <span className="opx-title opx-grow">What-If ({scenarios.length}/5)</span>
              <button type="button" className="opx-btn small" disabled={scenarios.length >= 5} onClick={addScenario}>+ Cenário</button>
            </div>
            {scenarios.length === 0 && <span className="opx-small opx-muted">Adicione cenários para ver como a curva muda com a vol e com o passar dos dias.</span>}
            {scenarios.map((sc, k) => (
              <div key={sc.id} className="opx-wi">
                <label className="opx-field"><span style={{ color: WI_COLORS[k] }}>Cenário {k + 1} · choque de vol (pts)</span><input className="input" type="number" value={val(sc.volPts)} onChange={(e) => patchScenario(sc.id, { volPts: num(e) || 0 })} /></label>
                <label className="opx-field"><span>Dias à frente</span><input className="input" type="number" min={0} value={val(sc.days)} onChange={(e) => patchScenario(sc.id, { days: Math.max(0, num(e) || 0) })} /></label>
                <button type="button" className="opx-btn small" aria-label={`Remover cenário ${k + 1}`} onClick={() => setScenarios((prev) => prev.filter((x) => x.id !== sc.id))}>Remover</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="card opx-stat">
      <span className="opx-stat-label">{label}</span>
      <b className={`opx-stat-value${tone === 'pos' ? ' opx-pos' : tone === 'neg' ? ' opx-neg' : ''}`}>{value}</b>
    </div>
  );
}
