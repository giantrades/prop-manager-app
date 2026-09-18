// STAGE 5 — Portfolio. Cost basis (FIFO, declarado) + mark-to-market manual +
// DCA mensal + alocação/concentração. Mobile-first 360px (tabela vira cards).
//
// Fonte: DOCS/06_STAGE5_WEALTH_OS/00-produto.md.
// Dados: `computePortfolio` + `computeAllocation` + `computeDcaFromTransactions`
// (packages/lib/db/wealth.ts) — NUNCA calculado na tela.

import { fmtMoney as fmtMoneyShared } from './currency';
function fmtMoney(v: unknown, cur = 'R$'): string { return fmtMoneyShared(v, cur); }
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import AllocationPie from './AllocationPie';
import { dividendIncomeByMonth, dividendByAsset, dividendCalendar } from '@apps/lib/db';
import type {
  AllocationResult,
  BenchmarkPoint,
  DcaMonth,
  DividendEvent,
  DividendRow,
  PortfolioRow,
  Position,
} from '@apps/lib/db';

/** #4 — desloca um `YYYY-MM` em N meses. */
function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PALETTE = ['#7c5cff', '#2ecc71', '#3498db', '#e1b12c', '#f7931a', '#e74c3c', '#a855f7', '#22d3ee'];


function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const v = value * 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** Resumo agregado do portfolio (totais derivados — ver `computePortfolio`). */
interface PortfolioSummary {
  totalCost: number;
  totalValue: number;
  totalPnl: number;
  pnlPercent: number;
  staleCount: number;
  dividendsTotal?: number;
}

/** Snapshot do histórico (valor vs custo) p/ o gráfico de evolução. */
interface PortfolioHistoryPoint {
  at: string;
  value: number;
  cost: number;
}

/** Alerta de preço a salvar (direção + preço-alvo). */
interface PriceAlertDraft {
  dir: string;
  price: number;
}

/** Provento anunciado a salvar (valor já convertido p/ número no onClick). */
interface DividendEventDraft {
  positionId: string;
  exDate: string;
  amountPerShare?: number;
  note?: string;
}

/** Estado do mini-form de anúncio de provento (campos ainda texto). */
interface DividendFormState {
  positionId: string;
  exDate: string;
  amountPerShare: string;
  note: string;
}

/** Alerta listado na seção "Alertas de preço" (alerta + proveniência da linha). */
interface PortfolioAlertView {
  id: string;
  dir: 'above' | 'below';
  price: number;
  symbol: string;
  rowId: string;
  fired: boolean;
}

