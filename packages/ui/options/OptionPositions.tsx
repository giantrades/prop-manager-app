// OptionPositions — posições de opções agrupadas por estratégia (derivadas de `option_legs`).
// Cada card mostra: prêmio, realizado, P/L TEÓRICO (modelo BSM) vs P/L de MERCADO (mid da
// cadeia), risco (máx lucro/perda, breakevens, gregas, venda descoberta), badge de
// proveniência e as ações Analisar · Fechar · Rolar · Exercer · Excluir (com confirmação
// inline — nunca alert). Spot é POR SUBJACENTE. Sem cálculo aqui: tudo de `@apps/lib/db`.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (sub-aba Posições).
import React, { useMemo, useState } from 'react';
import {
  buildRollPlan,
  closeOptionLeg,
  groupOptionLegs,
  optionAssignmentEligibility,
  optionDaysToExpiry,
  optionNakedExposure,
  optionQuoteMid,
  optionStrategyMarkPnl,
  optionStrategyTheoreticalPnl,
  optionThetaPerDay,
  summarizeOptionStrategy,
} from '@apps/lib/db';
import type { OptionChainQuote, OptionLeg, OptionStrategyGroup, RollPlan } from '@apps/lib/db';
import { fmtMoney } from '../currency';
import { ensureOptionStyles } from './optionStyles';

ensureOptionStyles();

interface Props {
  legs: OptionLeg[];
  quotes: OptionChainQuote[];
  spots: Record<string, number>;
  rate: number;
  stressPct: number;
  sharesByUnderlying: Record<string, number>;
  accountNames?: Record<string, string>;
  accountCurrency?: Record<string, string>;
  onSetSpot?: (underlying: string, spot: number) => void;
  onAnalyze?: (group: OptionStrategyGroup) => void;
  onCloseLegs?: (legs: OptionLeg[]) => void | Promise<void>;
  onRoll?: (plan: RollPlan) => void | Promise<void>;
  onAssign?: (leg: OptionLeg) => void | Promise<void>;
  onDelete?: (legIds: string[]) => void | Promise<void>;
  onRegister?: () => void;
}

const KIND_LABEL: Record<string, string> = {
  'single-call': 'Call', 'single-put': 'Put', vertical: 'Vertical', straddle: 'Straddle',
  strangle: 'Strangle', condor: 'Condor', butterfly: 'Borboleta', calendar: 'Calendário', custom: 'Custom',
};

function provenance(g: OptionStrategyGroup): { label: string; cls: string; title: string } {
  const bridge = g.legs.some((l) => l.source === 'quantower');
  const manual = g.legs.some((l) => l.source === 'manual');
  if (bridge && manual) return { label: 'bridge + manual', cls: 'info', title: 'Pernas vindas do bridge e lançadas à mão' };
  if (bridge) return { label: 'bridge', cls: 'ok', title: 'Posição sincronizada do Quantower' };
  return { label: 'manual', cls: '', title: 'Lançada manualmente / importada por CSV' };
}

function localInputNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

type Panel = 'close' | 'roll' | 'delete' | null;

