// OptionChainEditor — entrada MANUAL de cotações (sem bridge) e import de CSV da cadeia.
// A cadeia é cache volátil: reimportar o mesmo strike/vencimento ATUALIZA a linha (id
// determinístico). O multiplicador do contrato é obrigatório (nunca assumido).
// IV/gregas ausentes são calculadas localmente pela página (marcadas como "calc").
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (cotação manual) e melhorias.md (A6).
import React, { useState } from 'react';
import { optionQuoteId, parseOptionChainCsv } from '@apps/lib/db';
import type { OptionChainQuote, OptionRight } from '@apps/lib/db';
import { ensureOptionStyles } from './optionStyles';

ensureOptionStyles();

interface ChainSummary {
  underlying: string;
  expiry: string;
  count: number;
}

interface Props {
  underlyings: string[];
  defaultMultiplier: number | null;
  multipliers: Record<string, number>;
  chains: ChainSummary[];
  onSave: (quotes: OptionChainQuote[]) => void | Promise<void>;
  onClearChain: (underlying: string, expiry: string) => void | Promise<void>;
}

const optNum = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export default function OptionChainEditor({ underlyings, defaultMultiplier, multipliers, chains, onSave, onClearChain }: Props) {
  const [underlying, setUnderlying] = useState(underlyings[0] ?? '');
  const [expiry, setExpiry] = useState('');
  const [strike, setStrike] = useState('');
  const [right, setRight] = useState<OptionRight>('call');
  const [bid, setBid] = useState('');
  const [ask, setAsk] = useState('');
  const [last, setLast] = useState('');
  const [ivPct, setIvPct] = useState('');
  const [oi, setOi] = useState('');
  const [multiplier, setMultiplier] = useState('');
  const [csv, setCsv] = useState('');
  const [csvResult, setCsvResult] = useState<{ ok: number; errors: Array<{ line: number; message: string }> } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  const u = underlying.trim().toUpperCase();
  const knownMult = multipliers[u] ?? defaultMultiplier;
  const effMult = multiplier !== '' ? optNum(multiplier) : knownMult;

  const submit = async () => {
    setError('');
    const k = optNum(strike);
    const b = optNum(bid);
    const a = optNum(ask);
    const l = optNum(last);
    if (!u) return setError('Informe o subjacente.');
    if (!expiry) return setError('Informe o vencimento.');
    if (k == null || k <= 0) return setError('Strike inválido.');
    if (effMult == null || !(effMult > 0)) return setError('Informe o multiplicador do contrato.');
    if (b == null && a == null && l == null) return setError('Informe ao menos bid, ask ou último.');
    if (b != null && a != null && b > a) return setError('Bid não pode ser maior que o ask.');
    const ivRaw = optNum(ivPct);
    const quote: OptionChainQuote = {
      id: optionQuoteId(u, expiry, k, right),
      underlying: u,
      expiry,
      strike: k,
      right,
      symbol: `${u}${right[0].toUpperCase()}${k}`,
      bid: b,
      ask: a,
      last: l,
      iv: ivRaw != null && ivRaw > 0 ? ivRaw / 100 : null,
      oi: optNum(oi),
      volume: null,
      greeks: null,
      multiplier: effMult,
      at: new Date().toISOString(),
      source: 'manual',
    };
    setBusy(true);
    try {
      await onSave([quote]);
      setBid(''); setAsk(''); setLast(''); setIvPct(''); setOi('');
    } finally { setBusy(false); }
  };

  const importCsv = async () => {
    const res = parseOptionChainCsv(csv, {
      defaultUnderlying: u || undefined,
      defaultExpiry: expiry || undefined,
      defaultMultiplier: effMult ?? undefined,
    });
    setCsvResult({ ok: res.quotes.length, errors: res.errors });
    if (res.quotes.length === 0) return;
    setBusy(true);
    try { await onSave(res.quotes); if (res.errors.length === 0) setCsv(''); } finally { setBusy(false); }
  };

  return (
    <div className="opx-stack">
      <div className="card opx-panel" role="group" aria-label="Cadastrar cotação">
        <span className="opx-title">Cotação manual</span>
        <div className="opx-fields">
          <label className="opx-field"><span>Subjacente</span>
            <input className="input" list="opx-ce-underlyings" value={underlying} onChange={(e) => setUnderlying(e.target.value.toUpperCase())} placeholder="ex.: AAPL" />
            <datalist id="opx-ce-underlyings">{underlyings.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label className="opx-field"><span>Vencimento</span><input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
          <label className="opx-field"><span>Strike</span><input className="input" inputMode="decimal" value={strike} onChange={(e) => setStrike(e.target.value)} /></label>
          <label className="opx-field"><span>Tipo</span>
            <select className="select" value={right} onChange={(e) => setRight(e.target.value as OptionRight)}><option value="call">Call</option><option value="put">Put</option></select>
          </label>
          <label className="opx-field"><span>Bid</span><input className="input" inputMode="decimal" value={bid} onChange={(e) => setBid(e.target.value)} /></label>
          <label className="opx-field"><span>Ask</span><input className="input" inputMode="decimal" value={ask} onChange={(e) => setAsk(e.target.value)} /></label>
          <label className="opx-field"><span>Último</span><input className="input" inputMode="decimal" value={last} onChange={(e) => setLast(e.target.value)} /></label>
          <label className="opx-field"><span>IV % (opcional)</span><input className="input" inputMode="decimal" value={ivPct} onChange={(e) => setIvPct(e.target.value)} /></label>
          <label className="opx-field"><span>OI (opcional)</span><input className="input" inputMode="numeric" value={oi} onChange={(e) => setOi(e.target.value)} /></label>
          <label className="opx-field"><span>Multiplicador{knownMult ? ` (usando ${knownMult})` : ' *'}</span>
            <input className="input" inputMode="decimal" placeholder={knownMult ? String(knownMult) : 'obrigatório'} value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
          </label>
        </div>
        {error && <div className="opx-alert bad" role="alert">{error}</div>}
        <span className="opx-small opx-muted">Sem IV? Ela é calculada a partir do mid (precisa do spot do subjacente) e marcada como “calc”.</span>
        <div className="opx-row"><button type="button" className="opx-btn primary" disabled={busy} onClick={submit}>Salvar cotação</button></div>
      </div>

      <div className="card opx-panel" role="group" aria-label="Importar cadeia por CSV">
        <span className="opx-title">Colar CSV da cadeia</span>
        <span className="opx-small opx-muted">
          Cabeçalho: <code>strike, tipo, bid, ask, last, iv, oi, multiplicador</code> (+ <code>ativo</code> e <code>vencimento</code> se não preencher acima). Aceita “;” e vírgula decimal (1,25). IV pode ser 29, 0,29 ou 29%.
        </span>
        <textarea className="input" rows={6} aria-label="CSV da cadeia" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'strike;tipo;bid;ask;iv\n100;call;3,40;3,60;29%'} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        <div className="opx-row">
          <button type="button" className="opx-btn primary" disabled={busy || csv.trim() === ''} onClick={importCsv}>Importar</button>
        </div>
        {csvResult && (
          <div className={`opx-alert ${csvResult.errors.length ? 'warn' : ''}`} role="status">
            <b>{csvResult.ok} linha(s) importada(s){csvResult.errors.length ? `, ${csvResult.errors.length} com erro` : ''}.</b>
            {csvResult.errors.slice(0, 8).map((e) => <span key={`${e.line}${e.message}`} className="opx-small">Linha {e.line}: {e.message}</span>)}
            {csvResult.errors.length > 8 && <span className="opx-small opx-muted">… e mais {csvResult.errors.length - 8}.</span>}
          </div>
        )}
      </div>

      {chains.length > 0 && (
        <div className="card opx-panel">
          <span className="opx-title">Cadeias cadastradas</span>
          {chains.map((c) => {
            const key = `${c.underlying}:${c.expiry}`;
            return (
              <div key={key} className="opx-row">
                <span className="opx-grow">{c.underlying} · {c.expiry} <span className="opx-muted opx-small">({c.count} linhas)</span></span>
                {confirmClear === key ? (
                  <>
                    <button type="button" className="opx-btn small danger" onClick={async () => { setConfirmClear(null); await onClearChain(c.underlying, c.expiry); }}>Apagar</button>
                    <button type="button" className="opx-btn small" onClick={() => setConfirmClear(null)}>Cancelar</button>
                  </>
                ) : (
                  <button type="button" className="opx-btn small" onClick={() => setConfirmClear(key)}>Remover</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
