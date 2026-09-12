// Gastos/Mobills (engine-driven). Ganhos + despesas com ícones por categoria,
// gráficos (pizza/barras/linha), orçamento mensal, recorrentes, filtros,
// editar/deletar, categorias customizáveis. UI compõe selectors do motor.
// Mobile-first 360px.
//
// Fonte: DOCS/10_MODULES/gastos/00-spec.md (G1–G9).

import { fmtMoney as fmtMoneyShared } from './currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React, { useMemo, useState } from 'react';
import {
  House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp, TrendingDown,
  Briefcase, GraduationCap, Tag, Wallet, Pencil, Trash2, Plus, Coins, Gift,
  Receipt,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  computeFreeCash, expensesByCategory, incomeByKind, monthlySeries,
  budgetStatus, categoryOf, recurringDue, detectRecurringCandidates, compareMonths,
  parseBankFile, buildBankImport, rolloverAmount,
  pendingBills, pendingSummary, merchantRanking,
  DEFAULT_CATEGORIES,
} from '@apps/lib/db';

const ICONS = {
  House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp,
  Briefcase, GraduationCap, Tag, Wallet, Pencil, Trash2, Plus, Receipt, Coins, Gift,
};

const COLORS = {
  blue: 'var(--blue,#3498db)',
  green: 'var(--green,#2ecc71)',
  yellow: 'var(--yellow,#e1b12c)',
  red: 'var(--red,#e74c3c)',
  brand: 'var(--brand,#7c5cff)',
  gray: 'var(--gray,#5b6270)',
};

const INCOME_META = {
  payout_in: { label: 'Payouts', icon: 'Wallet', color: 'green' },
  rebate: { label: 'Rebates', icon: 'Coins', color: 'green' },
  income: { label: 'Outros ganhos', icon: 'Gift', color: 'blue' },
};

const ICON_CHOICES = ['House', 'UtensilsCrossed', 'Car', 'HeartPulse', 'Gamepad2', 'Landmark', 'TrendingUp', 'Briefcase', 'GraduationCap', 'Tag', 'Receipt', 'Coins', 'Gift', 'Wallet'];
const COLOR_CHOICES = ['blue', 'green', 'yellow', 'red', 'brand', 'gray'];

function CatIcon({ name, color, size = 18 }) {
  const Cmp = ICONS[name] || Tag;
  return (
    <span className="ex-ico" style={{ color: COLORS[color] || COLORS.gray, borderColor: COLORS[color] || COLORS.gray }}>
      <Cmp size={size} strokeWidth={2} />
    </span>
  );
}


function ymKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function emptyForm() {
  return {
    type: 'expense', category: 'moradia', accountId: '', amount: '', date: '', note: '',
    recur: false, recurDay: new Date().getDate(), attachments: {},
    // D1/D2/D4
    paid: true, dueDate: '', card: '', installmentCount: '', tags: '',
  };
}

// A2 — limite por anexo (300KB) com compressão client-side para imagens.
const ATTACH_MAX_BYTES = 300 * 1024;

function compressImage(file, maxBytes = ATTACH_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      if (file.size <= maxBytes) {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('leitura'));
        reader.readAsDataURL(file);
        return;
      }
      reject(new Error('arquivo maior que 300KB'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        let quality = 0.8;
        let dataUrl = '';
        for (let i = 0; i < 4; i += 1) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          // base64 ≈ 4/3 do binário
          if (dataUrl.length * 0.75 <= maxBytes) break;
          quality -= 0.2;
        }
        if (dataUrl.length * 0.75 <= maxBytes) resolve(dataUrl);
        else reject(new Error('imagem maior que 300KB mesmo comprimida'));
      } catch {
        URL.revokeObjectURL(url);
        reject(new Error('compressão'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imagem inválida'));
    };
    img.src = url;
  });
}

/**
 * @param {object} props
 * @param {Array<object>} [props.txs] todas as transactions
 * @param {Array<object>} [props.categories]
 * @param {object} [props.budgets] { [ym]: { [catId]: amount } }
 * @param {Array<object>} [props.accounts]
 * @param {(input:object)=>void} [props.onAdd]
 * @param {(id:string,patch:object)=>void} [props.onUpdate]
 * @param {(id:string)=>void} [props.onDelete]
 * @param {(tx:object)=>void} [props.onRestore] — desfazer exclusão
 * @param {(ym:string,catId:string,amount:number)=>void} [props.onSaveBudget]
 * @param {(cat:object)=>void} [props.onSaveCategory]
 * @param {(templateId:string,ym:string)=>void} [props.onGenerate]
 * @param {(id:string,day:number)=>void} [props.onMakeRecurring] — A1: tornar recorrente
 * @param {object} [props.savingsGoal] — A4: { [ym]: amount }
 * @param {(ym:string,amount:number)=>void} [props.onSaveSavingsGoal] — A4
 * @param {(entries:Array<object>)=>void} [props.onImportBatch] — A3: importar extrato
 * @param {Array<string>} [props.rolloverCats] — B1: opt-in de rollover por categoria
 * @param {(catId:string)=>void} [props.onToggleRollover] — B1
 * @param {string} [props.currency]
 * @param {boolean} [props.loading]
 */
