// STAGE 7 — GoalsEditor (engine-driven). Cria/edita Goals (kind, target, windowType).
// Grava via `ds.goals.put` (único writer). Progresso é derivado pelo motor — nunca digitado.

import React, { useState } from 'react';

interface GoalForm {
  id?: string;
  kind: string;
  targetValue: number;
  windowType: string;
  deadline: string;
}

interface GoalItem extends GoalForm {
  id: string;
}

interface GoalsEditorProps {
  goals?: GoalItem[];
  onSave: (goal: GoalForm) => Promise<void> | void;
  onDelete?: (goalId: string) => Promise<void> | void;
  loading?: boolean;
}

const KINDS: Array<{ id: string; label: string }> = [
  { id: 'emergency', label: 'Reserva de emergência' },
  { id: 'networth', label: 'Patrimônio líquido' },
  { id: 'property', label: 'Imóvel (entrada)' },
  { id: 'payout_year', label: 'Payout anual' },
  { id: 'portfolio', label: 'Portfolio' },
];

function emptyGoal(): GoalForm {
  return { kind: 'networth', targetValue: 0, windowType: 'calendar_year', deadline: '' };
}

/**
 * @param {object} props
 * @param {Array<object>} [props.goals]
 * @param {(goal:object)=>Promise<void>|void} props.onSave
 * @param {(goalId:string)=>Promise<void>|void} [props.onDelete]
 * @param {boolean} [props.loading]
 */
export default function GoalsEditor({ goals = [], onSave, onDelete, loading = false }: GoalsEditorProps) {
  const [editing, setEditing] = useState<GoalForm | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const startNew = () => { setEditing(emptyGoal()); setIsNew(true); };
  const startEdit = (g: GoalItem) => { setEditing(g); setIsNew(false); };
  const update = (k: keyof GoalForm, v: string | number) => setEditing((e) => (e ? ({ ...e, [k]: v } as GoalForm) : e));

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await onSave(editing);
      setEditing(null);
      setIsNew(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ge-root ge-loading" role="status" aria-live="polite">
        <div className="ge-skeleton" /><div className="ge-skeleton" />
        <span className="ge-screen-reader">Carregando goals…</span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="ge-root">
        <div className="ge-form">
          <div className="ge-form-title">{isNew ? 'Novo goal' : 'Editar goal'}</div>
          <div className="ge-grid">
            <label className="ge-field"><span className="ge-label">Tipo</span>
              <select className="ge-input" value={editing.kind} onChange={(e) => update('kind', e.target.value)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <label className="ge-field"><span className="ge-label">Meta (R$)</span>
              <input className="ge-input" type="number" value={editing.targetValue} onChange={(e) => update('targetValue', Number(e.target.value))} />
            </label>
            {editing.kind === 'payout_year' && (
              <label className="ge-field"><span className="ge-label">Janela</span>
                <select className="ge-input" value={editing.windowType} onChange={(e) => update('windowType', e.target.value)}>
                  <option value="calendar_year">Ano corrente</option>
                  <option value="rolling_12m">Últimos 12 meses</option>
                </select>
              </label>
            )}
            <label className="ge-field"><span className="ge-label">Prazo (opcional)</span>
              <input className="ge-input" type="date" value={editing.deadline || ''} onChange={(e) => update('deadline', e.target.value)} />
            </label>
          </div>
          <div className="ge-actions">
            <button className="ge-btn ge-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button className="ge-btn" onClick={() => { setEditing(null); setIsNew(false); }}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ge-root">
      <div className="ge-head">
        <h3 className="ge-title">Goals</h3>
        <button className="ge-btn ge-btn-primary" onClick={startNew}>+ Novo goal</button>
      </div>
      {goals.length === 0 ? (
        <div className="ge-empty" role="status">Nenhum goal definido.</div>
      ) : (
        <div className="ge-list">
          {goals.map((g) => (
            <div key={g.id} className="ge-item">
              <div className="ge-item-head">
                <div className="ge-item-name">{KINDS.find((k) => k.id === g.kind)?.label || g.kind}</div>
                <div className="ge-item-actions">
                  <button className="ge-btn ge-btn-sm" onClick={() => startEdit(g)}>Editar</button>
                  {onDelete && <button className="ge-btn ge-btn-sm ge-btn-danger" onClick={() => onDelete(g.id)}>Excluir</button>}
                </div>
              </div>
              <div className="ge-item-meta">meta {g.targetValue}{g.windowType === 'rolling_12m' ? ' · últ. 12m' : ''}{g.deadline ? ` · até ${g.deadline}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GE_CSS = `
.ge-root { display: flex; flex-direction: column; gap: 14px; }
.ge-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.ge-loading { gap: 8px; }
.ge-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: ge-pulse 1.4s ease-in-out infinite; }
.ge-form { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.ge-form-title { font-size: 14px; font-weight: 800; }
.ge-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.ge-field { display: flex; flex-direction: column; gap: 4px; }
.ge-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.ge-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 9px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 40px; }
.ge-head { display: flex; justify-content: space-between; align-items: center; }
.ge-title { font-size: 15px; font-weight: 800; margin: 0; }
.ge-actions { display: flex; gap: 10px; }
.ge-btn { padding: 9px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; }
.ge-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.ge-btn-sm { padding: 5px 10px; min-height: 30px; font-size: 11px; border-radius: 8px; }
.ge-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }
.ge-list { display: flex; flex-direction: column; gap: 10px; }
.ge-item { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.ge-item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ge-item-name { font-size: 14px; font-weight: 700; }
.ge-item-meta { font-size: 12px; color: var(--muted, #a1a7b3); margin-top: 6px; }
.ge-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 719px) { .ge-grid { grid-template-columns: 1fr; } }
@keyframes ge-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ge-styles')) {
  const style = document.createElement('style');
  style.id = 'ge-styles';
  style.textContent = GE_CSS;
  document.head.appendChild(style);
}
