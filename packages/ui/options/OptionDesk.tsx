// OptionDesk — cadeia de opções (estilo Quantower). Desktop: tabela Calls | Strike | Puts.
// Mobile (≤720px): um CARD por strike (Call em cima, Put embaixo) — nunca tabela espremida.
// Bid/Ask são botões: clicar no Ask monta uma COMPRA ao ask; clicar no Bid, uma VENDA ao bid
// (vai para o paper). Seletor de colunas (OI, IV, Δ, Bid, Ask). IV/Δ calculados localmente
// aparecem com a marca "calc" (nunca se passam por dado do broker). Sem cálculo aqui.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (sub-aba Desk).
import React, { useEffect, useMemo, useState } from 'react';
import type { OptionChainQuote } from '@apps/lib/db';
import { ensureOptionStyles } from './optionStyles';

ensureOptionStyles();

interface Props {
  quotes: OptionChainQuote[];
  spots?: Record<string, number>;
  onAddPaper?: (quote: OptionChainQuote, qty: number, price?: number) => void;
  onEditChain?: () => void;
}

type ColKey = 'oi' | 'iv' | 'delta' | 'bid' | 'ask';
const COLS: Array<{ key: ColKey; label: string }> = [
  { key: 'oi', label: 'OI' },
  { key: 'iv', label: 'IV' },
  { key: 'delta', label: 'Δ' },
  { key: 'bid', label: 'Bid' },
  { key: 'ask', label: 'Ask' },
];

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null ? '—' : v.toFixed(digits);
}
function fmtDelta(v: number | null | undefined): string {
  return v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}
function fmtOi(v: number | null | undefined): string {
  return v == null ? '—' : compact.format(v);
}

