// Payouts/Withdrawals (engine-driven). Cria payout (gross + split por peso + fee%) e
// aplica no ledger via `onCreate`. Usa `computePayoutSplitByWeight` (fórmula única).
// UX reaproveitada do app antigo: cards de resumo, líquido por firm (com cor), busca,
// filtro por status, tabela ordenável e form completo. Nenhuma fórmula nova.
//
// Fonte: DOCS/05_STAGE4_MONEY_OS/00-produto.md + DOCS/10_MODULES/propfirm.

import { fmtMoney } from './currency';
import React, { useMemo, useState } from 'react';
import { computePayoutSplitByWeight } from '@apps/lib/db';
import { Search, Plus, Trash2, X, Download } from 'lucide-react';

const METHODS = ['Wise', 'Payoneer', 'Bank', 'Crypto', 'Other'];
const STATUSES = ['Pending', 'Approved', 'Paid'];
const DEFAULT_FIRM_COLOR = '#7c5cff';

const statusClass = (s) => (s === 'Paid' ? 'py-st-paid' : s === 'Approved' ? 'py-st-approved' : 'py-st-pending');

function emptyForm() {
  return { gross: '', feePct: 0.2, method: 'Wise', status: 'Pending', date: new Date().toISOString().slice(0, 10), weights: {}, attachments: {} };
}

/**
 * @param {object} props
 * @param {Array<object>} [props.payouts]
 * @param {Array<{id:string;name:string;firmId?:string}>} [props.accounts]
 * @param {Array<{id:string;name:string;color:string}>} [props.firms]
 * @param {(payout:object)=>Promise<void>|void} props.onCreate
 * @param {(payoutId:string)=>Promise<void>|void} [props.onDelete]
 * @param {boolean} [props.loading]
 */
