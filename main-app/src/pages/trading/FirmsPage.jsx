// Firms — cadastro de empresas/corretoras (nome, tipo, cor, ícone, logo). A cor/ícone
// propagam para contas, listas e gráficos. Persistido em `meta`.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFinance, usePlatform } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import { listFirms, saveFirm, deleteFirm, listConnectionFirms, FIRM_TYPES, DEFAULT_FIRM_COLOR, accountBalance } from '@apps/lib/db';
import { fmtMoney } from '@apps/ui/currency';
import { Building2, Pencil, Trash2, Plus, X, ChevronDown, Unlink } from 'lucide-react';

function emptyFirm() {
  return { name: '', type: 'Futures', color: DEFAULT_FIRM_COLOR, icon: '', logo: null, notes: '' };
}

export default function FirmsPage() {
  const finance = useFinance();
  const { toast } = useToast();
  const { loading, data, reload: load } = usePageData('firms', async (f) => {
    const [firms, accounts, propExts, connFirms, payouts] = await Promise.all([
      listFirms(f.ds), f.ds.accounts.list(), f.ds.propExtensions.list(), listConnectionFirms(f.ds), f.ds.payouts.list(),
    ]);
    return { firms, accounts, propExts, connFirms, payouts };
  });
  const firms = data?.firms ?? [];
  const accounts = data?.accounts ?? [];
  const connFirms = data?.connFirms ?? {};
  const { statuses } = usePlatform();
  const connOnline = statuses.some((s) => s.online);
  const connsById = useMemo(() => {
    const m = new Map();
    for (const s of statuses) for (const c of (s.connections || [])) m.set(c.id, c);
    return m;
  }, [statuses]);
  const propByAcct = useMemo(() => new Map((data?.propExts ?? []).map((p) => [p.accountId, p])), [data]);

  const financeRef = useRef(finance);
  financeRef.current = finance;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);

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

  // Vincula/desvincula uma conta a uma firm (dentro do painel da firm).
  const setAccountFirm = useCallback(async (account, firmId) => {
    const f = financeRef.current;
    if (!f || !account) return;
    await f.ds.accounts.put(
      { ...account, firmId: firmId || undefined, updatedAt: new Date().toISOString() },
      { source: 'local' },
    );
    toast(firmId ? `${account.name} vinculada.` : `${account.name} desvinculada.`);
    load();
  }, [load, toast]);

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
              {firms.map((firm) => {
                const firmAccounts = accounts.filter((a) => a.firmId === firm.id);
                // BALANCE = plataforma (bridge) manda; nominal prop é só fallback.
                const capital = firmAccounts.reduce(
                  (s, a) => s + accountBalance(a, propByAcct.get(a.id)?.nominalSize || 0), 0,
                );
                const firmAcctIds = new Set(firmAccounts.map((a) => a.id));
                const firmPayouts = (data?.payouts ?? []).filter((p) => (p.accountIds ?? []).some((id) => firmAcctIds.has(id)));
                const payGross = firmPayouts.reduce((s, p) => s + (Number(p.gross) || 0), 0);
                const payFee = firmPayouts.reduce((s, p) => s + (Number(p.fee) || 0), 0);
                const payNet = firmPayouts.reduce((s, p) => s + (Number(p.net) || 0), 0);
                const firmConns = Object.entries(connFirms)
                  .filter(([, fid]) => fid === firm.id)
                  .map(([cid]) => ({ id: cid, name: connsById.get(cid)?.name || cid }));
                const unassigned = accounts.filter((a) => a.firmId !== firm.id);
                const open = openId === firm.id;
                return (
                  <div key={firm.id} className={`firm-card${open ? ' open' : ''}`} style={{ borderTopColor: firm.color }}>
                    <button type="button" className="firm-card-head firm-card-btn" onClick={() => setOpenId(open ? null : firm.id)} aria-expanded={open}>
                      <span className="firm-dot" style={{ background: firm.color }} />
                      {firm.icon ? <span className="firm-icon">{firm.icon}</span> : firm.logo ? <img className="firm-logo" src={firm.logo} alt={firm.name} /> : <Building2 size={18} style={{ color: firm.color }} />}
                      <span className="firm-name">{firm.name}</span>
                      <ChevronDown size={16} className={`firm-chev${open ? ' open' : ''}`} />
                    </button>
                    <div className="firm-meta">
                      {firm.type}
                      {firmConns.length > 0 ? ` · conexão ${connOnline ? 'conectada' : 'offline'}` : ' · sem conexão'}
                    </div>

                    <div className="firm-stats">
                      <div className="firm-stat"><span className="firm-stat-k">Contas</span><span className="firm-stat-v">{firmAccounts.length}</span></div>
                      <div className="firm-stat"><span className="firm-stat-k">Balance</span><span className="firm-stat-v">{fmtMoney(capital, 'USD')}</span></div>
                      <div className="firm-stat"><span className="firm-stat-k">Payouts</span><span className="firm-stat-v">{firmPayouts.length}</span></div>
                      <div className="firm-stat"><span className="firm-stat-k">Gross</span><span className="firm-stat-v">{fmtMoney(payGross, 'USD')}</span></div>
                      <div className="firm-stat"><span className="firm-stat-k">Fees</span><span className="firm-stat-v firm-red">- {fmtMoney(payFee, 'USD')}</span></div>
                      <div className="firm-stat"><span className="firm-stat-k">Net</span><span className="firm-stat-v firm-green">{fmtMoney(payNet, 'USD')}</span></div>
                    </div>

                    {open && (
                      <div className="firm-panel">
                        <div className="firm-sec">
                          <span className="firm-sec-title">Conexão (Quantower)</span>
                          {firmConns.length === 0 ? (
                            <span className="firm-hint">Nenhuma conexão vinculada. Em Sistema → Conexões, defina “Firm da conexão”.</span>
                          ) : firmConns.map((c) => (
                            <div key={c.id} className="firm-conn">
                              <span className={`cx-dot ${connOnline ? 'on' : 'off'}`} /> {c.name} · {connOnline ? 'conectada' : 'offline'}
                            </div>
                          ))}
                        </div>

                        <div className="firm-sec">
                          <span className="firm-sec-title">Contas desta firm ({firmAccounts.length})</span>
                          {firmAccounts.length === 0 ? (
                            <span className="firm-hint">Nenhuma conta vinculada a esta firm.</span>
                          ) : firmAccounts.map((a) => (
                            <div key={a.id} className="firm-row">
                              <span className="firm-row-name">{a.name}</span>
                              <span className="firm-row-kind">{a.kind}</span>
                              <button className="cx-btn" onClick={() => setAccountFirm(a, undefined)} title="Desvincular da firm" aria-label={`Desvincular ${a.name}`}><Unlink size={13} /></button>
                            </div>
                          ))}
                          {unassigned.length > 0 && (
                            <select
                              className="cx-select"
                              value=""
                              onChange={(e) => { const a = accounts.find((x) => x.id === e.target.value); if (a) setAccountFirm(a, firm.id); }}
                              aria-label="Vincular conta a esta firm"
                            >
                              <option value="">Vincular conta…</option>
                              {unassigned.map((a) => (<option key={a.id} value={a.id}>{a.name}{a.firmId ? ' (outra firm)' : ''}</option>))}
                            </select>
                          )}
                        </div>

                        <div className="firm-actions">
                          <button className="cmd-refresh" onClick={() => setForm({ ...firm })}><Pencil size={14} /> Editar</button>
                          <button className="cmd-refresh" onClick={() => onDelete(firm.id)}><Trash2 size={14} /> Excluir</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {form && (
        <div className="ac3-overlay" onClick={() => setForm(null)}>
          <div className="ac3-sheet" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label="Empresa" onClick={(e) => e.stopPropagation()}>
            <div className="ac3-sheet-head">
              <span className="ac3-sheet-title"><Building2 size={16} /> {form.id ? 'Editar empresa' : 'Nova empresa'}</span>
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
              <label className="ac3-field"><span className="ac3-label">Ícone (emoji)</span>
                <input className="ac3-input" value={form.icon} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))} placeholder="Ex.: 🏦 (deixe vazio para usar o ícone padrão)" aria-label="Ícone da empresa" />
              </label>
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
.firm-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.firm-stat { display: flex; flex-direction: column; gap: 1px; padding: 7px 9px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); }
.firm-stat-k { font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.firm-stat-v { font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.firm-green { color: var(--green, #2ecc71); }
.firm-red { color: var(--red, #e74c3c); }
.firm-profit { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.firm-actions { display: flex; gap: 6px; margin-top: auto; }
.firm-card-btn { width: 100%; background: transparent; border: none; color: inherit; cursor: pointer; text-align: left; padding: 0; }
.firm-card.open { border-color: rgba(124,92,255,0.4); }
.firm-chev { transition: transform 140ms ease; opacity: 0.7; }
.firm-chev.open { transform: rotate(180deg); }
.firm-panel { display: flex; flex-direction: column; gap: 12px; margin-top: 6px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); }
.firm-sec { display: flex; flex-direction: column; gap: 6px; }
.firm-sec-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.firm-hint { font-size: 11px; color: var(--muted, #a1a7b3); }
.firm-conn { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.firm-row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.firm-row:last-child { border-bottom: none; }
.firm-row-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.firm-row-kind { font-size: 10px; color: var(--muted, #a1a7b3); }
.firm-conn .cx-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.firm-conn .cx-dot.on { background: var(--green, #2ecc71); }
.firm-conn .cx-dot.off { background: var(--red, #e74c3c); }
.firm-panel .cx-btn { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); cursor: pointer; }
.firm-panel .cx-select { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); border-radius: 8px; padding: 6px 8px; font-size: 12px; min-height: 36px; }
.cmd-empty { padding: 28px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 14px; }
@media (max-width: 900px) { .firm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .firm-grid { grid-template-columns: 1fr; } .firm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;
if (typeof document !== 'undefined' && !document.getElementById('firm-styles')) {
  const style = document.createElement('style');
  style.id = 'firm-styles';
  style.textContent = FIRM_CSS;
  document.head.appendChild(style);
}