function useNarrow(maxPx = 720): boolean {
  const query = `(max-width: ${maxPx}px)`;
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

function Derived({ q, field }: { q?: OptionChainQuote; field: 'iv' | 'greeks' }) {
  if (!q?.derivedFields?.includes(field)) return null;
  return (
    <span
      className="opx-badge info"
      title={field === 'iv' ? 'IV calculada localmente (Black-Scholes) a partir do preço' : 'Gregas calculadas localmente (Black-Scholes)'}
    >
      calc
    </span>
  );
}

interface Row {
  strike: number;
  call?: OptionChainQuote;
  put?: OptionChainQuote;
}

export default function OptionDesk({ quotes, spots, onAddPaper, onEditChain }: Props) {
  const narrow = useNarrow();
  const underlyings = useMemo(() => [...new Set(quotes.map((q) => q.underlying))].sort(), [quotes]);
  const [underlying, setUnderlying] = useState<string>('');
  const activeUnderlying = underlyings.includes(underlying) ? underlying : underlyings[0] || '';

  const expiries = useMemo(
    () => [...new Set(quotes.filter((q) => q.underlying === activeUnderlying).map((q) => q.expiry))].sort(),
    [quotes, activeUnderlying],
  );
  const [expiry, setExpiry] = useState<string>('');
  const activeExpiry = expiries.includes(expiry) ? expiry : expiries[0] || '';

  const [visible, setVisible] = useState<Set<ColKey>>(new Set<ColKey>(['oi', 'iv', 'delta', 'bid', 'ask']));
  const toggle = (k: ColKey) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size > 1) next.delete(k);
      } else next.add(k);
      return next;
    });

  const spot = spots?.[activeUnderlying];

  const rows: Row[] = useMemo(() => {
    const forExp = quotes.filter((q) => q.underlying === activeUnderlying && q.expiry === activeExpiry);
    const strikes = [...new Set(forExp.map((q) => q.strike))].sort((a, b) => a - b);
    return strikes.map((strike) => ({
      strike,
      call: forExp.find((q) => q.strike === strike && q.right === 'call'),
      put: forExp.find((q) => q.strike === strike && q.right === 'put'),
    }));
  }, [quotes, activeUnderlying, activeExpiry]);

  const atmStrike = useMemo(() => {
    if (!(spot && spot > 0) || rows.length === 0) return null;
    return rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), rows[0]).strike;
  }, [rows, spot]);

  if (quotes.length === 0) {
    return (
      <div className="card opx-empty" role="status">
        <b>Sem cadeia de opções</b>
        <span>Cadastre cotações manualmente ou cole um CSV da sua corretora. Com o bridge ligado elas chegam sozinhas.</span>
        {onEditChain && <button type="button" className="opx-btn primary" onClick={onEditChain}>Cadastrar cotações</button>}
      </div>
    );
  }

  const quoteBtn = (q: OptionChainQuote | undefined, side: 'bid' | 'ask') => {
    const price = q?.[side] ?? null;
    const label = side === 'ask' ? 'Comprar' : 'Vender';
    return (
      <button
        type="button"
        className={`opx-quote-btn ${side}`}
        disabled={!q || price == null || !onAddPaper}
        aria-label={q ? `${label} ${q.right === 'call' ? 'call' : 'put'} ${q.strike} a ${fmt(price)}` : label}
        onClick={() => q && price != null && onAddPaper?.(q, side === 'ask' ? 1 : -1, price)}
      >
        {fmt(price)}
      </button>
    );
  };

  const sideCells = (q: OptionChainQuote | undefined) => (
    <>
      {visible.has('oi') && <div className="opx-metric"><span>OI</span><span>{fmtOi(q?.oi)}</span></div>}
      {visible.has('iv') && (
        <div className="opx-metric"><span>IV%</span><span>{q?.iv != null ? (q.iv * 100).toFixed(1) : '—'} <Derived q={q} field="iv" /></span></div>
      )}
      {visible.has('delta') && (
        <div className="opx-metric"><span>Δ</span><span>{fmtDelta(q?.greeks?.delta)} <Derived q={q} field="greeks" /></span></div>
      )}
      {visible.has('bid') && <div className="opx-metric"><span>Bid</span>{quoteBtn(q, 'bid')}</div>}
      {visible.has('ask') && <div className="opx-metric"><span>Ask</span>{quoteBtn(q, 'ask')}</div>}
    </>
  );

  const shown = COLS.filter((c) => visible.has(c.key));
  const shownRev = [...shown].reverse();

  return (
    <div className="opx-stack">
      <div className="opx-row" role="group" aria-label="Filtros da cadeia">
        <label className="opx-field"><span>Ativo</span>
          <select className="select" value={activeUnderlying} onChange={(e) => { setUnderlying(e.target.value); setExpiry(''); }}>
            {underlyings.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="opx-field"><span>Vencimento</span>
          <select className="select" value={activeExpiry} onChange={(e) => setExpiry(e.target.value)}>
            {expiries.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <div className="opx-grow" />
        <div className="opx-row" role="group" aria-label="Colunas visíveis">
          {COLS.map((c) => (
            <button key={c.key} type="button" className="opx-chip" aria-pressed={visible.has(c.key)} onClick={() => toggle(c.key)}>{c.label}</button>
          ))}
        </div>
      </div>

      <div className="opx-muted opx-small">
        {spot && spot > 0
          ? <>Spot {activeUnderlying}: <b className="opx-num">{spot.toFixed(2)}</b> · </>
          : <>Informe o spot de {activeUnderlying} para destacar o ATM · </>}
        toque no <b className="opx-pos">Bid</b> para vender e no <b className="opx-neg">Ask</b> para comprar (vai para o paper) · Δ por ação · IV em %
      </div>

      {rows.length === 0 && <div className="card opx-empty">Sem strikes para este vencimento.</div>}

      {narrow ? (
        <div className="opx-stack" role="list" aria-label={`Strikes ${activeUnderlying} ${activeExpiry}`}>
          {rows.map(({ strike, call, put }) => (
            <div key={strike} role="listitem" className={`card opx-strike-card${atmStrike === strike ? ' opx-desk-atm' : ''}`}>
              <div className="opx-strike-head">
                <b className="opx-num">{strike.toFixed(2)}</b>
                {atmStrike === strike && <span className="opx-badge ok">ATM</span>}
              </div>
              <div className="opx-side"><span className="opx-side-label call">Call</span>{sideCells(call)}</div>
              <div className="opx-side"><span className="opx-side-label put">Put</span>{sideCells(put)}</div>
            </div>
          ))}
        </div>
      ) : (
        rows.length > 0 && (
          <div className="opx-scroll" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="opx-table" aria-label={`Cadeia ${activeUnderlying} ${activeExpiry}`}>
              <thead>
                <tr>
                  <th colSpan={shown.length} className="opx-th-call" scope="colgroup">CALLS</th>
                  <th className="opx-strike-col" scope="col">Strike</th>
                  <th colSpan={shown.length} className="opx-th-put" scope="colgroup">PUTS</th>
                </tr>
                <tr>
                  {shown.map((c) => <th key={`c${c.key}`} scope="col">{c.label}</th>)}
                  <th className="opx-strike-col" />
                  {shownRev.map((c) => <th key={`p${c.key}`} scope="col">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ strike, call, put }) => {
                  const itmCall = spot != null && strike < spot;
                  const itmPut = spot != null && strike > spot;
                  const cell = (q: OptionChainQuote | undefined, k: ColKey, itm: boolean, tag: string) => {
                    let content: React.ReactNode;
                    if (k === 'oi') content = fmtOi(q?.oi);
                    else if (k === 'iv') content = <>{q?.iv != null ? (q.iv * 100).toFixed(1) : '—'} <Derived q={q} field="iv" /></>;
                    else if (k === 'delta') content = <>{fmtDelta(q?.greeks?.delta)} <Derived q={q} field="greeks" /></>;
                    else content = quoteBtn(q, k);
                    return <td key={`${tag}${k}`} className={itm ? 'opx-itm' : undefined}>{content}</td>;
                  };
                  return (
                    <tr key={strike} className={atmStrike === strike ? 'opx-desk-atm' : undefined}>
                      {shown.map((c) => cell(call, c.key, itmCall, 'c'))}
                      <td className="opx-strike-col opx-num">{strike.toFixed(2)}</td>
                      {shownRev.map((c) => cell(put, c.key, itmPut, 'p'))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
