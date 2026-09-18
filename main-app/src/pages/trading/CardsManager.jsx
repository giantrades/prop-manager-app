// Cartões de crédito (entidade): nome, bandeira, conta, limite, fechamento, vencimento.
// Grava via ds.cards (único writer). Sincroniza (tabela `cards`).
import React, { useCallback, useEffect, useState } from 'react';
import { useFinance } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import { CreditCard, Plus, Pencil, Trash2, X } from 'lucide-react';

export default function CardsManager() {
  const finance = useFinance();
  const { toast } = useToast();
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    if (!finance) return;
    try {
      const [c, a] = await Promise.all([finance.ds.cards.list(), finance.ds.accounts.list()]);
      setCards(c);
      setAccounts(a);
    } catch { /* noop */ }
  }, [finance]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!finance || !form?.name?.trim()) return;
    const id = form.id || `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await finance.ds.cards.put({
      ...form,
      id,
      currency: 'USD',
      creditLimit: Number(form.creditLimit) || 0,
      closingDay: form.closingDay ? Number(form.closingDay) : undefined,
      dueDay: form.dueDay ? Number(form.dueDay) : undefined,
      updatedAt: new Date().toISOString(),
      deviceId: finance.ds.deviceId,
      version: (form.version ?? 0) + 1,
    }, { source: 'local' });
    setForm(null);
    load();
    toast('Cartão salvo.');
  };

  const remove = async (id) => {
    if (!finance) return;
    await finance.ds.cards.remove(id);
    load();
    toast('Cartão removido.');
  };

  return (
    <div className="st-card">
      <div className="st-title"><CreditCard size={15} /> Cartões de crédito</div>
      <p className="st-hint">Entidade com limite, fechamento e vencimento (usada nos lançamentos).</p>

      {cards.map((c) => (
        <div key={c.id} className="cm-row">
          <div className="cm-info">
            <span className="cm-name">{c.name}{c.brand ? ` · ${c.brand}` : ''}</span>
            <span className="cm-sub">limite {c.creditLimit} · fecha dia {c.closingDay ?? '—'} · vence dia {c.dueDay ?? '—'}</span>
          </div>
          <button className="cmd-refresh" onClick={() => setForm({ ...c })} aria-label={`Editar ${c.name}`}><Pencil size={13} /></button>
          <button className="cmd-refresh" onClick={() => remove(c.id)} aria-label={`Excluir ${c.name}`}><Trash2 size={13} /></button>
        </div>
      ))}

      {form ? (
        <div className="cm-form">
          <input className="cm-input" placeholder="Nome (ex.: Nubank)" value={form.name || ''} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <input className="cm-input" placeholder="Bandeira (opcional)" value={form.brand || ''} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} />
          <select className="cm-input" value={form.accountId || ''} onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value || undefined }))} aria-label="Conta">
            <option value="">Conta…</option>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
          <input className="cm-input" type="number" step="0.01" placeholder="Limite" value={form.creditLimit ?? ''} onChange={(e) => setForm((p) => ({ ...p, creditLimit: e.target.value }))} />
          <input className="cm-input" type="number" placeholder="Fecha dia" value={form.closingDay ?? ''} onChange={(e) => setForm((p) => ({ ...p, closingDay: e.target.value }))} />
          <input className="cm-input" type="number" placeholder="Vence dia" value={form.dueDay ?? ''} onChange={(e) => setForm((p) => ({ ...p, dueDay: e.target.value }))} />
          <button className="cmd-refresh" onClick={save} disabled={!form.name?.trim()}>Salvar</button>
          <button className="cmd-refresh" onClick={() => setForm(null)} aria-label="Cancelar"><X size={13} /></button>
        </div>
      ) : (
        <button className="cmd-refresh" onClick={() => setForm({ name: '', currency: 'USD', creditLimit: 0 })}><Plus size={13} /> Novo cartão</button>
      )}
    </div>
  );
}

const CM_CSS = `
.cm-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.cm-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cm-name { font-size: 13px; font-weight: 600; }
.cm-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.cm-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.cm-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: var(--text, #e7eaf0); font-size: 12px; padding: 8px 10px; min-height: 38px; }
@media (max-width: 640px) { .cm-form { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('cm-styles')) {
  const style = document.createElement('style');
  style.id = 'cm-styles';
  style.textContent = CM_CSS;
  document.head.appendChild(style);
}
