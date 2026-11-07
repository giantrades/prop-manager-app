// QuickAddExpense — lançamento rápido estilo Mobills (≤3 toques), compacto.
// Gasto OU ganho; escolher categoria mostra SUBCATEGORIAS ao tocar no pai.
// Lembra a última conta/categoria (localStorage) e oferece "Repetir último".
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Repeat, ChevronRight, ArrowLeft } from 'lucide-react';
import type { Account, CategoryDef } from '@apps/lib/db';
import { parseAmount } from '@apps/lib/db';
import { fmtMoney } from './currency';
import { CATEGORY_ICONS, CATEGORY_COLORS } from './categoryIcons';

const LAST_KEY = 'expense:quick:last';

interface LastEntry { kind: 'expense' | 'income'; amount: number; category: string; accountId: string; }

function readLast(): LastEntry | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    return raw && typeof raw === 'object' && Number(raw.amount) > 0 ? (raw as LastEntry) : null;
  } catch { return null; }
}
function writeLast(entry: LastEntry): void {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(entry)); } catch { /* noop */ }
}

export interface QuickAddPayload {
  kind: 'expense' | 'income';
  accountId: string;
  amount: number;
  category?: string;
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
  const roots = useMemo(() => cats.filter((c) => !c.parent), [cats]);
  const last = useMemo(() => readLast(), []);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(() => last?.category || defaultCategoryId || cats[0]?.id || 'moradia');
  const [openParent, setOpenParent] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(() => last?.accountId || accounts[0]?.id || '');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { if (!accountId && accounts[0]) setAccountId(accounts[0].id); }, [accounts, accountId]);
  useEffect(() => {
    if (kind === 'expense' && cats.length && !cats.some((c) => c.id === category)) setCategory(cats[0].id);
  }, [cats, category, kind]);

  const parsed = useMemo(() => parseAmount(amount), [amount]);
  const canSave = parsed != null && parsed > 0 && !!accountId && (kind === 'income' || !!category);

  const childrenOf = (id: string) => cats.filter((c) => c.parent === id);
  const parentName = openParent ? (cats.find((c) => c.id === openParent)?.name ?? '') : '';

  const choose = (id: string) => { setCategory(id); setOpenParent(null); };
  const onCatClick = (r: CategoryDef) => {
    if (childrenOf(r.id).length) setOpenParent(r.id);
    else choose(r.id);
  };

  const save = useCallback((override?: Partial<QuickAddPayload>) => {
    const amt = override?.amount ?? parsed;
    if (amt == null || !(amt > 0) || !accountId) return;
    const k = override?.kind ?? kind;
    const cat = k === 'expense' ? (override?.category ?? category) : undefined;
    if (k === 'expense' && !cat) return;
    writeLast({ kind: k, amount: amt, category: cat ?? '', accountId });
    onAdd({ kind: k, accountId, amount: amt, category: cat, date: new Date().toISOString() });
    setAmount('');
    const label = k === 'income' ? 'Ganho' : (cats.find((c) => c.id === cat)?.name ?? cat);
    setFlash(`${fmtMoney(amt, currency)} · ${label}`);
    window.setTimeout(() => setFlash(null), 2500);
  }, [parsed, kind, category, accountId, onAdd, cats, currency]);

  const repeatLast = useCallback(() => {
    const l = readLast();
    if (!l) return;
    if (l.kind === 'expense' && l.category) { setKind('expense'); setCategory(l.category); setOpenParent(null); }
    else setKind(l.kind);
    setAccountId(l.accountId);
    save({ amount: l.amount, kind: l.kind, category: l.category || undefined });
  }, [save]);

  return (
    <div className={`qa-root qa-${kind}`} role="group" aria-label="Lançamento rápido">
      <div className="qa-top">
        <div className="qa-kind" role="group" aria-label="Tipo">
          <button type="button" className={`qa-kind-btn qa-kind-exp${kind === 'expense' ? ' on' : ''}`} aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>Gasto</button>
          <button type="button" className={`qa-kind-btn qa-kind-inc${kind === 'income' ? ' on' : ''}`} aria-pressed={kind === 'income'} onClick={() => setKind('income')}>Ganho</button>
        </div>
        <label className="qa-amount-wrap">
          <span className="qa-currency">{currency === 'BRL' ? 'R$' : '$'}</span>
          <input
            className="qa-amount" type="text" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) save(); }}
            placeholder="0,00" aria-label="Valor do lançamento rápido"
          />
        </label>
        <button type="button" className="qa-save" disabled={!canSave} onClick={() => save()} aria-label="Salvar lançamento rápido">
          <Check size={16} /> Salvar
        </button>
        {readLast() && (
          <button type="button" className="qa-repeat" onClick={repeatLast} title="Repetir último lançamento" aria-label="Repetir último lançamento">
            <Repeat size={15} />
          </button>
        )}
      </div>

      {kind === 'expense' && (
        <div className="qa-cats" role="group" aria-label="Categoria">
          {openParent ? (
            <>
              <button type="button" className="qa-cat qa-cat-back" onClick={() => setOpenParent(null)} aria-label="Voltar às categorias">
                <ArrowLeft size={14} /> {parentName}
              </button>
              <button type="button" className={`qa-cat${category === openParent ? ' active' : ''}`} onClick={() => choose(openParent)}>
                {parentName} (geral)
              </button>
              {childrenOf(openParent).map((ch) => {
                const Cmp = CATEGORY_ICONS[ch.icon] || CATEGORY_ICONS.Tag;
                return (
                  <button key={ch.id} type="button" className={`qa-cat${category === ch.id ? ' active' : ''}`} onClick={() => choose(ch.id)} aria-pressed={category === ch.id}>
                    <Cmp size={14} strokeWidth={2} style={{ color: CATEGORY_COLORS[ch.color] || CATEGORY_COLORS.gray }} />
                    <span>{ch.name}</span>
                  </button>
                );
              })}
            </>
          ) : (
            roots.map((r) => {
              const Cmp = CATEGORY_ICONS[r.icon] || CATEGORY_ICONS.Tag;
              const hasKids = childrenOf(r.id).length > 0;
              const active = category === r.id || (!!category && cats.find((c) => c.id === category)?.parent === r.id);
              return (
                <button key={r.id} type="button" className={`qa-cat${active ? ' active' : ''}`} onClick={() => onCatClick(r)} aria-pressed={active}>
                  <Cmp size={14} strokeWidth={2} style={{ color: CATEGORY_COLORS[r.color] || CATEGORY_COLORS.gray }} />
                  <span>{r.name}</span>
                  {hasKids && <ChevronRight size={13} />}
                </button>
              );
            })
          )}
        </div>
      )}

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
.qa-root { display: flex; flex-direction: column; gap: 8px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 14px; padding: 10px 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.qa-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.qa-kind { display: inline-flex; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 2px; }
.qa-kind-btn { padding: 7px 12px; border: none; background: transparent; color: var(--muted, #a1a7b3); font-size: 12px; font-weight: 700; border-radius: 8px; cursor: pointer; min-height: 34px; }
.qa-kind-btn.on { background: rgba(124,92,255,0.18); color: var(--text, #e7eaf0); }
/* Diferenciação sutil Gasto (vermelho) × Ganho (verde) — no botão ativo e na borda do card. */
.qa-kind-exp.on { background: rgba(231,76,60,0.20); color: #ff9a8f; }
.qa-kind-inc.on { background: rgba(46,204,113,0.20); color: #7bed9f; }
.qa-root.qa-expense { border-color: rgba(231,76,60,0.28); }
.qa-root.qa-income { border-color: rgba(46,204,113,0.30); }
.qa-root.qa-expense .qa-amount-wrap:focus-within { border-color: rgba(231,76,60,0.55); }
.qa-root.qa-income .qa-amount-wrap:focus-within { border-color: rgba(46,204,113,0.55); }
.qa-root.qa-income .qa-save { background: linear-gradient(135deg, #2ecc71, #27ae60); box-shadow: 0 6px 16px rgba(46,204,113,0.24); }
.qa-amount-wrap { display: flex; align-items: center; gap: 6px; flex: 1 1 160px; background: #111623; border: 1px solid #273044; border-radius: 11px; padding: 3px 10px; min-height: 42px; }
.qa-amount-wrap:focus-within { border-color: var(--brand, #7c5cff); }
.qa-currency { color: var(--muted, #a1a7b3); font-weight: 700; }
.qa-amount { flex: 1; min-width: 0; background: transparent; border: none; color: var(--text, #e7eaf0); font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; outline: none; }
.qa-save { background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; border: none; border-radius: 11px; font-weight: 800; font-size: 13px; padding: 10px 16px; min-height: 42px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 6px 16px rgba(124,92,255,0.28); }
.qa-save:disabled { opacity: 0.5; cursor: not-allowed; }
.qa-repeat { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); border-radius: 11px; min-width: 42px; min-height: 42px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.qa-repeat:hover { background: rgba(255,255,255,0.08); }
.qa-cats { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
.qa-cat { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; padding: 7px 11px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); color: var(--muted, #a1a7b3); font-size: 12px; font-weight: 600; cursor: pointer; min-height: 36px; }
.qa-cat.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); }
.qa-cat-back { color: var(--brand, #7c5cff); border-color: rgba(124,92,255,0.35); }
.qa-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.qa-acc { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted, #a1a7b3); }
.qa-select { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); border-radius: 9px; padding: 6px 8px; font-size: 12px; min-height: 34px; }
.qa-flash { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--green, #2ecc71); }
.qa-hint { font-size: 11px; color: var(--muted, #a1a7b3); }
@media (max-width: 560px) { .qa-amount { font-size: 17px; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('qa-styles')) {
  const style = document.createElement('style');
  style.id = 'qa-styles';
  style.textContent = QA_CSS;
  document.head.appendChild(style);
}