export default function OptionPositions({
  legs, quotes, spots, rate, stressPct, sharesByUnderlying, accountNames, accountCurrency,
  onSetSpot, onAnalyze, onCloseLegs, onRoll, onAssign, onDelete, onRegister,
}: Props) {
  const groups = useMemo(() => groupOptionLegs(legs), [legs]);
  const quoteById = useMemo(() => new Map(quotes.map((q) => [q.id, q] as const)), [quotes]);
  const [showClosed, setShowClosed] = useState(false);

  const visible = groups.filter((g) => showClosed || g.open);
  const closedCount = groups.filter((g) => !g.open).length;

  if (groups.length === 0) {
    return (
      <div className="card opx-empty" role="status">
        <b>Nenhuma posição de opções</b>
        <span>Registre uma operação, importe um extrato CSV ou monte uma estratégia no Desk e salve.</span>
        {onRegister && <button type="button" className="opx-btn primary" onClick={onRegister}>Registrar operação</button>}
      </div>
    );
  }

  return (
    <div className="opx-stack">
      <div className="opx-row">
        <span className="opx-muted opx-small opx-grow">{groups.filter((g) => g.open).length} aberta(s) · {closedCount} fechada(s)</span>
        {closedCount > 0 && (
          <button type="button" className="opx-chip" aria-pressed={showClosed} onClick={() => setShowClosed((v) => !v)}>Mostrar fechadas</button>
        )}
        {onRegister && <button type="button" className="opx-btn small" onClick={onRegister}>+ Registrar</button>}
      </div>
      {visible.length === 0 && <div className="card opx-empty">Nenhuma posição aberta.</div>}
      {visible.map((g) => (
        <GroupCard
          key={g.id}
          g={g}
          quoteById={quoteById}
          quotes={quotes}
          spot={spots[g.underlying]}
          rate={rate}
          stressPct={stressPct}
          shares={sharesByUnderlying[g.underlying] ?? 0}
          accountName={accountNames?.[g.legs[0]?.accountId ?? '']}
          currency={accountCurrency?.[g.legs[0]?.accountId ?? ''] ?? 'USD'}
          onSetSpot={onSetSpot}
          onAnalyze={onAnalyze}
          onCloseLegs={onCloseLegs}
          onRoll={onRoll}
          onAssign={onAssign}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface CardProps {
  g: OptionStrategyGroup;
  quoteById: Map<string, OptionChainQuote>;
  quotes: OptionChainQuote[];
  spot?: number;
  rate: number;
  stressPct: number;
  shares: number;
  accountName?: string;
  currency: string;
  onSetSpot?: Props['onSetSpot'];
  onAnalyze?: Props['onAnalyze'];
  onCloseLegs?: Props['onCloseLegs'];
  onRoll?: Props['onRoll'];
  onAssign?: Props['onAssign'];
  onDelete?: Props['onDelete'];
}

function GroupCard({
  g, quoteById, quotes, spot, rate, stressPct, shares, accountName, currency,
  onSetSpot, onAnalyze, onCloseLegs, onRoll, onAssign, onDelete,
}: CardProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<string | null>(null);
  const money = (v: number) => fmtMoney(v, currency);
  const openLegs = g.legs.filter((l) => l.exitPrice == null);
  const hasSpot = Boolean(spot && spot > 0);
  const prov = provenance(g);

  const marks = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const l of openLegs) {
      const q = quoteById.get(`${l.underlying}:${l.expiry}:${l.strike}:${l.right}`);
      m[l.id] = q ? optionQuoteMid(q) : null;
    }
    return m;
  }, [openLegs, quoteById]);

  const mark = useMemo(() => optionStrategyMarkPnl(g.legs, marks), [g.legs, marks]);
  const theo = useMemo(
    () => (hasSpot && g.open ? optionStrategyTheoreticalPnl(g.legs, spot as number, { r: rate }) : null),
    [g.legs, g.open, hasSpot, spot, rate],
  );
  const summary = useMemo(
    () => (hasSpot && g.open ? summarizeOptionStrategy(g.legs, { S: spot as number, r: rate, rangePct: 0.5, points: 41 }) : null),
    [g.legs, g.open, hasSpot, spot, rate],
  );
  const risk = useMemo(
    () => (g.open ? optionNakedExposure(g.legs, { spot: hasSpot ? (spot as number) : g.legs[0].strike, stressPct, shares }) : null),
    [g.legs, g.open, hasSpot, spot, stressPct, shares],
  );
  const nearestExpiry = openLegs.map((l) => l.expiry).sort()[0];
  const dte = nearestExpiry ? optionDaysToExpiry(nearestExpiry) : null;
  const marketComplete = g.open && mark.unmarked === 0;

  const run = async (fn?: () => void | Promise<void>) => {
    if (!fn) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); setPanel(null); }
  };

  return (
    <div className="card opx-pos-card">
      <div className="opx-pos-head">
        <div className="opx-row">
          <b>{g.underlying}</b>
          <span className="opx-badge">{KIND_LABEL[g.kind] ?? g.kind}</span>
          <span className={`opx-badge ${g.open ? 'ok' : ''}`}>{g.open ? 'aberta' : 'fechada'}</span>
          <span className={`opx-badge ${prov.cls}`} title={prov.title}>{prov.label}</span>
          {accountName && <span className="opx-small opx-muted">{accountName}</span>}
          {g.open && dte != null && <span className={`opx-badge ${dte <= 3 ? 'warn' : ''}`}>{dte === 0 ? 'vence hoje' : `${dte}d p/ vencer`}</span>}
        </div>
        <div className="opx-pos-nums">
          <div><span className="k">Prêmio</span><b className={`opx-num ${g.netPremium >= 0 ? 'opx-pos' : 'opx-neg'}`}>{money(g.netPremium)}</b></div>
          <div><span className="k">Realizado</span><b className={`opx-num ${g.realizedPnl >= 0 ? 'opx-pos' : 'opx-neg'}`}>{money(g.realizedPnl)}</b></div>
          {g.open && (
            <>
              <div title="Preço de modelo (Black-Scholes) ao spot informado">
                <span className="k">P/L teórico</span>
                <b className={`opx-num ${theo && theo.pnl >= 0 ? 'opx-pos' : 'opx-neg'}`}>{theo && theo.unpriced === 0 ? money(theo.pnl) : '—'}</b>
              </div>
              <div title="Preço de mercado: mid da cadeia cadastrada">
                <span className="k">P/L mercado</span>
                <b className={`opx-num ${mark.pnl >= 0 ? 'opx-pos' : 'opx-neg'}`}>{marketComplete ? money(mark.pnl) : '—'}</b>
              </div>
              {theo && theo.unpriced === 0 && marketComplete && (
                <div title="Mercado − teórico: quanto o preço de mercado foge do modelo">
                  <span className="k">Mercado − teórico</span>
                  <b className="opx-num">{money(mark.pnl - theo.pnl)}</b>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {g.open && !hasSpot && (
        <label className="opx-field" style={{ maxWidth: 240 }}>
          <span>Informe o spot de {g.underlying} para calcular risco e P/L teórico</span>
          <input className="input" type="number" inputMode="decimal" placeholder="spot" onBlur={(e) => { const v = Number(e.target.value); if (v > 0) onSetSpot?.(g.underlying, v); }} />
        </label>
      )}
      {g.open && !marketComplete && <span className="opx-small opx-muted">P/L de mercado indisponível: faltam cotações na cadeia ({mark.unmarked} perna(s) sem preço).</span>}
      {theo && theo.unpriced > 0 && <span className="opx-small opx-muted">P/L teórico indisponível: {theo.unpriced} perna(s) sem IV de entrada.</span>}

      {risk?.naked && (
        <div className={`opx-alert ${risk.unbounded ? 'bad' : 'warn'}`} role="alert">
          <b>{risk.unbounded ? 'Venda descoberta — perda teórica ilimitada' : 'Put vendida sem hedge — exige caixa'}</b>
          <span>
            {risk.maxLoss != null && <>Perda máxima: <b>{money(risk.maxLoss)}</b> · </>}
            Estresse ±{Math.round(risk.stressPct * 100)}%: <b>{money(risk.stressLoss)}</b>
            {!hasSpot && ' (spot não informado: estresse aproximado)'}
          </span>
        </div>
      )}

      {summary && (
        <div className="opx-pos-nums" aria-label="Risco da estratégia">
          <div><span className="k">Máx lucro</span><b className="opx-num opx-pos">{summary.maxProfitUnbounded ? '∞' : money(summary.maxProfit)}</b></div>
          <div><span className="k">Máx perda</span><b className="opx-num opx-neg">{summary.maxLossUnbounded ? '∞' : money(summary.maxLoss)}</b></div>
          <div><span className="k">Breakevens</span><b className="opx-num">{summary.breakevens.length ? summary.breakevens.map((b) => b.toFixed(2)).join(' / ') : '—'}</b></div>
          <div><span className="k">Δ</span><b className="opx-num">{summary.greeks.delta.toFixed(2)}</b></div>
          <div><span className="k">Θ/dia</span><b className="opx-num">{optionThetaPerDay(summary.greeks.theta).toFixed(2)}</b></div>
        </div>
      )}

      <div className="opx-scroll">
        <table className="opx-table" aria-label={`Pernas de ${g.underlying}`}>
          <thead>
            <tr><th className="left">Lado</th><th className="left">Tipo</th><th>Strike</th><th>Venc.</th><th>Qtd</th><th>Entrada</th><th>Mercado</th><th>Saída</th><th>IV</th><th aria-hidden="true" /></tr>
          </thead>
          <tbody>
            {g.legs.map((l) => {
              const elig = optionAssignmentEligibility(l, { spot });
              return (
                <tr key={l.id}>
                  <td className={`left ${l.qty >= 0 ? 'opx-pos' : 'opx-neg'}`}>{l.qty >= 0 ? 'Long' : 'Short'}</td>
                  <td className="left">{l.right === 'call' ? 'Call' : 'Put'}</td>
                  <td>{l.strike.toFixed(2)}</td>
                  <td>{l.expiry}</td>
                  <td>{Math.abs(l.qty)}</td>
                  <td>{l.entryPrice.toFixed(2)}</td>
                  <td>{l.exitPrice == null && marks[l.id] != null ? (marks[l.id] as number).toFixed(2) : '—'}</td>
                  <td>{l.exitPrice != null ? l.exitPrice.toFixed(2) : '—'}</td>
                  <td>{l.ivEntry != null ? `${(l.ivEntry * 100).toFixed(0)}%` : '—'}</td>
                  <td>
                    {onAssign && elig.ok ? (
                      pendingAssign === l.id ? (
                        <span className="opx-row" role="alertdialog" aria-label="Confirmar exercício antecipado">
                          <span className="opx-small opx-neg">Antes do vencimento ({l.expiry}). Confirmar?</span>
                          <button type="button" className="opx-btn small danger" disabled={busy} onClick={() => { setPendingAssign(null); void run(() => onAssign(l)); }}>Sim, exercer</button>
                          <button type="button" className="opx-btn small" onClick={() => setPendingAssign(null)}>Não</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="opx-btn small"
                          title={elig.early ? 'Exercício ANTECIPADO: pede confirmação' : 'Registrar assignment'}
                          aria-label={`Registrar assignment ${l.symbol}`}
                          disabled={busy}
                          onClick={() => { if (elig.early) setPendingAssign(l.id); else void run(() => onAssign(l)); }}
                        >
                          Exercer
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="opx-pos-actions">
        {onAnalyze && g.open && <button type="button" className="opx-btn small" onClick={() => onAnalyze(g)}>Analisar</button>}
        {g.open && onCloseLegs && <button type="button" className="opx-btn small" aria-expanded={panel === 'close'} onClick={() => setPanel(panel === 'close' ? null : 'close')}>Fechar</button>}
        {g.open && onRoll && <button type="button" className="opx-btn small" aria-expanded={panel === 'roll'} onClick={() => setPanel(panel === 'roll' ? null : 'roll')}>Rolar</button>}
        {onDelete && <button type="button" className="opx-btn small danger" aria-expanded={panel === 'delete'} onClick={() => setPanel(panel === 'delete' ? null : 'delete')}>Excluir</button>}
      </div>

      {panel === 'close' && onCloseLegs && (
        <ClosePanel
          openLegs={openLegs}
          marks={marks}
          busy={busy}
          onCancel={() => setPanel(null)}
          onConfirm={(closed) => run(() => onCloseLegs(closed))}
        />
      )}
      {panel === 'roll' && onRoll && (
        <RollPanel
          g={g}
          quotes={quotes}
          busy={busy}
          currency={currency}
          onCancel={() => setPanel(null)}
          onConfirm={(plan) => run(() => onRoll(plan))}
        />
      )}
      {panel === 'delete' && onDelete && (
        <div className="opx-alert bad" role="alertdialog" aria-label="Confirmar exclusão">
          <b>Excluir {g.legs.length} perna(s) de {g.underlying}?</b>
          <span>Isto apaga o registro (não é um fechamento). Para encerrar a posição com resultado, use “Fechar”.</span>
          <div className="opx-row">
            <button type="button" className="opx-btn danger" disabled={busy} onClick={() => run(() => onDelete(g.legs.map((l) => l.id)))}>Excluir definitivamente</button>
            <button type="button" className="opx-btn" onClick={() => setPanel(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClosePanel({
  openLegs, marks, busy, onCancel, onConfirm,
}: {
  openLegs: OptionLeg[];
  marks: Record<string, number | null>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (closed: OptionLeg[]) => void;
}) {
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of openLegs) init[l.id] = marks[l.id] != null ? String(Number((marks[l.id] as number).toFixed(4))) : '';
    return init;
  });
  const [fees, setFees] = useState('0');
  const [when, setWhen] = useState(localInputNow());

  const parsed = openLegs.map((l) => ({ l, p: prices[l.id] === '' || prices[l.id] == null ? NaN : Number(prices[l.id]) }));
  const valid = parsed.every((x) => Number.isFinite(x.p) && x.p >= 0) && Number(fees) >= 0 && !Number.isNaN(new Date(when).getTime());

  const submit = () => {
    const exitDatetime = new Date(when).toISOString();
    const perLegFee = Number(fees) / openLegs.length;
    onConfirm(parsed.map(({ l, p }) => closeOptionLeg(l, { exitPrice: p, exitDatetime, fees: Number(perLegFee.toFixed(6)) })));
  };

  return (
    <div className="opx-alert" role="group" aria-label="Fechar posição">
      <b>Fechar posição</b>
      <div className="opx-fields">
        {openLegs.map((l) => (
          <label key={l.id} className="opx-field">
            <span>{l.qty >= 0 ? 'Vender' : 'Recomprar'} {Math.abs(l.qty)}× {l.right === 'call' ? 'C' : 'P'} {l.strike} — preço de saída</span>
            <input className="input" type="number" inputMode="decimal" min={0} step="any" value={prices[l.id] ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} />
          </label>
        ))}
        <label className="opx-field"><span>Taxas do fechamento (total)</span><input className="input" type="number" inputMode="decimal" min={0} step="any" value={fees} onChange={(e) => setFees(e.target.value)} /></label>
        <label className="opx-field"><span>Data/hora</span><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
      </div>
      <span className="opx-small opx-muted">Expirou sem valor? Use preço de saída 0.</span>
      <div className="opx-row">
        <button type="button" className="opx-btn primary" disabled={!valid || busy} onClick={submit}>Confirmar fechamento</button>
        <button type="button" className="opx-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function RollPanel({
  g, quotes, busy, currency, onCancel, onConfirm,
}: {
  g: OptionStrategyGroup;
  quotes: OptionChainQuote[];
  busy: boolean;
  currency: string;
  onCancel: () => void;
  onConfirm: (plan: RollPlan) => void;
}) {
  const current = g.legs.filter((l) => l.exitPrice == null).map((l) => l.expiry).sort()[0] ?? '';
  const targets = useMemo(
    () => [...new Set(quotes.filter((q) => q.underlying === g.underlying && q.expiry > current).map((q) => q.expiry))].sort(),
    [quotes, g.underlying, current],
  );
  const [target, setTarget] = useState(targets[0] ?? '');
  const plan = useMemo(() => (target ? buildRollPlan(g.legs, quotes, { targetExpiry: target }) : null), [g.legs, quotes, target]);

  return (
    <div className="opx-alert" role="group" aria-label="Rolar posição">
      <b>Rolar posição</b>
      {targets.length === 0 ? (
        <span>Não há cotações de vencimentos posteriores a {current} para {g.underlying}. Cadastre a cadeia do próximo vencimento (Desk → Cotações) e volte.</span>
      ) : (
        <>
          <label className="opx-field" style={{ maxWidth: 220 }}><span>Novo vencimento (mesmo strike e quantidade)</span>
            <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {plan && (
            <>
              <div className="opx-scroll">
                <table className="opx-table" aria-label="Plano de rolagem">
                  <thead><tr><th className="left">Perna</th><th>Fechar a</th><th>Abrir a</th></tr></thead>
                  <tbody>
                    {plan.items.map((it) => (
                      <tr key={it.leg.id}>
                        <td className="left">{it.leg.qty >= 0 ? '+' : ''}{it.leg.qty} {it.leg.right === 'call' ? 'C' : 'P'} {it.leg.strike}</td>
                        <td>{it.closePrice != null ? it.closePrice.toFixed(2) : '—'}</td>
                        <td>{it.next ? it.next.entryPrice.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.items.filter((it) => it.reason).map((it) => <span key={it.leg.id} className="opx-small opx-neg">{it.reason}</span>)}
              {plan.netCredit != null && (
                <span>Resultado da rolagem: <b className={plan.netCredit >= 0 ? 'opx-pos' : 'opx-neg'}>{plan.netCredit >= 0 ? 'crédito' : 'débito'} de {fmtMoney(Math.abs(plan.netCredit), currency)}</b> (a mid; taxas não incluídas)</span>
              )}
            </>
          )}
        </>
      )}
      <div className="opx-row">
        <button type="button" className="opx-btn primary" disabled={!plan?.complete || busy} onClick={() => plan && onConfirm(plan)}>Confirmar rolagem</button>
        <button type="button" className="opx-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
