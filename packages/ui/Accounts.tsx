// Accounts — registro unificado de contas (prop, banco, carteira, investimento,
// cripto, dinheiro). Grava via `ds.accounts.put` + `ds.propExtensions.put` (único
// writer). Nenhuma fórmula nova. UX: resumo + filtros + cards + modal criar/editar.
//
// Fonte: DOCS/02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md + DOCS/04_STAGE3_TRADING_OS.
// Ver DOCS/11_PAGE_MAP.md.

import { fmtMoney, convertMoney, fmtDisplay } from './currency';
import React, { useMemo, useState } from 'react';
import {
  Building2, Landmark, Wallet, TrendingUp, Bitcoin, Banknote, Search,
  Pencil, Trash2, Plus, Copy, Gauge, X,
} from 'lucide-react';
import { FIRM_TEMPLATES, applyTemplate, templateNeedsCheck, DEFAULT_FIRM_COLOR, isActiveProp, normalizePropPhase } from '@apps/lib/db';

const KINDS = ['prop', 'wallet', 'investment', 'bank', 'cash'];
// Status de vida da conta (4 estados pedidos): Challenge, Funded, Live, Standby.
const PHASES = ['challenge', 'funded', 'live', 'standby'];
const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'];

const KIND_META = {
  prop: { label: 'Prop', icon: Building2, color: 'var(--brand, #7c5cff)' },
  wallet: { label: 'Cripto/Carteira', icon: Wallet, color: 'var(--green, #2ecc71)' },
  investment: { label: 'Investimento', icon: TrendingUp, color: 'var(--yellow, #e1b12c)' },
  bank: { label: 'Banco', icon: Landmark, color: 'var(--blue, #3498db)' },
  cash: { label: 'Dinheiro', icon: Banknote, color: 'var(--gray, #8b94a5)' },
  // legado: contas antigas do tipo crypto exibem como Cripto/Carteira
  crypto: { label: 'Cripto/Carteira', icon: Wallet, color: 'var(--green, #2ecc71)' },
};