interface PortfolioProps {
  rows?: PortfolioRow[];
  summary?: PortfolioSummary | null;
  dca?: DcaMonth[];
  allocation?: AllocationResult | null;
  history?: PortfolioHistoryPoint[];
  benchmark?: BenchmarkPoint[];
  currency?: string;
  onMark?: (row: PortfolioRow) => void;
  onDividend?: (row: PortfolioRow, amount: number) => void;
  onSaveAlert?: (row: PortfolioRow, alert: PriceAlertDraft) => void;
  onDeleteAlert?: (row: { id: string }, alertId: string) => void;
  onRearmAlert?: (alertId: string) => void;
  firedAlertIds?: string[];
  announced?: DividendEvent[];
  dividends?: DividendRow[];
  positions?: Position[];
  onSaveDividendEvent?: (ev: DividendEventDraft) => void;
  onRemoveDividendEvent?: (id: string) => void;
  onReceiveDividend?: (ev: DividendEvent) => void;
  loading?: boolean;
  only?: string[] | null;
}
export default function Portfolio({ rows = [], summary = null, dca = [], allocation = null, history = [], benchmark = [], currency = 'USD', onMark, onDividend, onSaveAlert, onDeleteAlert, onRearmAlert, firedAlertIds = [], announced = [], dividends = [], positions = [], onSaveDividendEvent, onRemoveDividendEvent, onReceiveDividend, loading = false, only = null }: PortfolioProps) {
  const show = (k: string): boolean => !only || only.includes(k);
  const [calYm, setCalYm] = React.useState(() => new Date().toISOString().slice(0, 7));
  const symbolById = React.useMemo<Record<string, string>>(() => Object.fromEntries((positions || []).map((p) => [p.id, p.symbol])), [positions]);
  const divMonthly = React.useMemo(() => dividendIncomeByMonth(dividends), [dividends]);
  const divByAsset = React.useMemo(() => dividendByAsset(dividends, symbolById), [dividends, symbolById]);
  const divCal = React.useMemo(() => dividendCalendar(dividends, announced, calYm), [dividends, announced, calYm]);
  const divTotal = React.useMemo(() => dividends.reduce((s, d) => s + (d.amount || 0), 0), [dividends]);
  const benchByAt = React.useMemo(() => new Map<string, number>((benchmark || []).map((b) => [b.at, b.index])), [benchmark]);
  const [divRow, setDivRow] = React.useState<string | null>(null);
  const [divAmount, setDivAmount] = React.useState('');
  const [alertRow, setAlertRow] = React.useState<string | null>(null);
  const [alertDir, setAlertDir] = React.useState('above');
  const [alertPrice, setAlertPrice] = React.useState('');
  const [showDivForm, setShowDivForm] = React.useState(false);
  const [divEv, setDivEv] = React.useState<DividendFormState>({ positionId: '', exDate: '', amountPerShare: '', note: '' });
  const fired = React.useMemo(() => new Set<string>(firedAlertIds || []), [firedAlertIds]);
  const allAlerts = React.useMemo(() => {
    const list: PortfolioAlertView[] = [];
    for (const r of rows) {
      for (const a of r.alerts ?? []) {
        list.push({ ...a, symbol: r.symbol, rowId: r.id, fired: fired.has(a.id) });
      }
    }
    return list;
  }, [rows, fired]);
  if (loading) {
    return (
      <div className="pf-root pf-loading" role="status" aria-live="polite">
        <div className="pf-skeleton" />
        <div className="pf-skeleton" />
        <div className="pf-skeleton" />
        <span className="pf-screen-reader">Carregando portfolio…</span>
      </div>
    );
  }

  const s: PortfolioSummary = summary || {
    totalCost: rows.reduce((acc, r) => acc + r.costBasis, 0),
    totalValue: rows.reduce((acc, r) => acc + r.marketValue, 0),
    totalPnl: 0,
    pnlPercent: 0,
    staleCount: 0,
  };
  const totalPnl = s.totalPnl || (s.totalValue - s.totalCost);
  const pnlPct = s.pnlPercent || (s.totalCost > 0 ? totalPnl / s.totalCost : 0);

  return (
    <div className="pf-root">
      {/* Summary */}
      {show('summary') && (<div className="pf-total-card">
        <div className="pf-total-row">
          <div className="pf-stat">
            <div className="pf-stat-label">Investido (cost basis)</div>
            <div className="pf-stat-value">{fmtMoney(s.totalCost, currency)}</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-label">Atual (mark-to-market)</div>
            <div className={`pf-stat-value ${totalPnl >= 0 ? 'pf-pos' : 'pf-neg'}`}>{fmtMoney(s.totalValue, currency)}</div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-label">PnL</div>
            <div className={`pf-stat-value ${totalPnl >= 0 ? 'pf-pos' : 'pf-neg'}`}>
              {fmtMoney(totalPnl, currency)}
              <span className="pf-stat-sub"> {fmtPct(pnlPct)}</span>
            </div>
          </div>
          <div className="pf-stat">
            <div className="pf-stat-label">Proventos</div>
            <div className="pf-stat-value pf-pos">{fmtMoney(s.dividendsTotal ?? 0, currency)}</div>
          </div>
        </div>
        {s.staleCount > 0 && (
          <div className="pf-stale-hint" role="note">
            ⚠️ {s.staleCount} posição(ões) com marcação antiga — valor usa o custo (proveniência).
          </div>
        )}
      </div>)}

      {/* DCA mensal */}
      {show('dca') && dca.length > 0 && (
        <div className="pf-section">
          <div className="pf-section-title">DCA mensal (aportes)</div>
          <div className="pf-dca">
            {dca.map((d) => (
              <div key={d.month} className="pf-dca-item">
                <span className="pf-dca-month">{d.month}</span>
                <span className="pf-dca-bar-wrap">
                  <span className="pf-dca-bar" style={{ width: `${Math.max(4, (d.amount / Math.max(1, ...dca.map((x) => x.amount))) * 100)}%` }} />
                </span>
                <span className="pf-dca-amt">{fmtMoney(d.amount, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alocação / concentração — pies por ativo e por conta */}
      {show('allocation') && allocation && (allocation.bySymbol.length > 0 || (allocation.byAccount ?? []).length > 0) && (
        <div className="pf-section">
          <div className="pf-section-title">
            Alocação
            {allocation.topPct >= 0.5 && <span className="pf-conc-badge">alta concentração</span>}
          </div>
          <div className="pf-alloc-grid">
            <AllocationPie
              title="Por ativo"
              currency={currency}
              data={(allocation.bySymbol ?? []).slice(0, 8).map((a, i) => ({ label: a.label, value: a.value, color: PALETTE[i % PALETTE.length] }))}
            />
            {(allocation.byAccount ?? []).length > 0 && (
              <AllocationPie
                title="Por conta"
                currency={currency}
                data={(allocation.byAccount ?? []).slice(0, 8).map((a, i) => ({ label: a.label, value: a.value, color: PALETTE[i % PALETTE.length] }))}
              />
            )}
          </div>
        </div>
      )}

      {/* P5 — Evolução do valor vs custo (R$, eixo esq.) + A3 benchmark CDI (base 100, eixo dir.) */}
      {show('history') && history.length > 1 && (
        <div className="pf-section">
          <div className="pf-section-title">Evolução (valor vs custo{benchByAt.size > 0 ? ' vs CDI' : ''})</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={history.map((h) => ({
                  at: String(h.at).slice(5, 10),
                  value: h.value,
                  cost: h.cost,
                  cdi: benchByAt.get(h.at) ?? null,
                }))}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="at" tick={{ fontSize: 10, fill: '#a1a7b3' }} minTickGap={28} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                {benchByAt.size > 0 && (
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#e1b12c' }} width={40} domain={[95, 'auto']} />
                )}
                <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a1a7b3' }} />
                <Area yAxisId="left" type="monotone" dataKey="value" name="Valor" stroke="#2ecc71" fill="rgba(46,204,113,0.15)" strokeWidth={2} />
                <Area yAxisId="left" type="monotone" dataKey="cost" name="Custo" stroke="#7c5cff" fill="transparent" strokeWidth={2} strokeDasharray="5 4" />
                {benchByAt.size > 0 && (
                  <Area yAxisId="right" type="monotone" dataKey="cdi" name="CDI (base 100)" stroke="#e1b12c" fill="transparent" strokeWidth={2} strokeDasharray="2 3" connectNulls />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* A2 — alertas de preço ativos */}
      {show('alerts') && allAlerts.length > 0 && (
        <div className="pf-section">
          <div className="pf-section-title">Alertas de preço ({allAlerts.length})</div>
          {allAlerts.map((a) => (
            <div key={a.id} className="pf-alert-row">
              <span className="pf-alert-sym">{a.symbol}</span>
              <span className="pf-alert-cond">{a.dir === 'above' ? '≥' : '≤'} {a.price}</span>
              {a.fired
                ? <span className="pf-pill pf-pill-stale">disparado</span>
                : <span className="pf-pill pf-pill-fresh">ativo</span>}
              <span className="pf-alert-actions">
                {a.fired && onRearmAlert && (
                  <button className="pf-mark-btn" onClick={() => onRearmAlert(a.id)}>Rearmar</button>
                )}
                {onDeleteAlert && (
                  <button className="pf-mark-btn" onClick={() => onDeleteAlert({ id: a.rowId }, a.id)} aria-label={`Excluir alerta de ${a.symbol}`}>x</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* B1 — proventos anunciados (data-com) */}
      {show('income') && (onSaveDividendEvent || announced.length > 0) && (
        <div className="pf-section">
          <div className="pf-section-title">Próximos proventos ({announced.length})</div>
          {announced.length === 0 ? (
            <div className="pf-empty" role="status">Nenhum provento anunciado.</div>
          ) : announced.map((e) => (
            <div key={e.id} className="pf-alert-row">
              <span className="pf-alert-sym">{e.symbol}</span>
              <span className="pf-alert-cond">ex {String(e.exDate).slice(8, 10)}/{String(e.exDate).slice(5, 7)}{e.amountPerShare != null ? ` • ${fmtMoney(e.amountPerShare, currency)}/ação` : ''}</span>
              <span className="pf-alert-actions">
                {onReceiveDividend && (
                  <button className="pf-mark-btn" onClick={() => onReceiveDividend(e)}>Marcar recebido</button>
                )}
                {onRemoveDividendEvent && (
                  <button className="pf-mark-btn" onClick={() => onRemoveDividendEvent(e.id)} aria-label={`Remover ${e.symbol}`}>x</button>
                )}
              </span>
            </div>
          ))}
          {onSaveDividendEvent && (
            <>
              <button className="pf-mark-btn" onClick={() => setShowDivForm((s) => !s)}>
                {showDivForm ? 'Fechar' : '+ Anunciar provento'}
              </button>
              {showDivForm && (
                <div className="pf-div-form" role="group" aria-label="Anunciar provento">
                  <select
                    className="pf-div-input" value={divEv.positionId}
                    onChange={(e) => setDivEv((f) => ({ ...f, positionId: e.target.value }))}
                    aria-label="Posição"
                  >
                    <option value="">Posição…</option>
                    {(positions || []).map((p) => (
                      <option key={p.id} value={p.id}>{p.symbol}</option>
                    ))}
                  </select>
                  <input
                    className="pf-div-input" type="date" value={divEv.exDate}
                    onChange={(e) => setDivEv((f) => ({ ...f, exDate: e.target.value }))}
                    aria-label="Data-com"
                  />
                  <input
                    className="pf-div-input" type="number" min="0" step="0.0001"
                    value={divEv.amountPerShare} onChange={(e) => setDivEv((f) => ({ ...f, amountPerShare: e.target.value }))}
                    placeholder="R$/ação" aria-label="Valor por ação"
                  />
                  <button
                    className="pf-mark-btn"
                    disabled={!divEv.exDate}
                    onClick={() => {
                      onSaveDividendEvent({ ...divEv, amountPerShare: divEv.amountPerShare === '' ? undefined : Number(divEv.amountPerShare) });
                      setDivEv({ positionId: '', exDate: '', amountPerShare: '', note: '' });
                      setShowDivForm(false);
                    }}
                  >
                    Salvar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* #4 — Histórico de proventos + Calendário de renda */}
      {show('income') && dividends.length > 0 && (
        <div className="pf-section">
          <div className="pf-section-title">Histórico de proventos ({dividends.length})</div>
          <div className="pf-div-stats">
            <div className="pf-div-stat"><span className="pf-stat-label">Total recebido</span><span className="pf-stat-value pf-pos">{fmtMoney(divTotal, currency)}</span></div>
            <div className="pf-div-stat"><span className="pf-stat-label">Média/mês</span><span className="pf-stat-value">{fmtMoney(divMonthly.length ? divTotal / divMonthly.length : 0, currency)}</span></div>
            <div className="pf-div-stat"><span className="pf-stat-label">Ativos pagadores</span><span className="pf-stat-value">{divByAsset.length}</span></div>
          </div>
          {divMonthly.length > 1 && (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={divMonthly.slice(-12).map((m) => ({ ym: m.ym.slice(5, 7) + '/' + m.ym.slice(2, 4), amount: m.amount }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={48} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, currency)} />
                <Bar dataKey="amount" name="Proventos" fill="#2ecc71" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="pf-div-assets">
            {divByAsset.slice(0, 6).map((a) => {
              const pct = divTotal > 0 ? (a.amount / divTotal) * 100 : 0;
              return (
                <div key={a.positionId} className="pf-div-asset-row">
                  <span className="pf-alert-sym">{a.symbol}</span>
                  <span className="pf-div-bar"><span className="pf-div-fill" style={{ width: `${pct}%` }} /></span>
                  <span className="pf-stat-value">{fmtMoney(a.amount, currency)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {show('income') && (
        <div className="pf-section">
          <div className="pf-div-cal-head">
            <span className="pf-section-title" style={{ margin: 0 }}>Calendário de renda</span>
            <span className="pf-div-cal-nav">
              <button className="pf-mark-btn" onClick={() => setCalYm((ym) => shiftYm(ym, -1))} aria-label="Mês anterior">‹</button>
              <span className="pf-div-cal-ym">{calYm.slice(5, 7)}/{calYm.slice(0, 4)}</span>
              <button className="pf-mark-btn" onClick={() => setCalYm((ym) => shiftYm(ym, 1))} aria-label="Próximo mês">›</button>
            </span>
          </div>
          <div className="pf-cal-week" aria-hidden="true">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="pf-cal-grid">
            {Array.from({ length: new Date(Number(calYm.slice(0, 4)), Number(calYm.slice(5, 7)) - 1, 1).getDay() }).map((_, i) => <span key={`pad${i}`} className="pf-cal-pad" />)}
            {divCal.map((d) => {
              const hasAnn = d.announced.length > 0;
              const title = [d.received > 0 ? `recebido ${fmtMoney(d.received, currency)}` : '', ...d.announced.map((e) => `${e.symbol} (data-com)`)].filter(Boolean).join(' · ');
              return (
                <span
                  key={d.date}
                  className={`pf-cal-day ${d.received > 0 ? 'has-recv' : ''} ${hasAnn ? 'has-ann' : ''}`}
                  title={title || undefined}
                >
                  <span className="pf-cal-num">{d.day}</span>
                  {d.received > 0 && <span className="pf-cal-val">{Math.abs(d.received) >= 1000 ? `${(d.received / 1000).toFixed(1)}k` : d.received.toFixed(0)}</span>}
                  {hasAnn && d.received === 0 && <span className="pf-cal-dot" />}
                </span>
              );
            })}
          </div>
          <div className="pf-div-legend">
            <span className="pf-legend-item"><span className="pf-cal-swatch has-recv" /> recebido</span>
            <span className="pf-legend-item"><span className="pf-cal-swatch has-ann" /> anunciado (data-com)</span>
          </div>
        </div>
      )}

      {/* Posições: tabela (desktop) / cards (mobile) */}
      {show('positions') && (
      <div className="pf-table-wrap">
        <table className="pf-table">
          <thead>
            <tr>
              <th>Ativo</th>
              <th className="pf-num">Qtd</th>
              <th className="pf-num">Preço médio</th>
              <th className="pf-num">Mark</th>
              <th className="pf-num">Investido</th>
              <th className="pf-num">Atual</th>
              <th className="pf-num">PnL</th>
              <th className="pf-num">Yield</th>
              <th className="pf-num">Marca</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
              <tr>
                <td>
                  <div className="pf-symbol">{r.symbol}</div>
                  <div className="pf-acct">
                    {r.accountName || r.accountId}
                    
                    {r.assetKind === 'fixed' && <span className="pf-pill" title="Renda fixa com accrual automático">RF</span>}
                    {r.converted === false && <span className="pf-pill pf-pill-stale" title="Sem taxa de conversão — fora dos totais">sem câmbio</span>}
                  </div>
                </td>
                <td className="pf-num">{r.qty}</td>
                {/* Valores da LINHA na moeda do próprio ativo (r.currency): o prop
                    `currency` é a moeda dos TOTAIS (BRL). Antes, um ativo USD era
                    formatado como BRL e saía errado. */}
                <td className="pf-num">{fmtMoney(r.avgPrice, currency)}</td>
                <td className="pf-num">{fmtMoney(r.markPrice, currency)}</td>
                <td className="pf-num">{fmtMoney(r.costBasis, currency)}</td>
                <td className="pf-num">{fmtMoney(r.marketValue, currency)}</td>
                <td className={`pf-num ${r.pnl >= 0 ? 'pf-pos' : 'pf-neg'}`}>
                  {fmtMoney(r.pnl, currency)}
                  <span className="pf-pnl-sub"> {fmtPct(r.pnlPercent)}</span>
                  {(r.dividends ?? 0) > 0 && (
                    <span className="pf-pnl-sub" title="Proventos recebidos"> +{fmtMoney(r.dividends, currency)} div</span>
                  )}
                  {(r.accruedInterest ?? 0) > 0 && (
                    <span className="pf-pnl-sub" title="Juros acumulados (accrual)"> +{fmtMoney(r.accruedInterest, currency)} juros</span>
                  )}
                </td>
                <td className={`pf-num ${r.yieldOnCost >= 0 ? 'pf-pos' : 'pf-neg'}`}>{fmtPct(r.yieldOnCost ?? 0)}</td>
                <td className="pf-num">
                  {r.staleMark ? (
                    <span className="pf-pill pf-pill-stale" title={r.ageDays != null ? `Marcação há ${r.ageDays}d` : 'Sem marcação'}>stale</span>
                  ) : (
                    <span className="pf-pill pf-pill-fresh">ok</span>
                  )}
                  {onMark && (
                    <button className="pf-mark-btn" onClick={() => onMark(r)} aria-label={`Marcar ${r.symbol}`}>marcar</button>
                  )}
                  {onDividend && (
                    <button className="pf-mark-btn" onClick={() => { setDivRow(divRow === r.id ? null : r.id); setDivAmount(''); }} aria-label={`Registrar provento de ${r.symbol}`}>+ provento</button>
                  )}
                  {onSaveAlert && (
                    <button className="pf-mark-btn" onClick={() => { setAlertRow(alertRow === r.id ? null : r.id); setAlertPrice(''); }} aria-label={`Alerta de preço de ${r.symbol}`}>🔔{(r.alerts ?? []).length > 0 ? ` ${(r.alerts ?? []).length}` : ''}</button>
                  )}
                </td>
              </tr>
              {onDividend && divRow === r.id && (
                <tr key={`${r.id}-div`}>
                  <td colSpan={9}>
                    <div className="pf-div-form" role="group" aria-label={`Provento de ${r.symbol}`}>
                      <input
                        className="pf-div-input" type="number" min="0" step="0.01"
                        value={divAmount} onChange={(e) => setDivAmount(e.target.value)}
                        placeholder="Valor do provento" aria-label="Valor do provento"
                      />
                      <button
                        className="pf-mark-btn"
                        disabled={!(Number(divAmount) > 0)}
                        onClick={() => { onDividend(r, Number(divAmount)); setDivRow(null); setDivAmount(''); }}
                      >
                        Salvar
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {onSaveAlert && alertRow === r.id && (
                <tr key={`${r.id}-alert`}>
                  <td colSpan={9}>
                    <div className="pf-div-form" role="group" aria-label={`Alerta de preço de ${r.symbol}`}>
                      <select className="pf-div-input" value={alertDir} onChange={(e) => setAlertDir(e.target.value)} aria-label="Direção do alerta">
                        <option value="above">Acima de (≥)</option>
                        <option value="below">Abaixo de (≤)</option>
                      </select>
                      <input
                        className="pf-div-input" type="number" min="0" step="0.01"
                        value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)}
                        placeholder="Preço-alvo" aria-label="Preço-alvo"
                      />
                      <button
                        className="pf-mark-btn"
                        disabled={!(Number(alertPrice) > 0)}
                        onClick={() => { onSaveAlert(r, { dir: alertDir, price: Number(alertPrice) }); setAlertRow(null); setAlertPrice(''); }}
                      >
                        Salvar alerta
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* Mobile: cards */}
        <div className="pf-cards">
          {rows.map((r) => (
              <div key={r.id} className="pf-card">
                <div className="pf-card-head">
                  <div>
                    <div className="pf-symbol">{r.symbol}</div>
                    <div className="pf-acct">
                      {r.accountName || r.accountId}
                      
                      {r.converted === false && <span className="pf-pill pf-pill-stale">sem câmbio</span>}
                    </div>
                  </div>
                <span className={`pf-pill ${r.staleMark ? 'pf-pill-stale' : 'pf-pill-fresh'}`}>
                  {r.staleMark ? 'stale' : 'ok'}
                </span>
              </div>
              <div className="pf-card-grid">
                <div className="pf-stat">
                  <div className="pf-stat-label">Qtd</div>
                  <div className="pf-stat-value pf-num">{r.qty}</div>
                </div>
                <div className="pf-stat">
                  <div className="pf-stat-label">Investido</div>
                  <div className="pf-stat-value pf-num">{fmtMoney(r.costBasis, currency)}</div>
                </div>
                <div className="pf-stat">
                  <div className="pf-stat-label">Atual</div>
                  <div className={`pf-stat-value pf-num ${r.pnl >= 0 ? 'pf-pos' : 'pf-neg'}`}>{fmtMoney(r.marketValue, currency)}</div>
                </div>
                <div className="pf-stat">
                  <div className="pf-stat-label">PnL</div>
                  <div className={`pf-stat-value pf-num ${r.pnl >= 0 ? 'pf-pos' : 'pf-neg'}`}>
                    {fmtMoney(r.pnl, currency)}
                    <span className="pf-stat-sub"> {fmtPct(r.pnlPercent)}</span>
                    {(r.dividends ?? 0) > 0 && (
                      <span className="pf-stat-sub"> +{fmtMoney(r.dividends, currency)} div</span>
                    )}
                  </div>
                </div>
                <div className="pf-stat">
                  <div className="pf-stat-label">Yield</div>
                  <div className={`pf-stat-value pf-num ${r.yieldOnCost >= 0 ? 'pf-pos' : 'pf-neg'}`}>{fmtPct(r.yieldOnCost ?? 0)}</div>
                </div>
              </div>
              {onMark && (
                <button className="pf-mark-btn pf-mark-full" onClick={() => onMark(r)}>Marcar {r.symbol}</button>
              )}
              {onSaveAlert && (
                <button className="pf-mark-btn pf-mark-full" onClick={() => { setAlertRow(alertRow === r.id ? null : r.id); setAlertPrice(''); }}>🔔 alerta {r.symbol}{(r.alerts ?? []).length > 0 ? ` (${(r.alerts ?? []).length})` : ''}</button>
              )}
              {onSaveAlert && alertRow === r.id && (
                <div className="pf-div-form" role="group" aria-label={`Alerta de preço de ${r.symbol}`}>
                  <select className="pf-div-input" value={alertDir} onChange={(e) => setAlertDir(e.target.value)} aria-label="Direção do alerta">
                    <option value="above">Acima de (≥)</option>
                    <option value="below">Abaixo de (≤)</option>
                  </select>
                  <input
                    className="pf-div-input" type="number" min="0" step="0.01"
                    value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)}
                    placeholder="Preço-alvo" aria-label="Preço-alvo"
                  />
                  <button
                    className="pf-mark-btn"
                    disabled={!(Number(alertPrice) > 0)}
                    onClick={() => { onSaveAlert(r, { dir: alertDir, price: Number(alertPrice) }); setAlertRow(null); setAlertPrice(''); }}
                  >
                    Salvar
                  </button>
                </div>
              )}
              {onDividend && (
                <button className="pf-mark-btn pf-mark-full" onClick={() => { setDivRow(divRow === r.id ? null : r.id); setDivAmount(''); }}>+ provento {r.symbol}</button>
              )}
              {onDividend && divRow === r.id && (
                <div className="pf-div-form" role="group" aria-label={`Provento de ${r.symbol}`}>
                  <input
                    className="pf-div-input" type="number" min="0" step="0.01"
                    value={divAmount} onChange={(e) => setDivAmount(e.target.value)}
                    placeholder="Valor do provento" aria-label="Valor do provento"
                  />
                  <button
                    className="pf-mark-btn"
                    disabled={!(Number(divAmount) > 0)}
                    onClick={() => { onDividend(r, Number(divAmount)); setDivRow(null); setDivAmount(''); }}
                  >
                    Salvar
                  </button>
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="pf-empty" role="status">Nenhuma posição cadastrada.</div>
          )}
        </div>
      </div>)}
    </div>
  );
}

const PF_CSS = `
.pf-root { display: flex; flex-direction: column; gap: 16px; }
.pf-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.pf-loading { gap: 8px; }
.pf-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: pf-pulse 1.4s ease-in-out infinite; }
.pf-skeleton:nth-child(2) { width: 80%; }
.pf-skeleton:nth-child(3) { width: 60%; }

.pf-total-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; }
.pf-total-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.pf-stat { min-width: 0; }
.pf-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.pf-stat-value { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pf-stat-sub { font-size: 11px; color: var(--muted, #a1a7b3); font-weight: 500; }
.pf-pos { color: var(--green, #2ecc71); }
.pf-neg { color: var(--red, #e74c3c); }
.pf-stale-hint { margin-top: 10px; font-size: 11px; color: var(--yellow, #e1b12c); }

.pf-section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.pf-section-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.pf-conc-badge { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: rgba(225,177,44,0.15); color: var(--yellow, #e1b12c); }

.pf-dca { display: flex; flex-direction: column; gap: 8px; }
.pf-dca-item { display: grid; grid-template-columns: 60px 1fr auto; align-items: center; gap: 10px; font-size: 12px; }
.pf-dca-month { color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.pf-dca-bar-wrap { height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.pf-dca-bar { display: block; height: 100%; background: linear-gradient(90deg, var(--brand, #7c5cff), #a78bfa); border-radius: 999px; }
.pf-dca-amt { font-variant-numeric: tabular-nums; font-weight: 600; }

.pf-alloc { display: flex; flex-direction: column; gap: 8px; }
.pf-alloc-row { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 10px; font-size: 12px; }
.pf-alloc-label { font-weight: 600; }
.pf-alloc-bar-wrap { height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.pf-alloc-bar { display: block; height: 100%; background: linear-gradient(90deg, var(--blue, #3498db), #5dade2); border-radius: 999px; }
.pf-alloc-pct { font-variant-numeric: tabular-nums; color: var(--muted, #a1a7b3); }

.pf-table-wrap { border-radius: 12px; border: 1px solid rgba(255,255,255,0.07); overflow: hidden; }
.pf-table { width: 100%; border-collapse: collapse; }
.pf-table th, .pf-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); }
.pf-table th { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; }
.pf-table td { font-size: 12px; }
.pf-num { font-variant-numeric: tabular-nums; }
.pf-table th.pf-num, .pf-table td.pf-num { text-align: right; }
.pf-symbol { font-weight: 700; font-size: 13px; }
.pf-acct { font-size: 11px; color: var(--muted, #a1a7b3); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.pf-cur { font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: rgba(52,152,219,0.15); color: var(--blue, #3498db); }
.pf-pnl-sub { font-size: 10px; color: var(--muted, #a1a7b3); }
.pf-pill { padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.pf-pill-fresh { background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); }
.pf-pill-stale { background: rgba(225,177,44,0.15); color: var(--yellow, #e1b12c); }
.pf-mark-btn { margin-left: 6px; font-size: 10px; padding: 2px 8px; border-radius: 8px; background: rgba(124,92,255,0.12); border: 1px solid rgba(124,92,255,0.3); color: var(--brand, #7c5cff); cursor: pointer; }
.pf-mark-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pf-mark-full { width: 100%; margin: 10px 0 0; padding: 6px; }
.pf-div-form { display: flex; gap: 8px; margin-top: 8px; }
.pf-div-input { flex: 1; background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 6px 10px; border-radius: 8px; font-size: 12px; min-height: 36px; }
.pf-alert-row { display: flex; gap: 10px; align-items: center; font-size: 12px; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; font-variant-numeric: tabular-nums; }
.pf-alert-sym { font-weight: 800; }
.pf-alert-cond { color: var(--muted, #a1a7b3); }
.pf-alert-actions { margin-left: auto; display: flex; gap: 6px; }
.pf-empty { grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

/* Mobile-first: a tabela some, os cards aparecem (sem scroll horizontal em 360px) */
.pf-cards { display: none; }
@media (max-width: 719px) {
  .pf-table { display: none; }
  .pf-cards { display: flex; flex-direction: column; gap: 12px; }
  .pf-total-row { grid-template-columns: 1fr; gap: 10px; }
  .pf-stat-value { font-size: 15px; }
}
.pf-card { padding: 14px; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); }
.pf-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.pf-card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

/* #4 — proventos (histórico + calendário) */
.pf-div-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px; }
.pf-div-stat { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
.pf-div-assets { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.pf-div-asset-row { display: grid; grid-template-columns: 88px 1fr auto; gap: 10px; align-items: center; font-size: 12px; }
.pf-div-bar { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
.pf-div-fill { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #2ecc71, #7bed9f); }
.pf-div-cal-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.pf-div-cal-nav { display: inline-flex; align-items: center; gap: 6px; }
.pf-div-cal-ym { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 56px; text-align: center; }
.pf-cal-week, .pf-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.pf-cal-week { font-size: 10px; color: var(--muted, #a1a7b3); text-align: center; margin-bottom: 4px; }
.pf-cal-pad { min-height: 34px; }
.pf-cal-day { position: relative; min-height: 34px; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-size: 10px; }
.pf-cal-num { font-variant-numeric: tabular-nums; color: var(--muted, #a1a7b3); }
.pf-cal-day.has-recv { background: rgba(46,204,113,0.16); border-color: rgba(46,204,113,0.45); }
.pf-cal-day.has-recv .pf-cal-num { color: var(--text, #e7eaf0); }
.pf-cal-val { font-size: 10px; font-weight: 700; color: #2ecc71; }
.pf-cal-day.has-ann { outline: 1px dashed rgba(225,177,44,0.7); outline-offset: -2px; }
.pf-cal-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--yellow, #e1b12c); }
.pf-div-legend { display: flex; gap: 14px; margin-top: 8px; font-size: 11px; color: var(--muted, #a1a7b3); }
.pf-legend-item { display: inline-flex; align-items: center; gap: 6px; }
.pf-cal-swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; background: rgba(255,255,255,0.08); }
.pf-cal-swatch.has-recv { background: rgba(46,204,113,0.6); }
.pf-cal-swatch.has-ann { border: 1px dashed rgba(225,177,44,0.9); }

@keyframes pf-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('pf-styles')) {
  const style = document.createElement('style');
  style.id = 'pf-styles';
  style.textContent = PF_CSS;
  document.head.appendChild(style);
}
