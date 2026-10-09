// QuickAddExpense — lançamento rápido estilo Mobills (≤3 toques):
// digita o valor → toca a categoria (chip com ícone) → Salvar. Lembra a última
// conta/categoria (localStorage) e oferece "Repetir último" em 1 toque. O sheet
// completo (parcelas/cartão/vencimento/anexo) continua em Expenses.
//
// H3 — ver DOCS/10_MODULES/gastos/melhorias.md. Sem fórmula: usa `parseAmount` (H4)
// e o `onAdd` do container (MoneyService.recordExpense).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp,
  Briefcase, GraduationCap, Tag, Receipt, Coins, Gift, Wallet, Repeat, Check,
} from 'lucide-react';
import type { Account, CategoryDef } from '@apps/lib/db';
import { parseAmount } from '@apps/lib/db';
import { fmtMoney } from './currency';
import { CATEGORY_ICONS, CATEGORY_COLORS } from './categoryIcons';

const ICONS = CATEGORY_ICONS;
const COLORS = CATEGORY_COLORS;

const LAST_KEY = 'expense:quick:last';

interface LastEntry {
  amount: number;
  category: string;
  accountId: string;
  note?: string;
}

function readLast(): LastEntry | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    return raw && typeof raw === 'object' && Number(raw.amount) > 0 ? (raw as LastEntry) : null;
  } catch {
    return null;
  }
}

function writeLast(entry: LastEntry): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(entry));
  } catch {
    /* noop */
  }
}

export interface QuickAddPayload {
  accountId: string;
  amount: number;
  category: string;
  date?: string;
  note?: string;
}

export interface QuickAddExpenseProps {
  categories: CategoryDef[];
  accounts: Account[];
  currency?: string;
  onAdd: (input: QuickAddPayload) => void;
  defaultCategoryId?: string;
}

