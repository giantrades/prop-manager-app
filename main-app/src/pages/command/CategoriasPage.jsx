// Módulo Gastos — aba Categorias (H0/H12). Redesenhada: lista à esquerda, editor à
// direita (sticky no desktop, empilhado no mobile). CRUD com ícone/cor/pai, mesclar,
// remover com reatribuição (nunca órfão), reordenar, preview de uso e pack de impostos.
import React, { useCallback, useMemo, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import { useToast } from '@apps/ui/Toast';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { fmtMoney } from '@apps/ui/currency';
import { Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown, MoreHorizontal, ArrowRightLeft } from 'lucide-react';
import { CATEGORY_ICONS, ICON_CHOICES, CATEGORY_COLORS, COLOR_CHOICES, CategoryIcon } from '@apps/ui/categoryIcons';
import {
  listCategories, saveCategory, mergeCategories, removeCategory, setCategoryOrder,
  categoryUsage, getCategoryOrder, DEFAULT_CATEGORIES, subcategoriesOf,
} from '@apps/lib/db';

const slug = (s) => String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TAX_PACK = DEFAULT_CATEGORIES.filter((c) => c.group === 'imposto');
const EMPTY_FORM = { id: '', name: '', icon: 'Tag', color: 'gray', parent: '' };

export default function CategoriasPage() {
  const { toast } = useToast();
  const { loading, data, error, reload, finance } = useEngineData(async (f) => {
    const cats = await listCategories(f.ds);
    const [usage, order] = await Promise.all([categoryUsage(f.ds, cats), getCategoryOrder(f.ds)]);
    return { cats, usage, order };
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // id do row com menu aberto
  const [dialog, setDialog] = useState(null); // { mode:'merge'|'remove', cat }

  const view = useMemo(() => {
    if (!data) return null;
    const cats = data.cats ?? [];
    const usageBy = new Map((data.usage ?? []).map((u) => [u.categoryId, u]));
    const max = Math.max(1, ...(data.usage ?? []).map((u) => u.total));
    const roots = cats.filter((c) => !c.parent);
    // Ordena: raízes na ordem atual, com as filhas logo abaixo do pai.
    const ordered = [];
    for (const r of roots) {
      ordered.push(r);
      for (const s of cats.filter((c) => c.parent === r.id)) ordered.push(s);
    }
    for (const c of cats) if (!ordered.includes(c)) ordered.push(c);
    return { cats, usageBy, max, roots, ordered };
  }, [data]);

  const startEdit = (c) => setForm({ id: c.id, name: c.name, icon: c.icon || 'Tag', color: c.color || 'gray', parent: c.parent ?? '' });
  const reset = () => setForm(EMPTY_FORM);

  const onSave = useCallback(async () => {
    const f = finance;
    if (!f || !form.name.trim()) return;
    const id = form.id || slug(form.name);
    if (!id) return;
    setBusy(true);
    try {
      await saveCategory(f.ds, { id, name: form.name.trim(), icon: form.icon, color: form.color, parent: form.parent || undefined });
      toast(form.id ? 'Categoria atualizada.' : 'Categoria criada.');
      reset();
    } finally { setBusy(false); }
  }, [finance, form, toast]);

  const move = useCallback(async (id, delta) => {
    const f = finance;
    if (!f || !view) return;
    const ids = view.ordered.map((c) => c.id).filter((x) => x !== id);
    const at = view.ordered.findIndex((c) => c.id === id);
    const to = Math.max(0, Math.min(ids.length, at + delta));
    ids.splice(to, 0, id);
    await setCategoryOrder(f.ds, ids);
  }, [finance, view]);

  const confirmDialog = useCallback(async (targetId) => {
    const f = finance;
    if (!f || !dialog || !view || !targetId) return;
    setBusy(true);
    try {
      if (dialog.mode === 'merge') {
        const moved = await mergeCategories(f.ds, dialog.cat.id, targetId, view.cats);
        toast(`${moved} lançamento(s) movido(s).`);
      } else {
        const moved = await removeCategory(f.ds, dialog.cat.id, targetId, view.cats);
        toast(`Categoria removida (${moved} reatribuído(s)).`);
      }
      setDialog(null);
    } finally { setBusy(false); }
  }, [finance, dialog, view, toast]);

  const addTaxPack = useCallback(async () => {
    const f = finance;
    if (!f) return;
    setBusy(true);
    try {
      for (const c of TAX_PACK) await saveCategory(f.ds, c);
      toast('Pack de impostos garantido.');
    } finally { setBusy(false); }
  }, [finance, toast]);

  const editing = !!form.id;

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
        <div className="cat2-layout">
          {/* Lista */}
          <section className="cat2-card cat2-list">
            <div className="cat2-card-head">
              <span className="cat2-card-title">Suas categorias</span>
              <span className="cat2-count">{view.cats.length}</span>
            </div>
            <div className="cat2-rows">
              {view.ordered.map((c, i) => {
                const u = view.usageBy.get(c.id);
                const isSub = !!c.parent;
                return (
                  <div key={c.id} className={`cat2-row${isSub ? ' cat2-row-sub' : ''}`}>
                    <CategoryIcon name={c.icon} color={c.color} size={16} />
                    <div className="cat2-main">
                      <div className="cat2-name-line">
                        {isSub && <span className="cat2-sub-mark">↳</span>}
                        <span className="cat2-name">{c.name}</span>
                        {c.group === 'imposto' && <span className="cat2-badge">imposto</span>}
                      </div>
                      <div className="cat2-bar"><span className="cat2-bar-fill" style={{ width: `${Math.round(((u?.total ?? 0) / view.max) * 100)}%`, background: CATEGORY_COLORS[c.color] || CATEGORY_COLORS.gray }} /></div>
                    </div>
                    <div className="cat2-usage">{u ? <>{fmtMoney(u.total, 'USD')}<span className="cat2-usage-n">{u.count}x</span></> : <span className="cat2-unused">sem uso</span>}</div>
                    <div className="cat2-actions">
                      <button className="cat2-icon-btn" onClick={() => move(c.id, -1)} disabled={i === 0} aria-label={`Subir ${c.name}`} title="Subir"><ChevronUp size={14} /></button>
                      <button className="cat2-icon-btn" onClick={() => move(c.id, 1)} disabled={i === view.ordered.length - 1} aria-label={`Descer ${c.name}`} title="Descer"><ChevronDown size={14} /></button>
                      <button className={`cat2-icon-btn${editing && form.id === c.id ? ' on' : ''}`} onClick={() => startEdit(c)} aria-label={`Editar ${c.name}`} title="Editar"><Pencil size={13} /></button>
                      <button className={`cat2-icon-btn${openMenu === c.id ? ' on' : ''}`} onClick={() => setOpenMenu((m) => (m === c.id ? null : c.id))} aria-label={`Mais ações de ${c.name}`} title="Mais"><MoreHorizontal size={14} /></button>
                    </div>
                    {openMenu === c.id && (
                      <div className="cat2-menu" role="menu">
                        <button role="menuitem" onClick={() => { setDialog({ mode: 'merge', cat: c }); setOpenMenu(null); }}><ArrowRightLeft size={13} /> Mesclar em…</button>
                        <button role="menuitem" className="danger" onClick={() => { setDialog({ mode: 'remove', cat: c }); setOpenMenu(null); }}><Trash2 size={13} /> Remover…</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Editor */}
          <aside className="cat2-card cat2-editor">
            <div className="cat2-card-head">
              <span className="cat2-card-title">{editing ? 'Editar categoria' : 'Nova categoria'}</span>
              {editing && <button className="cat2-link" onClick={reset}>cancelar</button>}
            </div>

            <label className="cat2-field"><span>Nome</span>
              <input className="cat2-input" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Ex.: Pets, Academia, Assinaturas" aria-label="Nome da categoria" />
            </label>

            <label className="cat2-field"><span>Categoria pai</span>
              <select className="cat2-input" value={form.parent} onChange={(e) => setForm((s) => ({ ...s, parent: e.target.value }))} aria-label="Categoria pai">
                <option value="">— Sem pai (categoria raiz)</option>
                {view.roots.filter((r) => r.id !== form.id).map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </select>
            </label>

            <div className="cat2-field"><span>Ícone</span>
              <div className="cat2-icons" role="group" aria-label="Ícone">
                {ICON_CHOICES.map((ic) => {
                  const Cmp = CATEGORY_ICONS[ic];
                  const active = form.icon === ic;
                  return (
                    <button key={ic} type="button" className={`cat2-swatch${active ? ' active' : ''}`} onClick={() => setForm((s) => ({ ...s, icon: ic }))} aria-pressed={active} title={ic} aria-label={`Ícone ${ic}`}>
                      <Cmp size={16} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="cat2-field"><span>Cor</span>
              <div className="cat2-colors" role="group" aria-label="Cor">
                {COLOR_CHOICES.map((co) => (
                  <button key={co} type="button" className={`cat2-color${form.color === co ? ' active' : ''}`} style={{ background: CATEGORY_COLORS[co] }} onClick={() => setForm((s) => ({ ...s, color: co }))} aria-pressed={form.color === co} aria-label={`Cor ${co}`} />
                ))}
              </div>
            </div>

            <div className="cat2-preview">
              <CategoryIcon name={form.icon} color={form.color} size={18} />
              <span>{form.name.trim() || 'Prévia da categoria'}</span>
            </div>

            <div className="cat2-editor-actions">
              <button className="cat2-btn" disabled={busy || !form.name.trim()} onClick={onSave}>
                {editing ? <><Check size={15} /> Salvar</> : <><Plus size={15} /> Criar</>}
              </button>
              {editing && <button className="cat2-btn-ghost" onClick={reset}><X size={14} /> Cancelar</button>}
            </div>

            <button className="cat2-link cat2-taxpack" disabled={busy} onClick={addTaxPack}>+ Garantir pack de impostos</button>
          </aside>
        </div>
      )}

      {/* Modal de mesclar/remover */}
      {dialog && (
        <div className="cat2-overlay" onClick={() => setDialog(null)}>
          <div className="cat2-modal" role="dialog" aria-modal="true" aria-label={dialog.mode === 'merge' ? 'Mesclar categoria' : 'Remover categoria'} onClick={(e) => e.stopPropagation()}>
            <div className="cat2-modal-head">
              <span>{dialog.mode === 'merge' ? 'Mesclar categoria' : 'Remover categoria'}</span>
              <button className="cat2-icon-btn" onClick={() => setDialog(null)} aria-label="Fechar"><X size={14} /></button>
            </div>
            <p className="cat2-modal-text">
              {dialog.mode === 'merge'
                ? <>Todos os lançamentos de <b>{dialog.cat.name}</b> serão movidos para a categoria escolhida, e <b>{dialog.cat.name}</b> deixa de existir.</>
                : <>Escolha para onde mover os lançamentos de <b>{dialog.cat.name}</b> antes de removê-la (nunca ficam órfãos).</>}
            </p>
            <label className="cat2-field"><span>{dialog.mode === 'merge' ? 'Mesclar em' : 'Reatribuir para'}</span>
              <select className="cat2-input" defaultValue="" onChange={(e) => confirmDialog(e.target.value)} aria-label="Categoria de destino">
                <option value="">— Escolha a categoria —</option>
                {view.cats.filter((x) => x.id !== dialog.cat.id).map((x) => (<option key={x.id} value={x.id}>{x.parent ? `↳ ${x.name}` : x.name}</option>))}
              </select>
            </label>
            <div className="cat2-modal-actions">
              <button className="cat2-btn-ghost" onClick={() => setDialog(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CAT2_CSS = `
.cat2-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: 14px; align-items: start; }
.cat2-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.cat2-editor { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 14px; }
.cat2-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cat2-card-title { font-size: 13px; font-weight: 800; }
.cat2-count { font-size: 11px; font-weight: 700; color: var(--muted, #a1a7b3); background: rgba(255,255,255,0.05); border-radius: 999px; padding: 2px 9px; }
.cat2-link { background: transparent; border: none; color: var(--brand, #7c5cff); font-size: 12px; font-weight: 700; cursor: pointer; padding: 4px; }
.cat2-list .cat2-rows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.cat2-row { position: relative; display: grid; grid-template-columns: 28px minmax(0,1fr) auto auto; align-items: center; gap: 10px; padding: 8px 8px 8px 10px; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
.cat2-row:hover { background: rgba(255,255,255,0.04); }
.cat2-row-sub { margin-left: 20px; }
.cat2-sub-mark { color: var(--muted, #a1a7b3); }
.cat2-main { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.cat2-name-line { display: flex; align-items: center; gap: 8px; }
.cat2-name { font-size: 13px; font-weight: 700; }
.cat2-badge { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 6px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); color: var(--muted, #a1a7b3); }
.cat2-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; max-width: 220px; }
.cat2-bar-fill { display: block; height: 100%; border-radius: 999px; opacity: 0.9; }
.cat2-usage { display: flex; align-items: baseline; gap: 6px; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cat2-usage-n { font-size: 10px; color: var(--muted, #a1a7b3); font-weight: 600; }
.cat2-unused { font-size: 11px; color: var(--muted, #a1a7b3); font-weight: 500; }
.cat2-actions { display: flex; gap: 3px; }
.cat2-icon-btn { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 9px; color: var(--muted, #a1a7b3); cursor: pointer; }
.cat2-icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.06); color: var(--text, #e7eaf0); }
.cat2-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.cat2-icon-btn.on { border-color: rgba(124,92,255,0.5); color: var(--brand, #7c5cff); background: rgba(124,92,255,0.1); }
.cat2-menu { position: absolute; right: 8px; top: 46px; z-index: 5; display: flex; flex-direction: column; min-width: 160px; background: #1b2130; border: 1px solid #2a3246; border-radius: 12px; padding: 4px; box-shadow: 0 12px 30px rgba(0,0,0,0.45); }
.cat2-menu button { display: flex; align-items: center; gap: 8px; background: transparent; border: none; color: var(--text, #e7eaf0); font-size: 12px; font-weight: 600; padding: 9px 10px; border-radius: 8px; cursor: pointer; text-align: left; }
.cat2-menu button:hover { background: rgba(255,255,255,0.06); }
.cat2-menu button.danger { color: var(--red, #e74c3c); }
.cat2-field { display: flex; flex-direction: column; gap: 7px; font-size: 11px; color: var(--muted, #a1a7b3); }
.cat2-input { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 10px 11px; border-radius: 11px; font-size: 13px; min-height: 42px; font-family: inherit; width: 100%; }
.cat2-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.cat2-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: 6px; max-height: 190px; overflow-y: auto; padding: 2px; }
.cat2-swatch { width: 100%; aspect-ratio: 1; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); cursor: pointer; }
.cat2-swatch:hover { background: rgba(255,255,255,0.07); }
.cat2-swatch.active { border-color: var(--brand, #7c5cff); background: rgba(124,92,255,0.16); color: var(--brand, #7c5cff); }
.cat2-colors { display: flex; gap: 10px; flex-wrap: wrap; padding: 2px; }
.cat2-color { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.cat2-color.active { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.25); }
.cat2-preview { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; background: rgba(124,92,255,0.07); border: 1px dashed rgba(124,92,255,0.3); font-size: 13px; font-weight: 700; }
.cat2-editor-actions { display: flex; gap: 8px; }
.cat2-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; border: none; border-radius: 12px; font-weight: 800; font-size: 13px; padding: 12px 14px; min-height: 46px; cursor: pointer; }
.cat2-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cat2-btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: rgba(255,255,255,0.04); border: 1px solid #2a3246; color: var(--text, #e7eaf0); border-radius: 12px; font-weight: 700; font-size: 13px; padding: 12px 14px; min-height: 46px; cursor: pointer; }
.cat2-taxpack { text-align: left; padding: 0; }
.cat2-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(7,9,14,0.72); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; }
.cat2-modal { width: 100%; max-width: 420px; background: linear-gradient(180deg, #171c27 0%, #12161f 100%); border: 1px solid #1f2734; border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 18px 50px rgba(0,0,0,0.5); }
.cat2-modal-head { display: flex; align-items: center; justify-content: space-between; font-weight: 800; }
.cat2-modal-text { font-size: 13px; color: var(--muted, #a1a7b3); line-height: 1.5; margin: 0; }
.cat2-modal-actions { display: flex; justify-content: flex-end; }
.cat2-editor .cat2-icons { max-height: 190px; }
@media (max-width: 860px) {
  .cat2-layout { grid-template-columns: 1fr; }
  .cat2-editor { position: static; }
}
@media (max-width: 520px) {
  .cat2-row { grid-template-columns: 28px minmax(0,1fr) auto; }
  .cat2-usage { grid-column: 2; }
  .cat2-actions { grid-column: 3; grid-row: 1; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('cat2-styles')) {
  const style = document.createElement('style');
  style.id = 'cat2-styles';
  style.textContent = CAT2_CSS;
  document.head.appendChild(style);
}
