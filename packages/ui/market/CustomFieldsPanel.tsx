// SCANNER — painel de campos personalizados (expressões numéricas).
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CUSTOM_FIELD_EXAMPLES, type CustomFieldCompiled, type CustomFieldDef } from '@apps/lib/db';

interface CustomFieldsPanelProps {
  defs: CustomFieldDef[];
  compiled: CustomFieldCompiled[];
  onChange: (defs: CustomFieldDef[]) => void;
}

export default function CustomFieldsPanel({ defs, compiled, onChange }: CustomFieldsPanelProps) {
  const [id, setId] = useState('');
  const [expression, setExpression] = useState('');

  const add = () => {
    if (!id.trim() || !expression.trim()) return;
    onChange([...defs, { id: id.trim(), expression: expression.trim() }]);
    setId('');
    setExpression('');
  };

  const remove = (index: number) => onChange(defs.filter((_, i) => i !== index));

  return (
    <div>
      <p className="mk-subtitle" style={{ marginTop: 0 }}>
        Defina expressões numéricas e use o <strong>id</strong> como um campo normal nas regras.
        Operadores <code>+ - * /</code>, parênteses e funções <code>abs/min/max/round</code>.
        Pode usar campos built-in, fundamentos e campos personalizados anteriores.
      </p>

      {defs.length > 0 && (
        <div className="mk-cf-list">
          {defs.map((d, i) => {
            const c = compiled[i];
            return (
              <div key={`${d.id}:${i}`} className="mk-cf-row">
                <span className="mk-cf-id">{c?.id || d.id}</span>
                <span className="mk-cf-expr" title={d.expression}>{d.expression}</span>
                <button type="button" className="mk-icon-btn" onClick={() => remove(i)} aria-label={`Remover campo ${d.id}`}>
                  <Trash2 size={14} />
                </button>
                {c?.error && <span className="mk-cf-error">{c.error}</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="mk-cf-form">
        <label className="mk-field">
          <span className="mk-field-label">Id</span>
          <input className="mk-input" placeholder="ex: forca" value={id} onChange={(e) => setId(e.target.value)} />
        </label>
        <label className="mk-field">
          <span className="mk-field-label">Expressão</span>
          <input
            className="mk-input"
            placeholder="ex: change5d - change"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          />
        </label>
        <button type="button" className="mk-btn" onClick={add} disabled={!id.trim() || !expression.trim()}>
          <Plus size={14} /> Adicionar
        </button>
      </div>

      <div className="mk-example-list" style={{ marginTop: 8 }}>
        {CUSTOM_FIELD_EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            type="button"
            className="mk-example"
            onClick={() => { setId(ex.id); setExpression(ex.expression); }}
          >
            {ex.id} = {ex.expression}
          </button>
        ))}
      </div>
    </div>
  );
}