export default function QuickAddExpense({
  categories = [], accounts = [], currency = 'USD', onAdd, defaultCategoryId,
}: QuickAddExpenseProps) {
  const cats = useMemo(() => categories.filter((c) => c.group !== 'imposto'), [categories]);
  const last = useMemo(() => readLast(), []);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState(() => last?.category || defaultCategoryId || cats[0]?.id || 'moradia');
  const [accountId, setAccountId] = useState(() => last?.accountId || accounts[0]?.id || '');
  const [flash, setFlash] = useState<string | null>(null);

  // Mantém conta/categoria válidas quando as listas chegam (async).
  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);
  useEffect(() => {
    if (cats.length && !cats.some((c) => c.id === category)) setCategory(cats[0].id);
  }, [cats, category]);

  const parsed = useMemo(() => parseAmount(amount), [amount]);
  const canSave = parsed != null && parsed > 0 && !!accountId && !!category;

  const save = useCallback((override?: Partial<QuickAddPayload>) => {
    const amt = override?.amount ?? parsed;
    const cat = override?.category ?? category;
    const acc = override?.accountId ?? accountId;
    if (amt == null || !(amt > 0) || !acc || !cat) return;
    const entry: LastEntry = { amount: amt, category: cat, accountId: acc, note: override?.note ?? (note.trim() || undefined) };
    writeLast(entry);
    onAdd({ accountId: acc, amount: amt, category: cat, date: new Date().toISOString(), note: entry.note });
    setAmount('');
    setNote('');
    setFlash(`${fmtMoney(amt, currency)} em ${cats.find((c) => c.id === cat)?.name ?? cat}`);
    window.setTimeout(() => setFlash(null), 2500);
  }, [parsed, category, accountId, note, onAdd, cats, currency]);

  const repeatLast = useCallback(() => {
    const l = readLast();
    if (!l) return;
    setCategory(l.category);
    setAccountId(l.accountId);
    save({ amount: l.amount, category: l.category, accountId: l.accountId, note: l.note });
  }, [save]);

  return (
    <div className="qa-root" role="group" aria-label="Lançamento rápido">
      <div className="qa-row">
        <label className="qa-amount-wrap">
          <span className="qa-currency">{currency === 'BRL' ? 'R$' : '$'}</span>
          <input
            className="qa-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) save(); }}
            placeholder="0,00"
            aria-label="Valor do lançamento rápido"
          />
          {parsed != null && amount.trim() !== '' && <span className="qa-preview">= {fmtMoney(parsed, currency)}</span>}
        </label>
        <input
          className="qa-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota (opcional)"
          aria-label="Nota do lançamento rápido"
        />
        <button
          type="button"
          className="qa-save"
          disabled={!canSave}
          onClick={() => save()}
          aria-label="Salvar lançamento rápido"
        >
          <Check size={16} /> Salvar
        </button>
        {readLast() && (
          <button type="button" className="qa-repeat" onClick={repeatLast} title="Repetir último lançamento" aria-label="Repetir último lançamento">
            <Repeat size={15} />
          </button>
        )}
      </div>

      <div className="qa-cats" role="group" aria-label="Categoria">
        {cats.map((c) => {
          const Cmp = ICONS[c.icon] ?? Tag;
          const active = c.id === category;
          return (
            <button
              key={c.id}
              type="button"
              className={`qa-cat${active ? ' active' : ''}`}
              aria-pressed={active}
              onClick={() => setCategory(c.id)}
              style={{ borderColor: active ? COLORS[c.color] : undefined }}
            >
              <Cmp size={15} strokeWidth={2} style={{ color: COLORS[c.color] || COLORS.gray }} />
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>

      <div className="qa-foot">
        <label className="qa-acc">
          <span>Conta</span>
          <select className="qa-select" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Conta do lançamento rápido">
            {accounts.length === 0 && <option value="">—</option>}
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
        </label>
        {flash && <span className="qa-flash" role="status"><Check size={13} /> {flash}</span>}
        {accounts.length === 0 && <span className="qa-hint">Crie uma conta para lançar.</span>}
      </div>
    </div>
  );
}

const QA_CSS = `
.qa-root { display: flex; flex-direction: column; gap: 10px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 14px 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.qa-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.qa-amount-wrap { display: flex; align-items: center; gap: 6px; flex: 1 1 200px; background: #111623; border: 1px solid #273044; border-radius: 12px; padding: 4px 10px; min-height: 48px; }
.qa-amount-wrap:focus-within { border-color: var(--brand, #7c5cff); }
.qa-currency { color: var(--muted, #a1a7b3); font-weight: 700; }
.qa-amount { flex: 1; min-width: 0; background: transparent; border: none; color: var(--text, #e7eaf0); font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; outline: none; }
.qa-preview { font-size: 11px; color: var(--muted, #a1a7b3); white-space: nowrap; }
.qa-note { flex: 1 1 140px; background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 12px 10px; border-radius: 12px; font-size: 13px; min-height: 48px; font-family: inherit; }
.qa-save { background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; border: none; border-radius: 12px; font-weight: 800; font-size: 14px; padding: 12px 18px; min-height: 48px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 6px 16px rgba(124,92,255,0.28); }
.qa-save:disabled { opacity: 0.5; cursor: not-allowed; }
.qa-repeat { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); border-radius: 12px; min-width: 48px; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.qa-repeat:hover { background: rgba(255,255,255,0.08); }
.qa-cats { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
.qa-cat { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); color: var(--muted, #a1a7b3); font-size: 12px; font-weight: 600; cursor: pointer; min-height: 40px; }
.qa-cat.active { background: rgba(124,92,255,0.14); color: var(--text, #e7eaf0); }
.qa-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.qa-acc { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted, #a1a7b3); }
.qa-select { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); border-radius: 10px; padding: 7px 9px; font-size: 12px; min-height: 38px; }
.qa-flash { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--green, #2ecc71); }
.qa-hint { font-size: 11px; color: var(--muted, #a1a7b3); }
@media (max-width: 560px) { .qa-amount { font-size: 18px; } .qa-note { flex: 1 1 100%; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('qa-styles')) {
  const style = document.createElement('style');
  style.id = 'qa-styles';
  style.textContent = QA_CSS;
  document.head.appendChild(style);
}
