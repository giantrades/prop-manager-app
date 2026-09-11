// Firms — cadastro de empresas/corretoras (nome, tipo, cor, ícone, logo). A cor/ícone
// propagam para contas, listas e gráficos. Persistido em `meta`.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import { listFirms, saveFirm, deleteFirm, FIRM_TYPES, DEFAULT_FIRM_COLOR } from '@apps/lib/db';
import { Building2, Pencil, Trash2, Plus, X } from 'lucide-react';

function emptyFirm() {
  return { name: '', type: 'Futures', color: DEFAULT_FIRM_COLOR, icon: '', logo: null, notes: '' };
}

const ICON_CHOICES = ['🏦', '🏛️', '💹', '📈', '🪙', '💠', '🐂', '🐻', '⚡', '🔥', '💎', '🎯', '🌐', '🏢'];

export default function FirmsPage() {
  const finance = useFinance();
  const { toast } = useToast();
  const { loading, data, reload: load } = usePageData('firms', async (f) => {
    const [firms, accounts] = await Promise.all([listFirms(f.ds), f.ds.accounts.list()]);
    return { firms, accounts };
  });
  const firms = data?.firms ?? [];
  const accounts = data?.accounts ?? [];

  const financeRef = useRef(finance);
  financeRef.current = finance;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const countByFirm = useMemo(() => {
    const acc = {};
    for (const a of accounts) if (a.firmId) acc[a.firmId] = (acc[a.firmId] ?? 0) + 1;
    return acc;
  }, [accounts]);

  const onSave = useCallback(async () => {
    const f = financeRef.current;
    if (!f || !form?.name?.trim()) return;
    setSaving(true);
    try {
      await saveFirm(f.ds, form);
      setForm(null);
      load();
    } catch (e) {
      toast(`Falha ao salvar empresa: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [form, load, toast]);

  const onDelete = useCallback(async (id) => {
    const f = financeRef.current;
    if (!f) return;
    await deleteFirm(f.ds, id);
    load();
  }, [load]);

  const setLogo = (file) => {
    if (!file) return;
    if (file.size > 300 * 1024) { toast('Logo muito grande (máx 300KB).', { type: 'warn' }); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Firms</h1>
        <div className="cmd-actions">
          <button className="cmd-refresh" onClick={() => setForm(emptyFirm())}><Plus size={15} /> Nova empresa</button>
        </div>
      </div>
      <ModuleTabs module="contas" />

      {loading ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando empresas…</div>
      ) : (
        <>
          {firms.length === 0 ? (
            <div className="cmd-empty" role="status">Nenhuma empresa cadastrada. Crie a primeira para colorir contas e gráficos.</div>
          ) : (
            <div className="firm-grid">
              {firms.map((firm) => (
                  <div key={firm.id} className="firm-card" style={{ borderTopColor: firm.color }}>
                    <div className="firm-card-head">
                      <span className="firm-dot" style={{ background: firm.color }} />
                      {firm.icon ? <span className="firm-icon">{firm.icon}</span> : firm.logo ? <img className="firm-logo" src={firm.logo} alt={firm.name} /> : <Building2 size={18} style={{ color: firm.color }} />}
                      <div className="firm-name">{firm.name}</div>
                    </div>
                    <div className="firm-meta">{firm.type} · {countByFirm[firm.id] ?? 0} conta(s)</div>
                    <div className="firm-actions">
                      <button className="cmd-refresh" onClick={() => setForm({ ...firm })} aria-label={`Editar ${firm.name}`}><Pencil size={14} /></button>
                      <button className="cmd-refresh" onClick={() => onDelete(firm.id)} aria-label={`Excluir ${firm.name}`}><Trash2 size={14} /></button>
                    </div>
                  </div>
              ))}
            </div>
          )}
        </>
      )}

      {form && (
        <div className="ac3-overlay" onClick={() => setForm(null)}>
          <div className="ac3-sheet" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label="Empresa" onClick={(e) => e.stopPropagation()}>
            <div className="ac3-sheet-head">
              <span className="ac3-sheet-title">{form.id ? 'Editar empresa' : 'Nova empresa'}</span>
              <button className="ac3-icon" onClick={() => setForm(null)} aria-label="Fechar"><X size={16} /></button>
            </div>
            <div className="ac3-form-body">
              <label className="ac3-field"><span className="ac3-label">Nome</span>
                <input className="ac3-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex.: FTMO" />
              </label>
              <div className="ac3-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="ac3-field"><span className="ac3-label">Tipo</span>
                  <select className="ac3-input" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    {FIRM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="ac3-field"><span className="ac3-label">Cor</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} style={{ width: 44, height: 40, border: 'none', background: 'transparent', cursor: 'pointer' }} aria-label="Cor da empresa" />
                    <span className="ac3-input" style={{ flex: 1, fontFamily: 'monospace' }}>{form.color}</span>
                  </span>
                </label>
              </div>
              <div className="ac3-field">
                <span className="ac3-label">Ícone (emoji)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {ICON_CHOICES.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      className={`firm-icon-btn${form.icon === ic ? ' active' : ''}`}
                      onClick={() => setForm((p) => ({ ...p, icon: p.icon === ic ? '' : ic }))}
                      aria-label={`Ícone ${ic}`}
                    >{ic}</button>
                  ))}
                  <input className="ac3-input" style={{ width: 70 }} value={form.icon} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))} placeholder="ou digite" aria-label="Ícone personalizado" />
                </div>
              </div>
              <label className="ac3-field"><span className="ac3-label">Logo (PNG/JPG, máx 300KB)</span>
                <input className="ac3-input" type="file" accept="image/*" onChange={(e) => { setLogo(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {form.logo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={form.logo} alt="logo" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain', background: 'rgba(0,0,0,0.2)' }} />
                  <button className="ac3-btn ac3-btn-sm" onClick={() => setForm((p) => ({ ...p, logo: null }))}>Remover logo</button>
                </div>
              )}
              <label className="ac3-field"><span className="ac3-label">Observações</span>
                <input className="ac3-input" value={form.notes || ''} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Regras, contato, etc." />
              </label>
              <div className="ac3-form-actions">
                <button className="ac3-btn ac3-btn-primary" onClick={onSave} disabled={saving || !form.name.trim()}>{saving ? 'Salvando…' : 'Salvar'}</button>
                <button className="ac3-btn" onClick={() => setForm(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FIRM_CSS = `
.firm-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.firm-card { display: flex; flex-direction: column; gap: 8px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-top: 3px solid #2a3246; border-radius: 16px; padding: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.firm-card-head { display: flex; align-items: center; gap: 8px; }
.firm-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.firm-logo { width: 22px; height: 22px; object-fit: contain; }
.firm-icon { font-size: 18px; }
.firm-icon-btn { width: 36px; height: 36px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; font-size: 16px; display: inline-flex; align-items: center; justify-content: center; }
.firm-icon-btn.active { border-color: var(--brand, #7c5cff); background: rgba(124,92,255,0.15); }
.firm-name { font-size: 14px; font-weight: 700; flex: 1; }
.firm-meta { font-size: 11px; color: var(--muted, #a1a7b3); }
.firm-profit { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.firm-actions { display: flex; gap: 6px; margin-top: auto; }
.cmd-empty { padding: 28px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 14px; }
@media (max-width: 900px) { .firm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .firm-grid { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('firm-styles')) {
  const style = document.createElement('style');
  style.id = 'firm-styles';
  style.textContent = FIRM_CSS;
  document.head.appendChild(style);
}