const PHASE_LABEL = {
  challenge: 'Challenge', funded: 'Funded', live: 'Live', standby: 'Standby',
};
const FREQ_LABEL = { daily: 'Diário', weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal' };
const PHASE_CLASS = {
  challenge: 'ac3-pill-warn', funded: 'ac3-pill-safe', live: 'ac3-pill-safe', standby: 'ac3-pill-muted',
};

function emptyAccount() {
  return { kind: 'wallet', name: '', currency: 'USD', institution: '', hidden: false, defaultWeight: 1 };
}
function emptyProp() {
  // Só estes campos são editáveis no form; os demais ficam com defaults p/ o motor
  // (DD/consistência/minDays) e podem ser ajustados via template da firm.
  return {
    nominalSize: 100000, challengeCost: 0, phase: 'challenge', target: 100000,
    maxDD: 0.1, trailingDD: 0.1, dailyDD: 0.05, consistencyPct: 0.4, minDays: 1,
    payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
    profitSplit: 0.8, payoutFrequency: 'monthly',
  };
}

function curSymbol(c) {
  return c === 'BRL' ? 'R$' : c === 'USD' ? '$' : (c || '');
}

/**
 * @param {object} props
 * @param {Array<object>} [props.accounts]
 * @param {Record<string,object>} [props.props] accountId -> PropExtension
 * @param {Record<string,number>} [props.balances] accountId -> saldo/equity derivado
 * @param {Record<string,string>} [props.statusById] accountId -> SAFE/WARN/STOP (opcional)
 * @param {(account:object, prop:object|null)=>Promise<void>|void} props.onSave
 * @param {(accountId:string)=>Promise<void>|void} [props.onDelete]
 * @param {(accountId:string)=>void} [props.onSelect]
 * @param {(accountId:string)=>void} [props.onDuplicate]
 * @param {(firm:{name:string;color?:string;type?:string})=>Promise<string|undefined>|void} [props.onSaveFirm]
 * @param {boolean} [props.loading]
 */
export default function Accounts({
  accounts = [], props = {}, balances = {}, statusById = {}, firms = [],
  onSave, onDelete, onSelect, onDuplicate, onSaveFirm, loading = false,
}) {
  const [editing, setEditing] = useState(null); // { account, prop } | null
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [newFirm, setNewFirm] = useState(null); // { name, color } | null

  const applyFirmTemplate = (id) => {
    setTemplateId(id);
    if (!id) return;
    const applied = applyTemplate(editing?.account?.name ?? '', id);
    if (!applied) return;
    setEditing((e) => ({
      account: { ...e.account, ...applied.accountPatch },
      prop: { ...(e.prop || emptyProp()), ...applied.prop },
    }));
  };

  const startNew = () => { setEditing({ account: emptyAccount(), prop: null }); setIsNew(true); setTemplateId(''); };
  const startEdit = (a) => { setEditing({ account: a, prop: props[a.id] ?? null }); setIsNew(false); };
  const update = (k, v) => setEditing((e) => ({ ...e, account: { ...e.account, [k]: v } }));
  const updateProp = (k, v) => setEditing((e) => ({ ...e, prop: { ...(e.prop || emptyProp()), [k]: v } }));

  const handleSave = async () => {
    if (!editing?.account?.name) return;
    setSaving(true);
    try {
      await onSave(editing.account, editing.account.kind === 'prop' ? (editing.prop || emptyProp()) : null);
      setEditing(null);
      setIsNew(false);
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (kindFilter !== 'all' && a.kind !== kindFilter) return false;
      if (q && !(`${a.name} ${a.institution ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [accounts, kindFilter, query]);

  const summary = useMemo(() => {
    const prop = accounts.filter((a) => a.kind === 'prop');
    const nominal = prop.reduce((s, a) => s + (props[a.id]?.nominalSize || a.platformBalance || 0), 0);
    let liquidTotal = 0;
    for (const a of accounts) {
      if (!['bank', 'wallet', 'cash', 'crypto'].includes(a.kind)) continue;
      // Saldo do ledger; se vazio, usa o saldo da plataforma (bridge).
      liquidTotal += convertMoney(balances[a.id] || a.platformBalance || 0, a.currency);
    }
    const activeProp = prop.filter((a) => isActiveProp(props[a.id]?.phase));
    return { total: accounts.length, propCount: prop.length, nominal, liquidTotal, activeProp: activeProp.length };
  }, [accounts, props, balances]);

  // ---- Form (modal) ----
  if (editing) {
    const { account, prop } = editing;
    const isProp = account.kind === 'prop';
    return (
      <div className="ac3-overlay" onClick={() => { setEditing(null); setIsNew(false); }}>
        <div className="ac3-sheet" role="dialog" aria-modal="true" aria-label={isNew ? 'Nova conta' : 'Editar conta'} onClick={(e) => e.stopPropagation()}>
          <div className="ac3-sheet-head">
            <span className="ac3-sheet-title"><Wallet size={16} /> {isNew ? 'Nova conta' : 'Editar conta'}</span>
            <button className="ac3-icon" onClick={() => { setEditing(null); setIsNew(false); }} aria-label="Fechar"><X size={16} /></button>
          </div>
          <div className="ac3-form-body">
            {isNew && (
              <div className="ac3-template">
                <label className="ac3-field"><span className="ac3-label">Template da firm (opcional)</span>
                  <select className="ac3-input" value={templateId} onChange={(e) => applyFirmTemplate(e.target.value)} aria-label="Template da firm">
                    <option value="">Sem template (manual)</option>
                    {FIRM_TEMPLATES.map((t) => (<option key={t.id} value={t.id}>{t.firm} — {t.plan}</option>))}
                  </select>
                </label>
                {templateId && (() => {
                  const t = FIRM_TEMPLATES.find((x) => x.id === templateId);
                  return t && templateNeedsCheck(t) ? (
                    <div className="ac3-warn" role="note">⚠️ Template não verificado — confira o regulamento atual da {t.firm} antes de operar.</div>
                  ) : null;
                })()}
              </div>
            )}

            <div className="ac3-kind-pick" role="group" aria-label="Tipo de conta">
              {KINDS.map((k) => {
                const M = KIND_META[k];
                const Icon = M.icon;
                return (
                  <button key={k} type="button" className={`ac3-kind-btn${account.kind === k ? ' active' : ''}`} onClick={() => update('kind', k)} aria-pressed={account.kind === k}>
                    <Icon size={16} /> {M.label}
                  </button>
                );
              })}
            </div>

            <div className="ac3-grid">
              <label className="ac3-field"><span className="ac3-label">Nome</span>
                <input className="ac3-input" value={account.name} onChange={(e) => update('name', e.target.value)} placeholder="Ex.: FTMO 100k" />
              </label>
              <label className="ac3-field"><span className="ac3-label">Instituição / corretora</span>
                <input className="ac3-input" value={account.institution || ''} onChange={(e) => update('institution', e.target.value)} placeholder="Ex.: FTMO, Nubank, XP" />
              </label>
              <label className="ac3-field"><span className="ac3-label">Empresa (firm)</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <select className="ac3-input" value={account.firmId || ''} onChange={(e) => update('firmId', e.target.value || undefined)} aria-label="Empresa">
                    <option value="">—</option>
                    {firms.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
                  </select>
                  {onSaveFirm && (
                    <button type="button" className="ac3-btn ac3-btn-sm" onClick={() => setNewFirm({ name: '', color: DEFAULT_FIRM_COLOR })} aria-label="Nova empresa" title="Nova empresa"><Plus size={14} /></button>
                  )}
                </span>
              </label>
            </div>

            {newFirm && (
              <div className="ac3-newfirm">
                <input className="ac3-input" value={newFirm.name} onChange={(e) => setNewFirm((p) => ({ ...p, name: e.target.value }))} placeholder="Nome da empresa (ex.: FTMO)" aria-label="Nome da nova empresa" />
                <input type="color" value={newFirm.color} onChange={(e) => setNewFirm((p) => ({ ...p, color: e.target.value }))} aria-label="Cor da nova empresa" style={{ width: 44, height: 40, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                <button
                  type="button"
                  className="ac3-btn ac3-btn-sm ac3-btn-primary"
                  disabled={!newFirm.name.trim()}
                  onClick={async () => {
                    const id = await onSaveFirm({ name: newFirm.name.trim(), color: newFirm.color });
                    if (id) update('firmId', id);
                    setNewFirm(null);
                  }}
                >
                  Criar
                </button>
                <button type="button" className="ac3-btn ac3-btn-sm" onClick={() => setNewFirm(null)} aria-label="Cancelar nova empresa"><X size={14} /></button>
              </div>
            )}

            {isProp && (
              <div className="ac3-prop">
                <div className="ac3-prop-title">Conta prop</div>
                <div className="ac3-grid">
                  <label className="ac3-field"><span className="ac3-label">Custo da conta</span>
                    <input className="ac3-input" type="number" step="0.01" value={prop?.challengeCost ?? 0} onChange={(e) => updateProp('challengeCost', Number(e.target.value))} />
                  </label>
                  <label className="ac3-field"><span className="ac3-label">Balance (tamanho)</span>
                    <input className="ac3-input" type="number" value={prop?.nominalSize ?? 0} onChange={(e) => updateProp('nominalSize', Number(e.target.value))} />
                  </label>
                  <label className="ac3-field"><span className="ac3-label">Status</span>
                    <select className="ac3-input" value={normalizePropPhase(prop?.phase) ?? 'challenge'} onChange={(e) => updateProp('phase', e.target.value)}>
                      {PHASES.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
                    </select>
                  </label>
                  <label className="ac3-field"><span className="ac3-label">Frequência payout</span>
                    <select className="ac3-input" value={prop?.payoutFrequency ?? 'monthly'} onChange={(e) => updateProp('payoutFrequency', e.target.value)}>
                      {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQ_LABEL[f] ?? f}</option>)}
                    </select>
                  </label>
                  <label className="ac3-field"><span className="ac3-label">Profit split</span>
                    <input className="ac3-input" type="number" step="0.05" value={prop?.profitSplit ?? 0} onChange={(e) => updateProp('profitSplit', Number(e.target.value))} />
                  </label>
                </div>
                <p className="ac3-hint">Contas de plataforma são vinculadas automaticamente em Sistema → Conexões. Perfil/telemetria vêm do bridge.</p>
              </div>
            )}

            <label className="ac3-check"><input type="checkbox" checked={!!account.hidden} onChange={(e) => update('hidden', e.target.checked)} /> Ocultar das listas</label>

            <div className="ac3-form-actions">
              <button className="ac3-btn ac3-btn-primary" onClick={handleSave} disabled={saving || !account.name}>{saving ? 'Salvando…' : 'Salvar'}</button>
              <button className="ac3-btn" onClick={() => { setEditing(null); setIsNew(false); }}>Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Lista ----
  return (
    <div className="ac3-root">
      {/* Resumo */}
      <div className="ac3-summary">
        <div className="ac3-sum-card"><span className="ac3-sum-label">Contas</span><span className="ac3-sum-value">{summary.total}</span><span className="ac3-sum-sub">{summary.propCount} prop · {summary.activeProp} ativas</span></div>
        <div className="ac3-sum-card"><span className="ac3-sum-label">Capital gerido</span><span className="ac3-sum-value">{fmtMoney(summary.nominal)}</span><span className="ac3-sum-sub">nominal prop</span></div>
        <div className="ac3-sum-card"><span className="ac3-sum-label">Líquido</span>
          <span className={`ac3-sum-value ${summary.liquidTotal >= 0 ? 'ac3-pos' : 'ac3-neg'}`}>{fmtDisplay(summary.liquidTotal)}</span>
          <span className="ac3-sum-sub">banco · carteira · cash · cripto</span>
        </div>
        <div className="ac3-sum-card ac3-sum-add">
          <button className="ac3-btn ac3-btn-primary" onClick={startNew}><Plus size={16} /> Nova conta</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ac3-toolbar">
        <div className="ac3-search">
          <Search size={15} />
          <input className="ac3-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou instituição…" aria-label="Buscar conta" />
        </div>
        <div className="ac3-filters" role="group" aria-label="Filtrar por tipo">
          <button className={`ac3-chip${kindFilter === 'all' ? ' active' : ''}`} onClick={() => setKindFilter('all')}>Todas</button>
          {KINDS.map((k) => {
            const M = KIND_META[k];
            const Icon = M.icon;
            return (
              <button key={k} className={`ac3-chip${kindFilter === k ? ' active' : ''}`} onClick={() => setKindFilter(k)}>
                <Icon size={14} /> {M.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="ac3-empty" role="status">Carregando contas…</div>
      ) : visible.length === 0 ? (
        <div className="ac3-empty" role="status">{accounts.length === 0 ? 'Nenhuma conta ainda. Crie a primeira.' : 'Nenhuma conta encontrada.'}</div>
      ) : (
        <div className="ac3-grid-cards">
          {visible.map((a) => {
            const M = KIND_META[a.kind] ?? KIND_META.wallet;
            const Icon = M.icon;
            const p = props[a.id];
            const phase = normalizePropPhase(p?.phase);
            const firm = firms.find((f) => f.id === a.firmId);
            const accent = firm?.color || M.color;
            return (
              <div key={a.id} className="ac3-card" style={{ borderTopColor: accent }}>
                <div className="ac3-card-head">
                  <span className="ac3-card-icon" style={{ color: accent, borderColor: accent }}><Icon size={18} /></span>
                  <div className="ac3-card-title">
                    <div className="ac3-card-name">
                      {a.name}
                      {a.hidden && <span className="ac3-mini-badge">oculta</span>}
                    </div>
                    <div className="ac3-card-sub">
                      {firm && <span style={{ color: accent }}>{firm.icon ? `${firm.icon} ` : '● '}</span>}
                      {M.label}{a.institution ? ` · ${a.institution}` : ''}
                    </div>
                  </div>
                  {phase && <span className={`ac3-pill ${PHASE_CLASS[phase] ?? ''}`}>{PHASE_LABEL[phase] ?? phase}</span>}
                  {!phase && statusById[a.id] && <span className={`ac3-pill ${statusById[a.id] === 'STOP' ? 'ac3-pill-stop' : statusById[a.id] === 'WARN' ? 'ac3-pill-warn' : 'ac3-pill-safe'}`}>{statusById[a.id]}</span>}
                </div>

                <div className="ac3-card-metrics">
                  <div className="ac3-metric">
                    <span className="ac3-metric-label">{a.kind === 'prop' ? 'Balance' : 'Saldo'}</span>
                    <span className="ac3-metric-value">{fmtMoney(a.kind === 'prop' ? (p?.nominalSize || a.platformBalance || 0) : (balances[a.id] || a.platformBalance || 0), curSymbol(a.currency))}</span>
                  </div>
                  {a.platformAccountId && a.platformBalance != null && (
                    <div className="ac3-metric">
                      <span className="ac3-metric-label">Plataforma</span>
                      <span className="ac3-metric-value" title="Saldo reportado pela ponte (Quantower)">{fmtMoney(a.platformBalance, curSymbol(a.currency))}</span>
                    </div>
                  )}
                  {a.kind === 'prop' && (
                    <div className="ac3-metric">
                      <span className="ac3-metric-label">Custo</span>
                      <span className="ac3-metric-value">{fmtMoney(p?.challengeCost ?? 0, curSymbol(a.currency))}</span>
                    </div>
                  )}
                  {a.kind === 'prop' && (
                    <div className="ac3-metric">
                      <span className="ac3-metric-label">Profit split</span>
                      <span className="ac3-metric-value">{Math.round((p?.profitSplit ?? 0) * 100)}%</span>
                    </div>
                  )}
                </div>

                <div className="ac3-card-actions">
                  {onSelect && <button className="ac3-btn ac3-btn-sm ac3-btn-primary" onClick={() => onSelect(a.id)}><Gauge size={14} /> Painel</button>}
                  <button className="ac3-btn ac3-btn-sm" onClick={() => startEdit(a)} aria-label={`Editar ${a.name}`}><Pencil size={14} /></button>
                  {onDuplicate && <button className="ac3-btn ac3-btn-sm" onClick={() => onDuplicate(a.id)} aria-label={`Duplicar ${a.name}`}><Copy size={14} /></button>}
                  {onDelete && <button className="ac3-btn ac3-btn-sm ac3-btn-danger" onClick={() => onDelete(a.id)} aria-label={`Excluir ${a.name}`}><Trash2 size={14} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const AC3_CSS = `
.ac3-root { display: flex; flex-direction: column; gap: 14px; }
.ac3-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 12px; }
.ac3-sum-card { display: flex; flex-direction: column; gap: 4px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.ac3-sum-add { justify-content: center; align-items: center; }
.ac3-sum-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.ac3-sum-value { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ac3-sum-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.ac3-pos { color: var(--green, #2ecc71); }
.ac3-neg { color: var(--red, #e74c3c); }

.ac3-toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.ac3-search { position: relative; display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px; }
.ac3-search svg { position: absolute; left: 12px; color: var(--muted, #a1a7b3); }
.ac3-search .ac3-input { padding-left: 34px; }
.ac3-filters { display: flex; gap: 6px; flex-wrap: wrap; }
.ac3-chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); font-size: 12px; font-weight: 600; cursor: pointer; min-height: 40px; }
.ac3-chip.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); }

.ac3-grid-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ac3-card { display: flex; flex-direction: column; gap: 12px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-top: 3px solid #2a3246; border-radius: 16px; padding: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.ac3-card-head { display: flex; align-items: flex-start; gap: 10px; }
.ac3-card-icon { width: 36px; min-width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; border: 1px solid; background: rgba(255,255,255,0.03); }
.ac3-card-title { flex: 1; min-width: 0; }
.ac3-card-name { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.ac3-card-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.ac3-mini-badge { font-size: 9px; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; background: rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); }
.ac3-card-metrics { display: flex; gap: 16px; }
.ac3-metric { display: flex; flex-direction: column; gap: 2px; }
.ac3-metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.ac3-metric-value { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ac3-card-actions { display: flex; gap: 6px; margin-top: auto; }

.ac3-pill { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; padding: 3px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
.ac3-pill-safe { color: var(--green, #2ecc71); border-color: rgba(46,204,113,0.45); background: rgba(46,204,113,0.1); }
.ac3-pill-warn { color: var(--yellow, #e1b12c); border-color: rgba(225,177,44,0.45); background: rgba(225,177,44,0.1); }
.ac3-pill-stop { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.45); background: rgba(231,76,60,0.1); }
.ac3-pill-muted { color: var(--muted, #a1a7b3); border-color: rgba(255,255,255,0.15); }

.ac3-btn { padding: 9px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; display: inline-flex; align-items: center; gap: 6px; }
.ac3-btn:hover:not(:disabled) { filter: brightness(1.1); }
.ac3-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ac3-btn-primary { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; font-weight: 700; box-shadow: 0 6px 16px rgba(124,92,255,0.28); }
.ac3-btn-sm { padding: 6px 10px; min-height: 40px; font-size: 12px; border-radius: 8px; }
.ac3-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }
.ac3-icon { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: transparent; border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); cursor: pointer; }

.ac3-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(7,9,14,0.72); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; }
.ac3-sheet { width: 100%; max-width: 720px; max-height: 92vh; overflow-y: auto; background: linear-gradient(180deg, #171c27 0%, #12161f 100%); border: 1px solid #1f2734; border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.55); }
.ac3-sheet-head { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; background: rgba(23,28,39,0.96); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(255,255,255,0.06); }
.ac3-sheet-title { font-size: 15px; font-weight: 800; }
.ac3-form-body { padding: 16px 18px 22px; display: flex; flex-direction: column; gap: 14px; }
.ac3-template { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; background: rgba(52,152,219,0.07); border: 1px solid rgba(52,152,219,0.25); }
.ac3-warn { font-size: 12px; color: var(--yellow, #e1b12c); }
.ac3-kind-pick { display: flex; gap: 6px; flex-wrap: wrap; }
.ac3-kind-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); color: var(--muted, #a1a7b3); font-size: 12px; font-weight: 600; cursor: pointer; min-height: 40px; }
.ac3-kind-btn.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.45); color: var(--text, #e7eaf0); }
.ac3-prop { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 12px; background: rgba(124,92,255,0.05); border: 1px solid rgba(124,92,255,0.2); }
.ac3-prop-title { font-size: 13px; font-weight: 800; }
.ac3-hint { font-size: 11px; color: var(--muted, #a1a7b3); margin: 8px 0 0; }
.ac3-advanced { padding: 4px 0; }
.ac3-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.ac3-newfirm { display: flex; gap: 8px; align-items: center; padding: 10px; border-radius: 10px; background: rgba(124,92,255,0.06); border: 1px solid rgba(124,92,255,0.22); }
.ac3-newfirm .ac3-input { flex: 1; }
.ac3-field { display: flex; flex-direction: column; gap: 4px; }
.ac3-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.ac3-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 9px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 40px; width: 100%; font-family: inherit; }
.ac3-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.ac3-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted, #a1a7b3); min-height: 40px; }
.ac3-check input { width: 18px; height: 18px; accent-color: var(--brand, #7c5cff); }
.ac3-form-actions { display: flex; gap: 10px; justify-content: flex-end; padding-top: 4px; }

.ac3-empty { padding: 32px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 14px; }

@media (max-width: 900px) { .ac3-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ac3-grid-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .ac3-summary { grid-template-columns: 1fr; } .ac3-grid-cards { grid-template-columns: 1fr; } .ac3-grid { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ac3-styles')) {
  const style = document.createElement('style');
  style.id = 'ac3-styles';
  style.textContent = AC3_CSS;
  document.head.appendChild(style);
}