export default function Payouts({ payouts = [], accounts = [], firms = [], onCreate, onDelete, loading = false }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);

  const accountList = accounts as Array<{ id: string; name: string; firmId?: string }>;
  const firmList = firms as Array<{ id: string; name: string; color: string; icon?: string }>;
  const accountById = useMemo(() => Object.fromEntries(accountList.map((a) => [a.id, a])), [accountList]);
  const firmById = useMemo(() => Object.fromEntries(firmList.map((f) => [f.id, f])), [firmList]);
  const firmColorOf = (accountId: string) => {
    const acc = accountById[accountId];
    const firm = acc?.firmId ? firmById[acc.firmId] : null;
    return firm?.color || DEFAULT_FIRM_COLOR;
  };
  const firmIconOf = (accountId: string) => {
    const acc = accountById[accountId];
    const firm = acc?.firmId ? firmById[acc.firmId] : null;
    return firm?.icon || null;
  };

  const summary = useMemo(() => {
    const gross = payouts.reduce((s, p) => s + (Number(p.gross) || 0), 0);
    const fee = payouts.reduce((s, p) => s + (Number(p.fee) || 0), 0);
    const net = payouts.reduce((s, p) => s + (Number(p.net) || 0), 0);
    return { gross, fee, net, count: payouts.length };
  }, [payouts]);

  // Líquido por firm (soma o net de cada conta pela cor da firm).
  const netByFirm = useMemo<Array<{ label: string; net: number; color: string }>>(() => {
    const acc: Record<string, { label: string; net: number; color: string }> = {};
    for (const p of payouts as Array<Record<string, any>>) {
      const split = p.splitByAccount as Record<string, { net?: number }> | undefined;
      const accountIds = (p.accountIds as string[]) ?? [];
      const splits: Array<[string, number]> = split && Object.keys(split).length
        ? Object.entries(split).map(([accountId, s]) => [accountId, Number(s.net) || 0] as [string, number])
        : accountIds.map((accountId) => [accountId, (Number(p.net) || 0) / Math.max(1, accountIds.length)] as [string, number]);
      for (const [accountId, net] of splits) {
        const a = accountById[accountId];
        const firm = a?.firmId ? firmById[a.firmId] : null;
        const key = firm?.id || accountId;
        const label = firm?.name || a?.name || accountId;
        if (!acc[key]) acc[key] = { label, net: 0, color: firm?.color || DEFAULT_FIRM_COLOR };
        acc[key].net += net;
      }
    }
    return Object.values(acc).filter((r) => r.net !== 0);
  }, [payouts, accountById, firmById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = payouts.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (!q) return true;
      const names = (p.accountIds ?? []).map((id) => accountById[id]?.name ?? '').join(' ');
      return `${p.method} ${p.status} ${p.gross} ${p.net} ${names}`.toLowerCase().includes(q);
    });
    list = list.slice().sort((a, b) => {
      let av = a[sortKey]; let bv = b[sortKey];
      if (sortKey === 'date') { av = a.date || a.updatedAt || ''; bv = b.date || b.updatedAt || ''; return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av)); }
      av = Number(av) || 0; bv = Number(bv) || 0;
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [payouts, query, statusFilter, sortKey, sortAsc, accountById]);

  const net = form.gross ? Number(form.gross) * (1 - Number(form.feePct)) : 0;
  const selectedAccounts = accounts.filter((a) => (form.weights[a.id] ?? 0) > 0);
  const preview = useMemo(() => {
    if (!form.gross || selectedAccounts.length === 0) return null;
    const weightMap = Object.fromEntries(selectedAccounts.map((a) => [a.id, form.weights[a.id]]));
    return computePayoutSplitByWeight(Number(form.gross), Number(form.feePct), weightMap);
  }, [form.gross, form.feePct, form.weights, selectedAccounts]);

  const toggleAccount = (id) => setForm((f) => {
    const next = { ...f.weights };
    if (next[id]) delete next[id]; else next[id] = 1;
    return { ...f, weights: next };
  });
  const setWeight = (id, v) => setForm((f) => ({ ...f, weights: { ...f.weights, [id]: Number(v) || 0 } }));

  const handleCreate = async () => {
    if (!form.gross || Number(form.gross) <= 0) return;
    setSaving(true);
    try {
      const accountIds = selectedAccounts.length > 0 ? selectedAccounts.map((a) => a.id) : (accounts[0] ? [accounts[0].id] : []);
      const weightMap = selectedAccounts.length > 0
        ? Object.fromEntries(selectedAccounts.map((a) => [a.id, form.weights[a.id]]))
        : { [accountIds[0]]: 1 };
      const splitByAccount = computePayoutSplitByWeight(Number(form.gross), Number(form.feePct), weightMap);
      await onCreate({
        id: `payout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        accountIds,
        gross: Number(form.gross),
        fee: Number(form.gross) * Number(form.feePct),
        net,
        splitByAccount,
        status: form.status,
        method: form.method,
        attachments: form.attachments,
        date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
      });
      setShowForm(false);
      setForm(emptyForm());
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const head = 'date,gross,fee,net,method,status,accounts';
    const lines = filtered.map((p) => [
      (p.date || p.updatedAt || '').slice(0, 10), p.gross, p.fee, p.net, p.method, p.status,
      `"${(p.accountIds ?? []).map((id) => accountById[id]?.name ?? id).join(' | ')}"`,
    ].join(','));
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="py-root py-loading" role="status" aria-live="polite">
        <div className="py-skeleton" /><div className="py-skeleton" />
        <span className="py-screen-reader">Carregando payouts…</span>
      </div>
    );
  }

  return (
    <div className="py-root">
      {/* Resumo */}
      <div className="py-summary">
        <div className="py-sum-card"><span className="py-sum-label">Gross solicitado</span><span className="py-sum-value">{fmtMoney(summary.gross)}</span><span className="py-sum-sub">{summary.count} payout(s)</span></div>
        <div className="py-sum-card py-sum-fee"><span className="py-sum-label">Total de taxas</span><span className="py-sum-value">- {fmtMoney(summary.fee)}</span></div>
        <div className="py-sum-card py-sum-net"><span className="py-sum-label">Líquido recebido</span><span className="py-sum-value">+ {fmtMoney(summary.net)}</span></div>
        {netByFirm.length > 0 && (
          <div className="py-sum-card py-sum-firms">
            <span className="py-sum-label">Líquido por firm</span>
            <div className="py-firm-list">
              {netByFirm.map((f) => (
                <span key={f.label} className="py-firm-chip" style={{ color: f.color, borderColor: f.color }}>
                  <span className="py-firm-dot" style={{ background: f.color }} />{f.label} {fmtMoney(f.net)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="py-toolbar">
        <div className="py-search">
          <Search size={15} />
          <input className="py-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por conta, método, valor…" aria-label="Buscar payout" />
        </div>
        <select className="py-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por status" style={{ maxWidth: 160 }}>
          <option value="">Todos os status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="py-input" value={`${sortKey}:${sortAsc ? 'asc' : 'desc'}`} onChange={(e) => { const [k, d] = e.target.value.split(':'); setSortKey(k); setSortAsc(d === 'asc'); }} aria-label="Ordenar" style={{ maxWidth: 190 }}>
          <option value="date:desc">Data (recente)</option>
          <option value="date:asc">Data (antiga)</option>
          <option value="net:desc">Líquido (maior)</option>
          <option value="gross:desc">Gross (maior)</option>
        </select>
        <button className="py-btn" onClick={exportCsv} disabled={filtered.length === 0}><Download size={14} /> CSV</button>
        <button className="py-btn py-btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Novo payout</button>
      </div>

      {/* Lista: tabela no desktop, cards no mobile */}
      {filtered.length === 0 ? (
        <div className="py-empty" role="status">{payouts.length === 0 ? 'Nenhum payout ainda.' : 'Nenhum payout encontrado.'}</div>
      ) : (
        <>
          <div className="py-table-wrap">
            <table className="py-table">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Contas / firm</th>
                  <th scope="col">Método</th>
                  <th scope="col">Status</th>
                  <th scope="col">Gross</th>
                  <th scope="col">Fee</th>
                  <th scope="col">Líquido</th>
                  <th scope="col" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{(p.date || p.updatedAt || '').slice(0, 10)}</td>
                    <td>
                      {(p.accountIds ?? []).map((id) => (
                        <span key={id} className="py-acct-chip">
                          {firmIconOf(id) ? <span>{firmIconOf(id)}</span> : <span className="py-firm-dot" style={{ background: firmColorOf(id) }} />}
                          {accountById[id]?.name ?? id}
                        </span>
                      ))}
                    </td>
                    <td>{p.method}</td>
                    <td><span className={`py-status ${statusClass(p.status)}`}>{p.status}</span></td>
                    <td className="py-num">{fmtMoney(p.gross)}</td>
                    <td className="py-num py-neg">- {fmtMoney(p.fee)}</td>
                    <td className="py-num py-pos">{fmtMoney(p.net)}</td>
                    <td>{onDelete && <button className="py-icon-btn py-danger" onClick={() => onDelete(p.id)} aria-label="Excluir payout"><Trash2 size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="py-cards">
            {filtered.map((p) => (
              <div key={p.id} className="py-card">
                <div className="py-card-head">
                  <span className="py-card-date">{(p.date || p.updatedAt || '').slice(0, 10)}</span>
                  <span className={`py-status ${statusClass(p.status)}`}>{p.status}</span>
                </div>
                <div className="py-card-net py-pos">{fmtMoney(p.net)}</div>
                <div className="py-card-meta">gross {fmtMoney(p.gross)} · fee {fmtMoney(p.fee)} · {p.method}</div>
                <div className="py-card-accts">
                  {(p.accountIds ?? []).map((id) => (
                    <span key={id} className="py-acct-chip">{firmIconOf(id) ? <span>{firmIconOf(id)}</span> : <span className="py-firm-dot" style={{ background: firmColorOf(id) }} />}{accountById[id]?.name ?? id}</span>
                  ))}
                </div>
                {onDelete && <button className="py-btn py-btn-sm py-btn-danger" onClick={() => onDelete(p.id)}>Excluir</button>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Form */}
      {showForm && (
        <div className="py-overlay" onClick={() => setShowForm(false)}>
          <div className="py-sheet" role="dialog" aria-modal="true" aria-label="Novo payout" onClick={(e) => e.stopPropagation()}>
            <div className="py-sheet-head">
              <span className="py-sheet-title">Novo payout</span>
              <button className="py-icon-btn" onClick={() => setShowForm(false)} aria-label="Fechar"><X size={16} /></button>
            </div>
            <div className="py-form">
              <div className="py-grid">
                <label className="py-field"><span className="py-label">Gross ($)</span>
                  <input className="py-input" type="number" step="0.01" value={form.gross} onChange={(e) => setForm((f) => ({ ...f, gross: e.target.value }))} placeholder="0.00" />
                </label>
                <label className="py-field"><span className="py-label">Fee (decimal, ex. 0.2)</span>
                  <input className="py-input" type="number" step="0.01" value={form.feePct} onChange={(e) => setForm((f) => ({ ...f, feePct: Number(e.target.value) }))} />
                </label>
                <label className="py-field"><span className="py-label">Método</span>
                  <input className="py-input" list="py-methods" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} />
                  <datalist id="py-methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
                </label>
                <label className="py-field"><span className="py-label">Status</span>
                  <select className="py-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="py-field"><span className="py-label">Data</span>
                  <input className="py-input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </label>
              </div>

              <div className="py-split">
                <div className="py-split-title">Contas (marque e defina o peso) — divisão por peso</div>
                {accounts.length === 0 && <div className="py-hint">Nenhuma conta prop — crie em Contas primeiro.</div>}
                {accounts.map((a) => {
                  const on = (form.weights[a.id] ?? 0) > 0;
                  const firm = a.firmId ? firmById[a.firmId] : null;
                  const part = preview?.[a.id]?.net;
                  return (
                    <div key={a.id} className={`py-split-row${on ? ' on' : ''}`}>
                      <label className="py-split-check">
                        <input type="checkbox" checked={on} onChange={() => toggleAccount(a.id)} />
                        <span className="py-firm-dot" style={{ background: firm?.color || DEFAULT_FIRM_COLOR }} />
                        <span className="py-split-name">{a.name}{firm ? ` · ${firm.name}` : ''}</span>
                      </label>
                      <input className="py-input py-split-input" type="number" min="0" placeholder="peso" value={form.weights[a.id] ?? ''} onChange={(e) => setWeight(a.id, e.target.value)} disabled={!on} aria-label={`Peso ${a.name}`} />
                      <span className="py-split-net">{part != null ? fmtMoney(part) : '—'}</span>
                    </div>
                  );
                })}
              </div>

              <div className="py-preview">
                <div><span className="py-label">Gross</span> <b>{fmtMoney(Number(form.gross) || 0)}</b></div>
                <div><span className="py-label">Fee</span> <b className="py-neg">{fmtMoney((Number(form.gross) || 0) * Number(form.feePct))}</b></div>
                <div><span className="py-label">Líquido</span> <b className="py-pos">{fmtMoney(net)}</b></div>
              </div>

              <div className="py-split">
                <div className="py-split-title">Comprovante</div>
                <input className="py-input" type="file" accept="image/*,.pdf" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setForm((f) => ({ ...f, attachments: { ...f.attachments, [file.name]: { name: file.name, dataUrl: reader.result } } }));
                  reader.readAsDataURL(file);
                }} />
                {Object.keys(form.attachments).length > 0 && (
                  <div className="py-attach-list">
                    {Object.keys(form.attachments).map((name) => (
                      <div key={name} className="py-attach-item">
                        <span>{name}</span>
                        <button className="py-btn py-btn-sm py-btn-danger" onClick={() => setForm((f) => { const n = { ...f.attachments }; delete n[name]; return { ...f, attachments: n }; })}>x</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="py-actions">
                <button className="py-btn py-btn-primary" onClick={handleCreate} disabled={saving || !form.gross}>{saving ? 'Aplicando…' : 'Criar e aplicar'}</button>
                <button className="py-btn" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PY_CSS = `
.py-root { display: flex; flex-direction: column; gap: 14px; }
.py-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.py-loading { gap: 8px; }
.py-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: py-pulse 1.4s ease-in-out infinite; }

.py-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(220px, 1.6fr); gap: 12px; }
.py-sum-card { display: flex; flex-direction: column; gap: 4px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.py-sum-fee { background: linear-gradient(180deg, #3a1a1a 0%, #241414 100%); border-color: rgba(231,76,60,0.25); }
.py-sum-fee .py-sum-value { color: var(--red, #e74c3c); }
.py-sum-net { background: linear-gradient(180deg, #1a3a2b 0%, #142428 100%); border-color: rgba(46,204,113,0.25); }
.py-sum-net .py-sum-value { color: var(--green, #2ecc71); }
.py-sum-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.py-sum-value { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.py-sum-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.py-firm-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.py-firm-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; border: 1px solid; background: rgba(255,255,255,0.03); font-variant-numeric: tabular-nums; }
.py-firm-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

.py-toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.py-search { position: relative; display: flex; align-items: center; flex: 1; min-width: 200px; }
.py-search svg { position: absolute; left: 12px; color: var(--muted, #a1a7b3); }
.py-search .py-input { padding-left: 34px; }

.py-table-wrap { overflow-x: auto; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 6px 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.py-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.py-table th, .py-table td { padding: 10px 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); }
.py-table thead th { color: var(--muted, #a1a7b3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
.py-table tbody tr:hover { background: rgba(255,255,255,0.02); }
.py-num { text-align: right; }
.py-pos { color: var(--green, #2ecc71); }
.py-neg { color: var(--red, #e74c3c); }
.py-acct-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; margin-right: 6px; white-space: nowrap; }
.py-status { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; padding: 3px 8px; border-radius: 999px; border: 1px solid; }
.py-st-paid { color: var(--green, #2ecc71); border-color: rgba(46,204,113,0.45); background: rgba(46,204,113,0.1); }
.py-st-approved { color: var(--blue, #3498db); border-color: rgba(52,152,219,0.45); background: rgba(52,152,219,0.1); }
.py-st-pending { color: var(--yellow, #e1b12c); border-color: rgba(225,177,44,0.45); background: rgba(225,177,44,0.1); }
.py-cards { display: none; }

.py-btn { padding: 9px 14px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; display: inline-flex; align-items: center; gap: 6px; }
.py-btn:hover:not(:disabled) { filter: brightness(1.1); }
.py-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.py-btn-primary { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; font-weight: 700; box-shadow: 0 6px 16px rgba(124,92,255,0.28); }
.py-btn-sm { padding: 5px 10px; min-height: 36px; font-size: 12px; border-radius: 8px; }
.py-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }
.py-icon-btn { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: transparent; border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); cursor: pointer; }
.py-icon-btn.py-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }

.py-form { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.py-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.py-field { display: flex; flex-direction: column; gap: 4px; }
.py-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.py-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 9px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 40px; width: 100%; font-family: inherit; }
.py-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.py-split { display: flex; flex-direction: column; gap: 8px; }
.py-split-title { font-size: 12px; font-weight: 700; }
.py-split-row { display: grid; grid-template-columns: 1fr 90px 90px; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 10px; border: 1px solid transparent; }
.py-split-row.on { background: rgba(124,92,255,0.06); border-color: rgba(124,92,255,0.22); }
.py-split-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; }
.py-split-check input { width: 18px; height: 18px; accent-color: var(--brand, #7c5cff); }
.py-split-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.py-split-input { text-align: right; }
.py-split-net { text-align: right; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--green, #2ecc71); }
.py-hint { font-size: 12px; color: var(--muted, #a1a7b3); }
.py-attach-list { display: flex; flex-direction: column; gap: 6px; }
.py-attach-item { display: flex; align-items: center; justify-content: space-between; font-size: 12px; padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
.py-preview { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); }
.py-actions { display: flex; gap: 10px; }

.py-empty { padding: 28px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 14px; }

.py-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(7,9,14,0.72); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; }
.py-sheet { width: 100%; max-width: 680px; max-height: 92vh; overflow-y: auto; background: linear-gradient(180deg, #171c27 0%, #12161f 100%); border: 1px solid #1f2734; border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.55); }
.py-sheet-head { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; background: rgba(23,28,39,0.96); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(255,255,255,0.06); }
.py-sheet-title { font-size: 15px; font-weight: 800; }
.py-sheet .py-form { border: none; background: transparent; border-radius: 0; padding: 16px 18px 22px; }

@media (max-width: 900px) {
  .py-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .py-grid { grid-template-columns: 1fr; }
  .py-table-wrap { display: none; }
  .py-cards { display: flex; flex-direction: column; gap: 10px; }
  .py-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .py-card-head { display: flex; justify-content: space-between; align-items: center; }
  .py-card-date { font-size: 12px; color: var(--muted, #a1a7b3); }
  .py-card-net { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .py-card-meta { font-size: 11px; color: var(--muted, #a1a7b3); }
  .py-card-accts { display: flex; flex-wrap: wrap; gap: 6px; }
}
@media (max-width: 560px) { .py-summary { grid-template-columns: 1fr; } }
@keyframes py-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('py-styles')) {
  const style = document.createElement('style');
  style.id = 'py-styles';
  style.textContent = PY_CSS;
  document.head.appendChild(style);
}
