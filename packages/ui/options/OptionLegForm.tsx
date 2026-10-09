// OptionLegForm — registra operações REAIS de opções (sem o bridge) e importa extrato CSV.
// Cada envio vira UM grupo (estratégia) com 1..N pernas. Conta escolhida pelo usuário.
// O multiplicador do contrato é obrigatório. A página aplica o risk gate antes de gravar.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (posições manuais) e melhorias.md (A6).
import React, { useState } from 'react';
import { parseOptionLegsCsv } from '@apps/lib/db';
import type { Account, OptionLeg, OptionRight } from '@apps/lib/db';
import { ensureOptionStyles } from './optionStyles';

ensureOptionStyles();

interface Props {
  accounts: Account[];
  accountId: string;
  onAccountChange: (id: string) => void;
  underlyings: string[];
  defaultMultiplier: number | null;
  multipliers: Record<string, number>;
  onSubmit: (legs: OptionLeg[]) => void | Promise<void>;
  onImportLegs: (legs: OptionLeg[]) => void | Promise<void>;
  onCancel?: () => void;
}

interface Row {
  right: OptionRight;
  side: 'buy' | 'sell';
  qty: string;
  strike: string;
  expiry: string;
  price: string;
  ivPct: string;
}

const blank = (): Row => ({ right: 'call', side: 'sell', qty: '1', strike: '', expiry: '', price: '', ivPct: '' });

function localInputNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function OptionLegForm({
  accounts, accountId, onAccountChange, underlyings, defaultMultiplier, multipliers, onSubmit, onImportLegs, onCancel,
}: Props) {
  const [underlying, setUnderlying] = useState(underlyings[0] ?? '');
  const [multiplier, setMultiplier] = useState('');
  const [fees, setFees] = useState('0');
  const [when, setWhen] = useState(localInputNow());
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState('');
  const [csvMsg, setCsvMsg] = useState<{ ok: number; errors: Array<{ line: number; message: string }> } | null>(null);

  const u = underlying.trim().toUpperCase();
  const knownMult = multipliers[u] ?? defaultMultiplier;
  const effMult = multiplier !== '' ? Number(multiplier.replace(',', '.')) : knownMult;
  const patch = (i: number, p: Partial<Row>) => setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const submit = async () => {
    setError('');
    if (!accountId) return setError('Escolha a conta.');
    if (!u) return setError('Informe o subjacente.');
    if (!effMult || !(effMult > 0)) return setError('Informe o multiplicador do contrato.');
    const t = new Date(when);
    if (Number.isNaN(t.getTime())) return setError('Data/hora inválida.');
    const totalFees = Number(fees.replace(',', '.'));
    if (!(totalFees >= 0)) return setError('Taxas inválidas.');
    const groupId = `grp_${Date.now().toString(36)}`;
    const legs: OptionLeg[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const qty = Number(r.qty);
      const strike = Number(r.strike.replace(',', '.'));
      const price = Number(r.price.replace(',', '.'));
      if (!(qty > 0) || !Number.isInteger(qty)) return setError(`Perna ${i + 1}: quantidade deve ser inteira positiva.`);
      if (!(strike > 0)) return setError(`Perna ${i + 1}: strike inválido.`);
      if (!r.expiry) return setError(`Perna ${i + 1}: informe o vencimento.`);
      if (!(price >= 0) || r.price.trim() === '') return setError(`Perna ${i + 1}: informe o prêmio.`);
      const iv = r.ivPct.trim() === '' ? undefined : Number(r.ivPct.replace(',', '.')) / 100;
      legs.push({
        id: `leg_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        accountId,
        underlying: u,
        symbol: `${u}${r.right[0].toUpperCase()}${strike}`,
        right: r.right,
        strike,
        expiry: r.expiry,
        qty: r.side === 'sell' ? -qty : qty,
        multiplier: effMult,
        entryPrice: price,
        entryDatetime: t.toISOString(),
        fees: Number((totalFees / rows.length).toFixed(6)),
        ivEntry: iv && iv > 0 ? iv : undefined,
        groupId,
        source: 'manual',
        updatedAt: new Date().toISOString(),
        deviceId: '',
        version: 0,
      });
    }
    setBusy(true);
    try {
      await onSubmit(legs);
      setRows([blank()]);
    } finally { setBusy(false); }
  };

  const importCsv = async () => {
    if (!accountId) { setCsvMsg({ ok: 0, errors: [{ line: 0, message: 'Escolha a conta antes de importar.' }] }); return; }
    const res = parseOptionLegsCsv(csv, { accountId, defaultMultiplier: effMult ?? undefined });
    setCsvMsg({ ok: res.legs.length, errors: res.errors });
    if (res.legs.length === 0) return;
    setBusy(true);
    try { await onImportLegs(res.legs); if (res.errors.length === 0) setCsv(''); } finally { setBusy(false); }
  };

  return (
    <div className="opx-stack">
      <div className="card opx-panel" role="group" aria-label="Registrar operação">
        <div className="opx-row"><span className="opx-title opx-grow">Registrar operação</span>{onCancel && <button type="button" className="opx-btn small" onClick={onCancel}>Fechar</button>}</div>
        <div className="opx-fields">
          <label className="opx-field"><span>Conta</span>
            <select className="select" value={accountId} onChange={(e) => onAccountChange(e.target.value)}>
              <option value="">Selecione…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="opx-field"><span>Subjacente</span>
            <input className="input" list="opx-lf-underlyings" value={underlying} onChange={(e) => setUnderlying(e.target.value.toUpperCase())} placeholder="ex.: AAPL" />
            <datalist id="opx-lf-underlyings">{underlyings.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label className="opx-field"><span>Multiplicador{knownMult ? ` (usando ${knownMult})` : ' *'}</span>
            <input className="input" inputMode="decimal" placeholder={knownMult ? String(knownMult) : 'obrigatório'} value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
          </label>
          <label className="opx-field"><span>Data/hora</span><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
          <label className="opx-field"><span>Taxas (total)</span><input className="input" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} /></label>
        </div>

        <div className="opx-scroll">
          <table className="opx-table" aria-label="Pernas da operação">
            <thead><tr><th className="left">Lado</th><th className="left">Tipo</th><th>Qtd</th><th>Strike</th><th>Vencimento</th><th>Prêmio</th><th>IV %</th><th aria-hidden="true" /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="left"><select className="select" aria-label={`Lado da perna ${i + 1}`} value={r.side} onChange={(e) => patch(i, { side: e.target.value as Row['side'] })}><option value="sell">Venda</option><option value="buy">Compra</option></select></td>
                  <td className="left"><select className="select" aria-label={`Tipo da perna ${i + 1}`} value={r.right} onChange={(e) => patch(i, { right: e.target.value as OptionRight })}><option value="call">Call</option><option value="put">Put</option></select></td>
                  <td><input className="input" inputMode="numeric" aria-label={`Quantidade da perna ${i + 1}`} value={r.qty} onChange={(e) => patch(i, { qty: e.target.value })} /></td>
                  <td><input className="input" inputMode="decimal" aria-label={`Strike da perna ${i + 1}`} value={r.strike} onChange={(e) => patch(i, { strike: e.target.value })} /></td>
                  <td><input className="input" type="date" aria-label={`Vencimento da perna ${i + 1}`} value={r.expiry} onChange={(e) => patch(i, { expiry: e.target.value })} /></td>
                  <td><input className="input" inputMode="decimal" aria-label={`Prêmio da perna ${i + 1}`} value={r.price} onChange={(e) => patch(i, { price: e.target.value })} /></td>
                  <td><input className="input" inputMode="decimal" aria-label={`IV da perna ${i + 1}`} value={r.ivPct} onChange={(e) => patch(i, { ivPct: e.target.value })} /></td>
                  <td>{rows.length > 1 && <button type="button" className="opx-btn small" aria-label={`Remover perna ${i + 1}`} onClick={() => setRows((p) => p.filter((_, k) => k !== i))}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <div className="opx-alert bad" role="alert">{error}</div>}
        <div className="opx-row">
          <button type="button" className="opx-btn small" disabled={rows.length >= 6} onClick={() => setRows((p) => [...p, blank()])}>+ Perna</button>
          <div className="opx-grow" />
          <button type="button" className="opx-btn primary" disabled={busy} onClick={submit}>Registrar</button>
        </div>
        <span className="opx-small opx-muted">Prêmio = preço por ação/unidade do contrato. IV de entrada habilita P/L teórico e gregas.</span>
      </div>

      <div className="card opx-panel" role="group" aria-label="Importar extrato CSV">
        <span className="opx-title">Importar extrato (CSV)</span>
        <span className="opx-small opx-muted">
          Cabeçalho: <code>ativo, tipo, strike, vencimento, lado, qtd, preco, data, taxas, multiplicador</code>. Reimportar o mesmo arquivo não duplica. A conta e (se faltar) o multiplicador vêm dos campos acima.
        </span>
        <textarea className="input" rows={5} aria-label="CSV do extrato" value={csv} onChange={(e) => setCsv(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} placeholder={'ativo;tipo;strike;vencimento;lado;qtd;preco;data\nAAPL;put;100;20/11/2026;venda;1;3,10;01/10/2026 10:00'} />
        <div className="opx-row"><button type="button" className="opx-btn primary" disabled={busy || csv.trim() === ''} onClick={importCsv}>Importar</button></div>
        {csvMsg && (
          <div className={`opx-alert ${csvMsg.errors.length ? 'warn' : ''}`} role="status">
            <b>{csvMsg.ok} perna(s) lida(s){csvMsg.errors.length ? `, ${csvMsg.errors.length} com erro` : ''}.</b>
            {csvMsg.errors.slice(0, 8).map((e) => <span key={`${e.line}${e.message}`} className="opx-small">{e.line ? `Linha ${e.line}: ` : ''}{e.message}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