export default function Expenses({
  txs = [], categories = [], budgets = {}, accounts = [],
  onAdd, onUpdate, onDelete, onRestore, onSaveBudget, onSaveCategory, onGenerate,
  onMakeRecurring, savingsGoal = {}, onSaveSavingsGoal, onImportBatch,
  rolloverCats = [], onToggleRollover, onAddInstallments, onTransfer,
  currency = 'R$', loading = false,
}) {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [typeFilter, setTypeFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('');
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState('cat');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [showBudget, setShowBudget] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', icon: 'Tag', color: 'gray' });
  const [undo, setUndo] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState({ from: '', to: '', amount: '', date: '', note: '' });

  const cats = categories.length ? categories : DEFAULT_CATEGORIES;
  const catById = useMemo(() => {
    const m = new Map(cats.map((c) => [c.id, c]));
    m.set('outros', { id: 'outros', name: 'Outros', icon: 'Tag', color: 'gray' });
    return m;
  }, [cats]);

  const key = ymKey(ym.year, ym.month);
  const fc = useMemo(() => computeFreeCash(txs, key), [txs, key]);
  const groups = useMemo(() => expensesByCategory(txs, key, cats), [txs, key, cats]);
  const gains = useMemo(() => incomeByKind(txs, key), [txs, key]);
  const series = useMemo(() => monthlySeries(txs, 6, key), [txs, key]);
  const monthBudgets = budgets[key] || {};
  const bStatus = useMemo(() => budgetStatus(txs, monthBudgets, key, cats), [txs, monthBudgets, key, cats]);
  // B1 — rollover da sobra do mês anterior (opt-in por categoria).
  const rollovers = useMemo(() => rolloverAmount(txs, budgets, rolloverCats, key, cats), [txs, budgets, rolloverCats, key, cats]);
  const rolloverByCat = useMemo(() => new Map(rollovers.map((r) => [r.categoryId, r])), [rollovers]);
  const due = useMemo(() => recurringDue(txs, key), [txs, key]);
  // A1 — candidatas a recorrente (mesma categoria+valor em 3+ meses).
  const candidates = useMemo(() => detectRecurringCandidates(txs, cats), [txs, cats]);
  // A4 — comparativo com o mês passado + meta de economia.
  const comparison = useMemo(() => compareMonths(txs, key, cats), [txs, key, cats]);
  const goal = savingsGoal[key] ?? 0;
  const worstRise = useMemo(() => comparison.filter((r) => r.deltaPct != null && r.deltaPct > 0).sort((a, b) => b.deltaPct - a.deltaPct)[0] ?? null, [comparison]);

  const filteredGroups = useMemo(() => {
    let g = groups;
    if (typeFilter === 'income') return [];
    if (catFilter) g = g.filter((x) => x.categoryId === catFilter);
    return g;
  }, [groups, typeFilter, catFilter]);  const monthTxs = useMemo(() => {
    let list = txs.filter((t) => (t.date || '').slice(0, 7) === key);
    if (typeFilter === 'income') list = list.filter((t) => ['payout_in', 'rebate', 'income'].includes(t.kind));
    if (typeFilter === 'expense') list = list.filter((t) => t.kind === 'expense');
    if (catFilter) list = list.filter((t) => (categoryOf(t, cats) ?? 'outros') === catFilter);
    const ql = q.trim().toLowerCase();
    if (ql) {
      list = list.filter((t) =>
        (t.note ?? '').toLowerCase().includes(ql)
        || (catById.get(categoryOf(t, cats) ?? 'outros')?.name ?? '').toLowerCase().includes(ql),
      );
    }
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [txs, key, typeFilter, catFilter, cats, q, catById]);

  // Progresso de orçamento consolidado (topo da página).
  const budgetTotals = useMemo(() => {
    const budget = bStatus.reduce((s, b) => s + (b.budget || 0), 0);
    const spent = bStatus.reduce((s, b) => s + (b.spent || 0), 0);
    return { budget, spent, pct: budget > 0 ? Math.round((spent / budget) * 100) : 0, over: budget > 0 && spent > budget };
  }, [bStatus]);

  // Com busca ativa, esconde grupos sem lançamento correspondente.
  const listGroups = useMemo(() => {
    if (!q.trim()) return filteredGroups;
    return filteredGroups.filter((g) => monthTxs.some((t) => t.kind === 'expense' && (categoryOf(t, cats) ?? 'outros') === g.categoryId));
  }, [filteredGroups, monthTxs, q, cats]);
  const listGains = useMemo(() => {
    if (!q.trim()) return gains;
    return gains.filter((g) => monthTxs.some((t) => t.kind === g.kind));
  }, [gains, monthTxs, q]);

  // D1 — contas a pagar/receber (títulos pendentes, qualquer mês; atraso em destaque).
  const bills = useMemo(() => pendingBills(txs), [txs]);
  const billSummary = useMemo(() => pendingSummary(txs), [txs]);
  // D2 — fatura por cartão no mês (despesas pagas + pendentes do cartão).
  const cardTotals = useMemo(() => {
    const acc = new Map();
    for (const t of txs) {
      if (t.kind !== 'expense' || !t.card) continue;
      if (t.date.slice(0, 7) !== key) continue;
      acc.set(t.card, (acc.get(t.card) ?? 0) + Math.abs(t.amount));
    }
    return [...acc.entries()].map(([card, total]) => ({ card, total })).sort((a, b) => b.total - a.total);
  }, [txs, key]);
  // D4 — onde mais gastei (estabelecimento derivado da nota).
  const merchants = useMemo(() => merchantRanking(txs, key, 6), [txs, key]);
  // D3 — lançamentos agrupados por dia (extrato).
  const dayGroups = useMemo(() => {
    const acc = new Map();
    for (const t of monthTxs) {
      const day = (t.date || '').slice(0, 10);
      const cur = acc.get(day) ?? { day, items: [], total: 0 };
      cur.items.push(t);
      if (t.kind === 'expense') cur.total -= Math.abs(t.amount);
      else if (['payout_in', 'rebate', 'income', 'dividend'].includes(t.kind)) cur.total += t.amount;
      acc.set(day, cur);
    }
    return [...acc.values()].sort((a, b) => b.day.localeCompare(a.day));
  }, [monthTxs]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const startAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm(), accountId: accounts[0]?.id ?? '' });
    setShowForm(true);
  };

  const [attachError, setAttachError] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [goalInput, setGoalInput] = useState('');

  const startEdit = (t) => {
    const isExp = t.kind === 'expense';
    setEditingId(t.id);
    setForm({
      type: isExp ? 'expense' : 'income',
      category: categoryOf(t, cats) ?? 'moradia',
      accountId: t.accountId ?? '',
      amount: String(Math.abs(t.amount ?? 0)),
      date: (t.date || '').slice(0, 16),
      note: isExp && t.note ? t.note : (t.note ?? ''),
      recur: false,
      recurDay: new Date().getDate(),
      attachments: { ...(t.attachments ?? {}) },
      paid: t.paid !== false,
      dueDate: (t.dueDate || '').slice(0, 16),
      card: t.card ?? '',
      installmentCount: '',
      tags: (t.tags ?? []).join(', '),
    });
    setAttachError(null);
    setShowForm(true);
  };

  const handleSave = () => {
    const amt = Number(form.amount);
    if (!amt || amt <= 0 || !form.accountId) return;
    const attachments = form.attachments && Object.keys(form.attachments).length > 0 ? form.attachments : undefined;
    const tags = form.tags.split(',').map((s) => s.trim()).filter(Boolean);
    const base = {
      accountId: form.accountId,
      amount: amt,
      date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
      note: form.note.trim() || undefined,
      attachments,
      paid: form.paid,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      card: form.card.trim() || undefined,
      tags: tags.length ? tags : undefined,
    };
    if (editingId) {
      const patch = form.type === 'expense'
        ? { amount: -amt, category: form.category, ...base }
        : { amount: amt, ...base };
      onUpdate?.(editingId, patch);
    } else if (form.type === 'expense') {
      const parts = Number(form.installmentCount);
      if (parts >= 2 && onAddInstallments) {
        // D2 — parcelamento: N parcelas mensais (contas a pagar).
        onAddInstallments({
          accountId: form.accountId, currency: 'BRL', totalAmount: amt, count: parts,
          category: form.category, card: base.card, note: base.note,
          firstDate: base.dueDate ?? base.date,
        });
      } else {
        onAdd?.({
          kind: 'expense', ...base, amount: amt, category: form.category,
          recurrence: form.recur ? { freq: 'monthly', day: Math.min(28, Math.max(1, Number(form.recurDay) || 1)) } : undefined,
        });
      }
    } else {
      onAdd?.({ kind: 'income', ...base, amount: amt });
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  // D5 — transferência entre carteiras (dupla entrada).
  const handleTransfer = () => {
    const amt = Number(transfer.amount);
    if (!(amt > 0) || !transfer.from || !transfer.to || transfer.from === transfer.to) return;
    onTransfer?.({
      fromAccountId: transfer.from, toAccountId: transfer.to, amount: amt, currency: 'BRL',
      date: transfer.date ? new Date(transfer.date).toISOString() : undefined,
      note: transfer.note.trim() || undefined,
    });
    setTransfer({ from: '', to: '', amount: '', date: '', note: '' });
    setShowTransfer(false);
  };

  // A2 — anexa arquivo ao form (comprime imagem; erro visível, nunca alert()).
  const handleAttach = async (file) => {
    if (!file) return;
    setAttachError(null);
    try {
      const dataUrl = await compressImage(file);
      setForm((f) => ({ ...f, attachments: { ...(f.attachments ?? {}), [file.name]: { name: file.name, dataUrl } } }));
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : 'anexo inválido');
    }
  };

  const removeAttach = (name) => {
    setForm((f) => {
      const next = { ...(f.attachments ?? {}) };
      delete next[name];
      return { ...f, attachments: next };
    });
  };

  const handleDelete = (t) => {
    setUndo({ tx: t });
    onDelete?.(t.id);
    setTimeout(() => setUndo((u) => (u && u.tx.id === t.id ? null : u)), 8000);
  };

  // A3 — importa extrato (OFX/CSV): parse + preview com categoria editável + dedup.
  const importFileRef = React.useRef(null);
  const [importError, setImportError] = useState(null);
  const handleImportFile = async (file) => {
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const entries = parseBankFile(text);
      const existing = txs.map((t) => ({ date: t.date, amount: t.amount, note: t.note ?? '' }));
      const { result, kinds } = buildBankImport(entries, existing);
      setImportPreview({
        entries: result.entries.map((en) => ({
          ...en,
          categoryId: en.amount < 0 ? (en.suggestedCategory ?? null) : null,
          kind: kinds.get(en.key),
        })),
        skipped: result.skippedDupes,
        errors: result.errors,
      });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'arquivo inválido');
    }
  };

  if (loading) {
    return (
      <div className="ex-root ex-loading" role="status" aria-live="polite">
        <div className="ex-skeleton" />
        <div className="ex-skeleton" />
        <span className="ex-screen-reader">Carregando finanças…</span>
      </div>
    );
  }

  const pieData = groups.map((g) => ({ name: catById.get(g.categoryId)?.name ?? g.categoryId, value: g.total, color: catById.get(g.categoryId)?.color ?? 'gray' }));
  const barData = series.map((s) => ({
    ym: s.ym.slice(5, 7) + '/' + s.ym.slice(2, 4),
    Receitas: s.income,
    Despesas: s.expenses,
    Saldo: s.balance,
  }));

  return (
    <div className="ex-root">
      {/* Resumo do mês */}
      <div className="ex-hero">
        <div className="ex-summary">
          <div className="ex-sum-card ex-sum-in">
            <span className="ex-sum-ico"><TrendingUp size={16} /></span>
            <span className="ex-sum-label">Receitas</span>
            <span className="ex-sum-value">{fmtMoney(fc.income, currency)}</span>
            <span className="ex-sum-sub">{gains.reduce((s, g) => s + g.count, 0)} lançamento(s)</span>
          </div>
          <div className="ex-sum-card ex-sum-out">
            <span className="ex-sum-ico"><TrendingDown size={16} /></span>
            <span className="ex-sum-label">Despesas</span>
            <span className="ex-sum-value">{fmtMoney(fc.expenses, currency)}</span>
            <span className="ex-sum-sub">{groups.reduce((s, g) => s + g.count, 0)} despesa(s)</span>
          </div>
          <div className={`ex-sum-card ${fc.freeCash >= 0 ? 'ex-sum-in' : 'ex-sum-out'}`}>
            <span className="ex-sum-ico"><Wallet size={16} /></span>
            <span className="ex-sum-label">Saldo do mês</span>
            <span className="ex-sum-value">{fmtMoney(fc.freeCash, currency)}</span>
            <span className="ex-sum-sub">entrou − gastou</span>
          </div>
        </div>
        {budgetTotals.budget > 0 && (
          <div className={`ex-budget-total${budgetTotals.over ? ' over' : ''}`}>
            <div className="ex-budget-total-top">
              <span>Orçamento do mês</span>
              <span>{fmtMoney(budgetTotals.spent, currency)} / {fmtMoney(budgetTotals.budget, currency)} · {budgetTotals.pct}%</span>
            </div>
            <div className="ex-bar-wrap"><span className="ex-bar" style={{ width: `${Math.min(100, budgetTotals.pct)}%` }} /></div>
          </div>
        )}
      </div>

      {/* Filtros + ações */}
      <div className="ex-toolbar">
        <div className="ex-monthnav">
          <button className="ex-btn ex-btn-ghost ex-btn-sm" aria-label="Mês anterior" onClick={() => setYm((s) => shiftMonth(s.year, s.month, -1))}>‹</button>
          <span className="ex-month">{MONTHS_PT[ym.month - 1]}/{ym.year}</span>
          <button className="ex-btn ex-btn-ghost ex-btn-sm" aria-label="Próximo mês" onClick={() => setYm((s) => shiftMonth(s.year, s.month, 1))}>›</button>
        </div>
        <div className="ex-typefilter" role="group" aria-label="Tipo">
          {[['all', 'Tudo'], ['income', 'Ganhos'], ['expense', 'Gastos']].map(([v, l]) => (
            <button key={v} className={`ex-chip${typeFilter === v ? ' active' : ''}`} onClick={() => setTypeFilter(v)}>{l}</button>
          ))}
        </div>
        <span className="ex-toolbar-spacer" />
        <input
          className="ex-input ex-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar lançamento…"
          aria-label="Buscar lançamento por nota ou categoria"
        />
        <button className="ex-btn ex-btn-primary" onClick={startAdd}><Plus size={16} /> Novo</button>
      </div>
      <div className="ex-toolbar ex-toolbar-2">
        <select className="ex-input ex-catfilter" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className={`ex-btn ex-btn-ghost${showBudget ? ' ex-btn-on' : ''}`} aria-pressed={showBudget} onClick={() => setShowBudget((s) => !s)}>Orçamento</button>
        <button className={`ex-btn ex-btn-ghost${showCats ? ' ex-btn-on' : ''}`} aria-pressed={showCats} onClick={() => setShowCats((s) => !s)}>Categorias</button>
        <button className="ex-btn ex-btn-ghost" onClick={() => setShowTransfer(true)}>Transferir</button>
        <button className="ex-btn ex-btn-ghost" onClick={() => importFileRef.current?.click()}>Importar extrato</button>
      </div>

      {/* D1 — Contas a pagar / a receber */}
      {bills.length > 0 && (
        <div className="ex-bills" role="region" aria-label="Contas a pagar e a receber">
          <div className="ex-bills-head">
            <span className="ex-section-title">Contas a pagar / receber</span>
            <span className="ex-bills-sum">
              {billSummary.payable > 0 && <span className="ex-neg-t">a pagar {fmtMoney(billSummary.payable, currency)}</span>}
              {billSummary.receivable > 0 && <span className="ex-pos-t">a receber {fmtMoney(billSummary.receivable, currency)}</span>}
              {billSummary.overdue > 0 && <span className="ex-badge-late">{billSummary.overdue} atrasada(s)</span>}
            </span>
          </div>
          {bills.slice(0, 8).map((b) => {
            const cat = catById.get(categoryOf(b.tx, cats) ?? 'outros');
            const isIncome = b.tx.kind !== 'expense';
            return (
              <div key={b.tx.id} className={`ex-bill${b.overdue ? ' late' : ''}`}>
                <CatIcon name={isIncome ? 'Gift' : (cat?.icon ?? 'Tag')} color={isIncome ? 'green' : (cat?.color ?? 'gray')} size={16} />
                <div className="ex-bill-main">
                  <span className="ex-bill-name">{b.tx.note || cat?.name || 'Lançamento'}</span>
                  <span className="ex-bill-due">vence {b.dueDate || b.tx.date.slice(0, 10)}{b.overdue ? ' · atrasado' : ''}</span>
                </div>
                <span className={`ex-bill-amount ${isIncome ? 'ex-pos-t' : 'ex-neg-t'}`}>{fmtMoney(Math.abs(b.tx.amount), currency)}</span>
                <button className="ex-btn ex-btn-sm ex-btn-primary" onClick={() => onUpdate?.(b.tx.id, { paid: true })}>{isIncome ? 'Receber' : 'Pagar'}</button>
              </div>
            );
          })}
        </div>
      )}
      <input
        ref={importFileRef} type="file" accept=".ofx,.csv,.txt,.qif" style={{ display: 'none' }}
        onChange={(e) => { handleImportFile(e.target.files?.[0]); e.target.value = ''; }} aria-label="Importar extrato OFX ou CSV"
      />
      {importError && <div className="ex-hint" role="alert">⚠️ {importError}</div>}
      {importPreview && (
        <div className="ex-section" role="dialog" aria-label="Prévia da importação">
          <div className="ex-section-title">
            Prévia — {importPreview.entries.length} lançamentos
            {importPreview.skipped > 0 && ` (${importPreview.skipped} duplicatas puladas)`}
          </div>
          {importPreview.errors.length > 0 && (
            <div className="ex-hint" role="alert">{importPreview.errors.slice(0, 3).join(' · ')}</div>
          )}
          <div className="ex-import-list">
            {importPreview.entries.slice(0, 30).map((en) => (
              <div key={en.key} className="ex-import-row">
                <span className="ex-import-date">{en.date.slice(0, 10)}</span>
                <span className="ex-import-desc" title={en.description}>{en.description.slice(0, 28)}</span>
                <span className={`ex-import-amt ${en.amount >= 0 ? 'ex-pos-t' : 'ex-neg-t'}`}>{fmtMoney(en.amount, currency)}</span>
                <select
                  className="ex-input ex-import-cat" value={en.categoryId ?? ''}
                  onChange={(e) => setImportPreview((p) => ({
                    ...p,
                    entries: p.entries.map((x) => (x.key === en.key ? { ...x, categoryId: e.target.value || null } : x)),
                  }))}
                  aria-label={`Categoria de ${en.description.slice(0, 20)}`}
                >
                  <option value="">Auto</option>
                  {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
            ))}
          </div>
          {importPreview.entries.length > 30 && (
            <div className="ex-hint">Mostrando 30 de {importPreview.entries.length} — todos serão importados.</div>
          )}
          <div className="ex-form-row">
            <button
              className="ex-btn"
              disabled={importPreview.entries.length === 0}
              onClick={() => {
                onImportBatch?.(importPreview.entries.map((en) => ({
                  date: en.date,
                  amount: en.amount,
                  description: en.description,
                  kind: en.amount >= 0 ? 'income' : 'expense',
                  categoryId: en.categoryId ?? en.suggestedCategory ?? null,
                })));
                setImportPreview(null);
              }}
            >
              Confirmar importação ({importPreview.entries.length})
            </button>
            <button className="ex-btn ex-btn-ghost" onClick={() => setImportPreview(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {undo && (
        <div className="ex-undo" role="status">
          Transação excluída.
          <button className="ex-btn ex-btn-sm" onClick={() => { onRestore?.(undo.tx); setUndo(null); }}>Desfazer</button>
        </div>
      )}

      {/* Recorrentes pendentes */}
      {due.length > 0 && (
        <div className="ex-recur" role="note">
          <span className="ex-recur-title">{due.length} recorrente(s) pendente(s) em {MONTHS_PT[ym.month - 1]}</span>
          {due.map((t) => (
            <div key={t.id} className="ex-recur-row">
              <span>{catById.get(categoryOf(t, cats) ?? 'outros')?.name} • {fmtMoney(Math.abs(t.amount), currency)}</span>
              <button className="ex-btn ex-btn-sm" onClick={() => onGenerate?.(t.id, key)}>Gerar</button>
            </div>
          ))}
        </div>
      )}

      {/* A1 — candidatas a recorrente (mesma categoria+valor em 3+ meses) */}
      {candidates.length > 0 && (
        <div className="ex-section">
          <div className="ex-section-title">Pode ser recorrente?</div>
          {candidates.map((c) => (
            <div key={`${c.categoryId}-${c.amount}`} className="ex-recur-row">
              <span>{catById.get(c.categoryId)?.name ?? c.categoryId} • {fmtMoney(c.amount, currency)} • {c.count} meses</span>
              <button className="ex-btn ex-btn-sm" onClick={() => onMakeRecurring?.(c.sampleId, c.day)}>Tornar recorrente</button>
            </div>
          ))}
        </div>
      )}

      {/* Form add/edit — bottom sheet */}
      {showForm && (
        <div className="ex-overlay" onClick={() => { setShowForm(false); setEditingId(null); }}>
          <div className="ex-sheet" role="dialog" aria-modal="true" aria-label={editingId ? 'Editar lançamento' : 'Novo lançamento'} onClick={(e) => e.stopPropagation()}>
          <div className="ex-sheet-head">
            <span className="ex-sheet-title"><Receipt size={16} /> {editingId ? 'Editar lançamento' : 'Novo lançamento'}</span>
            <button className="ex-mini" onClick={() => { setShowForm(false); setEditingId(null); }} aria-label="Fechar">✕</button>
          </div>
          <div className="ex-form">
          <div className="ex-typefilter" role="group" aria-label="Tipo de lançamento">
            {[['expense', 'Gasto'], ['income', 'Ganho']].map(([v, l]) => (
              <button key={v} className={`ex-chip${form.type === v ? ' active' : ''}`} onClick={() => setF('type', v)}>{l}</button>
            ))}
          </div>
          <div className="ex-form-row">
            {form.type === 'expense' ? (
              <label className="ex-field"><span>Categoria</span>
                <select className="ex-input" value={form.category} onChange={(e) => setF('category', e.target.value)} aria-label="Categoria">
                  {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </label>
            ) : (
              <label className="ex-field"><span>Tipo de ganho</span>
                <select className="ex-input" value="income" disabled aria-label="Tipo de ganho">
                  <option value="income">Ganho (salário/outros)</option>
                </select>
              </label>
            )}
            <label className="ex-field"><span>Conta</span>
              <select className="ex-input" value={form.accountId} onChange={(e) => setF('accountId', e.target.value)} aria-label="Conta">
                <option value="">—</option>
                {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
              </select>
            </label>
          </div>
          <div className="ex-form-row">
            <label className="ex-field"><span>Valor</span>
              <input className="ex-input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setF('amount', e.target.value)} placeholder="0.00" aria-label="Valor" />
            </label>
            <label className="ex-field"><span>Data</span>
              <input className="ex-input" type="datetime-local" value={form.date} onChange={(e) => setF('date', e.target.value)} aria-label="Data" />
            </label>
          </div>
          <label className="ex-field"><span>Nota</span>
            <input className="ex-input" type="text" value={form.note} onChange={(e) => setF('note', e.target.value)} placeholder="Ex.: aluguel" aria-label="Nota" />
          </label>
          <div className="ex-form-row">
            <label className="ex-field"><span>Estabelecimento / tags</span>
              <input className="ex-input" type="text" value={form.tags} onChange={(e) => setF('tags', e.target.value)} placeholder="viagem, trabalho (separe por vírgula)" aria-label="Tags" />
            </label>
            <label className="ex-field"><span>Cartão (fatura)</span>
              <input className="ex-input" type="text" value={form.card} onChange={(e) => setF('card', e.target.value)} placeholder="Ex.: Nubank" aria-label="Cartão" />
            </label>
          </div>
          <label className="ex-check">
            <input type="checkbox" checked={form.paid} onChange={(e) => setF('paid', e.target.checked)} />
            {form.type === 'expense' ? 'Já pago' : 'Já recebido'}
          </label>
          {!form.paid && (
            <label className="ex-field"><span>Vencimento</span>
              <input className="ex-input" type="date" value={form.dueDate} onChange={(e) => setF('dueDate', e.target.value)} aria-label="Vencimento" />
            </label>
          )}
          {form.type === 'expense' && !editingId && (
            <label className="ex-field"><span>Parcelar em (2–48x)</span>
              <input
                className="ex-input" type="number" min="2" max="48" value={form.installmentCount}
                onChange={(e) => setF('installmentCount', e.target.value)}
                placeholder="À vista" aria-label="Número de parcelas"
              />
            </label>
          )}
          <label className="ex-field"><span>Anexos (foto/recibo, máx 300KB)</span>
            <input className="ex-input" type="file" accept="image/*,.pdf" onChange={(e) => { handleAttach(e.target.files?.[0]); e.target.value = ''; }} aria-label="Anexar comprovante" />
          </label>
          {attachError && <div className="ex-hint" role="alert">⚠️ {attachError}</div>}
          {Object.keys(form.attachments ?? {}).length > 0 && (
            <div className="ex-attach-list">
              {Object.keys(form.attachments).map((name) => {
                const dataUrl = form.attachments[name]?.dataUrl;
                const isImg = typeof dataUrl === 'string' && dataUrl.startsWith('data:image');
                return (
                  <div key={name} className="ex-attach-item">
                    {isImg ? <img className="ex-thumb" src={dataUrl} alt={name} /> : <span className="ex-attach-name">{name}</span>}
                    <button className="ex-btn ex-btn-sm ex-btn-ghost" onClick={() => removeAttach(name)} aria-label={`Remover ${name}`}>x</button>
                  </div>
                );
              })}
            </div>
          )}
          {form.type === 'expense' && !editingId && (
            <label className="ex-check"><input type="checkbox" checked={form.recur} onChange={(e) => setF('recur', e.target.checked)} /> Repetir todo mês (dia
              <input className="ex-input ex-day" type="number" min={1} max={28} value={form.recurDay} onChange={(e) => setF('recurDay', e.target.value)} aria-label="Dia da recorrência" />)
            </label>
          )}
          <div className="ex-form-row">
            <button className="ex-btn ex-btn-primary" onClick={handleSave} disabled={!form.amount || !form.accountId}>{editingId ? 'Salvar' : 'Adicionar'}</button>
            <button className="ex-btn ex-btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancelar</button>
          </div>
          {accounts.length === 0 && <div className="ex-hint">Crie uma conta (Wallets) para lançar.</div>}
          </div>
          </div>
        </div>
      )}

      {/* D5 — Transferência entre carteiras */}
      {showTransfer && (
        <div className="ex-overlay" onClick={() => setShowTransfer(false)}>
          <div className="ex-sheet" role="dialog" aria-modal="true" aria-label="Transferir entre carteiras" onClick={(e) => e.stopPropagation()}>
            <div className="ex-sheet-head">
              <span className="ex-sheet-title">Transferir</span>
              <button className="ex-mini" onClick={() => setShowTransfer(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="ex-form">
              <div className="ex-form-row">
                <label className="ex-field"><span>De</span>
                  <select className="ex-input" value={transfer.from} onChange={(e) => setTransfer((t) => ({ ...t, from: e.target.value }))} aria-label="Conta de origem">
                    <option value="">—</option>
                    {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                  </select>
                </label>
                <label className="ex-field"><span>Para</span>
                  <select className="ex-input" value={transfer.to} onChange={(e) => setTransfer((t) => ({ ...t, to: e.target.value }))} aria-label="Conta de destino">
                    <option value="">—</option>
                    {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                  </select>
                </label>
              </div>
              <div className="ex-form-row">
                <label className="ex-field"><span>Valor</span>
                  <input className="ex-input" type="number" min="0" step="0.01" value={transfer.amount} onChange={(e) => setTransfer((t) => ({ ...t, amount: e.target.value }))} placeholder="0.00" aria-label="Valor da transferência" />
                </label>
                <label className="ex-field"><span>Data</span>
                  <input className="ex-input" type="date" value={transfer.date} onChange={(e) => setTransfer((t) => ({ ...t, date: e.target.value }))} aria-label="Data da transferência" />
                </label>
              </div>
              <label className="ex-field"><span>Nota</span>
                <input className="ex-input" type="text" value={transfer.note} onChange={(e) => setTransfer((t) => ({ ...t, note: e.target.value }))} placeholder="Ex.: reserva" aria-label="Nota da transferência" />
              </label>
              {transfer.from && transfer.to && transfer.from === transfer.to && <div className="ex-hint" role="alert">Origem e destino iguais.</div>}
              <div className="ex-form-row">
                <button className="ex-btn ex-btn-primary" onClick={handleTransfer} disabled={!(Number(transfer.amount) > 0) || !transfer.from || !transfer.to || transfer.from === transfer.to}>Transferir</button>
                <button className="ex-btn ex-btn-ghost" onClick={() => setShowTransfer(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Orçamento */}
      {showBudget && (
        <div className="ex-section">
          <div className="ex-section-title">Orçamento — {MONTHS_PT[ym.month - 1]}/{ym.year}</div>
          {bStatus.length === 0 && <div className="ex-hint">Sem metas. Defina abaixo por categoria.</div>}
          {bStatus.map((b) => {
            const cat = catById.get(b.categoryId) ?? { name: b.categoryId, icon: 'Tag', color: 'gray' };
            const ro = rolloverByCat.get(b.categoryId);
            const opted = rolloverCats.includes(b.categoryId);
            return (
              <div key={b.categoryId} className={`ex-budget${b.over ? ' over' : ''}`}>
                <CatIcon name={cat.icon} color={cat.color} size={16} />
                <div className="ex-budget-main">
                  <div className="ex-budget-top"><span>{cat.name}</span><span>{fmtMoney(b.spent, currency)} / {fmtMoney(b.budget, currency)}</span></div>
                  <div className="ex-bar-wrap"><span className="ex-bar" style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
                  {opted && ro && ro.rollover > 0 && (
                    <div className="ex-hint">+{fmtMoney(ro.rollover, currency)} de sobra do mês passado → efetivo {fmtMoney(ro.effective, currency)}</div>
                  )}
                </div>
                <span className="ex-budget-pct">{b.pct}%{b.over ? ' ⚠️' : ''}</span>
                <button
                  className={`ex-mini${opted ? ' ex-mini-on' : ''}`}
                  onClick={() => onToggleRollover?.(b.categoryId)}
                  title={opted ? 'Desativar rollover' : 'Ativar rollover da sobra'}
                  aria-pressed={opted}
                  aria-label={`Rollover de ${cat.name}`}
                >↻</button>
              </div>
            );
          })}
          <BudgetEditor cats={cats} budgets={monthBudgets} onSave={(catId, amount) => onSaveBudget?.(key, catId, amount)} currency={currency} />
        </div>
      )}

      {/* Categorias */}
      {showCats && (
        <div className="ex-section">
          <div className="ex-section-title">Categorias</div>
          <div className="ex-catlist">
            {cats.map((c) => (
              <span key={c.id} className="ex-catpill"><CatIcon name={c.icon} color={c.color} size={15} />{c.name}</span>
            ))}
          </div>
          <CategoryEditor onSave={(cat) => onSaveCategory?.(cat)} />
        </div>
      )}

      {/* Gráficos */}
      {typeFilter !== 'income' && pieData.length > 0 && (
        <div className="ex-section">
          <div className="ex-section-title">Distribuição por categoria</div>
          <div className="ex-pie">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {pieData.map((p) => (
                    <Cell key={p.name} fill={`var(--${p.color},#5b6270)`} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} formatter={(v) => fmtMoney(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a1a7b3' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="ex-section">
        <div className="ex-section-title">Últimos 6 meses</div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
              <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={52} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
              <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} formatter={(v) => fmtMoney(v, currency)} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#a1a7b3' }} />
              <Bar dataKey="Receitas" fill="var(--green,#2ecc71)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesas" fill="var(--red,#e74c3c)" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="Saldo" stroke="var(--brand,#7c5cff)" strokeWidth={2} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* D4 — onde mais gastei (estabelecimento) */}
      {typeFilter !== 'income' && merchants.length > 0 && (
        <div className="ex-section">
          <div className="ex-section-title">Onde mais gastei</div>
          <div className="ex-compare">
            {merchants.map((m) => (
              <div key={m.name} className="ex-compare-row">
                <span className="ex-compare-name">{m.name}</span>
                <span className="ex-compare-vals">{m.count}x</span>
                <span className="ex-compare-delta ex-neg-t">{fmtMoney(m.total, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* D2 — fatura por cartão */}
      {cardTotals.length > 0 && (
        <div className="ex-section">
          <div className="ex-section-title">Fatura por cartão (mês)</div>
          <div className="ex-compare">
            {cardTotals.map((c) => (
              <div key={c.card} className="ex-compare-row">
                <span className="ex-compare-name">{c.card}</span>
                <span className="ex-compare-vals">no mês</span>
                <span className="ex-compare-delta ex-neg-t">{fmtMoney(c.total, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* A4 — comparativo com o mês passado + meta de economia */}
      {typeFilter !== 'income' && (
        <div className="ex-section">
          <div className="ex-section-title">Vs mês passado</div>
          {worstRise && (
            <div className="ex-insight" role="note">
              {catById.get(worstRise.categoryId)?.name ?? worstRise.categoryId} {worstRise.deltaPct >= 0 ? '▲' : '▼'} {worstRise.deltaPct >= 0 ? '+' : ''}{worstRise.deltaPct}% vs mês passado
            </div>
          )}
          {comparison.length === 0 ? (
            <div className="ex-hint">Sem despesas para comparar.</div>
          ) : (
            <div className="ex-compare">
              {comparison.slice(0, 6).map((r) => {
                const cat = catById.get(r.categoryId) ?? { name: r.categoryId, icon: 'Tag', color: 'gray' };
                return (
                  <div key={r.categoryId} className="ex-compare-row">
                    <CatIcon name={cat.icon} color={cat.color} size={15} />
                    <span className="ex-compare-name">{cat.name}</span>
                    <span className="ex-compare-vals">{fmtMoney(r.cur, currency)}</span>
                    <span className={`ex-compare-delta ${r.deltaPct == null ? '' : r.deltaPct > 0 ? 'ex-neg-t' : 'ex-pos-t'}`}>
                      {r.deltaPct == null ? '—' : `${r.deltaPct >= 0 ? '+' : ''}${r.deltaPct}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="ex-goal">
            <span className="ex-goal-label">Meta de gasto do mês</span>
            <div className="ex-form-inline">
              <input
                className="ex-input" type="number" min="0" step="0.01"
                value={goalInput} onChange={(e) => setGoalInput(e.target.value)}
                placeholder={goal > 0 ? `Atual ${goal}` : 'Ex.: 8000'} aria-label="Meta de gasto do mês"
              />
              <button className="ex-btn ex-btn-sm" onClick={() => { if (Number(goalInput) >= 0) { onSaveSavingsGoal?.(key, Number(goalInput)); setGoalInput(''); } }}>Salvar meta</button>
            </div>
            {goal > 0 && (
              <div className="ex-budget-main" style={{ marginTop: 8 }}>
                <div className="ex-budget-top"><span>Gasto {fmtMoney(fc.expenses, currency)} / meta {fmtMoney(goal, currency)}</span></div>
                <div className="ex-bar-wrap"><span className="ex-bar" style={{ width: `${Math.min(100, (fc.expenses / goal) * 100)}%` }} /></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ganhos */}
      {typeFilter !== 'expense' && (
        <div className="ex-section">
          <div className="ex-section-title">Ganhos</div>
          {gains.length === 0 ? (
            <div className="ex-empty" role="status">Nenhum ganho neste mês.</div>
          ) : listGains.map((g) => {
            const meta = INCOME_META[g.kind] ?? { label: g.kind, icon: 'Gift', color: 'blue' };
            const items = monthTxs.filter((t) => t.kind === g.kind);
            return (
              <div key={g.kind} className="ex-group">
                <div className="ex-group-head">
                  <CatIcon name={meta.icon} color={meta.color} />
                  <span className="ex-group-name">{meta.label}</span>
                  <span className="ex-group-sub">{g.count}</span>
                  <span className="ex-group-total ex-pos-t">{fmtMoney(g.total, currency)}</span>
                </div>
                {items.map((t) => (
                  <TxRow key={t.id} t={t} currency={currency} label={meta.label} icon={meta.icon} color={meta.color} accountName={accounts.find((a) => a.id === t.accountId)?.name} onEdit={() => startEdit(t)} onDelete={() => handleDelete(t)} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Gastos agrupados */}
      {typeFilter !== 'income' && (
        <div className="ex-section">
          <div className="ex-section-head">
            <span className="ex-section-title">Lançamentos do mês</span>
            <span className="ex-typefilter" role="group" aria-label="Agrupar lançamentos">
              <button className={`ex-chip${groupBy === 'cat' ? ' active' : ''}`} onClick={() => setGroupBy('cat')}>Categoria</button>
              <button className={`ex-chip${groupBy === 'day' ? ' active' : ''}`} onClick={() => setGroupBy('day')}>Dia</button>
            </span>
          </div>
          {groupBy === 'day' ? (
            dayGroups.length === 0 ? (
              <div className="ex-empty" role="status">{q.trim() ? 'Nenhum lançamento encontrado.' : 'Nenhuma despesa neste mês.'}</div>
            ) : dayGroups.map((d) => (
              <div key={d.day} className="ex-group">
                <div className="ex-group-head">
                  <span className="ex-group-name">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</span>
                  <span className="ex-group-sub">{d.items.length} lançamento(s)</span>
                  <span className={`ex-group-total ${d.total >= 0 ? 'ex-pos-t' : 'ex-neg-t'}`}>{fmtMoney(d.total, currency)}</span>
                </div>
                {d.items.map((t) => {
                  const c = catById.get(categoryOf(t, cats) ?? 'outros') ?? { name: 'Lançamento', icon: 'Tag', color: 'gray' };
                  return (
                    <TxRow key={t.id} t={t} currency={currency} label={t.note || c.name} icon={c.icon} color={c.color} accountName={accounts.find((a) => a.id === t.accountId)?.name} onEdit={() => startEdit(t)} onDelete={() => handleDelete(t)} onPay={() => onUpdate?.(t.id, { paid: true })} />
                  );
                })}
              </div>
            ))
          ) : listGroups.length === 0 ? (
            <div className="ex-empty" role="status">{q.trim() ? 'Nenhum lançamento encontrado.' : 'Nenhuma despesa neste mês.'}</div>
          ) : listGroups.map((g) => {
            const cat = catById.get(g.categoryId) ?? { name: g.categoryId, icon: 'Tag', color: 'gray' };
            const items = monthTxs.filter((t) => t.kind === 'expense' && (categoryOf(t, cats) ?? 'outros') === g.categoryId);
            return (
              <div key={g.categoryId} className="ex-group">
                <div className="ex-group-head">
                  <CatIcon name={cat.icon} color={cat.color} />
                  <span className="ex-group-name">{cat.name}</span>
                  <span className="ex-group-sub">{g.count}</span>
                  <span className="ex-group-total ex-neg-t">{fmtMoney(g.total, currency)}</span>
                </div>
                {items.map((t) => (
                  <TxRow key={t.id} t={t} currency={currency} label={t.note || cat.name} icon={cat.icon} color={cat.color} accountName={accounts.find((a) => a.id === t.accountId)?.name} onEdit={() => startEdit(t)} onDelete={() => handleDelete(t)} onPay={() => onUpdate?.(t.id, { paid: true })} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TxRow({ t, currency, label, icon = 'Tag', color = 'gray', accountName, onEdit = null, onDelete = null, onPay = null }) {
  const files = Object.keys(t.attachments ?? {});
  const pending = t.paid === false;
  return (
    <div className="ex-item">
      <span className="ex-item-ico" style={{ color: COLORS[color] || COLORS.gray, borderColor: COLORS[color] || COLORS.gray }}>
        {(() => { const Cmp = ICONS[icon] || Tag; return <Cmp size={16} strokeWidth={2} />; })()}
      </span>
      <div className="ex-item-main">
        <div className="ex-item-cat">
          {label}
          {t.installments && <span className="ex-badge">{t.installments.n}/{t.installments.of}</span>}
          {t.card && <span className="ex-badge ex-badge-card">{t.card}</span>}
        </div>
        <div className="ex-item-note">
          {accountName ? `${accountName} · ` : ''}{t.date ? t.date.slice(0, 10) : ''}
          {t.tags?.length ? ` · ${t.tags.join(', ')}` : ''}
        </div>
        {files.length > 0 && (
          <div className="ex-attach-list">
            {files.map((name) => {
              const dataUrl = t.attachments[name]?.dataUrl;
              const isImg = typeof dataUrl === 'string' && dataUrl.startsWith('data:image');
              return isImg
                ? <img key={name} className="ex-thumb ex-thumb-sm" src={dataUrl} alt={name} title={name} />
                : <span key={name} className="ex-attach-name" title={name}>📎</span>;
            })}
          </div>
        )}
      </div>
      <div className="ex-item-right">
        <div className={`ex-item-amount ${t.amount >= 0 ? 'ex-pos-t' : ''}`}>{fmtMoney(t.amount, currency)}</div>
        <div className="ex-item-actions">
          <span className={`ex-status-dot ${pending ? 'ex-dot-pending' : 'ex-dot-paid'}`} title={pending ? 'Pendente' : 'Pago'} />
          {pending && onPay && <button className="ex-mini ex-mini-pay" onClick={onPay} aria-label="Marcar como pago" title="Marcar como pago">✓</button>}
          {onEdit && <button className="ex-mini" onClick={onEdit} aria-label="Editar"><Pencil size={13} /></button>}
          {onDelete && <button className="ex-mini ex-danger" onClick={onDelete} aria-label="Excluir"><Trash2 size={13} /></button>}
        </div>
      </div>
    </div>
  );
}

function BudgetEditor({ cats, budgets, onSave, currency }) {
  const [catId, setCatId] = useState(cats[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  return (
    <div className="ex-form-inline">
      <select className="ex-input" value={catId} onChange={(e) => setCatId(e.target.value)} aria-label="Categoria da meta">
        {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}{budgets[c.id] ? ` (atual ${budgets[c.id]})` : ''}</option>))}
      </select>
      <input className="ex-input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Meta" aria-label="Valor da meta" />
      <button className="ex-btn ex-btn-sm" onClick={() => { if (catId && Number(amount) >= 0) { onSave(catId, Number(amount)); setAmount(''); } }}>Salvar meta</button>
    </div>
  );
}

function CategoryEditor({ onSave }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Tag');
  const [color, setColor] = useState('gray');
  return (
    <div className="ex-form-inline">
      <input className="ex-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" aria-label="Nome da categoria" />
      <select className="ex-input" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Ícone">
        {['Tag', 'House', 'UtensilsCrossed', 'Car', 'HeartPulse', 'Gamepad2', 'Landmark', 'TrendingUp', 'Briefcase', 'GraduationCap', 'Receipt', 'Coins', 'Gift', 'Wallet'].map((i) => (<option key={i} value={i}>{i}</option>))}
      </select>
      <select className="ex-input" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Cor">
        {['blue', 'green', 'yellow', 'red', 'brand', 'gray'].map((c) => (<option key={c} value={c}>{c}</option>))}
      </select>
      <button className="ex-btn ex-btn-sm" onClick={() => {
        const id = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (id && name.trim()) { onSave({ id, name: name.trim(), icon, color }); setName(''); }
      }}>Criar</button>
    </div>
  );
}

const EX_CSS = `
.ex-root { display: flex; flex-direction: column; gap: 16px; }
.ex-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.ex-loading { gap: 8px; }
.ex-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: ex-pulse 1.4s ease-in-out infinite; }
.ex-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ex-sum-card { border-radius: 16px; padding: 14px; border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 4px; }
.ex-sum-in { background: linear-gradient(180deg, #1a3a2b 0%, #142428 100%); border-color: rgba(46,204,113,0.25); }
.ex-sum-out { background: linear-gradient(180deg, #3a1a1a 0%, #241414 100%); border-color: rgba(231,76,60,0.25); }
.ex-sum-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.ex-sum-value { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ex-sum-in .ex-sum-value { color: var(--green, #2ecc71); }
.ex-sum-out .ex-sum-value { color: var(--red, #e74c3c); }
.ex-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ex-monthnav { display: flex; gap: 6px; align-items: center; }
.ex-month { font-size: 13px; font-weight: 700; min-width: 76px; text-align: center; font-variant-numeric: tabular-nums; }
.ex-typefilter { display: flex; gap: 6px; }
.ex-chip { padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); font-size: 12px; font-weight: 600; cursor: pointer; min-height: 42px; }
.ex-chip.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); }
.ex-section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.ex-section-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; }
.ex-ico { width: 34px; min-width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; border: 1px solid; background: rgba(255,255,255,0.03); }
.ex-group { display: flex; flex-direction: column; gap: 6px; }
.ex-group-head { display: flex; align-items: center; gap: 10px; }
.ex-group-name { font-size: 13px; font-weight: 700; flex: 1; }
.ex-group-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.ex-group-total { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ex-pos-t { color: var(--green, #2ecc71); }
.ex-neg-t { color: var(--red, #e74c3c); }
.ex-item { display: flex; justify-content: space-between; align-items: center; gap: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 12px; }
.ex-item-main { min-width: 0; }
.ex-item-cat { font-size: 13px; font-weight: 600; }
.ex-item-note { font-size: 11px; color: var(--muted, #a1a7b3); }
.ex-item-right { text-align: right; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.ex-item-amount { font-size: 13px; font-weight: 700; color: var(--red, #e74c3c); font-variant-numeric: tabular-nums; }
.ex-item-amount.ex-pos-t { color: var(--green, #2ecc71); }
.ex-item-actions { display: flex; gap: 4px; }
.ex-mini { background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--muted, #a1a7b3); padding: 5px 7px; cursor: pointer; min-width: 34px; min-height: 34px; display: inline-flex; align-items: center; justify-content: center; }
.ex-mini-on { color: var(--green, #2ecc71); border-color: rgba(46,204,113,0.4); }
.ex-mini.ex-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }
.ex-form { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 14px; display: grid; gap: 10px; }
.ex-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ex-field { display: grid; gap: 6px; font-size: 11px; color: var(--muted, #a1a7b3); }
.ex-input { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 9px 10px; border-radius: 10px; width: 100%; font-size: 13px; min-height: 42px; font-family: inherit; }
.ex-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.ex-day { width: 64px; }
.ex-check { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--muted, #a1a7b3); }
.ex-check input[type="checkbox"] { width: 18px; height: 18px; }
.ex-btn { background: var(--brand, #7c5cff); color: white; border: none; padding: 10px 14px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; min-height: 42px; display: inline-flex; align-items: center; gap: 6px; }
.ex-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ex-btn-ghost { background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); }
.ex-btn-sm { padding: 6px 12px; min-height: 36px; font-size: 12px; }
.ex-btn:hover:not(:disabled) { filter: brightness(1.08); }
.ex-hint { font-size: 11px; color: var(--muted, #a1a7b3); }
.ex-insight { font-size: 13px; font-weight: 700; padding: 10px 12px; border-radius: 10px; background: rgba(225,177,44,0.08); border: 1px solid rgba(225,177,44,0.25); }
.ex-compare { display: flex; flex-direction: column; gap: 6px; }
.ex-compare-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.ex-compare-name { flex: 1; font-weight: 600; }
.ex-compare-vals { font-variant-numeric: tabular-nums; color: var(--muted, #a1a7b3); }
.ex-compare-delta { font-weight: 800; font-variant-numeric: tabular-nums; min-width: 56px; text-align: right; }
.ex-goal { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.ex-goal-label { font-size: 12px; font-weight: 700; }
.ex-attach-list { display: flex; flex-wrap: wrap; gap: 8px; }
.ex-attach-item { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 4px 6px; }
.ex-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; }
.ex-thumb-sm { width: 34px; height: 34px; }
.ex-attach-name { font-size: 11px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-import-list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
.ex-import-row { display: grid; grid-template-columns: 86px 1fr auto minmax(130px, 170px); gap: 8px; align-items: center; font-size: 12px; }
.ex-import-date { color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.ex-import-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-import-amt { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
@media (max-width: 719px) { .ex-import-row { grid-template-columns: 76px 1fr auto; } .ex-import-cat { grid-column: 1 / -1; } }
.ex-undo { display: flex; gap: 10px; align-items: center; background: rgba(225,177,44,0.1); border: 1px solid rgba(225,177,44,0.3); border-radius: 10px; padding: 10px 12px; font-size: 12px; }
.ex-recur { background: rgba(52,152,219,0.08); border: 1px solid rgba(52,152,219,0.3); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.ex-recur-title { font-size: 12px; font-weight: 700; }
.ex-recur-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; gap: 8px; }
.ex-budget { display: flex; gap: 10px; align-items: center; }
.ex-budget.over .ex-budget-pct { color: var(--red, #e74c3c); font-weight: 800; }
.ex-budget-main { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ex-budget-top { display: flex; justify-content: space-between; font-size: 12px; gap: 8px; font-variant-numeric: tabular-nums; }
.ex-bar-wrap { height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.ex-bar { display: block; height: 100%; background: linear-gradient(90deg, var(--brand, #7c5cff), #a78bfa); border-radius: 999px; }
.ex-budget.over .ex-bar { background: linear-gradient(90deg, var(--red, #e74c3c), #ff7b6b); }
.ex-budget-pct { font-size: 12px; font-variant-numeric: tabular-nums; }
.ex-catlist { display: flex; flex-wrap: wrap; gap: 8px; }
.ex-catpill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px 10px 4px 4px; border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; }
.ex-form-inline { display: flex; gap: 8px; flex-wrap: wrap; }
.ex-form-inline .ex-input { flex: 1; min-width: 120px; }
.ex-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
.ex-pie { display: flex; justify-content: center; }
@media (max-width: 719px) { .ex-summary { grid-template-columns: 1fr; } .ex-sum-value { font-size: 19px; } .ex-form-row { grid-template-columns: 1fr; } }
@keyframes ex-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }

/* ── v2 polish: glass, espaçamento, botões e sheet (Mobills-like) ── */
.ex-root { gap: 14px; }
.ex-hero { display: flex; flex-direction: column; gap: 12px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 18px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.ex-summary { gap: 12px; }
.ex-sum-card { border-radius: 14px; padding: 16px; }
.ex-budget-total { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); }
.ex-budget-total-top { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.ex-budget-total.over .ex-budget-total-top span:last-child { color: var(--red, #e74c3c); font-weight: 800; }
.ex-budget-total.over .ex-bar { background: linear-gradient(90deg, var(--red, #e74c3c), #ff7b6b); }

.ex-toolbar { gap: 10px; }
.ex-toolbar-2 { padding-top: 2px; }
.ex-toolbar-spacer { flex: 1; }
.ex-search { max-width: 240px; }
.ex-catfilter { max-width: 220px; }

.ex-section { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; gap: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }

.ex-btn { border-radius: 12px; padding: 10px 16px; gap: 8px; transition: filter 120ms ease, background 120ms ease; }
.ex-btn-primary { background: linear-gradient(135deg, #7c5cff, #6d4df2); box-shadow: 0 6px 16px rgba(124,92,255,0.28); }
.ex-btn-ghost { background: rgba(255,255,255,0.03); }
.ex-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.07); }
.ex-btn-on { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); }
.ex-chip { border-radius: 12px; }

.ex-item { border-radius: 12px; padding: 12px 14px; background: rgba(255,255,255,0.03); gap: 12px; }
.ex-item:hover { background: rgba(255,255,255,0.05); }
.ex-item-amount { font-size: 14px; }
.ex-mini { min-width: 40px; min-height: 40px; border-radius: 10px; }
.ex-item-actions { gap: 6px; }
.ex-group { gap: 8px; padding: 4px 0; }
.ex-group + .ex-group { border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; margin-top: 4px; }

/* Form em bottom sheet (mobile) / modal (desktop) */
.ex-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(7,9,14,0.72); backdrop-filter: blur(3px); display: flex; align-items: flex-end; justify-content: center; }
.ex-sheet { width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; background: linear-gradient(180deg, #171c27 0%, #12161f 100%); border: 1px solid #1f2734; border-radius: 20px 20px 0 0; box-shadow: 0 -12px 40px rgba(0,0,0,0.5); }
.ex-sheet-head { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; background: rgba(23,28,39,0.96); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(255,255,255,0.06); }
.ex-sheet-title { font-size: 15px; font-weight: 800; }
.ex-form { border: none; background: transparent; border-radius: 0; padding: 16px 18px 24px; gap: 14px; }
@media (min-width: 720px) { .ex-overlay { align-items: center; padding: 24px; } .ex-sheet { border-radius: 20px; } }
@media (max-width: 719px) { .ex-search { max-width: none; flex: 1; } .ex-section { padding: 14px; } }

/* ── D1/D2/D3/D4/D5 ── */
.ex-section-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.ex-badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 6px; border-radius: 999px; margin-left: 6px; border: 1px solid rgba(255,255,255,0.14); color: var(--muted, #a1a7b3); vertical-align: middle; }
.ex-badge-pending { color: var(--yellow, #e1b12c); border-color: rgba(225,177,44,0.45); background: rgba(225,177,44,0.1); }
.ex-badge-card { color: var(--blue, #3498db); border-color: rgba(52,152,219,0.4); background: rgba(52,152,219,0.1); }
.ex-mini-pay { color: var(--green, #2ecc71); border-color: rgba(46,204,113,0.45); }

.ex-bills { background: linear-gradient(180deg, #2e2b12 0%, #1b2010 100%); border: 1px solid #594e19; border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.ex-bills-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.ex-bills-sum { display: flex; gap: 10px; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; flex-wrap: wrap; }
.ex-badge-late { color: var(--red, #e74c3c); }
.ex-bill { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 12px; }
.ex-bill.late { border-color: rgba(231,76,60,0.4); }
.ex-bill-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ex-bill-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-bill-due { font-size: 11px; color: var(--muted, #a1a7b3); }
.ex-bill.late .ex-bill-due { color: var(--red, #e74c3c); }
.ex-bill-amount { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
@media (max-width: 719px) { .ex-bill { flex-wrap: wrap; } .ex-bill-amount { margin-left: auto; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ex-styles')) {
  const style = document.createElement('style');
  style.id = 'ex-styles';
  style.textContent = EX_CSS;
  document.head.appendChild(style);
}
