// Módulo Gastos — aba Categorias (H0/H12). CRUD com ícone/cor/pai, mesclar, remover
// com reatribuição (nunca órfão), reordenar, preview do impacto e pack de impostos.
// Compõe o motor (listCategories/saveCategory/mergeCategories/removeCategory/categoryUsage).
import React, { useCallback, useMemo, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import { useToast } from '@apps/ui/Toast';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { fmtMoney } from '@apps/ui/currency';
import {
  House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp,
  Briefcase, GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank, Plus, Trash2, Pencil, ArrowLeftRight,
} from 'lucide-react';
import {
  listCategories, saveCategory, mergeCategories, removeCategory, setCategoryOrder,
  categoryUsage, getCategoryOrder, DEFAULT_CATEGORIES, subcategoriesOf,
} from '@apps/lib/db';

const ICONS = { House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp, Briefcase, GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank };
const ICON_CHOICES = Object.keys(ICONS);
const COLORS = { blue: 'var(--blue,#3498db)', green: 'var(--green,#2ecc71)', yellow: 'var(--yellow,#e1b12c)', red: 'var(--red,#e74c3c)', brand: 'var(--brand,#7c5cff)', gray: 'var(--gray,#5b6270)' };
const COLOR_CHOICES = Object.keys(COLORS);

function CatIcon({ name, color, size = 16 }) {
  const Cmp = ICONS[name] || Tag;
  return <span className="cp-ico" style={{ color: COLORS[color] || COLORS.gray, borderColor: COLORS[color] || COLORS.gray }}><Cmp size={size} strokeWidth={2} /></span>;
}

const slug = (s) => String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const TAX_PACK = DEFAULT_CATEGORIES.filter((c) => c.group === 'imposto');

export default function CategoriasPage() {
  const { toast } = useToast();
  const { loading, data, error, reload, finance } = useEngineData(async (f) => {
    const cats = await listCategories(f.ds);
    const [usage, order] = await Promise.all([categoryUsage(f.ds, cats), getCategoryOrder(f.ds)]);
    return { cats, usage, order };
  });

  const [form, setForm] = useState({ id: '', name: '', icon: 'Tag', color: 'gray', parent: '' });
  const [busy, setBusy] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const cats = data.cats ?? [];
    const usageBy = new Map((data.usage ?? []).map((u) => [u.categoryId, u]));
    const max = Math.max(1, ...(data.usage ?? []).map((u) => u.total));
    const roots = cats.filter((c) => !c.parent);
    return { cats, usageBy, max, roots };
  }, [data]);

  const startEdit = (c) => setForm({ id: c.id, name: c.name, icon: c.icon, color: c.color, parent: c.parent ?? '' });
  const reset = () => setForm({ id: '', name: '', icon: 'Tag', color: 'gray', parent: '' });

  const onSave = useCallback(async () => {
    const f = finance;
    if (!f || !form.name.trim()) return;
    const id = form.id || slug(form.name);
    if (!id) return;
    await saveCategory(f.ds, {
      id, name: form.name.trim(), icon: form.icon, color: form.color,
      parent: form.parent || undefined,
    });
    reset();
  }, [finance, form]);

  const move = useCallback(async (id, delta) => {
    const f = finance;
    if (!f || !view) return;
    const ids = view.cats.map((c) => c.id).filter((x) => x !== id);
    const at = view.cats.findIndex((c) => c.id === id);
    const to = Math.max(0, Math.min(ids.length, at + delta));
    ids.splice(to, 0, id);
    await setCategoryOrder(f.ds, ids);
  }, [finance, view]);

  const onMerge = useCallback(async (fromId, toId) => {
    const f = finance;
    if (!f || !view || !toId || fromId === toId) return;
    setBusy(true);
    try {
      const moved = await mergeCategories(f.ds, fromId, toId, view.cats);
      toast(`${moved} lançamento(s) movido(s) para ${view.cats.find((c) => c.id === toId)?.name ?? toId}.`);
    } finally { setBusy(false); }
  }, [finance, view, toast]);

  const onRemove = useCallback(async (id, toId) => {
    const f = finance;
    if (!f || !view || !toId || id === toId) return;
    setBusy(true);
    try {
      const moved = await removeCategory(f.ds, id, toId, view.cats);
      toast(`Categoria removida (${moved} lançamento(s) reatribuído(s)).`);
    } finally { setBusy(false); }
  }, [finance, view, toast]);

  const addTaxPack = useCallback(async () => {
    const f = finance;
    if (!f) return;
    setBusy(true);
    try {
      for (const c of TAX_PACK) await saveCategory(f.ds, c);
      toast('Pack de impostos garantido.');
    } finally { setBusy(false); }
  }, [finance, toast]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Categorias</h1></div>
      <ModuleTabs module="gastos" />

      {error && view && <ActionableError stale error={error} onRetry={reload} label="as Categorias" />}
      {error && !view ? (
        <ActionableError error={error} onRetry={reload} label="as Categorias" />
      ) : loading || !view ? (
        <DashSkeleton cards={2} widgets={2} />
      ) : (
        <>
          {/* Editor */}
          <div className="dash-section">
            <div className="dash-title"><span><Tag size={14} /> {form.id ? 'Editar categoria' : 'Nova categoria'}</span>{form.id && <button className="cp-mini" onClick={reset}>cancelar edição</button>}</div>
            <div className="cp-form">
              <input className="cp-input" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Nome (ex.: Pets)" aria-label="Nome da categoria" />
              <select className="cp-input" value={form.parent} onChange={(e) => setForm((s) => ({ ...s, parent: e.target.value }))} aria-label="Categoria pai">
                <option value="">Sem pai (raiz)</option>
                {view.roots.filter((r) => r.id !== form.id).map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </select>
            </div>
            <div className="cp-palette" role="group" aria-label="Ícone">
              {ICON_CHOICES.map((ic) => {
                const Cmp = ICONS[ic];
                return (
                  <button key={ic} type="button" className={`cp-swatch${form.icon === ic ? ' active' : ''}`} onClick={() => setForm((s) => ({ ...s, icon: ic }))} aria-pressed={form.icon === ic} aria-label={`Ícone ${ic}`}>
                    <Cmp size={15} />
                  </button>
                );
              })}
            </div>
            <div className="cp-palette" role="group" aria-label="Cor">
              {COLOR_CHOICES.map((co) => (
                <button key={co} type="button" className={`cp-color${form.color === co ? ' active' : ''}`} style={{ background: COLORS[co] }} onClick={() => setForm((s) => ({ ...s, color: co }))} aria-pressed={form.color === co} aria-label={`Cor ${co}`} />
              ))}
            </div>
            <div className="cp-actions">
              <button className="cp-btn" disabled={!form.name.trim()} onClick={onSave}><Plus size={14} /> {form.id ? 'Salvar' : 'Criar'}</button>
              <button className="cp-btn-ghost" disabled={busy} onClick={addTaxPack}>Pack de impostos</button>
            </div>
          </div>

          {/* Lista + preview + mesclar/remover/reordenar */}
          <div className="dash-section">
            <div className="dash-title"><span><Tag size={14} /> Categorias ({view.cats.length})</span></div>
            {view.cats.map((c, i) => {
              const u = view.usageBy.get(c.id);
              const subs = subcategoriesOf(view.cats, c.id);
              return (
                <div key={c.id} className={`cp-row${c.parent ? ' cp-sub' : ''}`}>
                  <div className="cp-row-head">
                    <CatIcon name={c.icon} color={c.color} />
                    <div className="cp-row-main">
                      <div className="cp-row-name">{c.parent ? `↳ ${c.name}` : c.name}{c.group === 'imposto' && <span className="cp-badge">imposto</span>}</div>
                      <div className="cp-bar-wrap"><span className="cp-bar" style={{ width: `${Math.round(((u?.total ?? 0) / view.max) * 100)}%` }} /></div>
                    </div>
                    <span className="cp-row-val">{u ? `${fmtMoney(u.total, 'USD')} · ${u.count}x` : 'sem uso'}</span>
                    <div className="cp-row-actions">
                      <button className="cp-mini" onClick={() => move(c.id, -1)} disabled={i === 0} aria-label={`Subir ${c.name}`}>↑</button>
                      <button className="cp-mini" onClick={() => move(c.id, 1)} disabled={i === view.cats.length - 1} aria-label={`Descer ${c.name}`}>↓</button>
                      <button className="cp-mini" onClick={() => startEdit(c)} aria-label={`Editar ${c.name}`}><Pencil size={12} /></button>
                    </div>
                  </div>
                  <div className="cp-row-tools">
                    <label className="cp-tool">
                      <ArrowLeftRight size={12} />
                      <select className="cp-select" defaultValue="" onChange={(e) => { if (e.target.value) { onMerge(c.id, e.target.value); e.target.value = ''; } }} aria-label={`Mesclar ${c.name} em`}>
                        <option value="">Mesclar em…</option>
                        {view.cats.filter((x) => x.id !== c.id).map((x) => (<option key={x.id} value={x.id}>{x.name}</option>))}
                      </select>
                    </label>
                    <label className="cp-tool">
                      <Trash2 size={12} />
                      <select className="cp-select" defaultValue="" onChange={(e) => { if (e.target.value) { onRemove(c.id, e.target.value); e.target.value = ''; } }} aria-label={`Remover ${c.name} reatribuindo para`}>
                        <option value="">Remover, mover para…</option>
                        {view.cats.filter((x) => x.id !== c.id).map((x) => (<option key={x.id} value={x.id}>{x.name}</option>))}
                      </select>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const CP_CSS = `
.cp-form { display: flex; gap: 8px; flex-wrap: wrap; }
.cp-input { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 9px 10px; border-radius: 10px; font-size: 13px; min-height: 42px; flex: 1; min-width: 140px; font-family: inherit; }
.cp-palette { display: flex; gap: 6px; flex-wrap: wrap; }
.cp-swatch { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); cursor: pointer; }
.cp-swatch.active { border-color: var(--brand, #7c5cff); background: rgba(124,92,255,0.15); }
.cp-color { width: 30px; height: 30px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.cp-color.active { border-color: #fff; }
.cp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.cp-btn { background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; border: none; border-radius: 11px; font-weight: 800; font-size: 13px; padding: 10px 14px; min-height: 42px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.cp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cp-btn-ghost { background: rgba(255,255,255,0.03); border: 1px solid #2a3246; color: var(--text, #e7eaf0); border-radius: 11px; font-weight: 700; font-size: 13px; padding: 10px 14px; min-height: 42px; cursor: pointer; }
.cp-row { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.cp-row:last-child { border-bottom: none; }
.cp-sub { padding-left: 16px; }
.cp-row-head { display: flex; align-items: center; gap: 10px; }
.cp-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.cp-row-name { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.cp-badge { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 6px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); color: var(--muted, #a1a7b3); }
.cp-bar-wrap { height: 6px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; max-width: 260px; }
.cp-bar { display: block; height: 100%; background: linear-gradient(90deg, var(--brand, #7c5cff), #a78bfa); border-radius: 999px; }
.cp-row-val { font-size: 11px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cp-row-actions { display: flex; gap: 4px; }
.cp-mini { background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: var(--muted, #a1a7b3); padding: 5px 8px; cursor: pointer; min-height: 32px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
.cp-mini:disabled { opacity: 0.35; cursor: not-allowed; }
.cp-row-tools { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0 0 38px; }
.cp-tool { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted, #a1a7b3); }
.cp-select { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); border-radius: 8px; padding: 5px 7px; font-size: 11px; min-height: 32px; }
.cp-ico { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; border: 1px solid; background: rgba(255,255,255,0.03); }
`;
if (typeof document !== 'undefined' && !document.getElementById('cp-styles')) {
  const style = document.createElement('style');
  style.id = 'cp-styles';
  style.textContent = CP_CSS;
  document.head.appendChild(style);
}
